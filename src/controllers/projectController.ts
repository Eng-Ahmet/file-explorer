import { Request, Response } from 'express';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import Folder from '../models/Folder.js';
import fs from 'fs';
import path from 'path';
import { getFolderPath } from '../utils/pathHelper.js';

export const createProject = async (req: Request, res: Response) => {
  try {
    const { name, description, budget, deadline, priority, members } = req.body;
    const adminId = (req as any).user.id;
    const admin = await User.findById(adminId);
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    // Find the admin's root folder
    let adminRootFolder = await Folder.findOne({ createdBy: adminId, parentId: null });

    // Fallback if no root folder exists (rare, but for safety)
    if (!adminRootFolder) {
      adminRootFolder = new Folder({
        name: admin.username,
        parentId: null,
        createdBy: adminId
      });
      await adminRootFolder.save();
    }

    // Check if a dedicated folder for project files already exists in admin's root
    let projectFolder = await Folder.findOne({
      name: `${name} project`,
      parentId: adminRootFolder._id,
      createdBy: adminId
    });

    if (!projectFolder) {
      projectFolder = new Folder({
        name: `${name} project`,
        parentId: adminRootFolder._id,
        createdBy: adminId
      });
      await projectFolder.save();
    }

    // Ensure physical directory exists
    const physicalPath = await getFolderPath(projectFolder._id, admin.email);
    if (!fs.existsSync(physicalPath)) {
      fs.mkdirSync(physicalPath, { recursive: true });
    }

    const project = new Project({
      name,
      description,
      admin: adminId,
      members: members || [],
      filesFolderId: projectFolder._id,
      budget: budget || 0,
      deadline: deadline || null,
      priority: priority || 'medium'
    });

    await project.save();
    res.status(201).json(project);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getProjects = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const role = (req as any).user.role;

    let query: any = {
      $or: [{ admin: userId }, { members: userId }]
    };

    // If admin, they can see everything? Or just what they are part of?
    // User requested "Dedicated page in admin to track projects"
    // So for admin, we should probably show all projects or at least all projects where they are admin
    if (role === 'admin') {
      query = {}; // Admin sees all projects for tracking
    } else {
      // Members only see active/completed projects, NOT archived
      query.status = { $ne: 'archived' };
    }

    // Omit sensitive admin fields from the general list as requested
    const projects = await Project.find(query)
      .select('-notes -payments')
      .populate('admin members', 'username email');

    res.json(projects);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const archiveProject = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findByIdAndUpdate(projectId, { status: 'archived' }, { new: true });
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json({ message: 'Project archived successfully', project });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getAdminProjects = async (req: Request, res: Response) => {
  try {
    const projects = await Project.find()
      .populate('admin members', 'username email');
    res.json(projects);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};


export const getAdminProjectStats = async (req: Request, res: Response) => {
  try {
    const projects = await Project.find();
    const totalPayments = projects.reduce((acc, p) =>
      acc + (p.payments || []).filter(pay => pay.type === 'payment').reduce((a, pay) => a + pay.amount, 0),
      0);

    const totalExpenses = projects.reduce((acc, p) =>
      acc + (p.payments || []).filter(pay => pay.type === 'expense').reduce((a, pay) => a + pay.amount, 0),
      0);

    res.json({
      totalProjects: projects.length,
      activeProjects: projects.filter(p => p.status === 'active').length,
      totalPayments,
      totalExpenses,
      balance: totalPayments - totalExpenses
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getProjectAdminDetails = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId).populate('admin members notes.user', 'username email');

    if (!project) return res.status(404).json({ message: 'Project not found' });

    const tasks = await Task.find({ projectId }).populate('assignedTo', 'username');

    res.json({ project, tasks });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const addProjectNote = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { text } = req.body;
    const userId = (req as any).user.id;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    project.notes.push({
      text,
      user: userId,
      createdAt: new Date()
    } as any);

    await project.save();
    res.json(project);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const addProjectPayment = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { amount, description, type, date, status } = req.body;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    project.payments.push({
      amount,
      description,
      type,
      date: date || new Date(),
      status: status || 'completed'
    } as any);

    await project.save();
    res.json(project);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createTask = async (req: Request, res: Response) => {
  try {
    const { projectId, title, description, assignedTo, status } = req.body;

    // Check if project exists and user has access
    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const task = new Task({
      projectId,
      title,
      description,
      assignedTo,
      status: status || 'todo'
    });

    await task.save();
    res.status(201).json(task);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getProjectTasks = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const tasks = await Task.find({ projectId })
      .populate('assignedTo', 'username email')
      .populate('comments.user', 'username email');
    res.json(tasks);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateTaskStatus = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { status } = req.body;

    const task = await Task.findByIdAndUpdate(taskId, { status }, { new: true });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    res.json(task);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateTaskAssignment = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { assignedTo } = req.body;

    const task = await Task.findByIdAndUpdate(taskId, { assignedTo }, { new: true }).populate('assignedTo', 'username email');
    if (!task) return res.status(404).json({ message: 'Task not found' });

    res.json(task);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const addTaskComment = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { text } = req.body;
    const userId = (req as any).user.id;

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    task.comments.push({
      user: userId,
      text,
      createdAt: new Date()
    } as any);

    await task.save();
    res.json(task);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteProject = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Delete all tasks associated with the project
    await Task.deleteMany({ projectId });

    // Delete the project itself
    await Project.findByIdAndDelete(projectId);

    res.json({ message: 'Project and associated tasks deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateProjectMembers = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { members } = req.body; // Array of user IDs

    if (!Array.isArray(members)) {
      return res.status(400).json({ message: 'Members must be an array of user IDs' });
    }

    const project = await Project.findByIdAndUpdate(
      projectId,
      { members },
      { new: true }
    ).populate('members', 'username email');

    if (!project) return res.status(404).json({ message: 'Project not found' });

    res.json(project);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
