import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';

const GROQ_API_KEY = process.env.GROQ_API_KEY!;

// Whisper model to use for transcription
const WHISPER_MODEL = 'whisper-large-v3';

const groq = new Groq({
  apiKey: GROQ_API_KEY,
  timeout: 120000, // 2 minute timeout for large files
  maxRetries: 3,   // Retry on connection errors
});

// Verbose JSON response type from Groq
interface VerboseTranscription {
  text: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

// Retry helper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on non-retryable errors
      const errorMessage = lastError.message || '';
      if (errorMessage.includes('Invalid API Key') || 
          errorMessage.includes('401') ||
          errorMessage.includes('Invalid file format')) {
        throw error;
      }
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Groq API attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

export interface TranscriptionResult {
  text: string;
  duration: number;
  model: string;  // The Whisper model used for transcription
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

export const groqService = {
  /**
   * Transcribe an audio file using Groq's Whisper API
   * @param filePath - Path to the audio file
   * @param language - Optional language code (e.g., 'en', 'tr')
   */
  async transcribeFile(filePath: string, language?: string): Promise<TranscriptionResult> {
    // Check file size
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    console.log(`Transcribing file: ${path.basename(filePath)}, size: ${fileSizeMB.toFixed(2)}MB`);
    
    if (fileSizeMB > 25) {
      throw new Error(`File too large: ${fileSizeMB.toFixed(2)}MB. Maximum is 25MB.`);
    }

    return withRetry(async () => {
      const fileStream = fs.createReadStream(filePath);
      
      const transcription = await groq.audio.transcriptions.create({
        file: fileStream,
        model: WHISPER_MODEL,
        response_format: 'verbose_json',
        language: language,
        temperature: 0,
      }) as unknown as VerboseTranscription;

      // Calculate total duration from segments
      let duration = 0;
      if (transcription.segments && transcription.segments.length > 0) {
        const lastSegment = transcription.segments[transcription.segments.length - 1];
        duration = lastSegment.end;
      }

      return {
        text: transcription.text,
        duration,
        model: WHISPER_MODEL,
        segments: transcription.segments?.map(seg => ({
          start: seg.start,
          end: seg.end,
          text: seg.text,
        })),
      };
    });
  },

  /**
   * Transcribe audio from a buffer
   * @param buffer - Audio file buffer
   * @param filename - Original filename for format detection
   * @param language - Optional language code
   */
  async transcribeBuffer(
    buffer: Buffer, 
    filename: string, 
    language?: string
  ): Promise<TranscriptionResult> {
    const fileSizeMB = buffer.length / (1024 * 1024);
    console.log(`Transcribing buffer: ${filename}, size: ${fileSizeMB.toFixed(2)}MB`);
    
    if (fileSizeMB > 25) {
      throw new Error(`Buffer too large: ${fileSizeMB.toFixed(2)}MB. Maximum is 25MB.`);
    }

    return withRetry(async () => {
      // Create a File object from the buffer
      const file = new File([new Uint8Array(buffer)], filename, { 
        type: getAudioMimeType(filename) 
      });

      const transcription = await groq.audio.transcriptions.create({
        file: file,
        model: WHISPER_MODEL,
        response_format: 'verbose_json',
        language: language,
        temperature: 0,
      }) as unknown as VerboseTranscription;

      let duration = 0;
      if (transcription.segments && transcription.segments.length > 0) {
        const lastSegment = transcription.segments[transcription.segments.length - 1];
        duration = lastSegment.end;
      }

      return {
        text: transcription.text,
        duration,
        model: WHISPER_MODEL,
        segments: transcription.segments?.map(seg => ({
          start: seg.start,
          end: seg.end,
          text: seg.text,
        })),
      };
    });
  },
};

function getAudioMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.mp4': 'audio/mp4',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.webm': 'audio/webm',
  };
  return mimeTypes[ext] || 'audio/mpeg';
}
