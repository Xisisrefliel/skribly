import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { d1Service } from '../services/d1.js';
import { r2Service } from '../services/r2.js';
import { transcriptionService } from '../services/transcription.js';
import { llmService } from '../services/llm.js';
import { pdfService } from '../services/pdf.js';
import { processAudioFile, cleanupTempDir } from '../services/audio.js';
import type { TranscriptionListResponse, TranscriptionDetailResponse, TranscribeResponse, Quiz, FlashcardDeck } from '@lecture/shared';

const router: RouterType = Router();

// GET /api/transcriptions - List all transcriptions for the user
router.get('/transcriptions', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const transcriptions = await d1Service.getTranscriptionsByUser(userId);

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

// POST /api/transcribe/:id - Start transcription process
router.post('/transcribe/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.userId!;
  let tempDir: string | null = null;

  try {
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

    // Update status to processing
    await d1Service.updateTranscriptionStatus(id, 'processing', 0);

    // Respond immediately, process in background
    res.status(202).json({ 
      id, 
      status: 'processing', 
      message: 'Transcription started' 
    } as TranscribeResponse);

    // Process in background (don't await)
    processTranscription(id, userId, transcription.audioUrl!).catch(err => {
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
    await d1Service.updateTranscriptionText(id, fullTranscription, totalDuration, whisperModel);
    console.log(`Starting LLM structuring for ${id}`);

    // Structure the transcription with LLM (90% - 95% progress)
    await d1Service.updateTranscriptionStatus(id, 'structuring', 0.90);
    try {
      const { structuredText, detectedLanguage } = await llmService.structureTranscription(fullTranscription, title);
      
      await d1Service.updateTranscriptionStatus(id, 'structuring', 0.95);
      
      // Save structured text, detected language, and mark as completed
      await d1Service.updateStructuredText(id, structuredText, detectedLanguage);
      console.log(`Structuring completed for ${id}, language: ${detectedLanguage}`);

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

        // Generate quiz and flashcards in background
        await generateStudyMaterials(id, structuredText, title, detectedLanguage);
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
    const userId = req.userId!;
    const { id } = req.params;
    const { type = 'structured', regenerate = false } = req.body as { 
      type?: 'structured' | 'raw';
      regenerate?: boolean;
    };

    // Get the transcription
    const transcription = await d1Service.getTranscription(id, userId);

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

// PATCH /api/transcription/:id - Update transcription metadata (title)
router.patch('/transcription/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { title } = req.body as { title?: string };

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ error: 'Bad Request', message: 'Title is required and must be a non-empty string' });
      return;
    }

    // Verify the transcription exists and belongs to user
    const transcription = await d1Service.getTranscription(id, userId);

    if (!transcription) {
      res.status(404).json({ error: 'Not Found', message: 'Transcription not found' });
      return;
    }

    // Update the title
    await d1Service.updateTranscriptionTitle(id, userId, title.trim());

    res.json({ success: true, message: 'Title updated successfully' });
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

    // Delete PDF from R2 if exists
    if (transcription.pdfKey) {
      try {
        await r2Service.deleteFile(transcription.pdfKey);
      } catch (err) {
        console.warn(`Failed to delete PDF file: ${transcription.pdfKey}`, err);
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
