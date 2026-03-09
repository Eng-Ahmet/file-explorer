import { Router } from 'express';
import * as fileController from '../controllers/fileController.js';
import { authenticate } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';

const router = Router();

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

router.use(authenticate);

router.get('/', fileController.getFiles);
router.post('/upload', upload.single('file'), fileController.uploadFile);
router.delete('/:id', fileController.deleteFile);
router.get('/view/:id', fileController.viewFile);
router.get('/download/:id', fileController.downloadFile);

export default router;
