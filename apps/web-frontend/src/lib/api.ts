import type {
  FlashcardDeck,
  Folder,
  FolderListResponse,
  GenerateFlashcardsResponse,
  GenerateQuizResponse,
  Quiz,
  QuizAttempt,
  QuizAttemptResponse,
  QuizAttemptsListResponse,
  SaveQuizAttemptRequest,
  Tag,
  TagListResponse,
  TranscribeResponse,
  Transcription,
  TranscriptionDetailResponse,
  TranscriptionListResponse,
  UploadResponse,
} from '@lecture/shared';

// In production, VITE_API_URL should be set to the backend server URL.
// During development, the Vite proxy handles /api routes locally.
// For production builds, we must point to the actual API server.
const API_BASE = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? 'https://lecture-transcription-api.fly.dev' : '');

interface ApiError {
  error: string;
  message: string;
}

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Try Bearer token first (for cross-origin), fall back to cookies
    const token = localStorage.getItem('lecture-session-token');

    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    
    // Only add Authorization header if we have a valid token
    // Otherwise, let the cookie-based auth handle it
    if (token && token.length > 0) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers,
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: 'Request failed',
        message: response.statusText,
      }));
      throw new Error(error.message || error.error);
    }

    return response.json();
  }

  // Transcriptions
  async getTranscriptions(folderId?: string | null, tagIds?: string[]): Promise<Transcription[]> {
    const params = new URLSearchParams();
    if (folderId !== undefined) {
      params.append('folderId', folderId === null ? 'null' : folderId);
    }
    if (tagIds && tagIds.length > 0) {
      tagIds.forEach(tagId => params.append('tagIds', tagId));
    }
    const queryString = params.toString();
    const url = queryString ? `/api/transcriptions?${queryString}` : '/api/transcriptions';
    const response = await this.request<TranscriptionListResponse>(url);
    return response.transcriptions;
  }

  async getTranscription(id: string): Promise<Transcription> {
    const response = await this.request<TranscriptionDetailResponse>(`/api/transcription/${id}`);
    return response.transcription;
  }

  async uploadFile(file: File, title: string): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('audio', file);
    formData.append('title', title);

    return this.request<UploadResponse>('/api/upload', {
      method: 'POST',
      body: formData,
    });
  }

  async startTranscription(id: string, mode: 'fast' | 'quality' = 'quality'): Promise<TranscribeResponse> {
    return this.request<TranscribeResponse>(`/api/transcribe/${id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode }),
    });
  }

  async deleteTranscription(id: string): Promise<void> {
    await this.request(`/api/transcription/${id}`, {
      method: 'DELETE',
    });
  }

  async updateTranscription(id: string, data: { title?: string; isPublic?: boolean; folderId?: string | null; tagIds?: string[] }): Promise<void> {
    await this.request(`/api/transcription/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  }

  async getPublicTranscription(id: string): Promise<Transcription> {
    const response = await this.request<TranscriptionDetailResponse>(`/api/public/transcription/${id}`);
    return response.transcription;
  }

  async generatePdf(id: string, type: 'structured' | 'raw' = 'structured'): Promise<{ pdfUrl: string }> {
    return this.request<{ pdfUrl: string }>(`/api/transcription/${id}/pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type }),
    });
  }

  // Study features

  /**
   * Get stored quiz for a transcription (auto-generated after transcription completes)
   */
  async getQuiz(transcriptionId: string): Promise<Quiz | null> {
    try {
      const response = await this.request<GenerateQuizResponse>(`/api/transcription/${transcriptionId}/quiz`);
      return response.quiz;
    } catch (error) {
      // 404 means quiz not yet generated
      if (error instanceof Error && error.message.includes('not yet generated')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Regenerate quiz for a transcription (creates new questions)
   */
  async regenerateQuiz(transcriptionId: string, questionCount: number = 10): Promise<Quiz> {
    const response = await this.request<GenerateQuizResponse>(`/api/transcription/${transcriptionId}/quiz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ questionCount }),
    });
    return response.quiz;
  }

  /**
   * Get stored flashcards for a transcription (auto-generated after transcription completes)
   */
  async getFlashcards(transcriptionId: string): Promise<FlashcardDeck | null> {
    try {
      const response = await this.request<GenerateFlashcardsResponse>(`/api/transcription/${transcriptionId}/flashcards`);
      return response.deck;
    } catch (error) {
      // 404 means flashcards not yet generated
      if (error instanceof Error && error.message.includes('not yet generated')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Regenerate flashcards for a transcription (creates new cards)
   */
  async regenerateFlashcards(transcriptionId: string, cardCount: number = 20): Promise<FlashcardDeck> {
    const response = await this.request<GenerateFlashcardsResponse>(`/api/transcription/${transcriptionId}/flashcards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cardCount }),
    });
    return response.deck;
  }

  // Legacy methods for backward compatibility (now just call regenerate)
  async generateQuiz(transcriptionId: string, questionCount: number = 10): Promise<Quiz> {
    return this.regenerateQuiz(transcriptionId, questionCount);
  }

  async generateFlashcards(transcriptionId: string, cardCount: number = 20): Promise<FlashcardDeck> {
    return this.regenerateFlashcards(transcriptionId, cardCount);
  }

  // Folders
  async getFolders(): Promise<Folder[]> {
    const response = await this.request<FolderListResponse>('/api/folders');
    return response.folders;
  }

  async createFolder(name: string, color?: string): Promise<Folder> {
    const response = await this.request<{ folder: Folder }>('/api/folders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, color }),
    });
    return response.folder;
  }

  async updateFolder(id: string, data: { name?: string; color?: string }): Promise<Folder> {
    const response = await this.request<{ folder: Folder }>(`/api/folders/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return response.folder;
  }

  async deleteFolder(id: string): Promise<void> {
    await this.request(`/api/folders/${id}`, {
      method: 'DELETE',
    });
  }

  // Tags
  async getTags(): Promise<Tag[]> {
    const response = await this.request<TagListResponse>('/api/tags');
    return response.tags;
  }

  async createTag(name: string, color?: string): Promise<Tag> {
    const response = await this.request<{ tag: Tag }>('/api/tags', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, color }),
    });
    return response.tag;
  }

  async updateTag(id: string, data: { name?: string; color?: string }): Promise<Tag> {
    const response = await this.request<{ tag: Tag }>(`/api/tags/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return response.tag;
  }

  async deleteTag(id: string): Promise<void> {
    await this.request(`/api/tags/${id}`, {
      method: 'DELETE',
    });
  }

  // Quiz Attempts
  async saveQuizAttempt(data: SaveQuizAttemptRequest): Promise<QuizAttempt> {
    const response = await this.request<QuizAttemptResponse>(`/api/quiz/${data.quizId}/attempt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return response.attempt;
  }

  async getQuizAttempts(quizId: string): Promise<QuizAttempt[]> {
    const response = await this.request<QuizAttemptsListResponse>(`/api/quiz/${quizId}/attempts`);
    return response.attempts;
  }

  async getAllQuizAttempts(): Promise<QuizAttempt[]> {
    const response = await this.request<QuizAttemptsListResponse>('/api/quiz-attempts');
    return response.attempts;
  }
}

export const api = new ApiClient();
