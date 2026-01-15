import fs from 'fs';
import path from 'path';
import Groq from 'groq-sdk';
import OpenAI from 'openai';

// Configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Transcription provider: 'groq' | 'openai'
// Can be overridden per-request or set via environment variable
const DEFAULT_PROVIDER = (process.env.TRANSCRIPTION_PROVIDER || 'openai') as TranscriptionProvider;

// Model configurations
const MODELS = {
  groq: {
    whisper: 'whisper-large-v3',
    whisperTurbo: 'whisper-large-v3-turbo',
  },
  openai: {
    gpt4oMini: 'gpt-4o-mini-transcribe',
    gpt4o: 'gpt-4o-transcribe',
    whisper: 'whisper-1',
  },
} as const;

// Default model for each provider
const DEFAULT_MODELS = {
  groq: MODELS.groq.whisper,
  openai: MODELS.openai.gpt4oMini,
} as const;

export type TranscriptionProvider = 'groq' | 'openai';

export interface TranscriptionResult {
  text: string;
  duration: number;
  model: string;
  provider: TranscriptionProvider;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface TranscriptionOptions {
  provider?: TranscriptionProvider;
  model?: string;
  language?: string;
  prompt?: string; // Only supported by OpenAI gpt-4o models
}

// Initialize clients lazily
let groqClient: Groq | null = null;
let openaiClient: OpenAI | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    if (!GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is not set');
    }
    groqClient = new Groq({
      apiKey: GROQ_API_KEY,
      timeout: 120000,
      maxRetries: 3,
    });
  }
  return groqClient;
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    openaiClient = new OpenAI({
      apiKey: OPENAI_API_KEY,
      timeout: 120000,
      maxRetries: 3,
    });
  }
  return openaiClient;
}

// Verbose JSON response type from Groq Whisper
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
      
      const errorMessage = lastError.message || '';
      if (errorMessage.includes('Invalid API Key') || 
          errorMessage.includes('401') ||
          errorMessage.includes('Invalid file format')) {
        throw error;
      }
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Transcription attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Transcribe using Groq's Whisper API
 */
async function transcribeWithGroq(
  filePath: string,
  model: string,
  language?: string
): Promise<TranscriptionResult> {
  const groq = getGroqClient();
  
  return withRetry(async () => {
    const fileStream = fs.createReadStream(filePath);
    
    const transcription = await groq.audio.transcriptions.create({
      file: fileStream,
      model: model,
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
      model,
      provider: 'groq' as const,
      segments: transcription.segments?.map(seg => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
      })),
    };
  });
}

/**
 * Transcribe using OpenAI's API (gpt-4o-mini-transcribe or whisper-1)
 */
async function transcribeWithOpenAI(
  filePath: string,
  model: string,
  language?: string,
  prompt?: string
): Promise<TranscriptionResult> {
  const openai = getOpenAIClient();
  
  return withRetry(async () => {
    const fileStream = fs.createReadStream(filePath);
    
    // gpt-4o models only support json/text, not verbose_json
    const isGpt4oModel = model.includes('gpt-4o');
    
    const requestParams: OpenAI.Audio.TranscriptionCreateParams = {
      file: fileStream,
      model: model,
      response_format: isGpt4oModel ? 'json' : 'verbose_json',
      language: language,
    };
    
    // Only gpt-4o models support prompting effectively
    if (prompt && isGpt4oModel) {
      requestParams.prompt = prompt;
    }
    
    const transcription = await openai.audio.transcriptions.create(requestParams);

    interface TranscriptionUsage {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    }

    const usage = 'usage' in transcription
      ? (transcription as { usage?: TranscriptionUsage }).usage
      : undefined;

    const normalizedUsage = usage
      ? {
        inputTokens: usage.input_tokens ?? usage.inputTokens,
        outputTokens: usage.output_tokens ?? usage.outputTokens,
        totalTokens: usage.total_tokens ?? usage.totalTokens,
      }
      : undefined;

    // For gpt-4o models, we don't get segments/duration
    // For whisper-1 with verbose_json, we get full details
    let duration = 0;
    let segments: TranscriptionResult['segments'] = undefined;
    
    if (!isGpt4oModel && 'segments' in transcription) {
      const verboseResult = transcription as unknown as VerboseTranscription;
      if (verboseResult.segments && verboseResult.segments.length > 0) {
        const lastSegment = verboseResult.segments[verboseResult.segments.length - 1];
        duration = lastSegment.end;
        segments = verboseResult.segments.map(seg => ({
          start: seg.start,
          end: seg.end,
          text: seg.text,
        }));
      }
    }

    return {
      text: transcription.text,
      duration,
      model,
      provider: 'openai' as const,
      segments,
      usage: normalizedUsage,
    };
  });
}

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

