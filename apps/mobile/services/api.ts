import * as FileSystem from 'expo-file-system';
import type { 
  Transcription, 
  UploadResponse, 
  TranscribeResponse,
  TranscriptionListResponse,
  TranscriptionDetailResponse,
} from '@lecture/shared';

// API base URL - change this to your Fly.io URL after deployment
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

class ApiClient {
  private deviceId: string | null = null;

  setDeviceId(id: string) {
    this.deviceId = id;
  }

  private getHeaders(): HeadersInit {
    if (!this.deviceId) {
      throw new Error('Device ID not set. Call setDeviceId first.');
    }
    return {
      'Content-Type': 'application/json',
      'X-Device-ID': this.deviceId,
    };
  }

  /**
   * Upload an audio file for transcription
   */
  async uploadAudio(fileUri: string, title: string): Promise<UploadResponse> {
    if (!this.deviceId) {
      throw new Error('Device ID not set');
    }

    // Get file info
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      throw new Error('File does not exist');
    }

    // Extract filename from URI
    const filename = fileUri.split('/').pop() || 'audio.m4a';

    // Create form data
    const formData = new FormData();
    formData.append('audio', {
      uri: fileUri,
      name: filename,
      type: 'audio/m4a',
    } as unknown as Blob);
    formData.append('title', title);

    const response = await fetch(`${API_BASE_URL}/api/upload`, {
      method: 'POST',
      headers: {
        'X-Device-ID': this.deviceId,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Upload failed');
    }

    return response.json();
  }

  /**
   * Start transcription for an uploaded audio file
   */
  async startTranscription(id: string): Promise<TranscribeResponse> {
    const response = await fetch(`${API_BASE_URL}/api/transcribe/${id}`, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to start transcription');
    }

    return response.json();
  }

  /**
   * Get all transcriptions for this device
   */
  async getTranscriptions(): Promise<Transcription[]> {
    const response = await fetch(`${API_BASE_URL}/api/transcriptions`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get transcriptions');
    }

    const data: TranscriptionListResponse = await response.json();
    return data.transcriptions;
  }

  /**
   * Get a single transcription by ID
   */
  async getTranscription(id: string): Promise<Transcription> {
    const response = await fetch(`${API_BASE_URL}/api/transcription/${id}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get transcription');
    }

    const data: TranscriptionDetailResponse = await response.json();
    return data.transcription;
  }

  /**
   * Delete a transcription
   */
  async deleteTranscription(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/transcription/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete transcription');
    }
  }

  /**
   * Check server health
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const apiClient = new ApiClient();
