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
    
    // If user is not admin and cannot see others' files, only show their own folders
    if (role !== 'admin') {
      if (user.permissions.canSeeOthersFiles) {
        if (user.permissions.permittedUsers && user.permissions.permittedUsers.length > 0) {
          // Can see their own + specific permitted users
          query.createdBy = { $in: [userId, ...user.permissions.permittedUsers] };
        } else {
          // If toggle is ON but list is empty, assume "See All"
        }
      } else {
        // Can only see their own
        query.createdBy = userId;
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

    const folder = new Folder({
      name,
      parentId: parentId || null,
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
    const folder = await Folder.findByIdAndUpdate(id, { name }, { new: true });
    if (!folder) return res.status(404).json({ message: 'Folder not found' });

    // Log Activity
    await logActivity(userId as any, user.username, 'RENAME_FOLDER', `Renamed folder from ${oldName} to ${name}`, req);

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

    const folderPath = await getFolderPath(id, user.email);
    const folderName = folder.name;

    // Recursively delete from DB (simplified for now but targeting the folder's files/subfolders)
    await File.deleteMany({ folderId: id as any });
    
    // Physical deletion
    if (fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, { recursive: true, force: true });
    }

    await Folder.findByIdAndDelete(id);

    // Log Activity
    await logActivity(userId as any, user.username, 'DELETE_FOLDER', `Deleted folder: ${folderName}`, req);

    res.json({ message: 'Folder and its physical contents deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting folder', error: err });
  }
};
