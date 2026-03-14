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
import projectRoutes from './routes/projects.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/file-manager';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Dynamic path resolution
const rootDir = process.cwd();
const publicDir = path.resolve(rootDir, 'public');
const viewsDir = path.resolve(rootDir, 'src', 'views', 'pages');

console.log('--- Path Configuration ---');
console.log('Root:', rootDir);
console.log('Public:', publicDir);
console.log('Views:', viewsDir);
console.log('---------------------------');

app.use(express.static(publicDir));

// EJS Configuration
app.set('view engine', 'ejs');
app.set('views', viewsDir);

// Ensure uploads directory exists
const uploadsDir = path.join(rootDir, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/projects', projectRoutes);

// Serve pages
app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));
app.get('/admin', (req, res) => res.render('admin-dashboard'));
app.get('/admin/users', (req, res) => res.render('users'));
app.get('/admin/projects', (req, res) => res.render('admin-projects'));
app.get('/admin/create-project', (req, res) => res.render('admin-create-project'));
app.get('/files', (req, res) => res.render('index'));
app.get('/projects', (req, res) => res.render('projects'));

// Home redirect
app.get('/', (req, res) => res.redirect('/files'));

// Fallback to Dashboard/Home for non-asset requests
app.get('*', (req, res, next) => {
  // If requesting a file (with extension), don't render HTML - let it fall through to 404
  if (path.extname(req.url)) {
    return next();
  }
  res.render('index');
});
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
