import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import File from '../models/File.js';
import Folder from '../models/Folder.js';
import User from '../models/User.js';
import fs from 'fs';
import path from 'path';
import { getFolderPath } from '../utils/pathHelper.js';
import { logActivity } from '../utils/logger.js';

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
      if (user.permissions.canSeeOthersFiles) {
        if (user.permissions.permittedUsers && user.permissions.permittedUsers.length > 0) {
          // Can see their own + specific permitted users
          query.uploadedBy = { $in: [userId, ...user.permissions.permittedUsers] };
        } else {
          // If toggle is ON but list is empty, assume "See All" (Legacy/Super-User behavior)
          // No uploadedBy filter = see all (unless we decide to restrict to "none" which might break things)
        }
      } else {
        // Can only see their own
        query.uploadedBy = userId;
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

    if (role !== 'admin' && file.uploadedBy.toString() !== userId) {
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

    if (role !== 'admin' && file.uploadedBy.toString() !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Set content type correctly
    const ext = path.extname(file.path).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.pdf') contentType = 'application/pdf';
    else if (ext === '.md') contentType = 'text/plain'; 
    else if (ext === '.txt') contentType = 'text/plain';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';

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

    if (role !== 'admin' && file.uploadedBy.toString() !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Log Activity
    await logActivity(userId as any, user.username, 'DOWNLOAD_FILE', `Downloaded: ${file.originalName}`, req);

    res.download(file.path, file.originalName);
  } catch (err) {
    res.status(500).json({ message: 'Error downloading file', error: err });
  }
};
