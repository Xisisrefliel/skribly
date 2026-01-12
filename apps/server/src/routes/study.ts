import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { d1Service } from '../services/d1.js';
import { llmService } from '../services/llm.js';
import type { Quiz, FlashcardDeck, GenerateQuizResponse, GenerateFlashcardsResponse, QuizAttempt, QuizAttemptResponse, QuizAttemptsListResponse, SaveQuizAttemptRequest } from '@lecture/shared';

const router: RouterType = Router();

// GET /api/transcription/:id/quiz - Get quiz for transcription (returns stored or generates new)
router.get('/transcription/:id/quiz', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Verify transcription exists and belongs to user
    const transcription = await d1Service.getTranscription(id, userId);

    if (!transcription) {
      res.status(404).json({ error: 'Not Found', message: 'Transcription not found' });
      return;
    }

    if (transcription.status !== 'completed') {
      res.status(400).json({ error: 'Bad Request', message: 'Transcription is not completed yet' });
      return;
    }

    // Try to get stored quiz
    const quiz = await d1Service.getQuizByTranscriptionId(id);

    if (quiz) {
      const response: GenerateQuizResponse = { quiz };
      res.json(response);
      return;
    }

    // No stored quiz - return 404 (quiz should be auto-generated after transcription)
    res.status(404).json({ error: 'Not Found', message: 'Quiz not yet generated' });
  } catch (error) {
    console.error('Get quiz error:', error);
    res.status(500).json({
      error: 'Failed to get quiz',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/transcription/:id/quiz - Generate new quiz (regenerate)
router.post('/transcription/:id/quiz', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { questionCount = 10 } = req.body as { questionCount?: number };

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

    // Use structured text if available, otherwise raw transcription
    const content = transcription.structuredText || transcription.transcriptionText;
    if (!content) {
      res.status(400).json({ error: 'Bad Request', message: 'No content available for quiz generation' });
      return;
    }

    // Delete existing quiz for this transcription
    await d1Service.deleteQuizByTranscriptionId(id);

    // Generate new quiz questions with language support
    const language = transcription.detectedLanguage || 'English';
    const questions = await llmService.generateQuiz(content, transcription.title, questionCount, language);

    const quiz: Quiz = {
      id: uuidv4(),
      transcriptionId: id,
      title: `Quiz: ${transcription.title}`,
      questions,
      createdAt: new Date().toISOString(),
    };

    // Save to database
    await d1Service.saveQuiz(quiz);

    const response: GenerateQuizResponse = { quiz };
    res.json(response);
  } catch (error) {
    console.error('Generate quiz error:', error);
    res.status(500).json({
      error: 'Failed to generate quiz',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/transcription/:id/flashcards - Get flashcards for transcription (returns stored or generates new)
router.get('/transcription/:id/flashcards', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Verify transcription exists and belongs to user
    const transcription = await d1Service.getTranscription(id, userId);

    if (!transcription) {
      res.status(404).json({ error: 'Not Found', message: 'Transcription not found' });
      return;
    }

    if (transcription.status !== 'completed') {
      res.status(400).json({ error: 'Bad Request', message: 'Transcription is not completed yet' });
      return;
    }

    // Try to get stored flashcard deck
    const deck = await d1Service.getFlashcardDeckByTranscriptionId(id);

    if (deck) {
      const response: GenerateFlashcardsResponse = { deck };
      res.json(response);
      return;
    }

    // No stored deck - return 404 (flashcards should be auto-generated after transcription)
    res.status(404).json({ error: 'Not Found', message: 'Flashcards not yet generated' });
  } catch (error) {
    console.error('Get flashcards error:', error);
    res.status(500).json({
      error: 'Failed to get flashcards',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/transcription/:id/flashcards - Generate new flashcards (regenerate)
router.post('/transcription/:id/flashcards', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { cardCount = 20 } = req.body as { cardCount?: number };

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

    // Use structured text if available, otherwise raw transcription
    const content = transcription.structuredText || transcription.transcriptionText;
    if (!content) {
      res.status(400).json({ error: 'Bad Request', message: 'No content available for flashcard generation' });
      return;
    }

    // Delete existing flashcard deck for this transcription
    await d1Service.deleteFlashcardDeckByTranscriptionId(id);

    // Generate new flashcards with language support
    const language = transcription.detectedLanguage || 'English';
    const cards = await llmService.generateFlashcards(content, transcription.title, cardCount, language);

    const deck: FlashcardDeck = {
      id: uuidv4(),
      transcriptionId: id,
      title: `Flashcards: ${transcription.title}`,
      cards,
      createdAt: new Date().toISOString(),
    };

    // Save to database
    await d1Service.saveFlashcardDeck(deck);

    const response: GenerateFlashcardsResponse = { deck };
    res.json(response);
  } catch (error) {
    console.error('Generate flashcards error:', error);
    res.status(500).json({
      error: 'Failed to generate flashcards',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// Quiz Attempt endpoints
// ============================================

// POST /api/quiz/:quizId/attempt - Save a quiz attempt
router.post('/quiz/:quizId/attempt', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { quizId } = req.params;
    const { score, totalQuestions, answers } = req.body as SaveQuizAttemptRequest;

    // Validate input
    if (typeof score !== 'number' || typeof totalQuestions !== 'number' || !Array.isArray(answers)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid request body' });
      return;
    }

    const attempt: QuizAttempt = {
      id: uuidv4(),
      quizId,
      userId,
      score,
      totalQuestions,
      answers,
      completedAt: new Date().toISOString(),
    };

    await d1Service.saveQuizAttempt(attempt);

    const response: QuizAttemptResponse = { attempt };
    res.json(response);
  } catch (error) {
    console.error('Save quiz attempt error:', error);
    res.status(500).json({
      error: 'Failed to save quiz attempt',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/quiz/:quizId/attempts - Get all attempts for a quiz
router.get('/quiz/:quizId/attempts', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { quizId } = req.params;

    const attempts = await d1Service.getQuizAttempts(quizId, userId);

    const response: QuizAttemptsListResponse = { attempts };
    res.json(response);
  } catch (error) {
    console.error('Get quiz attempts error:', error);
    res.status(500).json({
      error: 'Failed to get quiz attempts',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/quiz-attempts - Get all quiz attempts for the current user
router.get('/quiz-attempts', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const attempts = await d1Service.getAllQuizAttemptsByUser(userId);

    const response: QuizAttemptsListResponse = { attempts };
    res.json(response);
  } catch (error) {
    console.error('Get all quiz attempts error:', error);
    res.status(500).json({
      error: 'Failed to get quiz attempts',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export { router as studyRouter };
