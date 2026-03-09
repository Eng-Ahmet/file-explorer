import { Router } from 'express';
import * as adminController from '../controllers/adminController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/users', adminController.getAllUsers);
router.get('/stats', adminController.getStorageStats);
router.get('/diagnostics', adminController.getSystemDiagnostics);
router.get('/logs', adminController.getActivityLogs);

router.put('/users/:id/role', adminController.updateUserRole);
router.put('/users/:id/permissions', adminController.updateUserPermissions);
router.patch('/users/:id/supervisor', adminController.updateSupervisor);
router.patch('/users/:id/quota', adminController.updateUserQuota);
router.patch('/users/:id/status', adminController.toggleUserStatus);
router.post('/users/:id/reset-password', adminController.resetPassword);
router.post('/sync-storage', adminController.recalculateAllStorage);
router.delete('/users/:id', adminController.deleteUser);

export default router;
