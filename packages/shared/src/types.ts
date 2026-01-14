// Transcription status enum
export type TranscriptionStatus = 
  | 'pending'      // Uploaded, waiting to process
  | 'processing'   // Currently being transcribed
  | 'structuring'  // Transcription done, now structuring with LLM
  | 'completed'    // Successfully transcribed and structured
  | 'error';       // Failed to transcribe

// Source file type for transcriptions
export type SourceType = 'audio' | 'video' | 'pdf' | 'pptx' | 'ppt' | 'docx';

// Folder type
export interface Folder {
  id: string;
  userId: string;
  name: string;
  color: string;                 // Hex color code
  createdAt: string;            // ISO date string
}

// Tag type
export interface Tag {
  id: string;
  userId: string;
  name: string;
  color: string;                // Hex color code
  createdAt: string;            // ISO date string
}

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
  pdfKey: string | null;
  pdfGeneratedAt: string | null;
  
  whisperModel: string | null;   // Model used for transcription (e.g., 'whisper-large-v3')
  detectedLanguage: string | null; // Language detected in the transcription
  isPublic: boolean;             // Whether the transcription is publicly shareable
  sourceType: SourceType;        // The type of source file (audio, video, pdf, pptx, ppt)
  mimeType?: string | null;      // The original MIME type of the file
  originalFileName?: string | null; // The original filename for display
  folderId?: string;             // Optional folder ID
  tags?: Tag[];                  // Array of tags associated with this transcription
  createdAt: string;             // ISO date string
  updatedAt: string;             // ISO date string
}

export interface SourceFileDownload {
  url: string;
  originalName: string;
  sourceType: SourceType;
}

export interface SourceDownloadResponse {
  files: SourceFileDownload[];
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

// Quiz attempt - stores user's quiz results
export interface QuizAttempt {
  id: string;
  quizId: string;
  userId: string;
  score: number;           // Number of correct answers
  totalQuestions: number;  // Total number of questions
  answers: number[];       // User's answers (indices)
  completedAt: string;     // ISO date string
}

export interface SaveQuizAttemptRequest {
  quizId: string;
  score: number;
  totalQuestions: number;
  answers: number[];
}

export interface QuizAttemptResponse {
  attempt: QuizAttempt;
}

export interface QuizAttemptsListResponse {
  attempts: QuizAttempt[];
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
  decks?: FlashcardDeck[];
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

// Folder and Tag API request/response types
export interface FolderListResponse {
  folders: Folder[];
}

export interface TagListResponse {
  tags: Tag[];
}

export interface CreateFolderRequest {
  name: string;
  color?: string;
}

export interface UpdateFolderRequest {
  name?: string;
  color?: string;
}

export interface CreateTagRequest {
  name: string;
  color?: string;
}

export interface UpdateTagRequest {
  name?: string;
  color?: string;
}

export interface UpdateTranscriptionRequest {
  title?: string;
  isPublic?: boolean;
  folderId?: string | null;
  tagIds?: string[];
}

// API endpoints
export const API_ENDPOINTS = {
  UPLOAD: '/api/upload',
  BATCH_UPLOAD: '/api/upload-batch',
  TRANSCRIBE: '/api/transcribe',
  TRANSCRIPTIONS: '/api/transcriptions',
  TRANSCRIPTION: '/api/transcription',
  FOLDERS: '/api/folders',
  TAGS: '/api/tags',
} as const;
