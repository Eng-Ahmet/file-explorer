import path from 'path';
import Folder from '../models/Folder.js';
import mongoose from 'mongoose';

/**
 * Recursively builds the physical path for a folder or user root.
 * @param folderId The ID of the folder (null for user root)
 * @param userIdentifier A human-readable identifier for the user root (e.g. email)
 * @returns The full physical path relative to project root
 */
export const getFolderPath = async (folderId: string | mongoose.Types.ObjectId | null, userIdentifier: string): Promise<string> => {
  if (!folderId) {
    return path.join('uploads', userIdentifier);
  }

  const folder = await Folder.findById(folderId);
  if (!folder) return path.join('uploads', userIdentifier);

  // If this is a root folder (directly representing the user's base directory)
  if (folder.parentId === null) {
    return path.join('uploads', userIdentifier);
  }

  const parentPath = await getFolderPath(folder.parentId, userIdentifier);
  return path.join(parentPath, folder.name);
};
