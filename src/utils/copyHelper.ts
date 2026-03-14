import path from 'path';
import fs from 'fs';
import File from '../models/File.js';
import Folder from '../models/Folder.js';
import User from '../models/User.js';
import { getFolderPath } from './pathHelper.js';
import mongoose from 'mongoose';

/**
 * Recursively copies a file or folder to a new destination.
 */
export const copyItemRecursive = async (
  itemId: string,
  targetFolderId: string | null,
  userId: string,
  role: string,
  isRoot: boolean = true
): Promise<void> => {
  const user = await User.findById(userId);
  if (!user) return;

  // 1. Identify Target Owner
  let targetOwnerEmail = user.email;
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
    // Copying to user root
    const owner = await User.findById(userId);
    if (owner) {
        targetOwnerEmail = owner.email;
        targetOwnerId = owner._id.toString();
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

    // Generate physical name-avoid collision
    const newFileName = `${Date.now()}-copy-${file.name.split('-').pop()}`;
    const newPath = path.join(targetDir, newFileName);

    // Physical copy
    if (fs.existsSync(file.path)) {
      fs.copyFileSync(file.path, newPath);
    }

    // Clone metadata
    const newFile = new File({
      name: newFileName,
      originalName: file.originalName,
      displayName: isRoot ? `Copy of ${file.displayName}` : file.displayName,
      size: file.size,
      type: file.type,
      path: newPath,
      folderId: targetFolderId ? new mongoose.Types.ObjectId(targetFolderId) : null,
      uploadedBy: new mongoose.Types.ObjectId(targetOwnerId),
    });

    await newFile.save();
    
    // Update target owner storage usage
    await User.findByIdAndUpdate(targetOwnerId, { $inc: { totalStorageUsed: file.size } });
    return;
  }

  // Check if it's a folder
  const folder = await Folder.findById(itemId);
  if (folder) {
    if (role !== 'admin' && folder.createdBy.toString() !== userId) return;

    // Clone folder metadata
    const newFolder = new Folder({
      name: isRoot ? `Copy of ${folder.name}` : folder.name,
      parentId: targetFolderId ? new mongoose.Types.ObjectId(targetFolderId) : null,
      createdBy: new mongoose.Types.ObjectId(targetOwnerId),
    });
    await newFolder.save();

    // Create physical directory for the new folder
    const folderPath = await getFolderPath(newFolder._id, targetOwnerEmail);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Copy contents recursively
    // 1. Files
    const files = await File.find({ folderId: new mongoose.Types.ObjectId(itemId) });
    for (const f of files) {
      await copyItemRecursive(f._id.toString(), newFolder._id.toString(), userId, role, false);
    }

    // 2. Subfolders
    const subfolders = await Folder.find({ parentId: new mongoose.Types.ObjectId(itemId) });
    for (const sub of subfolders) {
      await copyItemRecursive(sub._id.toString(), newFolder._id.toString(), userId, role, false);
    }
  }
};
