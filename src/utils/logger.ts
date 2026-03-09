import ActivityLog from '../models/ActivityLog.js';
import { Request } from 'express';

export const logActivity = async (userId: string, username: string, action: string, details: string, req: Request) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const log = new ActivityLog({
      userId,
      username,
      action,
      details,
      ip: typeof ip === 'string' ? ip : JSON.stringify(ip),
      userAgent,
      timestamp: new Date()
    });

    await log.save();
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
};
