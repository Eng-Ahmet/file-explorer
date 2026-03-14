import { Response } from 'express';
import archiver from 'archiver';
import { AuthRequest } from '../middleware/auth.js';
import File from '../models/File.js';
import Folder from '../models/Folder.js';
import User from '../models/User.js';
import fs from 'fs';
import path from 'path';
import { getFolderPath } from '../utils/pathHelper.js';
import { logActivity } from '../utils/logger.js';
import { moveItemRecursive } from '../utils/moveHelper.js';
import { copyItemRecursive } from '../utils/copyHelper.js';
import mongoose from 'mongoose';

async function hasAccess(folderId: string | mongoose.Types.ObjectId | null | undefined, userId: string): Promise<boolean> {
  if (!folderId || folderId === 'null') return true;
  const folder = await Folder.findById(folderId);
  if (!folder) return false;

  if (folder.createdBy.toString() === userId || (folder.sharedWith && folder.sharedWith.some(id => id.toString() === userId))) {
    return true;
  }

  if (folder.parentId) {
    return hasAccess(folder.parentId, userId);
  }

  return false;
}

export const getFiles = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const role = req.user?.role;
  const { folderId } = req.query;

  try {
    const user = await User.findById(userId);
    if (!user || (!user.permissions.canView && role !== 'admin')) {
      return res.status(403).json({ message: 'You do not have permission to view files' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Your account is deactivated' });
    }

    const query: any = {};

    // Only filter by folderId if it's explicitly provided in query
    if (folderId !== undefined) {
      query.folderId = folderId === 'null' ? null : folderId;
    }

    if (role !== 'admin') {
      const userFolders = await Folder.find({ createdBy: userId });
      const userFolderIds = userFolders.map(f => f._id);

      if (user.permissions.canSeeOthersFiles && user.permissions.permittedUsers?.length > 0) {
        query.$or = [
          { uploadedBy: { $in: [userId, ...user.permissions.permittedUsers.map(id => id.toString())] } },
          { folderId: { $in: userFolderIds } }
        ];
      } else if (!user.permissions.canSeeOthersFiles) {
        // If folderId is NOT provided, the client expects "all accessible items"
        if (query.folderId === undefined) {
          const allFiles = await File.find({});
          const accessibleFiles = [];
          for (const file of allFiles) {
            if (file.uploadedBy.toString() === userId || (file.sharedWith && file.sharedWith.some(id => id.toString() === userId))) {
              accessibleFiles.push(file);
              continue;
            }
            if (await hasAccess(file.folderId, userId as string)) {
              accessibleFiles.push(file);
            }
          }
          return res.json(accessibleFiles);
        }

        // Looking inside a folder, verify inheritance
        const authorized = await hasAccess(query.folderId, userId as string);
        if (!authorized) {
          return res.json([]);
        }
        // If authorized, we just filter by folderId (already in query)
      }
    }

    const files = await File.find(query).sort({ uploadDate: -1 });
    res.json(files);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching files', error: err });
  }
};

export const uploadFile = async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const { folderId } = req.body;
  const userId = req.user?.id;
  const role = req.user?.role;

  try {
    const user = await User.findById(userId);
    if (!user || (!user.permissions.canUpload && role !== 'admin')) {
      // Cleanup temp file
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ message: 'You do not have permission to upload files' });
    }

    if (!user.isActive) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    // Quota check
    const fileSize = req.file.size;
    if (role !== 'admin' && user.totalStorageUsed + fileSize > user.storageQuota) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ message: `Storage quota exceeded. Limit: ${Math.round(user.storageQuota / (1024 * 1024))}MB` });
    }

    let targetFolderId = folderId;
    if (targetFolderId && role !== 'admin') {
      const authorized = await hasAccess(targetFolderId, userId as string);
      if (!authorized) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(403).json({ message: 'You do not have permission to upload to this folder' });
      }
    }
    if (!targetFolderId && role !== 'admin') {
      // Find the user's root folder
      const rootFolder = await Folder.findOne({ createdBy: userId, parentId: null });
      if (rootFolder) {
        targetFolderId = rootFolder._id.toString();
      }
    }

    let ownerEmail = user.email;
    if (targetFolderId) {
      const parentFolder = await Folder.findById(targetFolderId);
      if (parentFolder) {
        const owner = await User.findById(parentFolder.createdBy);
        if (owner) ownerEmail = owner.email;
      }
    }

    const targetDir = await getFolderPath(targetFolderId, ownerEmail);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const newPath = path.join(targetDir, req.file.filename);

    // Move file to target physical directory
    fs.renameSync(req.file.path, newPath);

    const file = new File({
      name: req.file.filename,
      originalName: req.file.originalname,
      displayName: req.file.originalname,
      size: req.file.size,
      type: path.extname(req.file.originalname).substring(1),
      path: newPath,
      folderId: targetFolderId || null,
      uploadedBy: userId
    });

    await file.save();

    // Update user usage
    await User.findByIdAndUpdate(userId, { $inc: { totalStorageUsed: fileSize } });

    // Log Activity
    await logActivity(userId as any, user.username, 'UPLOAD_FILE', `Uploaded: ${file.originalName} (${Math.round(file.size / 1024)} KB)`, req);

    res.status(201).json(file);
  } catch (err) {
    // Cleanup temp file on error if it still exists
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ message: 'Error saving file metadata', error: err });
  }
};

