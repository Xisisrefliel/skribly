import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { d1Service } from '../services/d1.js';
import type { FolderListResponse } from '@lecture/shared';

const router: RouterType = Router();

// GET /api/folders - List all folders for the user
router.get('/folders', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const folders = await d1Service.getFoldersByUser(userId);

    const response: FolderListResponse = { folders };
    res.json(response);
  } catch (error) {
    console.error('List folders error:', error);
    res.status(500).json({ 
      error: 'Failed to list folders', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// POST /api/folders - Create a new folder
router.post('/folders', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { name, color = '#0ea5e9' } = req.body as { name?: string; color?: string };

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Bad Request', message: 'Folder name is required' });
      return;
    }

    const id = uuidv4();
    await d1Service.createFolder(id, userId, name.trim(), color);

    const folders = await d1Service.getFoldersByUser(userId);
    const folder = folders.find(f => f.id === id);

    res.status(201).json({ folder });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ 
      error: 'Failed to create folder', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// PATCH /api/folders/:id - Update folder
router.patch('/folders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { name, color } = req.body as { name?: string; color?: string };

    // Verify folder exists and belongs to user
    const folders = await d1Service.getFoldersByUser(userId);
    const folder = folders.find(f => f.id === id);

    if (!folder) {
      res.status(404).json({ error: 'Not Found', message: 'Folder not found' });
      return;
    }

    // Update folder
    if (name !== undefined && name.trim().length === 0) {
      res.status(400).json({ error: 'Bad Request', message: 'Folder name cannot be empty' });
      return;
    }

    await d1Service.updateFolder(id, userId, name?.trim(), color);

    // Return updated folder
    const updatedFolders = await d1Service.getFoldersByUser(userId);
    const updatedFolder = updatedFolders.find(f => f.id === id);

    res.json({ folder: updatedFolder });
  } catch (error) {
    console.error('Update folder error:', error);
    res.status(500).json({ 
      error: 'Failed to update folder', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// DELETE /api/folders/:id - Delete a folder
router.delete('/folders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Verify folder exists and belongs to user
    const folders = await d1Service.getFoldersByUser(userId);
    const folder = folders.find(f => f.id === id);

    if (!folder) {
      res.status(404).json({ error: 'Not Found', message: 'Folder not found' });
      return;
    }

    await d1Service.deleteFolder(id, userId);

    res.status(200).json({ message: 'Folder deleted successfully' });
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ 
      error: 'Failed to delete folder', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export { router as foldersRouter };
