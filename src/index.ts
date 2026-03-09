import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import fileRoutes from './routes/files.js';
import folderRoutes from './routes/folders.js';
import adminRoutes from './routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/file-explorer';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), 'public')));

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/admin', adminRoutes);

// Serve pages
app.get('/login', (req, res) => res.sendFile(path.join(process.cwd(), 'public', 'pages', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(process.cwd(), 'public', 'pages', 'register.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(process.cwd(), 'public', 'pages', 'admin.html')));
app.get('/files', (req, res) => res.sendFile(path.join(process.cwd(), 'public', 'pages', 'index.html')));

// Fallback to Dashboard/Home
app.get('*', (req, res) => res.sendFile(path.join(process.cwd(), 'public', 'pages', 'index.html')));
// Database Connection
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
  });
