import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { d1Service } from '../services/d1.js';
import { r2Service } from '../services/r2.js';
import type { SourceDownloadResponse, SourceType, TranscriptionDetailResponse } from '@lecture/shared';

const router: RouterType = Router();

const getSourceExtension = (sourceType: SourceType, mimeType?: string | null) => {
  const mimeExtensionMap: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'video/mp4': 'mp4',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  };

  if (mimeType && mimeExtensionMap[mimeType]) {
    return mimeExtensionMap[mimeType];
  }

  if (sourceType === 'audio') {
    return 'mp3';
  }

  if (sourceType === 'video') {
    return 'mp4';
  }

  return sourceType;
};

const buildDefaultSourceName = (title: string, sourceType: SourceType, mimeType?: string | null) =>
  `${title}.${getSourceExtension(sourceType, mimeType)}`;

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


// GET /api/public/transcription/:id/source - Download public source file(s)
router.get('/transcription/:id/source', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const transcription = await d1Service.getPublicTranscription(id);

    if (!transcription) {
      res.status(404).json({ error: 'Not Found', message: 'Transcription not found or not public' });
      return;
    }

    if (!transcription.audioUrl) {
      res.status(404).json({ error: 'Not Found', message: 'Source file not available' });
      return;
    }

    const trimmedSource = transcription.audioUrl.trim();
    if (trimmedSource.startsWith('[') && trimmedSource.endsWith(']')) {
      try {
        const parsedFiles = JSON.parse(trimmedSource) as Array<{ key: string; originalName?: string; sourceType?: SourceType }>;
        const files = await Promise.all(parsedFiles.map(async (file) => {
          const url = await r2Service.getSignedUrl(file.key, 86400);
          return {
            url,
            originalName: file.originalName || buildDefaultSourceName(transcription.title, file.sourceType ?? transcription.sourceType, transcription.mimeType),
            sourceType: (file.sourceType ?? transcription.sourceType) as SourceType,
          };
        }));

        const response: SourceDownloadResponse = { files };
        res.json(response);
        return;
      } catch (parseError) {
        console.warn('Failed to parse public source key as batch download:', parseError);
      }
    }

    const url = await r2Service.getSignedUrl(transcription.audioUrl, 86400);
    const originalName = transcription.originalFileName?.trim() || buildDefaultSourceName(transcription.title, transcription.sourceType, transcription.mimeType);
    const response: SourceDownloadResponse = {
      files: [{ url, originalName, sourceType: transcription.sourceType }],
    };
    res.json(response);
  } catch (error) {
    console.error('Download public source error:', error);
    res.status(500).json({
      error: 'Failed to download source file',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export { router as publicRouter };

