import express from 'express';
import {
  createProject,
  getProjects,
  getAdminProjects,
  createTask,
  getProjectTasks,
  updateTaskStatus,
  updateTaskAssignment,
  addTaskComment,
  getAdminProjectStats,
  getProjectAdminDetails,
  addProjectNote,
  addProjectPayment,
  archiveProject,
  deleteProject,
  updateProjectMembers
} from '../controllers/projectController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Projects
router.post('/', authenticate, requireAdmin, createProject);
router.get('/', authenticate, getProjects);
router.get('/admin/list', authenticate, requireAdmin, getAdminProjects);
router.get('/admin/stats', authenticate, requireAdmin, getAdminProjectStats);
router.get('/admin/:projectId', authenticate, requireAdmin, getProjectAdminDetails);
router.put('/admin/:projectId/members', authenticate, requireAdmin, updateProjectMembers);
router.delete('/:projectId', authenticate, requireAdmin, deleteProject);
router.post('/admin/:projectId/notes', authenticate, requireAdmin, addProjectNote);
router.post('/admin/:projectId/payments', authenticate, requireAdmin, addProjectPayment);

// Tasks
router.post('/tasks', authenticate, createTask);
router.get('/:projectId/tasks', authenticate, getProjectTasks);
router.patch('/:projectId/note', authenticate, addProjectNote); 
router.patch('/:projectId/payment', authenticate, addProjectPayment); 
router.patch('/:projectId/archive', authenticate, archiveProject); 
router.patch('/tasks/:taskId/status', authenticate, updateTaskStatus); 
router.patch('/tasks/:taskId/assignment', authenticate, updateTaskAssignment);
router.post('/tasks/:taskId/comments', authenticate, addTaskComment);

export default router;
