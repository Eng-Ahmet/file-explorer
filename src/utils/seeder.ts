import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Folder from '../models/Folder.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const seedAdmin = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/file-manager';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const adminEmail = 'test@hwai-technology.com';
    const adminPassword = '741321'; // Change this in production

    const existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(adminPassword, salt);

    const adminUser = new User({
      username: 'admin',
      email: adminEmail,
      passwordHash,
      role: 'admin',
      permissions: {
        canUpload: true,
        canView: true,
        canDelete: true,
        canShare: true
      }
    });

    await adminUser.save();
    console.log('Admin user seeded successfully');

    // Create root folder for admin
    const rootFolder = new Folder({
      name: adminEmail,
      parentId: null,
      createdBy: adminUser._id
    });
    await rootFolder.save();
    console.log('Admin root folder created');

    // Create physical directory for admin
    const adminPath = path.join(process.cwd(), 'uploads', adminUser.email);
    if (!fs.existsSync(adminPath)) {
      fs.mkdirSync(adminPath, { recursive: true });
    }
    console.log('Admin physical directory created');

    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);

    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin user:', error);
    process.exit(1);
  }
};

seedAdmin();
