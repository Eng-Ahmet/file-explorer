import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import User from '../models/User.js';
import File from '../models/File.js';
import ActivityLog from '../models/ActivityLog.js';
import os from 'os';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import path from 'path';
import Folder from '../models/Folder.js';

export const getAllUsers = async (req: AuthRequest, res: Response) => {
  try {
    const users = await User.find({}, '-passwordHash').populate('monitoredBy', 'username email');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching users', error: err });
  }
};

export const updateUserRole = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { role } = req.body;

  if (role !== 'admin' && role !== 'user') {
    return res.status(400).json({ message: 'Invalid role' });
  }

  try {
    const user = await User.findByIdAndUpdate(id, { role }, { new: true }).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Error updating user role', error: err });
  }
};

export const updateUserPermissions = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { permissions } = req.body;

  try {
    const user = await User.findByIdAndUpdate(
      id,
      { permissions },
      { new: true }
    ).select('-passwordHash');

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Error updating user permissions', error: err });
  }
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const user = await User.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting user', error: err });
  }
};
export const updateSupervisor = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { monitoredBy } = req.body;

  try {
    const user = await User.findByIdAndUpdate(
      id,
      { monitoredBy: monitoredBy || null },
      { new: true }
    ).select('-passwordHash').populate('monitoredBy', 'username email');

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Error updating user supervisor', error: err });
  }
};

export const updateUserQuota = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { storageQuota } = req.body; // Expecting MB

  try {
    const quotaInBytes = storageQuota * 1024 * 1024;
    const user = await User.findByIdAndUpdate(id, { storageQuota: quotaInBytes }, { new: true }).select('-passwordHash');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Error updating quota', error: err });
  }
};

export const toggleUserStatus = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { isActive } = req.body;

  try {
    const user = await User.findByIdAndUpdate(id, { isActive }, { new: true }).select('-passwordHash');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Error toggling status', error: err });
  }
};

export const resetPassword = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  try {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(id, { passwordHash });
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error resetting password', error: err });
  }
};

export const getStorageStats = async (req: AuthRequest, res: Response) => {
  try {
    const totalFiles = await File.countDocuments();
    const files = await File.find();
    const totalBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);
    
    const typeDistribution = await File.aggregate([
      { $group: { _id: "$type", count: { $sum: 1 }, size: { $sum: "$size" } } }
    ]);

    const topUsers = await User.find({}, 'username totalStorageUsed storageQuota email')
      .sort({ totalStorageUsed: -1 })
      .limit(5);

    res.json({
      totalFiles,
      totalBytes,
      typeDistribution,
      topUsers
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching stats', error: err });
  }
};

export const getSystemDiagnostics = async (req: AuthRequest, res: Response) => {
  try {
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const cpuLoad = os.loadavg();
    const uptime = os.uptime();

    // Get disk usage (uploads folder)
    let diskUsage = 0;
    const uploadsDir = 'uploads';
    if (fs.existsSync(uploadsDir)) {
      const stats = fs.statSync(uploadsDir);
      // This is just the directory size, usually we want the recursive size of all files.
      // For simplicity in this demo, let's use the totalStorageUsed from all users or sum files.
      // But since we already have getStorageStats, maybe we just provide a basic disk metrics or platform stats.
    }

    res.json({
      memory: {
        free: freeMem,
        total: totalMem,
        usage: ((totalMem - freeMem) / totalMem) * 100
      },
      cpu: {
        load: cpuLoad
      },
      disk: {
        platform: os.platform(),
        // On modern systems, getting full disk info without external libs is tricky in Node.
        // We'll provide what we can or stick to the app's 'storage' metrics.
      },
      uptime,
      platform: os.platform(),
      hostname: os.hostname()
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching diagnostics', error: err });
  }
};

export const getActivityLogs = async (req: AuthRequest, res: Response) => {
  const { userId, limit = 50 } = req.query;
  try {
    const query: any = {};
    if (userId && userId !== 'all') query.userId = userId;

    const logs = await ActivityLog.find(query)
      .sort({ timestamp: -1 })
      .limit(Number(limit));
    
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching logs', error: err });
  }
};

export const recalculateAllStorage = async (req: AuthRequest, res: Response) => {
  try {
    const users = await User.find({});
    const results = [];

    for (const user of users) {
      const userBaseDir = path.join('uploads', user.email);
      let physicalBytes = 0;

      // 1. Cleanup: Remove DB records for files that don't exist physically
      const dbFiles = await File.find({ uploadedBy: user._id });
      for (const f of dbFiles) {
        if (!fs.existsSync(f.path)) {
          await File.findByIdAndDelete(f._id);
        }
      }

      // 2. Discovery & Summation: Scan disk for files and add to DB if missing
      if (fs.existsSync(userBaseDir)) {
        // Ensure user has a root folder object in DB
        let userRoot = await Folder.findOne({ createdBy: user._id, parentId: null });
        if (!userRoot) {
            userRoot = new Folder({
                name: user.email,
                parentId: null,
                createdBy: user._id
            });
            await userRoot.save();
        } else if (userRoot.name !== user.email) {
            // Standardize name if it was different
            userRoot.name = user.email;
            await userRoot.save();
        }

        const scanDir = async (dirPath: string, parentFolderId: any) => {
          const items = fs.readdirSync(dirPath);
          for (const item of items) {
            const fullPath = path.join(dirPath, item);
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
              // Try to find matching folder in DB
              let folder = await Folder.findOne({ 
                name: item, 
                createdBy: user._id,
                parentId: parentFolderId 
              });
              
              if (!folder) {
                console.log(`Discovering missing folder: ${item} for user ${user.email}`);
                folder = new Folder({
                  name: item,
                  parentId: parentFolderId,
                  createdBy: user._id
                });
                await folder.save();
              }

              // Recurse into subdirectories
              await scanDir(fullPath, folder._id);
            } else {
              physicalBytes += stats.size;
              
              // Check if file exists in DB
              const exists = await File.findOne({ path: fullPath });
              if (!exists) {
                // Discover and add missing file
                const newFile = new File({
                  name: item,
                  originalName: item,
                  displayName: item,
                  size: stats.size,
                  type: path.extname(item).substring(1) || 'file',
                  path: fullPath,
                  folderId: parentFolderId,
                  uploadedBy: user._id
                });
                await newFile.save();
              } else if (exists.size !== stats.size) {
                // Correct size if mismatched
                exists.size = stats.size;
                await exists.save();
              }
            }
          }
        };

        await scanDir(userBaseDir, userRoot._id);
      }

      const prevSize = user.totalStorageUsed;
      user.totalStorageUsed = physicalBytes;
      await user.save();

      results.push({
        username: user.username,
        prevSize,
        newSize: physicalBytes,
        synced: true
      });
    }

    res.json({ 
      message: 'Deep storage sync completed. Files discovered and usage weights corrected.', 
      details: results 
    });
  } catch (err) {
    console.error('Deep sync failed:', err);
    res.status(500).json({ message: 'Error during deep storage sync', error: err });
  }
};

export const updateUserSharedWith = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { sharedWith } = req.body;

  try {
    const user = await User.findByIdAndUpdate(
      id,
      { sharedWith: sharedWith || [] },
      { new: true }
    ).select('-passwordHash');

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Error updating shared users', error: err });
  }
};
