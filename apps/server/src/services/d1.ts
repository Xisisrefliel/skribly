import type { Transcription, TranscriptionStatus, Quiz, QuizQuestion, FlashcardDeck, Flashcard } from '@lecture/shared';

const D1_ACCOUNT_ID = process.env.D1_ACCOUNT_ID!;
const D1_DATABASE_ID = process.env.D1_DATABASE_ID!;
const D1_API_TOKEN = process.env.D1_API_TOKEN!;

const D1_API_URL = `https://api.cloudflare.com/client/v4/accounts/${D1_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

interface D1Response<T> {
  success: boolean;
  errors: Array<{ message: string }>;
  result: Array<{
    results: T[];
    success: boolean;
  }>;
}

async function executeQuery<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const response = await fetch(D1_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${D1_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`D1 API error: ${response.status} - ${text}`);
  }

  const data = await response.json() as D1Response<T>;
  
  if (!data.success) {
    throw new Error(`D1 query failed: ${data.errors.map(e => e.message).join(', ')}`);
  }

  return data.result[0]?.results || [];
}

// Database row type (snake_case from DB)
interface TranscriptionRow {
  id: string;
  user_id: string;
  title: string;
  audio_url: string | null;
  audio_duration: number | null;
  transcription_text: string | null;
  structured_text: string | null;
  status: TranscriptionStatus;
  progress: number;
  error_message: string | null;
  pdf_key: string | null;
  pdf_generated_at: string | null;
  whisper_model: string | null;
  detected_language: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTranscription(row: TranscriptionRow): Transcription {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    audioUrl: row.audio_url,
    audioDuration: row.audio_duration,
    transcriptionText: row.transcription_text,
    structuredText: row.structured_text,
    status: row.status,
    progress: row.progress,
    errorMessage: row.error_message,
    pdfKey: row.pdf_key,
    pdfGeneratedAt: row.pdf_generated_at,
    whisperModel: row.whisper_model,
    detectedLanguage: row.detected_language,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const d1Service = {
  /**
   * Initialize the database schema
   */
  async initSchema(): Promise<void> {
    // ============================================
    // better-auth tables
    // ============================================
    
    // User table for better-auth
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        email_verified INTEGER DEFAULT 0,
        image TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Session table for better-auth
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      )
    `);

    // Account table for OAuth providers (Google)
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS account (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        access_token_expires_at TEXT,
        refresh_token_expires_at TEXT,
        scope TEXT,
        id_token TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      )
    `);

    // Verification table for email verification tokens
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS verification (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Create indexes for better-auth tables
    try {
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_session_user_id ON session(user_id)`);
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_session_token ON session(token)`);
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_account_user_id ON account(user_id)`);
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_account_provider ON account(provider_id, account_id)`);
    } catch (e) {
      // Indexes may already exist
    }

    // ============================================
    // Application tables
    // ============================================

    // Migration: Check if we need to migrate from device_id to user_id schema
    // SQLite doesn't allow dropping columns or changing NOT NULL constraints,
    // so we need to recreate the table
    try {
      // Try to select device_id - if it exists, we need to migrate
      await executeQuery(`SELECT device_id FROM transcriptions LIMIT 1`);
      
      // If we get here, device_id column exists - need to migrate
      console.log('Migrating transcriptions table from device_id to user_id...');
      
      // Create new table with correct schema
      await executeQuery(`
        CREATE TABLE IF NOT EXISTS transcriptions_new (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          title TEXT NOT NULL,
          audio_url TEXT,
          audio_duration INTEGER,
          transcription_text TEXT,
          structured_text TEXT,
          status TEXT DEFAULT 'pending',
          progress REAL DEFAULT 0,
          error_message TEXT,
          pdf_key TEXT,
          pdf_generated_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      
      // Copy data from old table
      // Check if user_id column exists in old table
      try {
        await executeQuery(`SELECT user_id FROM transcriptions LIMIT 1`);
        // user_id exists, copy it
        await executeQuery(`
          INSERT INTO transcriptions_new (
            id, user_id, title, audio_url, audio_duration,
            transcription_text, structured_text, status, progress, error_message,
            pdf_key, pdf_generated_at, created_at, updated_at
          )
          SELECT 
            id, user_id, title, audio_url, audio_duration,
            transcription_text, structured_text, status, progress, error_message,
            pdf_key, pdf_generated_at, created_at, updated_at
          FROM transcriptions
        `);
      } catch {
        // user_id doesn't exist, copy without it
        await executeQuery(`
          INSERT INTO transcriptions_new (
            id, title, audio_url, audio_duration,
            transcription_text, structured_text, status, progress, error_message,
            pdf_key, pdf_generated_at, created_at, updated_at
          )
          SELECT 
            id, title, audio_url, audio_duration,
            transcription_text, structured_text, status, progress, error_message,
            pdf_key, pdf_generated_at, created_at, updated_at
          FROM transcriptions
        `);
      }
      
      // Drop old table and rename new one
      await executeQuery(`DROP TABLE transcriptions`);
      await executeQuery(`ALTER TABLE transcriptions_new RENAME TO transcriptions`);
      
      console.log('Migration complete: transcriptions table updated to use user_id');
    } catch {
      // device_id column doesn't exist or table doesn't exist - no migration needed
      // This is expected for new installations or already migrated databases
    }

    // Create table if it doesn't exist (for new installations)
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS transcriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT NOT NULL,
        audio_url TEXT,
        audio_duration INTEGER,
        transcription_text TEXT,
        structured_text TEXT,
        status TEXT DEFAULT 'pending',
        progress REAL DEFAULT 0,
        error_message TEXT,
        pdf_key TEXT,
        pdf_generated_at TEXT,
        whisper_model TEXT,
        detected_language TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Add whisper_model and detected_language columns if they don't exist (migration for existing DBs)
    try {
      await executeQuery(`ALTER TABLE transcriptions ADD COLUMN whisper_model TEXT`);
      console.log('Added whisper_model column to transcriptions table');
    } catch {
      // Column already exists
    }
    try {
      await executeQuery(`ALTER TABLE transcriptions ADD COLUMN detected_language TEXT`);
      console.log('Added detected_language column to transcriptions table');
    } catch {
      // Column already exists
    }

    // Create index on user_id if not exists
    try {
      await executeQuery(`
        CREATE INDEX IF NOT EXISTS idx_transcriptions_user_id 
        ON transcriptions(user_id)
      `);
    } catch (e) {
      // Index already exists, ignore
    }

    // ============================================
    // Quiz and Flashcard tables
    // ============================================

    // Quizzes table - stores quiz metadata
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS quizzes (
        id TEXT PRIMARY KEY,
        transcription_id TEXT NOT NULL,
        title TEXT NOT NULL,
        question_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (transcription_id) REFERENCES transcriptions(id) ON DELETE CASCADE
      )
    `);

    // Quiz questions table - stores individual questions
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS quiz_questions (
        id TEXT PRIMARY KEY,
        quiz_id TEXT NOT NULL,
        question TEXT NOT NULL,
        options TEXT NOT NULL,
        correct_answer INTEGER NOT NULL,
        explanation TEXT NOT NULL,
        question_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
      )
    `);

    // Flashcard decks table - stores deck metadata
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS flashcard_decks (
        id TEXT PRIMARY KEY,
        transcription_id TEXT NOT NULL,
        title TEXT NOT NULL,
        card_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (transcription_id) REFERENCES transcriptions(id) ON DELETE CASCADE
      )
    `);

    // Flashcards table - stores individual cards
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS flashcards (
        id TEXT PRIMARY KEY,
        deck_id TEXT NOT NULL,
        front TEXT NOT NULL,
        back TEXT NOT NULL,
        category TEXT,
        card_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (deck_id) REFERENCES flashcard_decks(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for quiz and flashcard tables
    try {
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_quizzes_transcription_id ON quizzes(transcription_id)`);
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id)`);
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_flashcard_decks_transcription_id ON flashcard_decks(transcription_id)`);
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_flashcards_deck_id ON flashcards(deck_id)`);
    } catch (e) {
      // Indexes may already exist
    }
  },

  /**
   * Create a new transcription record
   */
  async createTranscription(data: Omit<Transcription, 'createdAt' | 'updatedAt'>): Promise<void> {
    await executeQuery(
      `INSERT INTO transcriptions (
        id, user_id, title, audio_url, audio_duration, 
        transcription_text, structured_text, status, progress, error_message,
        pdf_key, pdf_generated_at, whisper_model, detected_language
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.userId,
        data.title,
        data.audioUrl,
        data.audioDuration,
        data.transcriptionText,
        data.structuredText,
        data.status,
        data.progress,
        data.errorMessage,
        data.pdfKey,
        data.pdfGeneratedAt,
        data.whisperModel,
        data.detectedLanguage,
      ]
    );
  },

  /**
   * Get all transcriptions for a user
   */
  async getTranscriptionsByUser(userId: string): Promise<Transcription[]> {
    const rows = await executeQuery<TranscriptionRow>(
      `SELECT * FROM transcriptions WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(rowToTranscription);
  },

  /**
   * Get a single transcription by ID
   */
  async getTranscription(id: string, userId: string): Promise<Transcription | null> {
    const rows = await executeQuery<TranscriptionRow>(
      `SELECT * FROM transcriptions WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    return rows.length > 0 ? rowToTranscription(rows[0]) : null;
  },

  /**
   * Update transcription status and progress
   */
  async updateTranscriptionStatus(
    id: string, 
    status: TranscriptionStatus, 
    progress: number,
    errorMessage?: string
  ): Promise<void> {
    await executeQuery(
      `UPDATE transcriptions 
       SET status = ?, progress = ?, error_message = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [status, progress, errorMessage || null, id]
    );
  },

  /**
   * Update transcription with completed text (raw only, before structuring)
   */
  async updateTranscriptionText(
    id: string, 
    text: string, 
    duration: number,
    whisperModel?: string,
    detectedLanguage?: string
  ): Promise<void> {
    await executeQuery(
      `UPDATE transcriptions 
       SET transcription_text = ?, audio_duration = ?, status = 'structuring', 
           progress = 0.9, whisper_model = ?, detected_language = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [text, duration, whisperModel || null, detectedLanguage || null, id]
    );
  },

  /**
   * Update transcription with structured text (final step)
   */
  async updateStructuredText(
    id: string, 
    structuredText: string,
    detectedLanguage?: string
  ): Promise<void> {
    await executeQuery(
      `UPDATE transcriptions 
       SET structured_text = ?, status = 'completed', 
           progress = 1.0, detected_language = COALESCE(?, detected_language), updated_at = datetime('now')
       WHERE id = ?`,
      [structuredText, detectedLanguage || null, id]
    );
  },

  /**
   * Delete a transcription
   */
  async deleteTranscription(id: string, userId: string): Promise<boolean> {
    const result = await executeQuery(
      `DELETE FROM transcriptions WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    return true; // D1 doesn't return affected rows count via REST API
  },

  /**
   * Update transcription with PDF info after background generation
   */
  async updatePdfInfo(
    id: string,
    pdfKey: string
  ): Promise<void> {
    await executeQuery(
      `UPDATE transcriptions 
       SET pdf_key = ?, pdf_generated_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
      [pdfKey, id]
    );
  },

  /**
   * Clear PDF info (used when regenerating PDF)
   */
  async clearPdfInfo(id: string): Promise<void> {
    await executeQuery(
      `UPDATE transcriptions 
       SET pdf_key = NULL, pdf_generated_at = NULL, updated_at = datetime('now')
       WHERE id = ?`,
      [id]
    );
  },

  // ============================================
  // Quiz operations
  // ============================================

  /**
   * Save a quiz with its questions
   */
  async saveQuiz(quiz: Quiz): Promise<void> {
    // Insert quiz metadata
    await executeQuery(
      `INSERT INTO quizzes (id, transcription_id, title, question_count, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [quiz.id, quiz.transcriptionId, quiz.title, quiz.questions.length, quiz.createdAt]
    );

    // Insert questions
    for (let i = 0; i < quiz.questions.length; i++) {
      const q = quiz.questions[i];
      await executeQuery(
        `INSERT INTO quiz_questions (id, quiz_id, question, options, correct_answer, explanation, question_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [q.id, quiz.id, q.question, JSON.stringify(q.options), q.correctAnswer, q.explanation, i]
      );
    }
  },

  /**
   * Get quiz for a transcription (returns the most recent one)
   */
  async getQuizByTranscriptionId(transcriptionId: string): Promise<Quiz | null> {
    // Get quiz metadata
    const quizRows = await executeQuery<{
      id: string;
      transcription_id: string;
      title: string;
      created_at: string;
    }>(
      `SELECT id, transcription_id, title, created_at 
       FROM quizzes 
       WHERE transcription_id = ? 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [transcriptionId]
    );

    if (quizRows.length === 0) {
      return null;
    }

    const quizRow = quizRows[0];

    // Get questions
    const questionRows = await executeQuery<{
      id: string;
      question: string;
      options: string;
      correct_answer: number;
      explanation: string;
    }>(
      `SELECT id, question, options, correct_answer, explanation 
       FROM quiz_questions 
       WHERE quiz_id = ? 
       ORDER BY question_order`,
      [quizRow.id]
    );

    const questions: QuizQuestion[] = questionRows.map(row => ({
      id: row.id,
      question: row.question,
      options: JSON.parse(row.options),
      correctAnswer: row.correct_answer,
      explanation: row.explanation,
    }));

    return {
      id: quizRow.id,
      transcriptionId: quizRow.transcription_id,
      title: quizRow.title,
      questions,
      createdAt: quizRow.created_at,
    };
  },

  /**
   * Delete quiz for a transcription
   */
  async deleteQuizByTranscriptionId(transcriptionId: string): Promise<void> {
    // Questions will be cascade deleted due to foreign key
    await executeQuery(
      `DELETE FROM quizzes WHERE transcription_id = ?`,
      [transcriptionId]
    );
  },

  // ============================================
  // Flashcard operations
  // ============================================

  /**
   * Save a flashcard deck with its cards
   */
  async saveFlashcardDeck(deck: FlashcardDeck): Promise<void> {
    // Insert deck metadata
    await executeQuery(
      `INSERT INTO flashcard_decks (id, transcription_id, title, card_count, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [deck.id, deck.transcriptionId, deck.title, deck.cards.length, deck.createdAt]
    );

    // Insert cards
    for (let i = 0; i < deck.cards.length; i++) {
      const card = deck.cards[i];
      await executeQuery(
        `INSERT INTO flashcards (id, deck_id, front, back, category, card_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [card.id, deck.id, card.front, card.back, card.category || null, i]
      );
    }
  },

  /**
   * Get flashcard deck for a transcription (returns the most recent one)
   */
  async getFlashcardDeckByTranscriptionId(transcriptionId: string): Promise<FlashcardDeck | null> {
    // Get deck metadata
    const deckRows = await executeQuery<{
      id: string;
      transcription_id: string;
      title: string;
      created_at: string;
    }>(
      `SELECT id, transcription_id, title, created_at 
       FROM flashcard_decks 
       WHERE transcription_id = ? 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [transcriptionId]
    );

    if (deckRows.length === 0) {
      return null;
    }

    const deckRow = deckRows[0];

    // Get cards
    const cardRows = await executeQuery<{
      id: string;
      front: string;
      back: string;
      category: string | null;
    }>(
      `SELECT id, front, back, category 
       FROM flashcards 
       WHERE deck_id = ? 
       ORDER BY card_order`,
      [deckRow.id]
    );

    const cards: Flashcard[] = cardRows.map(row => ({
      id: row.id,
      front: row.front,
      back: row.back,
      category: row.category || undefined,
    }));

    return {
      id: deckRow.id,
      transcriptionId: deckRow.transcription_id,
      title: deckRow.title,
      cards,
      createdAt: deckRow.created_at,
    };
  },

  /**
   * Delete flashcard deck for a transcription
   */
  async deleteFlashcardDeckByTranscriptionId(transcriptionId: string): Promise<void> {
    // Cards will be cascade deleted due to foreign key
    await executeQuery(
      `DELETE FROM flashcard_decks WHERE transcription_id = ?`,
      [transcriptionId]
    );
  },
};
