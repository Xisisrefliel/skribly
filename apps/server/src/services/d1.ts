import type { Transcription, TranscriptionStatus } from '@lecture/shared';

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
  device_id: string;
  title: string;
  audio_url: string | null;
  audio_duration: number | null;
  transcription_text: string | null;
  status: TranscriptionStatus;
  progress: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTranscription(row: TranscriptionRow): Transcription {
  return {
    id: row.id,
    deviceId: row.device_id,
    title: row.title,
    audioUrl: row.audio_url,
    audioDuration: row.audio_duration,
    transcriptionText: row.transcription_text,
    status: row.status,
    progress: row.progress,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const d1Service = {
  /**
   * Initialize the database schema
   */
  async initSchema(): Promise<void> {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS transcriptions (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        title TEXT NOT NULL,
        audio_url TEXT,
        audio_duration INTEGER,
        transcription_text TEXT,
        status TEXT DEFAULT 'pending',
        progress REAL DEFAULT 0,
        error_message TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_transcriptions_device_id 
      ON transcriptions(device_id)
    `);
  },

  /**
   * Create a new transcription record
   */
  async createTranscription(data: Omit<Transcription, 'createdAt' | 'updatedAt'>): Promise<void> {
    await executeQuery(
      `INSERT INTO transcriptions (
        id, device_id, title, audio_url, audio_duration, 
        transcription_text, status, progress, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.deviceId,
        data.title,
        data.audioUrl,
        data.audioDuration,
        data.transcriptionText,
        data.status,
        data.progress,
        data.errorMessage,
      ]
    );
  },

  /**
   * Get all transcriptions for a device
   */
  async getTranscriptionsByDevice(deviceId: string): Promise<Transcription[]> {
    const rows = await executeQuery<TranscriptionRow>(
      `SELECT * FROM transcriptions WHERE device_id = ? ORDER BY created_at DESC`,
      [deviceId]
    );
    return rows.map(rowToTranscription);
  },

  /**
   * Get a single transcription by ID
   */
  async getTranscription(id: string, deviceId: string): Promise<Transcription | null> {
    const rows = await executeQuery<TranscriptionRow>(
      `SELECT * FROM transcriptions WHERE id = ? AND device_id = ?`,
      [id, deviceId]
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
   * Update transcription with completed text
   */
  async updateTranscriptionText(
    id: string, 
    text: string, 
    duration: number
  ): Promise<void> {
    await executeQuery(
      `UPDATE transcriptions 
       SET transcription_text = ?, audio_duration = ?, status = 'completed', 
           progress = 1.0, updated_at = datetime('now')
       WHERE id = ?`,
      [text, duration, id]
    );
  },

  /**
   * Delete a transcription
   */
  async deleteTranscription(id: string, deviceId: string): Promise<boolean> {
    const result = await executeQuery(
      `DELETE FROM transcriptions WHERE id = ? AND device_id = ?`,
      [id, deviceId]
    );
    return true; // D1 doesn't return affected rows count via REST API
  },
};