export const deleteFile = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const role = req.user?.role;

  try {
    const file = await File.findById(id);
    if (!file) return res.status(404).json({ message: 'File not found' });

    const user = await User.findById(userId);
    if (!user || (!user.permissions.canDelete && role !== 'admin')) {
      return res.status(403).json({ message: 'You do not have permission to delete files' });
    }

    // Permission check: admin OR uploader OR folder owner
    let isFolderOwner = false;
    if (file.folderId) {
      const folder = await Folder.findById(file.folderId);
      if (folder && folder.createdBy.toString() === userId) {
        isFolderOwner = true;
      }
    }

    if (role !== 'admin' && file.uploadedBy.toString() !== userId && !isFolderOwner) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const fileSize = file.size;
    const fileName = file.originalName;
    const ownerId = file.uploadedBy;

    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    await File.findByIdAndDelete(id);

    // Update user usage (of the owner, not necessarily the deleter)
    await User.findByIdAndUpdate(ownerId, { $inc: { totalStorageUsed: -fileSize } });

    // Log Activity
    await logActivity(userId as any, user.username, 'DELETE_FILE', `Deleted: ${fileName}`, req);

    res.json({ message: 'File deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting file', error: err });
  }
};

export const viewFile = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const role = req.user?.role;

  try {
    const file = await File.findById(id);
    if (!file || !fs.existsSync(file.path)) {
      return res.status(404).json({ message: 'File not found' });
    }

    const user = await User.findById(userId);
    if (!user || (!user.permissions.canView && role !== 'admin')) {
      return res.status(403).json({ message: 'You do not have permission to view files' });
    }

    // Permission check: admin OR uploader OR folder owner
    let isFolderOwner = false;
    if (file.folderId) {
      const folder = await Folder.findById(file.folderId);
      if (folder && folder.createdBy.toString() === userId) {
        isFolderOwner = true;
      }
    }

    if (role !== 'admin' && file.uploadedBy.toString() !== userId && !isFolderOwner) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Set content type correctly
    const ext = path.extname(file.path).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.pdf') contentType = 'application/pdf';
    else if (ext === '.md') contentType = 'text/markdown';
    else if (['.txt', '.log', '.json', '.js', '.ts', '.css', '.html'].includes(ext)) contentType = 'text/plain';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.svg') contentType = 'image/svg+xml';
    else if (ext === '.mp4') contentType = 'video/mp4';
    else if (ext === '.webm') contentType = 'video/webm';
    else if (ext === '.mp3') contentType = 'audio/mpeg';
    else if (ext === '.wav') contentType = 'audio/wav';

    res.setHeader('Content-Type', contentType);
    // Log Activity
    await logActivity(userId as any, user.username, 'VIEW_FILE', `Viewed: ${file.originalName}`, req);

    res.sendFile(path.resolve(file.path));
  } catch (err) {
    res.status(500).json({ message: 'Error viewing file', error: err });
  }
};

export const downloadFile = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const role = req.user?.role;

  try {
    const file = await File.findById(id);
    if (!file || !fs.existsSync(file.path)) {
      return res.status(404).json({ message: 'File not found' });
    }

    const user = await User.findById(userId);
    if (!user || (!user.permissions.canView && role !== 'admin')) {
      return res.status(403).json({ message: 'You do not have permission to download files' });
    }

    // Permission check: admin OR uploader OR folder owner
    let isFolderOwner = false;
    if (file.folderId) {
      const folder = await Folder.findById(file.folderId);
      if (folder && folder.createdBy.toString() === userId) {
        isFolderOwner = true;
      }
    }

    if (role !== 'admin' && file.uploadedBy.toString() !== userId && !isFolderOwner) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Log Activity
    await logActivity(userId as any, user.username, 'DOWNLOAD_FILE', `Downloaded: ${file.originalName}`, req);
    res.download(file.path, file.originalName);
  } catch (err) {
    res.status(500).json({ message: 'Error downloading file', error: err });
  }
};

