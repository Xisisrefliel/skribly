import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { d1Service } from '../services/d1.js';
import type { TagListResponse } from '@lecture/shared';

const router: RouterType = Router();

// GET /api/tags - List all tags for the user
router.get('/tags', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const tags = await d1Service.getTagsByUser(userId);

    const response: TagListResponse = { tags };
    res.json(response);
  } catch (error) {
    console.error('List tags error:', error);
    res.status(500).json({ 
      error: 'Failed to list tags', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// POST /api/tags - Create a new tag
router.post('/tags', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { name, color = '#0ea5e9' } = req.body as { name?: string; color?: string };

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Bad Request', message: 'Tag name is required' });
      return;
    }

    const id = uuidv4();
    await d1Service.createTag(id, userId, name.trim(), color);

    const tags = await d1Service.getTagsByUser(userId);
    const tag = tags.find(t => t.id === id);

    res.status(201).json({ tag });
  } catch (error) {
    console.error('Create tag error:', error);
    res.status(500).json({ 
      error: 'Failed to create tag', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// PATCH /api/tags/:id - Update tag
router.patch('/tags/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { name, color } = req.body as { name?: string; color?: string };

    // Verify tag exists and belongs to user
    const tags = await d1Service.getTagsByUser(userId);
    const tag = tags.find(t => t.id === id);

    if (!tag) {
      res.status(404).json({ error: 'Not Found', message: 'Tag not found' });
      return;
    }

    // Update tag
    if (name !== undefined && name.trim().length === 0) {
      res.status(400).json({ error: 'Bad Request', message: 'Tag name cannot be empty' });
      return;
    }

    await d1Service.updateTag(id, userId, name?.trim(), color);

    // Return updated tag
    const updatedTags = await d1Service.getTagsByUser(userId);
    const updatedTag = updatedTags.find(t => t.id === id);

    res.json({ tag: updatedTag });
  } catch (error) {
    console.error('Update tag error:', error);
    res.status(500).json({ 
      error: 'Failed to update tag', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// DELETE /api/tags/:id - Delete a tag
router.delete('/tags/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Verify tag exists and belongs to user
    const tags = await d1Service.getTagsByUser(userId);
    const tag = tags.find(t => t.id === id);

    if (!tag) {
      res.status(404).json({ error: 'Not Found', message: 'Tag not found' });
      return;
    }

    await d1Service.deleteTag(id, userId);

    res.status(200).json({ message: 'Tag deleted successfully' });
  } catch (error) {
    console.error('Delete tag error:', error);
    res.status(500).json({ 
      error: 'Failed to delete tag', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export { router as tagsRouter };
