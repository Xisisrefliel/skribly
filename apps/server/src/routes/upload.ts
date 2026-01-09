import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { r2Service } from '../services/r2.js';
import { d1Service } from '../services/d1.js';
import type { UploadResponse } from '@lecture/shared';

const router: RouterType = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max file size
  },
  fileFilter: (_req, file, cb) => {
    // Accept audio files
    const allowedMimes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/m4a',
      'audio/x-m4a',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/ogg',
      'audio/flac',
      'audio/webm',
      'video/mp4', // Some voice memos are saved as video/mp4
    ];
    
    if (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only audio files are allowed.`));
    }
  },
});

// POST /api/upload - Upload an audio file
router.post('/upload', upload.single('audio'), async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = req.deviceId!;
    const file = req.file;
    const title = (req.body.title as string) || 'Untitled Lecture';

    if (!file) {
      res.status(400).json({ error: 'Bad Request', message: 'No audio file provided' });
      return;
    }

    // Generate unique ID for this transcription
    const id = uuidv4();
    const fileExtension = file.originalname.split('.').pop() || 'mp3';
    const r2Key = `audio/${deviceId}/${id}/original.${fileExtension}`;

    // Upload to R2
    await r2Service.uploadFile(r2Key, file.buffer, file.mimetype);

    // Create transcription record in D1
    await d1Service.createTranscription({
      id,
      deviceId,
      title,
      audioUrl: r2Key,
      audioDuration: null, // Will be set during processing
      transcriptionText: null,
      status: 'pending',
      progress: 0,
      errorMessage: null,
    });

    const response: UploadResponse = {
      id,
      message: 'Audio uploaded successfully. Ready for transcription.',
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export { router as uploadRouter };