import { deleteFolderRecursiveInternal } from '../utils/deleteHelper.js';

export const bulkDeleteFiles = async (req: AuthRequest, res: Response) => {
  const { ids } = req.body;
  const userId = req.user?.id;
  const role = req.user?.role;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'No IDs provided' });
  }

  try {
    const user = await User.findById(userId);
    if (!user || (!user.permissions.canDelete && role !== 'admin')) {
      return res.status(403).json({ message: 'You do not have permission to delete items' });
    }

    const files = await File.find({ _id: { $in: ids } });
    const folders = await Folder.find({ _id: { $in: ids } });

    let deletedCount = 0;

    // Process Files
    const deletedFileIds: string[] = [];
    for (const file of files) {
      if (role === 'admin' || file.uploadedBy.toString() === userId) {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        deletedFileIds.push(file._id.toString());
        await User.findByIdAndUpdate(file.uploadedBy, { $inc: { totalStorageUsed: -file.size } });
        deletedCount++;
      }
    }
    await File.deleteMany({ _id: { $in: deletedFileIds } });

    // Process Folders
    for (const folder of folders) {
      deletedCount += await deleteFolderRecursiveInternal(folder._id.toString(), userId as string, role as string);
    }

    await logActivity(userId as any, user.username, 'BULK_DELETE', `Deleted ${deletedCount} items (files/folders)`, req);

    res.json({ message: `Successfully deleted ${deletedCount} items`, deletedCount });
  } catch (err) {
    res.status(500).json({ message: 'Error during bulk delete', error: err });
  }
};

export const copyFiles = async (req: AuthRequest, res: Response) => {
  const { ids, targetFolderId } = req.body;
  const userId = req.user?.id;
  const role = req.user?.role;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'No file IDs provided' });
  }

  try {
    const user = await User.findById(userId);
    if (!user || (!user.permissions.canUpload && role !== 'admin')) {
      return res.status(403).json({ message: 'You do not have permission to copy files' });
    }

    for (const id of ids) {
      await copyItemRecursive(id, targetFolderId || null, userId as string, role as string);
    }

    await logActivity(userId as any, user.username, 'COPY_FILES', `Copied ${ids.length} items`, req);

    res.json({ message: `Successfully copied ${ids.length} items` });
  } catch (err) {
    res.status(500).json({ message: 'Error copying items', error: err });
  }
};

export const moveFiles = async (req: AuthRequest, res: Response) => {
  const { ids, targetFolderId } = req.body;
  const userId = req.user?.id;
  const role = req.user?.role;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'No file IDs provided' });
  }

  try {
    const user = await User.findById(userId);
    if (!user || (!user.permissions.canUpload && role !== 'admin')) {
      return res.status(403).json({ message: 'You do not have permission to move files' });
    }

    for (const id of ids) {
      await moveItemRecursive(id, targetFolderId || null, userId as string, role as string);
    }

    await logActivity(userId as any, user.username, 'MOVE_FILES', `Moved ${ids.length} items`, req);

    res.json({ message: `Successfully moved ${ids.length} items` });
  } catch (err) {
    res.status(500).json({ message: 'Error moving items', error: err });
  }
};

