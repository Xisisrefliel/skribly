import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { d1Service } from '../services/d1.js';
import { r2Service } from '../services/r2.js';
import { pdfService } from '../services/pdf.js';
import { transcriptionService } from '../services/transcription.js';
import type { TranscriptionProvider } from '../services/transcription.js';
import { llmService } from '../services/llm.js';
import { usageService } from '../services/usage.js';
import {
  addTranscriptionEventClient,
  broadcastTranscriptionPing,
  broadcastTranscriptionUpdate,
  removeTranscriptionEventClient,
} from '../services/transcriptionEvents.js';

import { documentService } from '../services/document.js';
import { enhancedDocumentService } from '../services/enhancedDocument.js';
import { processAudioFile, cleanupTempDir } from '../services/audio.js';
import type {
  FlashcardDeck,
  Quiz,
  SourceDownloadResponse,
  SourceType,
  TranscribeResponse,
  TranscriptionDetailResponse,
  TranscriptionListResponse,
  TranscriptionStatus,
} from '@lecture/shared';

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

const createTranscriptionEventPayload = (
  transcriptionId: string,
  status: TranscriptionStatus,
  progress: number,
  errorMessage?: string | null
) => ({
  transcriptionId,
  status,
  progress,
  errorMessage: errorMessage ?? null,
  updatedAt: new Date().toISOString(),
});

async function updateTranscriptionStatusWithEvent(
  userId: string,
  transcriptionId: string,
  status: TranscriptionStatus,
  progress: number,
  errorMessage?: string
): Promise<void> {
  await d1Service.updateTranscriptionStatus(transcriptionId, status, progress, errorMessage);
  broadcastTranscriptionUpdate(userId, createTranscriptionEventPayload(transcriptionId, status, progress, errorMessage));
}

async function isTranscriptionCanceled(transcriptionId: string, userId: string): Promise<boolean> {
  const transcription = await d1Service.getTranscription(transcriptionId, userId);
  return transcription?.status === 'canceled';
}

