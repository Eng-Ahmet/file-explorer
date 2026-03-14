import path from 'path';
import fs from 'fs';
import File from '../models/File.js';
import Folder from '../models/Folder.js';
import User from '../models/User.js';
import { getFolderPath } from './pathHelper.js';
import mongoose from 'mongoose';

/**
 * Recursively moves a file or folder to a new destination.
 */
export const moveItemRecursive = async (
  itemId: string,
  targetFolderId: string | null,
  userId: string,
  role: string
): Promise<void> => {
  // 1. Identify Target Owner
  let targetOwnerEmail = '';
  let targetOwnerId = userId;

  if (targetFolderId) {
    const parentFolder = await Folder.findById(targetFolderId);
    if (parentFolder) {
      const owner = await User.findById(parentFolder.createdBy);
      if (owner) {
        targetOwnerEmail = owner.email;
        targetOwnerId = owner._id.toString();
      }
    }
  } else {
    // Moving to root
    const user = await User.findById(userId);
    if (user) {
        targetOwnerEmail = user.email;
        targetOwnerId = user._id.toString();
    }
  }

  // Check if it's a file
  const file = await File.findById(itemId);
  if (file) {
    if (role !== 'admin' && file.uploadedBy.toString() !== userId) return;

    const targetDir = await getFolderPath(targetFolderId, targetOwnerEmail);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const newPath = path.join(targetDir, file.name);
    
    // Physical move
    if (fs.existsSync(file.path)) {
      fs.renameSync(file.path, newPath);
    }

    // Update DB
    file.path = newPath;
    file.folderId = targetFolderId ? new mongoose.Types.ObjectId(targetFolderId) : null as any;
    file.uploadedBy = new mongoose.Types.ObjectId(targetOwnerId) as any; // Transfer ownership
    await file.save();
    return;
  }

  // Check if it's a folder
  const folder = await Folder.findById(itemId);
  if (folder) {
    if (role !== 'admin' && folder.createdBy.toString() !== userId) return;

    // Get current owner info for old path capture
    const currentOwner = await User.findById(folder.createdBy);
    const sourceOwnerEmail = currentOwner?.email || '';

    // 1. Capture old path
    const oldPath = await getFolderPath(itemId, sourceOwnerEmail);

    // 2. Update DB metadata
    folder.parentId = targetFolderId ? new mongoose.Types.ObjectId(targetFolderId) : null as any;
    folder.createdBy = new mongoose.Types.ObjectId(targetOwnerId) as any; // Transfer ownership
    await folder.save();

    // 3. Capture new path
    const newPath = await getFolderPath(itemId, targetOwnerEmail);

    // 4. Physical move the folder directory
    if (fs.existsSync(oldPath) && oldPath !== newPath) {
        const destParentDir = path.dirname(newPath);
        if (!fs.existsSync(destParentDir)) fs.mkdirSync(destParentDir, { recursive: true });
        
        try {
            fs.renameSync(oldPath, newPath);
        } catch (err) {
            console.error(`Directory migrate failed: ${oldPath} -> ${newPath}`, err);
        }
    }

    // 5. Update nested files & subfolders recursively
    await updateNestedItems(itemId, targetOwnerId, targetOwnerEmail);
  }
};

/**
 * Recursively updates paths and ownership for all items inside a folder.
 */
export const updateNestedItems = async (folderId: string, targetOwnerId: string, targetOwnerEmail: string): Promise<void> => {
    // Update nested files
    const files = await File.find({ folderId: new mongoose.Types.ObjectId(folderId) });
    for (const file of files) {
        const newPathDir = await getFolderPath(folderId, targetOwnerEmail);
        const newPath = path.join(newPathDir, file.name);
        
        file.path = newPath;
        file.uploadedBy = new mongoose.Types.ObjectId(targetOwnerId) as any;
        await file.save();
    }

    // Update subfolders
    const subfolders = await Folder.find({ parentId: new mongoose.Types.ObjectId(folderId) });
    for (const sub of subfolders) {
        sub.createdBy = new mongoose.Types.ObjectId(targetOwnerId) as any;
        await sub.save();
        // Recurse
        await updateNestedItems(sub._id.toString(), targetOwnerId, targetOwnerEmail);
    }
};

/**
 * Recursively updates paths for all files nested inside a folder.
 */
export const updateNestedFilePaths = async (folderId: string, ownerEmail: string): Promise<void> => {
  const files = await File.find({ folderId: new mongoose.Types.ObjectId(folderId) });
  for (const file of files) {
    // Recalculate physical path
    const newPathDir = await getFolderPath(folderId, ownerEmail);
    const newPath = path.join(newPathDir, file.name);

    if (file.path !== newPath) {
      file.path = newPath;
      await file.save();
    }
  }

  const subfolders = await Folder.find({ parentId: new mongoose.Types.ObjectId(folderId) });
  for (const sub of subfolders) {
    await updateNestedFilePaths(sub._id.toString(), ownerEmail);
  }
};
