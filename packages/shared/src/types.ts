// Transcription status enum
export type TranscriptionStatus = 
  | 'pending'      // Uploaded, waiting to process
  | 'processing'   // Currently being transcribed
  | 'completed'    // Successfully transcribed
  | 'error';       // Failed to transcribe

// Main transcription type
export interface Transcription {
  id: string;
  deviceId: string;
  title: string;
  audioUrl: string | null;
  audioDuration: number | null;  // Duration in seconds
  transcriptionText: string | null;
  status: TranscriptionStatus;
  progress: number;              // 0.0 to 1.0
  errorMessage: string | null;
  createdAt: string;             // ISO date string
  updatedAt: string;             // ISO date string
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
