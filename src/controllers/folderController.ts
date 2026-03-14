import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import Folder from '../models/Folder.js';
import File from '../models/File.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

import { getFolderPath } from '../utils/pathHelper.js';
import { logActivity } from '../utils/logger.js';
import { deleteFolderRecursiveInternal } from '../utils/deleteHelper.js';
import { updateNestedFilePaths } from '../utils/moveHelper.js';

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

export const getFolders = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const role = req.user?.role;
  const { parentId } = req.query;

  try {
    const user = await User.findById(userId);
    if (!user || (!user.permissions.canView && role !== 'admin')) {
      return res.status(403).json({ message: 'You do not have permission to view folders' });
    }

    const query: any = {};
    
    // If parentId is provided, filter by it (including null)
    if (parentId !== undefined) {
      query.parentId = parentId === 'null' ? null : parentId;
    }
    
    // If user is not admin and cannot see others' files, strictly check access
    if (role !== 'admin') {
      if (user.permissions.canSeeOthersFiles && user.permissions.permittedUsers?.length > 0) {
        // Limited global visibility (e.g. Monitoring)
        query.createdBy = { $in: [userId, ...user.permissions.permittedUsers.map(id => id.toString())] };
      } else if (!user.permissions.canSeeOthersFiles) {
        // If parentId is NOT provided, the client expects "all accessible items" (recursive)
        if (query.parentId === undefined) {
          const allFolders = await Folder.find({}).populate('createdBy', 'email username');
          const accessibleFolders = [];
          for (const folder of allFolders) {
            if (await hasAccess(folder._id, userId as string)) {
              accessibleFolders.push(folder);
            }
          }
          return res.json(accessibleFolders);
        }

        // Looking inside a folder, verify inheritance
        const authorized = await hasAccess(query.parentId, userId as string);
        if (!authorized) {
          return res.json([]); // Or 403, but empty array is safer for UX
        }
        // If authorized, we just filter by parentId (already in query)
      }
    }

    const folders = await Folder.find(query).sort({ createdAt: -1 }).populate('createdBy', 'email username');
    res.json(folders);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching folders', error: err });
  }
};

export const createFolder = async (req: AuthRequest, res: Response) => {
  const { name, parentId } = req.body;
  const userId = req.user?.id;
  const role = req.user?.role;

  if (!name) {
    return res.status(400).json({ message: 'Folder name is required' });
  }

  try {
    const user = await User.findById(userId);
    if (!user || (!user.permissions.canUpload && role !== 'admin')) {
      return res.status(403).json({ message: 'You do not have permission to create folders' });
    }

    let effectiveParentId = parentId || null;
    if (effectiveParentId && role !== 'admin') {
      const authorized = await hasAccess(effectiveParentId, userId as string);
      if (!authorized) {
        return res.status(403).json({ message: 'You do not have permission to create folders here' });
      }
    }
    if (!effectiveParentId && role !== 'admin') {
      const rootFolder = await Folder.findOne({ createdBy: userId, parentId: null });
      if (rootFolder) effectiveParentId = rootFolder._id.toString();
    }

    const folder = new Folder({
      name,
      parentId: effectiveParentId,
      createdBy: userId
    });
    await folder.save();

    let ownerEmail = user.email;
    if (parentId) {
      const parentFolder = await Folder.findById(parentId);
      if (parentFolder) {
        const owner = await User.findById(parentFolder.createdBy);
        if (owner) ownerEmail = owner.email;
      }
    }

    // Create physical directory
    const folderPath = await getFolderPath(folder._id, ownerEmail);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Log Activity
    await logActivity(userId as any, user.username, 'CREATE_FOLDER', `Created folder: ${folder.name}`, req);

    res.status(201).json(folder);
  } catch (err) {
    res.status(500).json({ message: 'Error creating folder', error: err });
  }
};