export const transcriptionService = {
  /**
   * Get the default provider
   */
  getDefaultProvider(): TranscriptionProvider {
    return DEFAULT_PROVIDER;
  },

  /**
   * Transcribe an audio file
   * @param filePath - Path to the audio file
   * @param options - Transcription options including provider, model, language, prompt
   */
  async transcribeFile(
    filePath: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const provider = options.provider || DEFAULT_PROVIDER;
    const model = options.model || DEFAULT_MODELS[provider];
    
    // Check file size
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    console.log(`Transcribing file: ${path.basename(filePath)}, size: ${fileSizeMB.toFixed(2)}MB, provider: ${provider}, model: ${model}`);
    
    if (fileSizeMB > 25) {
      throw new Error(`File too large: ${fileSizeMB.toFixed(2)}MB. Maximum is 25MB.`);
    }

    if (provider === 'groq') {
      return transcribeWithGroq(filePath, model, options.language);
    } else {
      // For Turkish content, add a helpful prompt
      let prompt = options.prompt;
      if (!prompt && options.language === 'tr') {
        prompt = 'Bu bir Türkçe ders kaydıdır. Lütfen doğru Türkçe yazım ve gramer kurallarına dikkat edin.';
      }
      return transcribeWithOpenAI(filePath, model, options.language, prompt);
    }
  },

  /**
   * Transcribe audio from a buffer
   * @param buffer - Audio file buffer
   * @param filename - Original filename for format detection
   * @param options - Transcription options
   */
  async transcribeBuffer(
    buffer: Buffer,
    filename: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const provider = options.provider || DEFAULT_PROVIDER;
    const model = options.model || DEFAULT_MODELS[provider];
    
    const fileSizeMB = buffer.length / (1024 * 1024);
    console.log(`Transcribing buffer: ${filename}, size: ${fileSizeMB.toFixed(2)}MB, provider: ${provider}, model: ${model}`);
    
    if (fileSizeMB > 25) {
      throw new Error(`Buffer too large: ${fileSizeMB.toFixed(2)}MB. Maximum is 25MB.`);
    }

    // For buffer-based transcription, we need to write to a temp file
    // because the OpenAI SDK expects a file stream
    const tempPath = `/tmp/transcription-${Date.now()}-${filename}`;
    fs.writeFileSync(tempPath, buffer);
    
    try {
      const result = await this.transcribeFile(tempPath, options);
      return result;
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  },

  /**
   * Get available models for a provider
   */
  getAvailableModels(provider: TranscriptionProvider) {
    return MODELS[provider];
  },
};

// Re-export for backward compatibility
export const groqService = {
  async transcribeFile(filePath: string, language?: string): Promise<TranscriptionResult> {
    return transcriptionService.transcribeFile(filePath, { 
      provider: 'groq', 
      language 
    });
  },
  async transcribeBuffer(buffer: Buffer, filename: string, language?: string): Promise<TranscriptionResult> {
    return transcriptionService.transcribeBuffer(buffer, filename, { 
      provider: 'groq', 
      language 
    });
  },
};
