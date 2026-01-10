import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { d1Service } from '../services/d1.js';
import { r2Service } from '../services/r2.js';
import { groqService } from '../services/groq.js';
import { llmService } from '../services/llm.js';
import { pdfService } from '../services/pdf.js';
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

    if (transcription.status === 'processing' || transcription.status === 'structuring') {
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
    // Get the transcription for the title
    const transcriptionRecord = await d1Service.getTranscription(id, deviceId);
    const title = transcriptionRecord?.title || 'Untitled Lecture';

    console.log(`Starting transcription for ${id}: "${title}"`);

    // Download audio from R2
    const audioBuffer = await r2Service.getFile(audioUrl);
    const filename = audioUrl.split('/').pop() || 'audio.mp3';

    // Process audio (convert and split)
    await d1Service.updateTranscriptionStatus(id, 'processing', 0.1);
    const { chunks, totalDuration, tempDir: processedTempDir } = await processAudioFile(audioBuffer, filename);
    tempDir = processedTempDir;

    console.log(`Audio processed: ${totalDuration}s, ${chunks.length} chunks`);
    await d1Service.updateTranscriptionStatus(id, 'processing', 0.15);

    // Transcribe each chunk (0.15 - 0.80 progress)
    const transcriptionParts: string[] = [];
    const progressPerChunk = 0.65 / chunks.length;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`Transcribing chunk ${i + 1}/${chunks.length}`);

      const result = await groqService.transcribeFile(chunk.filePath);
      transcriptionParts.push(result.text);

      const progress = 0.15 + (i + 1) * progressPerChunk;
      await d1Service.updateTranscriptionStatus(id, 'processing', Math.min(progress, 0.80));
    }

    // Merge transcription parts
    const fullTranscription = transcriptionParts.join('\n\n');
    console.log(`Transcription complete for ${id}, length: ${fullTranscription.length} chars`);

    // Save raw transcription and update status to structuring
    await d1Service.updateTranscriptionText(id, fullTranscription, totalDuration);
    console.log(`Starting LLM structuring for ${id}`);

    // Structure the transcription with LLM (0.90 - 1.0 progress)
    try {
      const { structuredText } = await llmService.structureTranscription(fullTranscription, title);
      
      // Save structured text and mark as completed
      await d1Service.updateStructuredText(id, structuredText);
      console.log(`Structuring completed for ${id}`);

      // Generate PDF in background after structuring completes
      if (structuredText) {
        try {
          console.log(`Starting background PDF generation for ${id}`);
          const pdfResult = await pdfService.generateAndUpload(id, structuredText, title, 'structured');
          await d1Service.updatePdfInfo(id, pdfResult.pdfKey);
          console.log(`PDF generated and saved for ${id}: ${pdfResult.pdfKey}`);
        } catch (pdfError) {
          // PDF generation failure should not fail the transcription
          console.error(`Background PDF generation failed for ${id}:`, pdfError);
        }
      }
    } catch (llmError) {
      // If LLM fails, still mark as completed but without structured text
      console.error(`LLM structuring failed for ${id}:`, llmError);
      await d1Service.updateStructuredText(id, ''); // Empty structured text, but still complete
      console.log(`Transcription completed for ${id} (without structuring)`);
    }

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

// POST /api/transcription/:id/pdf - Generate PDF for transcription
router.post('/transcription/:id/pdf', async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = req.deviceId!;
    const { id } = req.params;
    const { type = 'structured', regenerate = false } = req.body as { 
      type?: 'structured' | 'raw';
      regenerate?: boolean;
    };

    // Get the transcription
    const transcription = await d1Service.getTranscription(id, deviceId);

    if (!transcription) {
      res.status(404).json({ error: 'Not Found', message: 'Transcription not found' });
      return;
    }

    if (transcription.status !== 'completed') {
      res.status(400).json({ error: 'Bad Request', message: 'Transcription is not completed yet' });
      return;
    }

    // For structured type, check if we have a cached PDF
    if (type === 'structured' && transcription.pdfKey && !regenerate) {
      try {
        // Get a fresh signed URL for the existing PDF (valid for 24 hours)
        const pdfUrl = await r2Service.getSignedUrl(transcription.pdfKey, 86400);
        console.log(`Returning cached PDF for ${id}: ${transcription.pdfKey}`);
        res.json({
          pdfUrl,
          message: 'PDF retrieved from cache',
          cached: true,
          generatedAt: transcription.pdfGeneratedAt,
        });
        return;
      } catch (cacheError) {
        // If cached PDF retrieval fails, regenerate
        console.warn(`Failed to retrieve cached PDF for ${id}, regenerating:`, cacheError);
      }
    }

    // Determine which content to use
    let content: string;
    if (type === 'structured' && transcription.structuredText) {
      content = transcription.structuredText;
    } else if (transcription.transcriptionText) {
      content = transcription.transcriptionText;
    } else {
      res.status(400).json({ error: 'Bad Request', message: 'No content available for PDF generation' });
      return;
    }

    // Generate and upload PDF
    const result = await pdfService.generateAndUpload(
      id,
      content,
      transcription.title,
      type
    );

    // Update the transcription with new PDF info for structured type
    if (type === 'structured') {
      await d1Service.updatePdfInfo(id, result.pdfKey);
    }

    res.json({
      pdfUrl: result.pdfUrl,
      message: regenerate ? 'PDF regenerated successfully' : 'PDF generated successfully',
      cached: false,
    });
  } catch (error) {
    console.error('Generate PDF error:', error);
    res.status(500).json({
      error: 'Failed to generate PDF',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// DELETE /api/transcription/:id - Delete a transcription
router.delete('/transcription/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = req.deviceId!;
    const { id } = req.params;

    // Get the transcription to find the audio URL and PDF key
    const transcription = await d1Service.getTranscription(id, deviceId);

    if (!transcription) {
      res.status(404).json({ error: 'Not Found', message: 'Transcription not found' });
      return;
    }

    // Delete audio from R2 if exists
    if (transcription.audioUrl) {
      try {
        await r2Service.deleteFile(transcription.audioUrl);
      } catch (err) {
        console.warn(`Failed to delete audio file: ${transcription.audioUrl}`, err);
      }
    }

    // Delete PDF from R2 if exists
    if (transcription.pdfKey) {
      try {
        await r2Service.deleteFile(transcription.pdfKey);
      } catch (err) {
        console.warn(`Failed to delete PDF file: ${transcription.pdfKey}`, err);
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
