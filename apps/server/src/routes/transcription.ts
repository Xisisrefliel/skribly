import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { d1Service } from '../services/d1.js';
import { r2Service } from '../services/r2.js';
import { groqService } from '../services/groq.js';
import { processAudioFile, cleanupTempDir } from '../services/audio.js';
import type { TranscriptionListResponse, TranscriptionDetailResponse, TranscribeResponse } from '@lecture/shared';

const router: RouterType = Router();

// GET /api/transcriptions - List all transcriptions for the device
router.get('/transcriptions', async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = req.deviceId!;
    const transcriptions = await d1Service.getTranscriptionsByDevice(deviceId);

    const response: TranscriptionListResponse = { transcriptions };
    res.json(response);
  } catch (error) {
    console.error('List transcriptions error:', error);
    res.status(500).json({ 
      error: 'Failed to list transcriptions', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// GET /api/transcription/:id - Get a single transcription
router.get('/transcription/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = req.deviceId!;
    const { id } = req.params;

    const transcription = await d1Service.getTranscription(id, deviceId);

    if (!transcription) {
      res.status(404).json({ error: 'Not Found', message: 'Transcription not found' });
      return;
    }

    const response: TranscriptionDetailResponse = { transcription };
    res.json(response);
  } catch (error) {
    console.error('Get transcription error:', error);
    res.status(500).json({ 
      error: 'Failed to get transcription', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// POST /api/transcribe/:id - Start transcription process
router.post('/transcribe/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const deviceId = req.deviceId!;
  let tempDir: string | null = null;

  try {
    // Get the transcription record
    const transcription = await d1Service.getTranscription(id, deviceId);

    if (!transcription) {
      res.status(404).json({ error: 'Not Found', message: 'Transcription not found' });
      return;
    }

    if (transcription.status === 'processing') {
      res.status(409).json({ error: 'Conflict', message: 'Transcription is already processing' });
      return;
    }

    if (transcription.status === 'completed') {
      res.status(200).json({ 
        id, 
        status: 'completed', 
        message: 'Transcription already completed' 
      } as TranscribeResponse);
      return;
    }

    // Update status to processing
    await d1Service.updateTranscriptionStatus(id, 'processing', 0);

    // Respond immediately, process in background
    res.status(202).json({ 
      id, 
      status: 'processing', 
      message: 'Transcription started' 
    } as TranscribeResponse);

    // Process in background (don't await)
    processTranscription(id, deviceId, transcription.audioUrl!).catch(err => {
      console.error(`Background transcription error for ${id}:`, err);
    });

  } catch (error) {
    console.error('Start transcription error:', error);
    res.status(500).json({ 
      error: 'Failed to start transcription', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Background transcription processing
async function processTranscription(id: string, deviceId: string, audioUrl: string): Promise<void> {
  let tempDir: string | null = null;

  try {
    console.log(`Starting transcription for ${id}`);

    // Download audio from R2
    const audioBuffer = await r2Service.getFile(audioUrl);
    const filename = audioUrl.split('/').pop() || 'audio.mp3';

    // Process audio (convert and split)
    await d1Service.updateTranscriptionStatus(id, 'processing', 0.1);
    const { chunks, totalDuration, tempDir: processedTempDir } = await processAudioFile(audioBuffer, filename);
    tempDir = processedTempDir;

    console.log(`Audio processed: ${totalDuration}s, ${chunks.length} chunks`);
    await d1Service.updateTranscriptionStatus(id, 'processing', 0.2);

    // Transcribe each chunk
    const transcriptionParts: string[] = [];
    const progressPerChunk = 0.7 / chunks.length; // 70% of progress for transcription

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`Transcribing chunk ${i + 1}/${chunks.length}`);

      const result = await groqService.transcribeFile(chunk.filePath);
      transcriptionParts.push(result.text);

      const progress = 0.2 + (i + 1) * progressPerChunk;
      await d1Service.updateTranscriptionStatus(id, 'processing', progress);
    }

    // Merge transcription parts
    const fullTranscription = transcriptionParts.join('\n\n');

    // Update with completed transcription
    await d1Service.updateTranscriptionText(id, fullTranscription, totalDuration);

    console.log(`Transcription completed for ${id}`);

  } catch (error) {
    console.error(`Transcription failed for ${id}:`, error);
    await d1Service.updateTranscriptionStatus(
      id, 
      'error', 
      0, 
      error instanceof Error ? error.message : 'Unknown error'
    );
  } finally {
    // Cleanup temp files
    if (tempDir) {
      cleanupTempDir(tempDir);
    }
  }
}

// DELETE /api/transcription/:id - Delete a transcription
router.delete('/transcription/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = req.deviceId!;
    const { id } = req.params;

    // Get the transcription to find the audio URL
    const transcription = await d1Service.getTranscription(id, deviceId);

    if (!transcription) {
      res.status(404).json({ error: 'Not Found', message: 'Transcription not found' });
      return;
    }

    // Delete from R2 if there's an audio file
    if (transcription.audioUrl) {
      try {
        await r2Service.deleteFile(transcription.audioUrl);
      } catch (err) {
        console.warn(`Failed to delete audio file: ${transcription.audioUrl}`, err);
      }
    }

    // Delete from D1
    await d1Service.deleteTranscription(id, deviceId);

    res.status(200).json({ message: 'Transcription deleted successfully' });
  } catch (error) {
    console.error('Delete transcription error:', error);
    res.status(500).json({ 
      error: 'Failed to delete transcription', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export { router as transcriptionRouter };