export const createFile = async (req: AuthRequest, res: Response) => {
  const { name, folderId } = req.body;
  const userId = req.user?.id;
  const role = req.user?.role;

  if (!name) {
    return res.status(400).json({ message: 'File name is required' });
  }

  try {
    const user = await User.findById(userId);
    if (!user || (!user.permissions.canUpload && role !== 'admin')) {
      return res.status(403).json({ message: 'You do not have permission to create files' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    let targetFolderId = folderId;
    if (!targetFolderId && role !== 'admin') {
      const rootFolder = await Folder.findOne({ createdBy: userId, parentId: null });
      if (rootFolder) targetFolderId = rootFolder._id.toString();
    }

    let ownerEmail = user.email;
    if (targetFolderId) {
      const parentFolder = await Folder.findById(targetFolderId);
      if (parentFolder) {
        const owner = await User.findById(parentFolder.createdBy);
        if (owner) ownerEmail = owner.email;
      }
    }

    const targetDir = await getFolderPath(targetFolderId, ownerEmail);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const fileName = `${Date.now()}-${name}`;
    const filePath = path.join(targetDir, fileName);

    // Create an empty file
    fs.writeFileSync(filePath, '');

    const file = new File({
      name: fileName,
      originalName: name,
      displayName: name,
      size: 0,
      type: path.extname(name).substring(1) || 'txt',
      path: filePath,
      folderId: targetFolderId || null,
      uploadedBy: userId
    });

    await file.save();

    await logActivity(userId as any, user.username, 'CREATE_FILE', `Created file: ${name}`, req);

    res.status(201).json(file);
  } catch (err) {
    res.status(500).json({ message: 'Error creating file', error: err });
  }
};

export const updateFileContent = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { content } = req.body;
  const userId = req.user?.id;
  const role = req.user?.role;

  if (content === undefined) {
    return res.status(400).json({ message: 'Content is required' });
  }

  try {
    const file = await File.findById(id);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    const user = await User.findById(userId);
    if (!user || (!user.permissions.canUpload && role !== 'admin')) {
      return res.status(403).json({ message: 'You do not have permission to edit files' });
    }

    // Permission check: admin OR uploader OR folder owner
    let isFolderOwner = false;
    if (file.folderId) {
      const folder = await Folder.findById(file.folderId);
      if (folder && folder.createdBy.toString() === userId) {
        isFolderOwner = true;
      }
    }

    if (role !== 'admin' && file.uploadedBy.toString() !== userId && !isFolderOwner) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Physical update
    fs.writeFileSync(file.path, content);

    // Update metadata
    const stats = fs.statSync(file.path);
    const oldSize = file.size;
    file.size = stats.size;
    await file.save();

    // Update user usage
    const sizeDiff = stats.size - oldSize;
    if (sizeDiff !== 0) {
      await User.findByIdAndUpdate(file.uploadedBy, { $inc: { totalStorageUsed: sizeDiff } });
    }

    await logActivity(userId as any, user.username, 'EDIT_FILE', `Edited file: ${file.originalName}`, req);

    res.json({ message: 'File updated successfully', file });
  } catch (err) {
    res.status(500).json({ message: 'Error updating file', error: err });
  }
};

export const shareFile = async (req: AuthRequest, res: Response) => {
  const { fileId, userIds } = req.body;
  const adminId = req.user?.id;

  try {
    const file = await File.findById(fileId);
    if (!file) return res.status(404).json({ message: 'File not found' });

    // Validate user IDs
    const validUsers = await User.find({ _id: { $in: userIds } });
    const validUserIds = validUsers.map(u => u._id);

    file.sharedWith = validUserIds as any;
    await file.save();

    res.json({ message: 'File shared successfully', sharedWith: validUserIds });
  } catch (err) {
    res.status(500).json({ message: 'Error sharing file', error: err });
  }
};

export const revokeFileAccess = async (req: AuthRequest, res: Response) => {
  const { fileId, userId } = req.body;

  try {
    const file = await File.findById(fileId);
    if (!file) return res.status(404).json({ message: 'File not found' });

    file.sharedWith = file.sharedWith.filter(id => id.toString() !== userId) as any;
    await file.save();

    res.json({ message: 'Access revoked successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error revoking access', error: err });
  }
};

export const bulkDownloadFiles = async (req: AuthRequest, res: Response) => {
  const { ids } = req.body;
  const userId = req.user?.id;
  const role = req.user?.role;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'No IDs provided' });
  }

  try {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const zipName = `hwai-download-${Date.now()}.zip`;

    res.attachment(zipName);
    archive.pipe(res);

    const processItem = async (id: string, currentPath: string = '') => {
        const file = await File.findById(id);
        if (file) {
            // Permission check: admin OR owner OR sharedWith
            const isShared = file.sharedWith && file.sharedWith.some(uid => uid.toString() === userId);
            if (role === 'admin' || file.uploadedBy.toString() === userId || isShared) {
                if (fs.existsSync(file.path)) {
                    archive.file(file.path, { name: path.join(currentPath, file.originalName) });
                }
            }
            return;
        }

        const folder = await Folder.findById(id);
        if (folder) {
            // Permission check: admin OR owner OR sharedWith (recursive)
            // Simplified for now: if user reached this folder, assume they have access or filter sub-items
            const subfolders = await Folder.find({ parentId: folder._id });
            const subfiles = await File.find({ folderId: folder._id });

            for (const sub of subfiles) {
                await processItem(sub._id.toString(), path.join(currentPath, folder.name));
            }
            for (const subf of subfolders) {
                await processItem(subf._id.toString(), path.join(currentPath, folder.name));
            }
        }
    };

    for (const id of ids) {
        await processItem(id);
    }

    await archive.finalize();
    await logActivity(userId as any, (req as any).user.username, 'BULK_DOWNLOAD', `Downloaded ${ids.length} items as ZIP`, req);
  } catch (err) {
    console.error('ZIP Error:', err);
    if (!res.headersSent) {
        res.status(500).json({ message: 'Error creating ZIP archive', error: err });
    }
  }
};
