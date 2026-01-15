import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { d1Service } from '../services/d1.js';
import { r2Service } from '../services/r2.js';
import { pdfService } from '../services/pdf.js';
import { transcriptionService } from '../services/transcription.js';
import { llmService } from '../services/llm.js';

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
      res.status(409).json({ error: 'Conflict', message: 'Structured transcription not ready yet' });
      return;
    }

    if (transcription.pdfKey) {
      const url = await r2Service.getSignedUrl(transcription.pdfKey, 86400);
      res.json({ url });
      return;
    }

    const { pdfKey, pdfUrl } = await pdfService.generateAndUpload(
      id,
      userId,
      transcription.structuredText,
      transcription.title,
      'structured'
    );

    await d1Service.updatePdfInfo(id, pdfKey);

    res.json({ url: pdfUrl });
  } catch (error) {
    console.error('Generate PDF error:', error);
    res.status(500).json({
      error: 'Failed to generate PDF',
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
    await d1Service.updateTranscriptionStatus(id, 'processing', 0);

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
    await d1Service.updateTranscriptionStatus(id, 'structuring', 0.85);

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

  try {
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
    await d1Service.updateTranscriptionStatus(id, 'processing', 0);

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
      processTranscription(id, userId, audioUrl).catch(err => {
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
async function generateStudyMaterials(transcriptionId: string, content: string, title: string, language: string = 'English'): Promise<void> {
  console.log(`Starting study materials generation for ${transcriptionId} (parallel, language: ${language})`);

  // Generate quiz and flashcards in parallel
  const quizPromise = (async () => {
    try {
      console.log(`Generating quiz for ${transcriptionId}`);
      const questions = await llmService.generateQuiz(content, title, 10, language);
      
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
      const cards = await llmService.generateFlashcards(content, title, 20, language);
      
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
  // Save raw transcription (use 0 for documents that don't have duration)
  await d1Service.updateTranscriptionText(id, rawText, audioDuration ?? 0, whisperModel ?? undefined);
  console.log(`Starting LLM structuring for ${id}`);

  await d1Service.updateTranscriptionStatus(id, 'structuring', 0.90);
  
  try {
    const { structuredText, detectedLanguage } = await llmService.structureTranscription(rawText, title);
    
    await d1Service.updateTranscriptionStatus(id, 'structuring', 0.95);
    await d1Service.updateStructuredText(id, structuredText, detectedLanguage);
    console.log(`Structuring completed for ${id}, language: ${detectedLanguage}`);

    if (structuredText) {
      // Generate quiz and flashcards
      await generateStudyMaterials(id, structuredText, title, detectedLanguage);

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
    await d1Service.updateStructuredText(id, '');
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

    await d1Service.updateTranscriptionStatus(id, 'processing', 0.05);

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
          
          await d1Service.updateTranscriptionStatus(id, 'processing', fileProgressStart);
          
          const fileBuffer = await r2Service.getFile(file.key);
          const result = await enhancedDocumentService.processDocument(
            fileBuffer as Buffer,
            file.sourceType,
            null,
            async (p) => {
              const currentProgress = fileProgressStart + (p.progress * progressPerFile);
              await d1Service.updateTranscriptionStatus(id, 'processing', currentProgress);
            }
          );
          
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
      await d1Service.updateTranscriptionStatus(id, 'processing', 0.15);

      const result = await enhancedDocumentService.processDocument(
        buffer as Buffer,
        sourceType as any,
        mimeType,
        async (p) => {
          const progressRange = 0.70;
          const currentProgress = 0.15 + p.progress * progressRange;
          await d1Service.updateTranscriptionStatus(id, 'processing', currentProgress);
        }
      );
      rawText = result.text;
    }

    console.log(`Text extracted from ${sourceType}, length: ${rawText.length} chars`);
    await d1Service.updateTranscriptionStatus(id, 'processing', 0.85);

    // Process from raw text onwards (reuse common pipeline)
    const infoModel = `document/${finalSourceType}${rawText.includes('--- Source File:') ? '-batch' : ''}`;
    await processFromRawText(id, userId, rawText, title, infoModel, null);

  } catch (error) {
    console.error(`Document processing failed for ${id}:`, error);
    await d1Service.updateTranscriptionStatus(
      id,
      'error',
      0,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

// Background transcription processing
async function processTranscription(id: string, userId: string, audioUrl: string): Promise<void> {
  let tempDir: string | null = null;

  try {
    // Get the transcription for the title
    const transcriptionRecord = await d1Service.getTranscription(id, userId);
    const title = transcriptionRecord?.title || 'Untitled Lecture';

    console.log(`Starting transcription for ${id}: "${title}"`);

    // Progress breakdown:
    // 0-5%: Download audio
    // 5-15%: Process/convert audio
    // 15-85%: Transcribe chunks
    // 85-95%: Structuring with LLM
    // 95-100%: PDF generation + completion

    // Download audio from R2
    await d1Service.updateTranscriptionStatus(id, 'processing', 0.02);
    const audioBuffer = await r2Service.getFile(audioUrl);
    const filename = audioUrl.split('/').pop() || 'audio.mp3';
    await d1Service.updateTranscriptionStatus(id, 'processing', 0.05);

    // Process audio (convert and split)
    const { chunks, totalDuration, tempDir: processedTempDir } = await processAudioFile(audioBuffer, filename);
    tempDir = processedTempDir;

    console.log(`Audio processed: ${totalDuration}s, ${chunks.length} chunks`);
    console.log(`Chunk details:`, chunks.map(c => ({ 
      index: c.index, 
      duration: `${Math.round(c.endTime - c.startTime)}s`,
      path: c.filePath 
    })));
    await d1Service.updateTranscriptionStatus(id, 'processing', 0.15);

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

      // Update progress at start of each chunk
      const chunkStartProgress = 0.15 + i * progressPerChunk;
      await d1Service.updateTranscriptionStatus(id, 'processing', chunkStartProgress);

      const result = await transcriptionService.transcribeFile(chunk.filePath);
      transcriptionParts.push(result.text);
      
      // Capture the model and provider from the first chunk
      if (i === 0) {
        transcriptionModel = result.model;
        transcriptionProvider = result.provider;
      }

      // Update progress at end of each chunk
      const chunkEndProgress = 0.15 + (i + 1) * progressPerChunk;
      await d1Service.updateTranscriptionStatus(id, 'processing', Math.min(chunkEndProgress, 0.85));
    }

    // Merge transcription parts
    const fullTranscription = transcriptionParts.join('\n\n');
    // Include provider in model name for debugging (e.g., "openai/gpt-4o-mini-transcribe")
    const whisperModel = transcriptionProvider ? `${transcriptionProvider}/${transcriptionModel}` : transcriptionModel;
    console.log(`Transcription complete for ${id}, length: ${fullTranscription.length} chars, model: ${whisperModel}`);

    // Save raw transcription and update status to structuring (85% -> 90%)
    await d1Service.updateTranscriptionStatus(id, 'processing', 0.87);

    // Process from raw text onwards (reuse common pipeline)
    await processFromRawText(id, userId, fullTranscription, title, whisperModel, totalDuration);

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