// GET /api/transcriptions - List all transcriptions for the user (with optional folder and tag filters)
router.get('/transcriptions', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const folderId = req.query.folderId as string | undefined;
    const tagIds = req.query.tagIds ? (Array.isArray(req.query.tagIds) ? req.query.tagIds as string[] : [req.query.tagIds as string]) : undefined;

    // Convert folderId string to null if it's the string "null"
    const folderIdValue = folderId === 'null' ? null : folderId;

    const transcriptions = await d1Service.getTranscriptionsByUserWithTags(userId, folderIdValue, tagIds);

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

// GET /api/transcriptions/events - Stream transcription updates
router.get('/transcriptions/events', (req: Request, res: Response): void => {
  const userId = req.userId!;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  addTranscriptionEventClient(userId, res);
  res.write('event: ready\ndata: {}\n\n');

  const heartbeat = setInterval(() => {
    broadcastTranscriptionPing(userId);
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeTranscriptionEventClient(userId, res);
  });
});

// GET /api/transcription/:id - Get a single transcription
router.get('/transcription/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const transcription = await d1Service.getTranscription(id, userId);

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

// GET /api/transcription/:id/source - Download original source file(s)
router.get('/transcription/:id/source', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const transcription = await d1Service.getTranscription(id, userId);

    if (!transcription) {
      res.status(404).json({ error: 'Not Found', message: 'Transcription not found' });
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
        console.warn('Failed to parse source key as batch download:', parseError);
      }
    }

    const url = await r2Service.getSignedUrl(transcription.audioUrl, 86400);
    const originalName = transcription.originalFileName?.trim() || buildDefaultSourceName(transcription.title, transcription.sourceType, transcription.mimeType);
    const response: SourceDownloadResponse = {
      files: [{ url, originalName, sourceType: transcription.sourceType }],
    };
    res.json(response);
  } catch (error) {
    console.error('Download source error:', error);
    res.status(500).json({
      error: 'Failed to download source file',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/transcription/:id/pdf - Download structured PDF

router.get('/transcription/:id/pdf', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const transcription = await d1Service.getTranscription(id, userId);

    if (!transcription) {
      res.status(404).json({ error: 'Not Found', message: 'Transcription not found' });
      return;
    }

    if (!transcription.pdfKey) {
      res.status(404).json({ error: 'Not Found', message: 'PDF not ready yet' });
      return;
    }

    const url = await r2Service.getSignedUrl(transcription.pdfKey, 86400);
    res.json({ url });
  } catch (error) {
    console.error('Download PDF error:', error);
    res.status(500).json({
      error: 'Failed to download PDF',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/transcription/:id/pdf - Generate structured PDF on demand
router.post('/transcription/:id/pdf', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const transcription = await d1Service.getTranscription(id, userId);

    if (!transcription) {
      res.status(404).json({ error: 'Not Found', message: 'Transcription not found' });
      return;
    }

    if (!transcription.structuredText) {
      console.warn(`[PDF Generation] Structured text not ready for transcription ${id}`, {
        status: transcription.status,
        hasStructuredText: !!transcription.structuredText,
      });
      res.status(409).json({
        error: 'Conflict',
        message: 'Structured transcription not ready yet. Please wait for the AI to finish processing.'
      });
      return;
    }

    if (transcription.pdfKey) {
      console.log(`[PDF Generation] PDF already exists for transcription ${id}, returning signed URL`);
      const url = await r2Service.getSignedUrl(transcription.pdfKey, 86400);
      res.json({ url });
      return;
    }

    console.log(`[PDF Generation] Starting PDF generation for transcription ${id}`, {
      titleLength: transcription.title.length,
      contentLength: transcription.structuredText.length,
    });

    const { pdfKey, pdfUrl } = await pdfService.generateAndUpload(
      id,
      userId,
      transcription.structuredText,
      transcription.title,
      'structured'
    );

    await d1Service.updatePdfInfo(id, pdfKey);

    console.log(`[PDF Generation] PDF generated successfully for transcription ${id}`);
    res.json({ url: pdfUrl });
  } catch (error) {
    console.error('Generate PDF error:', error, {
      transcriptionId: id,
      userId,
    });
    res.status(500).json({
      error: 'Failed to generate PDF',
      message: error instanceof Error ? error.message : 'Unknown error occurred during PDF generation',
    });
  }
});

// POST /api/transcription/:id/cancel - Cancel a transcription in progress
router.post('/transcription/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.userId!;

  try {
    const transcription = await d1Service.getTranscription(id, userId);

    if (!transcription) {
      res.status(404).json({ error: 'Not Found', message: 'Transcription not found' });
      return;
    }

    if (
      transcription.status === 'completed' ||
      transcription.status === 'error' ||
      transcription.status === 'canceled'
    ) {
      res.status(409).json({ error: 'Conflict', message: 'Transcription is not cancelable' });
      return;
    }

    await updateTranscriptionStatusWithEvent(
      userId,
      id,
      'canceled',
      transcription.progress ?? 0
    );

    res.status(202).json({
      id,
      status: 'canceled',
      message: 'Transcription canceled',
    } as TranscribeResponse);
  } catch (error) {
    console.error('Cancel transcription error:', error);
    res.status(500).json({
      error: 'Failed to cancel transcription',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/transcription/:id/reprocess - Re-run transcription and structuring
router.post('/transcription/:id/reprocess', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.userId!;

  try {
    const isActive = await d1Service.isSubscriptionActive(userId);
    if (!isActive) {
      res.status(402).json({
        error: 'Subscription required',
        message: 'An active subscription is required to reprocess transcription.',
      });
      return;
    }

    const transcription = await d1Service.getTranscription(id, userId);

    if (!transcription) {
      res.status(404).json({ error: 'Not Found', message: 'Transcription not found' });
      return;
    }

    if (transcription.status === 'processing' || transcription.status === 'structuring') {
      res.status(409).json({ error: 'Conflict', message: 'Transcription is already processing' });
      return;
    }

    const { sourceType, audioUrl, mimeType } = transcription as typeof transcription & {
      sourceType?: string;
      mimeType?: string | null;
    };

    if (!audioUrl) {
      throw new Error('No source file URL found');
    }

    await d1Service.clearStructuredContent(id);
    await updateTranscriptionStatusWithEvent(userId, id, 'processing', 0);

    res.status(202).json({
      id,
      status: 'processing',
      message: 'Reprocessing started',
    } as TranscribeResponse);

    if (sourceType === 'pdf' || sourceType === 'pptx' || sourceType === 'ppt') {
      processDocumentTranscription(
        id,
        userId,
        audioUrl,
        sourceType as 'pdf' | 'pptx' | 'ppt',
        mimeType
      ).catch(err => {
        console.error(`Background document processing error for ${id}:`, err);
      });
    } else {
      processTranscription(id, userId, audioUrl).catch(err => {
        console.error(`Background transcription error for ${id}:`, err);
      });
    }
  } catch (error) {
    console.error('Reprocess transcription error:', error);
    res.status(500).json({
      error: 'Failed to reprocess transcription',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/transcription/:id/restructure - Re-run LLM structuring from raw text
router.post('/transcription/:id/restructure', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.userId!;

  try {
    const isActive = await d1Service.isSubscriptionActive(userId);
    if (!isActive) {
      res.status(402).json({
        error: 'Subscription required',
        message: 'An active subscription is required to recreate notes.',
      });
      return;
    }

    const transcription = await d1Service.getTranscription(id, userId);

    if (!transcription) {
      res.status(404).json({ error: 'Not Found', message: 'Transcription not found' });
      return;
    }

    if (transcription.status === 'processing' || transcription.status === 'structuring') {
      res.status(409).json({ error: 'Conflict', message: 'Transcription is already processing' });
      return;
    }

    if (!transcription.transcriptionText) {
      res.status(400).json({
        error: 'Missing transcription text',
        message: 'No raw transcription text found to restructure.'
      });
      return;
    }

    await d1Service.clearStructuredContent(id);
    await updateTranscriptionStatusWithEvent(userId, id, 'structuring', 0.85);

    res.status(202).json({
      id,
      status: 'structuring',
      message: 'Restructuring started',
    } as TranscribeResponse);

    processFromRawText(
      id,
      userId,
      transcription.transcriptionText,
      transcription.title,
      transcription.whisperModel,
      transcription.audioDuration ?? 0
    ).catch(err => {
      console.error(`Background restructuring error for ${id}:`, err);
    });
  } catch (error) {
    console.error('Restructure transcription error:', error);
    res.status(500).json({
      error: 'Failed to restructure transcription',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/transcribe/:id - Start transcription process
router.post('/transcribe/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.userId!;
  const { mode } = req.body as { mode?: TranscriptionMode };

  try {
    if (mode && mode !== 'fast' && mode !== 'quality') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'mode must be either fast or quality',
      });
      return;
    }

    const isActive = await d1Service.isSubscriptionActive(userId);
    if (!isActive) {
      res.status(402).json({
        error: 'Subscription required',
        message: 'An active subscription is required to start transcription.',
      });
      return;
    }

    // Get the transcription record
    const transcription = await d1Service.getTranscription(id, userId);

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

    // Branch by sourceType
    const { sourceType, audioUrl, mimeType } = transcription as typeof transcription & {
      sourceType?: string;
      mimeType?: string | null;
    };

    if (!audioUrl) {
      throw new Error('No source file URL found');
    }

    // Update status to processing
    await updateTranscriptionStatusWithEvent(userId, id, 'processing', 0);

    // Respond immediately, process in background
    res.status(202).json({ 
      id, 
      status: 'processing', 
      message: 'Transcription started' 
    } as TranscribeResponse);

    if (sourceType === 'pdf' || sourceType === 'pptx' || sourceType === 'ppt') {
      processDocumentTranscription(
        id,
        userId,
        audioUrl,
        sourceType as 'pdf' | 'pptx' | 'ppt',
        mimeType
      ).catch(err => {
        console.error(`Background document processing error for ${id}:`, err);
      });
    } else {
      processTranscription(id, userId, audioUrl, mode).catch(err => {
        console.error(`Background transcription error for ${id}:`, err);
      });
    }

  } catch (error) {
    console.error('Start transcription error:', error);
    res.status(500).json({ 
      error: 'Failed to start transcription', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * Generate quiz and flashcards for a transcription in background (in parallel)
 */
async function generateStudyMaterials(
  transcriptionId: string,
  userId: string,
  content: string,
  title: string,
  language: string = 'English'
): Promise<void> {
  console.log(`Starting study materials generation for ${transcriptionId} (parallel, language: ${language})`);

  // Generate quiz and flashcards in parallel
  const quizPromise = (async () => {
    try {
      console.log(`Generating quiz for ${transcriptionId}`);
      const questions = await llmService.generateQuiz(
        content,
        title,
        10,
        language,
        {
          userId,
          transcriptionId,
          step: 'quiz',
        }
      );
      
      const quiz: Quiz = {
        id: uuidv4(),
        transcriptionId,
        title: `Quiz: ${title}`,
        questions,
        createdAt: new Date().toISOString(),
      };

      await d1Service.saveQuiz(quiz);
      console.log(`Quiz saved for ${transcriptionId}: ${quiz.id} with ${questions.length} questions`);
    } catch (quizError) {
      console.error(`Quiz generation failed for ${transcriptionId}:`, quizError);
    }
  })();

  const flashcardsPromise = (async () => {
    try {
      console.log(`Generating flashcards for ${transcriptionId}`);
      const cards = await llmService.generateFlashcards(
        content,
        title,
        20,
        language,
        {
          userId,
          transcriptionId,
          step: 'flashcards',
        }
      );
      
      const deck: FlashcardDeck = {
        id: uuidv4(),
        transcriptionId,
        title: `Flashcards: ${title}`,
        cards,
        createdAt: new Date().toISOString(),
      };

      await d1Service.saveFlashcardDeck(deck);
      console.log(`Flashcard deck saved for ${transcriptionId}: ${deck.id} with ${cards.length} cards`);
    } catch (flashcardError) {
      console.error(`Flashcard generation failed for ${transcriptionId}:`, flashcardError);
    }
  })();

  // Wait for both to complete
  await Promise.all([quizPromise, flashcardsPromise]);
}

/**
 * Process from raw text onwards (LLM structuring, PDF generation, quiz/flashcards)
 * Used by both audio/video transcription and document processing
 */
async function processFromRawText(
  id: string,
  userId: string,
  rawText: string,
  title: string,
  whisperModel: string | null = null,
  audioDuration: number | null = null
): Promise<void> {
  if (await isTranscriptionCanceled(id, userId)) {
    return;
  }

  // Save raw transcription (use 0 for documents that don't have duration)
  await d1Service.updateTranscriptionText(id, rawText, audioDuration ?? 0, whisperModel ?? undefined);
  console.log(`Starting LLM structuring for ${id}`);

  await updateTranscriptionStatusWithEvent(userId, id, 'structuring', 0.90);
  
  try {
    const { structuredText, detectedLanguage } = await llmService.structureTranscription(
      rawText,
      title,
      {
        userId,
        transcriptionId: id,
        step: 'structuring',
      }
    );

    if (await isTranscriptionCanceled(id, userId)) {
      return;
    }
    
    await updateTranscriptionStatusWithEvent(userId, id, 'structuring', 0.95);
    await d1Service.updateStructuredText(id, structuredText, detectedLanguage);
    broadcastTranscriptionUpdate(
      userId,
      createTranscriptionEventPayload(id, 'completed', 1, null)
    );
    console.log(`Structuring completed for ${id}, language: ${detectedLanguage}`);

    if (structuredText) {
      // Generate quiz and flashcards
      await generateStudyMaterials(id, userId, structuredText, title, detectedLanguage);

      try {
        const { pdfKey } = await pdfService.generateAndUpload(
          id,
          userId,
          structuredText,
          title,
          'structured'
        );
        await d1Service.updatePdfInfo(id, pdfKey);
      } catch (pdfError) {
        console.error(`PDF generation failed for ${id}:`, pdfError);
      }
    }
  } catch (llmError) {
    console.error(`LLM structuring failed for ${id}:`, llmError);
    if (await isTranscriptionCanceled(id, userId)) {
      return;
    }
    await d1Service.updateStructuredText(id, '');
    broadcastTranscriptionUpdate(
      userId,
      createTranscriptionEventPayload(id, 'completed', 1, null)
    );
    console.log(`Processing completed for ${id} (without structuring)`);
  }
}

/**
 * Process document transcription (PDF/PPTX)
 */
async function processDocumentTranscription(
  id: string,
  userId: string,
  sourceKey: string,
  sourceType: 'pdf' | 'pptx' | 'ppt',
  mimeType?: string | null
): Promise<void> {
  try {
    const transcriptionRecord = await d1Service.getTranscription(id, userId);
    const title = transcriptionRecord?.title || 'Untitled Document';

    console.log(`Starting document processing for ${id}: "${title}", type=${sourceType}`);

    if (await isTranscriptionCanceled(id, userId)) {
      return;
    }

    await updateTranscriptionStatusWithEvent(userId, id, 'processing', 0.05);

    let rawText = '';
    let finalSourceType = sourceType;

    // Check if it's a batch upload (JSON array in sourceKey)
    if (sourceKey.startsWith('[') && sourceKey.endsWith(']')) {
      try {
        const files = JSON.parse(sourceKey) as Array<{ key: string, originalName: string, sourceType: any }>;
        console.log(`Processing batch of ${files.length} files for ${id}`);
        
        const textParts: string[] = [];
        const progressPerFile = 0.70 / files.length;

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const fileProgressStart = 0.15 + (i * progressPerFile);

          if (await isTranscriptionCanceled(id, userId)) {
            return;
          }
          
          await updateTranscriptionStatusWithEvent(userId, id, 'processing', fileProgressStart);
          
          const fileBuffer = await r2Service.getFile(file.key);
          const result = await enhancedDocumentService.processDocument(
            fileBuffer as Buffer,
            file.sourceType,
            null,
            async (p) => {
              const currentProgress = fileProgressStart + (p.progress * progressPerFile);
              if (await isTranscriptionCanceled(id, userId)) {
                return;
              }
              await updateTranscriptionStatusWithEvent(userId, id, 'processing', currentProgress);
            }
          );

          if (await isTranscriptionCanceled(id, userId)) {
            return;
          }
          
          textParts.push(`--- Source File: ${file.originalName} ---\n\n${result.text}`);
        }
        
        rawText = textParts.join('\n\n' + '='.repeat(40) + '\n\n');
        finalSourceType = 'pdf'; // Set to pdf for consistent processing
      } catch (parseError) {
        console.warn('Failed to parse sourceKey as batch, treating as single file');
        // Fallback to single file logic below
      }
    }

    if (!rawText) {
      // Single file processing (original logic)
      const buffer = await r2Service.getFile(sourceKey);
      await updateTranscriptionStatusWithEvent(userId, id, 'processing', 0.15);

      const result = await enhancedDocumentService.processDocument(
        buffer as Buffer,
        sourceType as any,
        mimeType,
        async (p) => {
          const progressRange = 0.70;
          const currentProgress = 0.15 + p.progress * progressRange;
          if (await isTranscriptionCanceled(id, userId)) {
            return;
          }
          await updateTranscriptionStatusWithEvent(userId, id, 'processing', currentProgress);
        }
      );
      rawText = result.text;
    }

    if (await isTranscriptionCanceled(id, userId)) {
      return;
    }

    console.log(`Text extracted from ${sourceType}, length: ${rawText.length} chars`);
    await updateTranscriptionStatusWithEvent(userId, id, 'processing', 0.85);

    // Process from raw text onwards (reuse common pipeline)
    const infoModel = `document/${finalSourceType}${rawText.includes('--- Source File:') ? '-batch' : ''}`;
    await processFromRawText(id, userId, rawText, title, infoModel, null);

  } catch (error) {
    console.error(`Document processing failed for ${id}:`, error);
    await updateTranscriptionStatusWithEvent(
      userId,
      id,
      'error',
      0,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

// Background transcription processing
type TranscriptionMode = 'fast' | 'quality';

type TranscriptionModeOptions = {
  provider: TranscriptionProvider;
  model: string;
};

const getTranscriptionModeOptions = (mode?: TranscriptionMode): TranscriptionModeOptions => {
  if (mode === 'fast') {
    const models = transcriptionService.getAvailableModels('groq') as { whisperTurbo: string };
    return {
      provider: 'groq',
      model: models.whisperTurbo,
    };
  }

  const models = transcriptionService.getAvailableModels('openai') as { gpt4oMini: string };
  return {
    provider: 'openai',
    model: models.gpt4oMini,
  };
};

async function processTranscription(
  id: string,
  userId: string,
  audioUrl: string,
  mode?: TranscriptionMode
): Promise<void> {
  let tempDir: string | null = null;

  try {
    // Get the transcription for the title
    const transcriptionRecord = await d1Service.getTranscription(id, userId);
    const title = transcriptionRecord?.title || 'Untitled Lecture';

    const transcriptionOptions = getTranscriptionModeOptions(mode);
    const modeLabel = mode ?? 'quality';

    console.log(`Starting transcription for ${id}: "${title}" (mode: ${modeLabel}, provider: ${transcriptionOptions.provider}, model: ${transcriptionOptions.model})`);

    // Progress breakdown:
    // 0-5%: Download audio
    // 5-15%: Process/convert audio
    // 15-85%: Transcribe chunks
    // 85-95%: Structuring with LLM
    // 95-100%: PDF generation + completion

    if (await isTranscriptionCanceled(id, userId)) {
      return;
    }

    // Download audio from R2
    await updateTranscriptionStatusWithEvent(userId, id, 'processing', 0.02);
    const audioBuffer = await r2Service.getFile(audioUrl);
    const filename = audioUrl.split('/').pop() || 'audio.mp3';
    await updateTranscriptionStatusWithEvent(userId, id, 'processing', 0.05);

    // Process audio (convert and split)
    const { chunks, totalDuration, tempDir: processedTempDir } = await processAudioFile(audioBuffer, filename);
    tempDir = processedTempDir;

    console.log(`Audio processed: ${totalDuration}s, ${chunks.length} chunks`);
    console.log(`Chunk details:`, chunks.map(c => ({ 
      index: c.index, 
      duration: `${Math.round(c.endTime - c.startTime)}s`,
      path: c.filePath 
    })));

    if (await isTranscriptionCanceled(id, userId)) {
      return;
    }

    await updateTranscriptionStatusWithEvent(userId, id, 'processing', 0.15);

    // Transcribe each chunk (0.15 - 0.85 progress)
    const transcriptionParts: string[] = [];
    const transcriptionProgressRange = 0.70; // 15% to 85%
    const progressPerChunk = transcriptionProgressRange / chunks.length;
    let transcriptionModel: string | undefined;
    let transcriptionProvider: string | undefined;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkDuration = chunk.endTime - chunk.startTime;
      console.log(`Transcribing chunk ${i + 1}/${chunks.length}: ${chunk.filePath}, duration: ${Math.round(chunkDuration)}s`);

      if (await isTranscriptionCanceled(id, userId)) {
        return;
      }

      // Update progress at start of each chunk
      const chunkStartProgress = 0.15 + i * progressPerChunk;
      await updateTranscriptionStatusWithEvent(userId, id, 'processing', chunkStartProgress);

      const result = await transcriptionService.transcribeFile(chunk.filePath, transcriptionOptions);
      transcriptionParts.push(result.text);

      const usageContext = {
        userId,
        transcriptionId: id,
        step: 'audio',
      } as const;

      const chunkMetadata = {
        chunkIndex: chunk.index,
        chunkDurationSeconds: Math.round(chunkDuration),
      };

      const hasTokenUsage = Boolean(
        result.usage?.inputTokens || result.usage?.outputTokens || result.usage?.totalTokens
      );

      if (hasTokenUsage) {
        await usageService.recordTokenUsage({
          context: usageContext,
          provider: result.provider,
          model: result.model,
          usage: {
            inputTokens: result.usage?.inputTokens ?? null,
            outputTokens: result.usage?.outputTokens ?? null,
            totalTokens: result.usage?.totalTokens ?? null,
          },
          metadata: chunkMetadata,
        });
      } else {
        const audioSeconds = result.duration || chunkDuration;
        await usageService.recordAudioUsage({
          context: usageContext,
          provider: result.provider,
          model: result.model,
          audioSeconds,
          metadata: chunkMetadata,
        });
      }
      
      // Capture the model and provider from the first chunk
      if (i === 0) {
        transcriptionModel = result.model;
        transcriptionProvider = result.provider;
      }

      if (await isTranscriptionCanceled(id, userId)) {
        return;
      }

      // Update progress at end of each chunk
      const chunkEndProgress = 0.15 + (i + 1) * progressPerChunk;
      await updateTranscriptionStatusWithEvent(userId, id, 'processing', Math.min(chunkEndProgress, 0.85));
    }

    // Merge transcription parts
    const fullTranscription = transcriptionParts.join('\n\n');
    // Include provider in model name for debugging (e.g., "openai/gpt-4o-mini-transcribe")
    const whisperModel = transcriptionProvider ? `${transcriptionProvider}/${transcriptionModel}` : transcriptionModel;
    console.log(`Transcription complete for ${id}, length: ${fullTranscription.length} chars, model: ${whisperModel}`);

    if (await isTranscriptionCanceled(id, userId)) {
      return;
    }

    // Save raw transcription and update status to structuring (85% -> 90%)
    await updateTranscriptionStatusWithEvent(userId, id, 'processing', 0.87);

    // Process from raw text onwards (reuse common pipeline)
    await processFromRawText(id, userId, fullTranscription, title, whisperModel, totalDuration);

  } catch (error) {
    console.error(`Transcription failed for ${id}:`, error);
    await updateTranscriptionStatusWithEvent(
      userId,
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



// PATCH /api/transcription/:id - Update transcription metadata (title, isPublic, folderId, or tagIds)
router.patch('/transcription/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { title, isPublic, folderId, tagIds } = req.body as { 
      title?: string; 
      isPublic?: boolean; 
      folderId?: string | null;
      tagIds?: string[];
    };

    // Verify the transcription exists and belongs to user
    const transcription = await d1Service.getTranscription(id, userId);

    if (!transcription) {
      res.status(404).json({ error: 'Not Found', message: 'Transcription not found' });
      return;
    }

    // Update title if provided
    if (title !== undefined) {
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        res.status(400).json({ error: 'Bad Request', message: 'Title is required and must be a non-empty string' });
        return;
      }
      await d1Service.updateTranscriptionTitle(id, userId, title.trim());
    }

    // Update visibility if provided
    if (isPublic !== undefined) {
      if (typeof isPublic !== 'boolean') {
        res.status(400).json({ error: 'Bad Request', message: 'isPublic must be a boolean' });
        return;
      }
      await d1Service.updateTranscriptionVisibility(id, userId, isPublic);
    }

    // Update folder if provided
    if (folderId !== undefined) {
      if (folderId !== null) {
        // Verify folder exists and belongs to user
        const folders = await d1Service.getFoldersByUser(userId);
        const folder = folders.find(f => f.id === folderId);
        if (!folder) {
          res.status(400).json({ error: 'Bad Request', message: 'Folder not found' });
          return;
        }
      }
      await d1Service.updateTranscriptionFolder(id, userId, folderId);
    }

    // Update tags if provided
    if (tagIds !== undefined) {
      if (!Array.isArray(tagIds)) {
        res.status(400).json({ error: 'Bad Request', message: 'tagIds must be an array' });
        return;
      }
      // Verify all tags exist and belong to user
      const userTags = await d1Service.getTagsByUser(userId);
      const userTagIds = new Set(userTags.map(t => t.id));
      const invalidTagIds = tagIds.filter(tagId => !userTagIds.has(tagId));
      if (invalidTagIds.length > 0) {
        res.status(400).json({ error: 'Bad Request', message: `Invalid tag IDs: ${invalidTagIds.join(', ')}` });
        return;
      }
      await d1Service.setTranscriptionTags(id, tagIds);
    }

    res.json({ success: true, message: 'Transcription updated successfully' });
  } catch (error) {
    console.error('Update transcription error:', error);
    res.status(500).json({ 
      error: 'Failed to update transcription', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// DELETE /api/transcription/:id - Delete a transcription
router.delete('/transcription/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Get the transcription to find the audio URL and PDF key
    const transcription = await d1Service.getTranscription(id, userId);

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

    

    // Delete from D1
    await d1Service.deleteTranscription(id, userId);

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
