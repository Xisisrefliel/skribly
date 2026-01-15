import type { Transcription, TranscriptionStatus, Quiz, QuizQuestion, FlashcardDeck, Flashcard, Tag, SourceType } from '@lecture/shared';

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
  is_public: number; // SQLite uses INTEGER for boolean (0 or 1)
  source_type: string;
  mime_type: string | null;
  original_file_name: string | null;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SubscriptionRow {
  user_id: string;
  subscription_id: string;
  customer_id: string;
  product_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: number;
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
    isPublic: Boolean(row.is_public),
    sourceType: (row.source_type as SourceType) || 'audio',
    mimeType: row.mime_type,
    originalFileName: row.original_file_name,
    folderId: row.folder_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueEmailError(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed: user\.email/i.test(error.message);
}

export const d1Service = {
  /**
   * Ensure a user exists in the database (upsert)
   * This is called when Clerk authenticates a user to ensure they have a row in the user table
   * 
   * Handles two conflict scenarios:
   * 1. User with same ID already exists -> update their info
   * 2. User with same email but different ID exists -> migrate data and replace old user
   */
  async ensureUser(userId: string, name: string, email: string, image?: string): Promise<void> {
    const migrateUserData = async (oldUserId: string): Promise<void> => {
      const tempEmail = `${userId}@temp.migrated`;
      try {
        await executeQuery(
          `INSERT INTO user (id, name, email, image, created_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [userId, name, tempEmail, image || null]
        );
      } catch (error) {
        const checkAgain = await executeQuery<{ id: string }>(
          `SELECT id FROM user WHERE id = ?`,
          [userId]
        );
        if (checkAgain.length === 0) {
          throw error;
        }
      }

      await executeQuery(`UPDATE transcriptions SET user_id = ? WHERE user_id = ?`, [userId, oldUserId]);
      await executeQuery(`UPDATE folders SET user_id = ? WHERE user_id = ?`, [userId, oldUserId]);
      await executeQuery(`UPDATE tags SET user_id = ? WHERE user_id = ?`, [userId, oldUserId]);
      await executeQuery(`UPDATE quiz_attempts SET user_id = ? WHERE user_id = ?`, [userId, oldUserId]);
      await executeQuery(`UPDATE usage_events SET user_id = ? WHERE user_id = ?`, [userId, oldUserId]);

      await executeQuery(`DELETE FROM session WHERE user_id = ?`, [oldUserId]);
      await executeQuery(`DELETE FROM account WHERE user_id = ?`, [oldUserId]);
      await executeQuery(`DELETE FROM user WHERE id = ?`, [oldUserId]);

      await executeQuery(
        `UPDATE user SET email = ?, updated_at = datetime('now') WHERE id = ?`,
        [email, userId]
      );

      console.log(`Migrated user data from ID ${oldUserId} to ${userId} (email: ${email})`);
    };

    const upsertUser = async (): Promise<void> => {
      await executeQuery(
        `INSERT INTO user (id, name, email, image, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           email = excluded.email,
           image = excluded.image,
           updated_at = datetime('now')`,
        [userId, name, email, image || null]
      );
    };

    const existingById = await executeQuery<{ id: string; email: string }>(
      `SELECT id, email FROM user WHERE id = ?`,
      [userId]
    );

    if (existingById.length > 0 && email) {
      const emailOwner = await executeQuery<{ id: string }>(
        `SELECT id FROM user WHERE email = ? AND id != ?`,
        [email, userId]
      );
      if (emailOwner.length > 0) {
        await migrateUserData(emailOwner[0].id);
        return;
      }
      await upsertUser();
      return;
    }

    if (email) {
      const existingByEmail = await executeQuery<{ id: string }>(
        `SELECT id FROM user WHERE email = ?`,
        [email]
      );

      if (existingByEmail.length > 0 && existingByEmail[0].id !== userId) {
        await migrateUserData(existingByEmail[0].id);
        return;
      }
    }

    try {
      await upsertUser();
    } catch (error) {
      if (isUniqueEmailError(error) && email) {
        const emailOwner = await executeQuery<{ id: string }>(
          `SELECT id FROM user WHERE email = ?`,
          [email]
        );
        if (emailOwner.length > 0 && emailOwner[0].id !== userId) {
          await migrateUserData(emailOwner[0].id);
          return;
        }
        await executeQuery(
          `UPDATE user SET name = ?, email = ?, image = ?, updated_at = datetime('now') WHERE id = ?`,
          [name, email, image || null, userId]
        );
        return;
      }
      throw error;
    }
  },

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
        is_public INTEGER DEFAULT 0,
        source_type TEXT DEFAULT 'audio',
        mime_type TEXT,
        original_file_name TEXT,
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
    try {
      await executeQuery(`ALTER TABLE transcriptions ADD COLUMN is_public INTEGER DEFAULT 0`);
      console.log('Added is_public column to transcriptions table');
    } catch {
      // Column already exists
    }
    try {
      await executeQuery(`ALTER TABLE transcriptions ADD COLUMN source_type TEXT DEFAULT 'audio'`);
      console.log('Added source_type column to transcriptions table');
    } catch {
      // Column already exists
    }
    try {
      await executeQuery(`ALTER TABLE transcriptions ADD COLUMN mime_type TEXT`);
      console.log('Added mime_type column to transcriptions table');
    } catch {
      // Column already exists
    }
    try {
      await executeQuery(`ALTER TABLE transcriptions ADD COLUMN original_file_name TEXT`);
      console.log('Added original_file_name column to transcriptions table');
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
    // Subscription tables
    // ============================================

    await executeQuery(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        user_id TEXT PRIMARY KEY,
        subscription_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        status TEXT NOT NULL,
        current_period_end TEXT,
        cancel_at_period_end INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    try {
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`);
    } catch (e) {
      // Index already exists, ignore
    }

    // ============================================
    // Usage events
    // ============================================

    await executeQuery(`
      CREATE TABLE IF NOT EXISTS usage_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        transcription_id TEXT NOT NULL,
        step TEXT NOT NULL,
        provider TEXT,
        model TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        total_tokens INTEGER,
        audio_seconds REAL,
        cost_usd REAL DEFAULT 0,
        metadata_json TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
        FOREIGN KEY (transcription_id) REFERENCES transcriptions(id) ON DELETE CASCADE
      )
    `);

    try {
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON usage_events(user_id)`);
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_usage_events_transcription_id ON usage_events(transcription_id)`);
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_usage_events_step ON usage_events(step)`);
    } catch (e) {
      // Indexes may already exist
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

    // Quiz attempts table - stores user quiz results
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS quiz_attempts (
        id TEXT PRIMARY KEY,
        quiz_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        score INTEGER NOT NULL,
        total_questions INTEGER NOT NULL,
        answers TEXT NOT NULL,
        completed_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for quiz attempts
    try {
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_id ON quiz_attempts(quiz_id)`);
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_id ON quiz_attempts(user_id)`);
    } catch (e) {
      // Indexes may already exist
    }

    // ============================================
    // Folders and Tags tables
    // ============================================

    // Add folder_id column to transcriptions if it doesn't exist
    try {
      await executeQuery(`ALTER TABLE transcriptions ADD COLUMN folder_id TEXT`);
      console.log('Added folder_id column to transcriptions table');
    } catch {
      // Column already exists
    }

    // Folders table - user-created folders for organizing transcriptions
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#0ea5e9',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      )
    `);

    // Tags table - user-created tags for categorizing transcriptions
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#0ea5e9',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      )
    `);

    // Transcription tags junction table - many-to-many relationship
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS transcription_tags (
        transcription_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (transcription_id, tag_id),
        FOREIGN KEY (transcription_id) REFERENCES transcriptions(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for folders and tags
    try {
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id)`);
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id)`);
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_transcription_tags_transcription_id ON transcription_tags(transcription_id)`);
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_transcription_tags_tag_id ON transcription_tags(tag_id)`);
      await executeQuery(`CREATE INDEX IF NOT EXISTS idx_transcriptions_folder_id ON transcriptions(folder_id)`);
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
        pdf_key, pdf_generated_at, whisper_model, detected_language, is_public,
        source_type, mime_type, original_file_name, folder_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        data.isPublic ? 1 : 0,
        data.sourceType || 'audio',
        data.mimeType || null,
        data.originalFileName || null,
        data.folderId || null,
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
    const transcriptions = rows.map(rowToTranscription);
    
    // Fetch tags for each transcription
    for (const transcription of transcriptions) {
      const tags = await this.getTagsByTranscription(transcription.id);
      (transcription as any).tags = tags;
    }
    
    return transcriptions;
  },

  /**
   * Get a single transcription by ID
   */
  async getTranscription(id: string, userId: string): Promise<Transcription | null> {
    const rows = await executeQuery<TranscriptionRow>(
      `SELECT * FROM transcriptions WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    if (rows.length === 0) return null;
    
    const transcription = rowToTranscription(rows[0]);
    // Fetch tags for the transcription
    const tags = await this.getTagsByTranscription(id);
    (transcription as Transcription & { tags: Array<{ id: string; userId: string; name: string; color: string; createdAt: string }> }).tags = tags;
    
    return transcription;
  },

  /**
   * Get a public transcription by ID (no user check)
   */
  async getPublicTranscription(id: string): Promise<Transcription | null> {
    const rows = await executeQuery<TranscriptionRow>(
      `SELECT * FROM transcriptions WHERE id = ? AND is_public = 1`,
      [id]
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
   * Clear structured content and PDF metadata
   */
  async clearStructuredContent(id: string): Promise<void> {
    await executeQuery(
      `UPDATE transcriptions
       SET structured_text = NULL, pdf_key = NULL, pdf_generated_at = NULL,
           error_message = NULL, updated_at = datetime('now')
       WHERE id = ?`,
      [id]
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
  // Usage events
  // ============================================

  async insertUsageEvent(event: {
    id: string;
    userId: string;
    transcriptionId: string;
    step: string;
    provider: string;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    audioSeconds: number | null;
    costUsd: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await executeQuery(
      `INSERT INTO usage_events (
         id, user_id, transcription_id, step, provider, model,
         input_tokens, output_tokens, total_tokens, audio_seconds, cost_usd, metadata_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.userId,
        event.transcriptionId,
        event.step,
        event.provider,
        event.model,
        event.inputTokens,
        event.outputTokens,
        event.totalTokens,
        event.audioSeconds,
        event.costUsd,
        event.metadata ? JSON.stringify(event.metadata) : null,
      ]
    );
  },

  async getTranscriptionUsageTotal(transcriptionId: string): Promise<number> {
    const rows = await executeQuery<{ total_cost: number | null }>(
      `SELECT SUM(cost_usd) as total_cost FROM usage_events WHERE transcription_id = ?`,
      [transcriptionId]
    );
    return Number(rows[0]?.total_cost ?? 0);
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
  // Quiz attempt operations
  // ============================================

  /**
   * Save a quiz attempt
   */
  async saveQuizAttempt(attempt: {
    id: string;
    quizId: string;
    userId: string;
    score: number;
    totalQuestions: number;
    answers: number[];
  }): Promise<void> {
    await executeQuery(
      `INSERT INTO quiz_attempts (id, quiz_id, user_id, score, total_questions, answers, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        attempt.id,
        attempt.quizId,
        attempt.userId,
        attempt.score,
        attempt.totalQuestions,
        JSON.stringify(attempt.answers),
        new Date().toISOString(),
      ]
    );
  },

  /**
   * Get quiz attempts for a quiz
   */
  async getQuizAttempts(quizId: string, userId: string): Promise<Array<{
    id: string;
    quizId: string;
    userId: string;
    score: number;
    totalQuestions: number;
    answers: number[];
    completedAt: string;
  }>> {
    const rows = await executeQuery<{
      id: string;
      quiz_id: string;
      user_id: string;
      score: number;
      total_questions: number;
      answers: string;
      completed_at: string;
    }>(
      `SELECT id, quiz_id, user_id, score, total_questions, answers, completed_at
       FROM quiz_attempts
       WHERE quiz_id = ? AND user_id = ?
       ORDER BY completed_at DESC`,
      [quizId, userId]
    );

    return rows.map(row => ({
      id: row.id,
      quizId: row.quiz_id,
      userId: row.user_id,
      score: row.score,
      totalQuestions: row.total_questions,
      answers: JSON.parse(row.answers),
      completedAt: row.completed_at,
    }));
  },

  /**
   * Get all quiz attempts for a user (across all quizzes)
   */
  async getAllQuizAttemptsByUser(userId: string): Promise<Array<{
    id: string;
    quizId: string;
    userId: string;
    score: number;
    totalQuestions: number;
    answers: number[];
    completedAt: string;
  }>> {
    const rows = await executeQuery<{
      id: string;
      quiz_id: string;
      user_id: string;
      score: number;
      total_questions: number;
      answers: string;
      completed_at: string;
    }>(
      `SELECT id, quiz_id, user_id, score, total_questions, answers, completed_at
       FROM quiz_attempts
       WHERE user_id = ?
       ORDER BY completed_at DESC`,
      [userId]
    );

    return rows.map(row => ({
      id: row.id,
      quizId: row.quiz_id,
      userId: row.user_id,
      score: row.score,
      totalQuestions: row.total_questions,
      answers: JSON.parse(row.answers),
      completedAt: row.completed_at,
    }));
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
   * Get all flashcard decks for a transcription
   */
  async getAllFlashcardDecks(transcriptionId: string): Promise<FlashcardDeck[]> {
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
       ORDER BY created_at DESC`,
      [transcriptionId]
    );

    const decks: FlashcardDeck[] = [];

    for (const deckRow of deckRows) {
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

      decks.push({
        id: deckRow.id,
        transcriptionId: deckRow.transcription_id,
        title: deckRow.title,
        cards,
        createdAt: deckRow.created_at,
      });
    }

    return decks;
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

  /**
   * Update transcription title
   */
  async updateTranscriptionTitle(id: string, userId: string, title: string): Promise<void> {
    await executeQuery(
      `UPDATE transcriptions 
       SET title = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
      [title, id, userId]
    );
  },

  /**
   * Update transcription public/private status
   */
  async updateTranscriptionVisibility(id: string, userId: string, isPublic: boolean): Promise<void> {
    await executeQuery(
      `UPDATE transcriptions 
       SET is_public = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
      [isPublic ? 1 : 0, id, userId]
    );
  },

  // ============================================
  // Folder operations
  // ============================================

  /**
   * Get all folders for a user
   */
  async getFoldersByUser(userId: string): Promise<Array<{ id: string; userId: string; name: string; color: string; createdAt: string }>> {
    const rows = await executeQuery<{
      id: string;
      user_id: string;
      name: string;
      color: string;
      created_at: string;
    }>(
      `SELECT id, user_id, name, color, created_at FROM folders WHERE user_id = ? ORDER BY name ASC`,
      [userId]
    );
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      color: row.color,
      createdAt: row.created_at,
    }));
  },

  /**
   * Create a new folder
   */
  async createFolder(id: string, userId: string, name: string, color: string): Promise<void> {
    await executeQuery(
      `INSERT INTO folders (id, user_id, name, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [id, userId, name, color]
    );
  },

  /**
   * Update folder name or color
   */
  async updateFolder(id: string, userId: string, name?: string, color?: string): Promise<void> {
    const updates: string[] = [];
    const params: unknown[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (color !== undefined) {
      updates.push('color = ?');
      params.push(color);
    }

    if (updates.length === 0) return;

    updates.push("updated_at = datetime('now')");
    params.push(id, userId);

    await executeQuery(
      `UPDATE folders SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      params
    );
  },

  /**
   * Delete a folder
   */
  async deleteFolder(id: string, userId: string): Promise<void> {
    // First, remove folder_id from all transcriptions in this folder
    await executeQuery(
      `UPDATE transcriptions SET folder_id = NULL WHERE folder_id = ? AND user_id = ?`,
      [id, userId]
    );
    // Then delete the folder
    await executeQuery(
      `DELETE FROM folders WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
  },

  /**
   * Update transcription folder
   */
  async updateTranscriptionFolder(id: string, userId: string, folderId: string | null): Promise<void> {
    await executeQuery(
      `UPDATE transcriptions 
       SET folder_id = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
      [folderId, id, userId]
    );
  },

  // ============================================
  // Tag operations
  // ============================================

  /**
   * Get all tags for a user
   */
  async getTagsByUser(userId: string): Promise<Array<{ id: string; userId: string; name: string; color: string; createdAt: string }>> {
    const rows = await executeQuery<{
      id: string;
      user_id: string;
      name: string;
      color: string;
      created_at: string;
    }>(
      `SELECT id, user_id, name, color, created_at FROM tags WHERE user_id = ? ORDER BY name ASC`,
      [userId]
    );
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      color: row.color,
      createdAt: row.created_at,
    }));
  },

  /**
   * Create a new tag
   */
  async createTag(id: string, userId: string, name: string, color: string): Promise<void> {
    await executeQuery(
      `INSERT INTO tags (id, user_id, name, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [id, userId, name, color]
    );
  },

  /**
   * Update tag name or color
   */
  async updateTag(id: string, userId: string, name?: string, color?: string): Promise<void> {
    const updates: string[] = [];
    const params: unknown[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (color !== undefined) {
      updates.push('color = ?');
      params.push(color);
    }

    if (updates.length === 0) return;

    updates.push("updated_at = datetime('now')");
    params.push(id, userId);

    await executeQuery(
      `UPDATE tags SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      params
    );
  },

  /**
   * Delete a tag
   */
  async deleteTag(id: string, userId: string): Promise<void> {
    // Junction table entries will be cascade deleted
    await executeQuery(
      `DELETE FROM tags WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
  },

  /**
   * Get tags for a transcription
   */
  async getTagsByTranscription(transcriptionId: string): Promise<Tag[]> {
    const rows = await executeQuery<{
      id: string;
      user_id: string;
      name: string;
      color: string;
      created_at: string;
    }>(
      `SELECT t.id, t.user_id, t.name, t.color, t.created_at
       FROM tags t
       INNER JOIN transcription_tags tt ON t.id = tt.tag_id
       WHERE tt.transcription_id = ?
       ORDER BY t.name ASC`,
      [transcriptionId]
    );
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      color: row.color,
      createdAt: row.created_at,
    }));
  },

  /**
   * Set tags for a transcription (replaces all existing tags)
   */
  async setTranscriptionTags(transcriptionId: string, tagIds: string[]): Promise<void> {
    // Delete existing tags
    await executeQuery(
      `DELETE FROM transcription_tags WHERE transcription_id = ?`,
      [transcriptionId]
    );

    // Insert new tags
    for (const tagId of tagIds) {
      await executeQuery(
        `INSERT INTO transcription_tags (transcription_id, tag_id, created_at)
         VALUES (?, ?, datetime('now'))`,
        [transcriptionId, tagId]
      );
    }
  },

  /**
   * Get transcriptions with their tags
   */
  async getTranscriptionsByUserWithTags(userId: string, folderId?: string | null, tagIds?: string[]): Promise<Transcription[]> {
    let query = `SELECT t.* FROM transcriptions t WHERE t.user_id = ?`;
    const params: unknown[] = [userId];

    if (folderId !== undefined) {
      if (folderId === null) {
        query += ` AND t.folder_id IS NULL`;
      } else {
        query += ` AND t.folder_id = ?`;
        params.push(folderId);
      }
    }

    if (tagIds && tagIds.length > 0) {
      query += ` AND t.id IN (
        SELECT DISTINCT transcription_id 
        FROM transcription_tags 
        WHERE tag_id IN (${tagIds.map(() => '?').join(',')})
      )`;
      params.push(...tagIds);
    }

    query += ` ORDER BY t.created_at DESC`;

    const rows = await executeQuery<TranscriptionRow>(query, params);
    const transcriptions = rows.map(rowToTranscription);

    // Fetch tags for each transcription
    for (const transcription of transcriptions) {
      const tags = await this.getTagsByTranscription(transcription.id);
      (transcription as Transcription & { tags: Array<{ id: string; userId: string; name: string; color: string; createdAt: string }> }).tags = tags;
    }

    return transcriptions;
  },

  // ============================================
  // Subscription operations
  // ============================================

  async getSubscriptionByUser(userId: string): Promise<SubscriptionRow | null> {
    const rows = await executeQuery<SubscriptionRow>(
      `SELECT * FROM subscriptions WHERE user_id = ?`,
      [userId]
    );
    return rows[0] || null;
  },

  async upsertSubscription(data: {
    userId: string;
    subscriptionId: string;
    customerId: string;
    productId: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  }): Promise<void> {
    await executeQuery(
      `INSERT INTO subscriptions (
        user_id, subscription_id, customer_id, product_id, status, current_period_end, cancel_at_period_end, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        subscription_id = excluded.subscription_id,
        customer_id = excluded.customer_id,
        product_id = excluded.product_id,
        status = excluded.status,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        updated_at = datetime('now')`,
      [
        data.userId,
        data.subscriptionId,
        data.customerId,
        data.productId,
        data.status,
        data.currentPeriodEnd,
        data.cancelAtPeriodEnd ? 1 : 0,
      ]
    );
  },

  async isSubscriptionActive(userId: string): Promise<boolean> {
    const subscription = await this.getSubscriptionByUser(userId);
    if (!subscription) return false;
    if (subscription.status !== 'active') return false;

    if (subscription.current_period_end) {
      const periodEnd = new Date(subscription.current_period_end).getTime();
      if (Number.isNaN(periodEnd)) return false;
      return periodEnd > Date.now();
    }

    return true;
  },
};
