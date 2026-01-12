// Transcription status enum
export type TranscriptionStatus = 
  | 'pending'      // Uploaded, waiting to process
  | 'processing'   // Currently being transcribed
  | 'structuring'  // Transcription done, now structuring with LLM
  | 'completed'    // Successfully transcribed and structured
  | 'error';       // Failed to transcribe

// Main transcription type
export interface Transcription {
  id: string;
  userId: string;
  title: string;
  audioUrl: string | null;
  audioDuration: number | null;  // Duration in seconds
  transcriptionText: string | null;      // Raw transcription
  structuredText: string | null;         // LLM-structured markdown
  status: TranscriptionStatus;
  progress: number;              // 0.0 to 1.0
  errorMessage: string | null;
  pdfKey: string | null;         // R2 storage key for pre-generated PDF
  pdfGeneratedAt: string | null; // ISO date string when PDF was generated
  whisperModel: string | null;   // Model used for transcription (e.g., 'whisper-large-v3')
  detectedLanguage: string | null; // Language detected in the transcription
  createdAt: string;             // ISO date string
  updatedAt: string;             // ISO date string
}

// Quiz types
export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number; // Index of correct option
  explanation: string;
}

export interface Quiz {
  id: string;
  transcriptionId: string;
  title: string;
  questions: QuizQuestion[];
  createdAt: string;
}

export interface GenerateQuizRequest {
  questionCount?: number; // Default 10
}

export interface GenerateQuizResponse {
  quiz: Quiz;
}

// Flashcard types
export interface Flashcard {
  id: string;
  front: string;  // Question or concept
  back: string;   // Answer or explanation
  category?: string;
}

export interface FlashcardDeck {
  id: string;
  transcriptionId: string;
  title: string;
  cards: Flashcard[];
  createdAt: string;
}

export interface GenerateFlashcardsRequest {
  cardCount?: number; // Default 20
}

export interface GenerateFlashcardsResponse {
  deck: FlashcardDeck;
}

// API request/response types
export interface UploadResponse {
  id: string;
  message: string;
}

export interface TranscribeRequest {
  id: string;
}

export interface TranscribeResponse {
  id: string;
  status: TranscriptionStatus;
  message: string;
}

export interface TranscriptionListResponse {
  transcriptions: Transcription[];
}

export interface TranscriptionDetailResponse {
  transcription: Transcription;
}

export interface ErrorResponse {
  error: string;
  message: string;
}

// Audio chunk for processing
export interface AudioChunk {
  id: string;
  transcriptionId: string;
  chunkIndex: number;
  chunkPath: string;
  chunkText: string | null;
  startTime: number;      // Start time in seconds
  endTime: number;        // End time in seconds
  status: TranscriptionStatus;
}

// API endpoints
export const API_ENDPOINTS = {
  UPLOAD: '/api/upload',
  TRANSCRIBE: '/api/transcribe',
  TRANSCRIPTIONS: '/api/transcriptions',
  TRANSCRIPTION: '/api/transcription',
} as const;
