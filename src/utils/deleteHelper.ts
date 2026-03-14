import Folder from '../models/Folder.js';
import File from '../models/File.js';
import User from '../models/User.js';
import fs from 'fs';
import { getFolderPath } from './pathHelper.js';

/**
 * Recursively deletes a folder, its subfolders, and its files from DB and physical storage.
 * @returns Total number of items (files + folders) deleted.
 */
export const deleteFolderRecursiveInternal = async (folderId: string, userId: string, role: string): Promise<number> => {
  const folder = await Folder.findById(folderId);
  if (!folder) return 0;

  // Permission check
  if (role !== 'admin' && folder.createdBy.toString() !== userId) return 0;

  let count = 0;
  
  // Find sub-folders
  const subfolders = await Folder.find({ parentId: folderId });
  for (const sub of subfolders) {
    count += await deleteFolderRecursiveInternal(sub._id.toString(), userId, role);
  }

  // Find files in this folder
  const files = await File.find({ folderId: folderId as any });
  for (const file of files) {
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    await File.findByIdAndDelete(file._id);
    await User.findByIdAndUpdate(file.uploadedBy, { $inc: { totalStorageUsed: -file.size } });
    count++;
  }

  // Physical folder deletion
  const owner = await User.findById(folder.createdBy);
  if (owner) {
    const folderPath = await getFolderPath(folder._id, owner.email);
    if (fs.existsSync(folderPath)) {
      try {
        fs.rmSync(folderPath, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to delete physical path: ${folderPath}`, err);
      }
    }
  }

  await Folder.findByIdAndDelete(folderId);
  return count + 1;
};
