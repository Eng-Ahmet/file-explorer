import { Router } from 'express';
import * as folderController from '../controllers/folderController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', folderController.getFolders);
router.post('/', folderController.createFolder);
router.put('/:id/rename', folderController.renameFolder);
router.delete('/:id', folderController.deleteFolder);
router.post('/share', folderController.shareFolder);
router.post('/revoke', folderController.revokeFolderAccess);

export default router;