export const renameFolder = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name } = req.body;
  const userId = req.user?.id;
  const role = req.user?.role;

  try {
    const user = await User.findById(userId);
    if (!user || (!user.permissions.canUpload && role !== 'admin')) {
      return res.status(403).json({ message: 'You do not have permission to rename folders' });
    }

    const folderToUpdate = await Folder.findById(id);
    if (!folderToUpdate) return res.status(404).json({ message: 'Folder not found' });

    if (role !== 'admin' && folderToUpdate.createdBy.toString() !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const oldName = folderToUpdate.name;
    const ownerRecord = await User.findById(folderToUpdate.createdBy);
    const ownerEmail = ownerRecord?.email || (await User.findById(userId))?.email || '';

    // Capture old physical path
    const oldPath = await getFolderPath(id, ownerEmail);

    const folder = await Folder.findByIdAndUpdate(id, { name }, { new: true });
    if (!folder) return res.status(404).json({ message: 'Folder not found' });

    // Capture new physical path
    const newPath = await getFolderPath(id, ownerEmail);

    // Physically rename directory
    if (fs.existsSync(oldPath) && oldPath !== newPath) {
        try {
            fs.renameSync(oldPath, newPath);
        } catch (err) {
            console.error(`Folder rename failed physically: ${oldPath} -> ${newPath}`, err);
        }
    }

    // Recursively update all file path strings in DB
    await updateNestedFilePaths(id, ownerEmail);

    // Log Activity
    await logActivity(userId as any, ownerRecord?.username || 'System', 'RENAME_FOLDER', `Renamed folder from ${oldName} to ${name}`, req);

    res.json(folder);
  } catch (err) {
    res.status(500).json({ message: 'Error renaming folder', error: err });
  }
};

export const deleteFolder = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const role = req.user?.role;

  try {
    const folder = await Folder.findById(id);
    if (!folder) return res.status(404).json({ message: 'Folder not found' });

    const user = await User.findById(userId);
    if (!user || (!user.permissions.canDelete && role !== 'admin')) {
      return res.status(403).json({ message: 'You do not have permission to delete folders' });
    }

    // Permission check
    if (req.user?.role !== 'admin' && folder.createdBy.toString() !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    let ownerEmail = user.email;
    const owner = await User.findById(folder.createdBy);
    if (owner) ownerEmail = owner.email;

    const folderPath = await getFolderPath(id, ownerEmail);
    const folderName = folder.name;

    // Use centralized recursive deletion helper
    const deletedCount = await deleteFolderRecursiveInternal(id, userId as string, role as string);

    // Log Activity
    await logActivity(userId as any, user.username, 'DELETE_FOLDER', `Deleted folder: ${folderName} (Total items removed: ${deletedCount})`, req);

    res.json({ message: 'Folder and its contents deleted', deletedCount });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting folder', error: err });
  }
};

export const shareFolder = async (req: AuthRequest, res: Response) => {
  const { folderId, userIds } = req.body;
  const adminId = req.user?.id;

  try {
    const folder = await Folder.findById(folderId);
    if (!folder) return res.status(404).json({ message: 'Folder not found' });

    // Validate user IDs
    const validUsers = await User.find({ _id: { $in: userIds } });
    const validUserIds = validUsers.map(u => u._id);

    folder.sharedWith = validUserIds as any;
    await folder.save();

    res.json({ message: 'Folder shared successfully', sharedWith: validUserIds });
  } catch (err) {
    res.status(500).json({ message: 'Error sharing folder', error: err });
  }
};

export const revokeFolderAccess = async (req: AuthRequest, res: Response) => {
  const { folderId, userId } = req.body;

  try {
    const folder = await Folder.findById(folderId);
    if (!folder) return res.status(404).json({ message: 'Folder not found' });

    folder.sharedWith = folder.sharedWith.filter(id => id.toString() !== userId) as any;
    await folder.save();

    res.json({ message: 'Access revoked successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error revoking access', error: err });
  }
};
