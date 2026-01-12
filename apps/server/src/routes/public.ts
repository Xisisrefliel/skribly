import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { d1Service } from '../services/d1.js';
import type { TranscriptionDetailResponse } from '@lecture/shared';

const router: RouterType = Router();

// GET /api/public/transcription/:id - Get a public transcription (no auth required)
router.get('/transcription/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const transcription = await d1Service.getPublicTranscription(id);

    if (!transcription) {
      res.status(404).json({ error: 'Not Found', message: 'Transcription not found or not public' });
      return;
    }

    const response: TranscriptionDetailResponse = { transcription };
    res.json(response);
  } catch (error) {
    console.error('Get public transcription error:', error);
    res.status(500).json({ 
      error: 'Failed to get transcription', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export { router as publicRouter };
