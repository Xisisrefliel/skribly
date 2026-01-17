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
  SourceDownloadResponse,
  SourceFileDownload,
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

export interface BillingStatusResponse {
  isActive: boolean;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  transcriptionCount: number;
  freeLimit: number;
  hasFreeTierAvailable: boolean;
}

type TokenGetter = () => Promise<string | null>;

class ApiClient {
  private getToken: TokenGetter | null = null;
  private tokenGetterPromise: Promise<void> | null = null;
  private resolveTokenGetter: (() => void) | null = null;

  constructor() {
    // Create a promise that resolves when setTokenGetter is called
    this.tokenGetterPromise = new Promise((resolve) => {
      this.resolveTokenGetter = resolve;
    });
  }

  setTokenGetter(getter: TokenGetter) {
    this.getToken = getter;
    // Resolve the promise so any waiting requests can proceed
    if (this.resolveTokenGetter) {
      this.resolveTokenGetter();
      this.resolveTokenGetter = null;
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Wait for the token getter to be set (with a timeout)
    if (!this.getToken && this.tokenGetterPromise) {
      // Wait up to 5 seconds for the token getter to be set
      await Promise.race([
        this.tokenGetterPromise,
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    }

    const token = this.getToken ? await this.getToken() : null;

    if (!token && import.meta.env.DEV) {
      console.warn('[API] No token available for request to:', endpoint);
    }

    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    
    // Always include Authorization header if token is available
    // Clerk Express SDK expects Bearer tokens in Authorization header
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      // Don't use credentials: 'include' for cross-origin requests
      // Safari blocks third-party cookies, and we use Bearer tokens anyway
      headers,
    });

    if (!response.ok) {
      // If we get a 401, it means authentication failed
      if (response.status === 401) {
        const error: ApiError = await response.json().catch(() => ({
          error: 'Authentication required',
          message: 'Please sign in to continue',
        }));
        throw new Error(error.message || error.error);
      }
      
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

  async getSourceDownloadUrls(id: string, isPublic: boolean = false): Promise<SourceFileDownload[]> {
    const endpoint = isPublic ? `/api/public/transcription/${id}/source` : `/api/transcription/${id}/source`;
    const response = await this.request<SourceDownloadResponse>(endpoint);
    return response.files;
  }

  async getPdfDownloadUrl(id: string): Promise<string> {
    // Return the backend proxy endpoint instead of the R2 signed URL
    // This avoids CORS issues by downloading through the backend
    return `/api/transcription/${id}/pdf/download`;
  }

  async generatePdf(id: string): Promise<string> {
    const response = await this.request<{ url?: string }>(`/api/transcription/${id}/pdf`, {
      method: 'POST',
    });
    // Return the backend proxy endpoint
    return `/api/transcription/${id}/pdf/download`;
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

  async uploadFilesBatch(files: File[], title: string): Promise<UploadResponse> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('title', title);

    return this.request<UploadResponse>('/api/upload-batch', {
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

  async reprocessTranscription(id: string): Promise<TranscribeResponse> {
    return this.request<TranscribeResponse>(`/api/transcription/${id}/reprocess`, {
      method: 'POST',
    });
  }

  async restructureTranscription(id: string): Promise<TranscribeResponse> {
    return this.request<TranscribeResponse>(`/api/transcription/${id}/restructure`, {
      method: 'POST',
    });
  }

  async deleteTranscription(id: string): Promise<void> {
    await this.request(`/api/transcription/${id}`, {
      method: 'DELETE',
    });
  }

  async cancelTranscription(id: string): Promise<TranscribeResponse> {
    return this.request<TranscribeResponse>(`/api/transcription/${id}/cancel`, {
      method: 'POST',
    });
  }

  async updateTranscription(
    id: string,
    data: { title?: string; isPublic?: boolean; folderId?: string | null; tagIds?: string[] }
  ): Promise<void> {
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

  async getBillingStatus(): Promise<BillingStatusResponse> {
    return this.request<BillingStatusResponse>('/api/billing/status');
  }

  async createBillingCheckout(): Promise<{ url: string }> {
    return this.request<{ url: string }>('/api/billing/checkout', {
      method: 'POST',
    });
  }

  async createBillingPortal(): Promise<{ url: string }> {
    return this.request<{ url: string }>('/api/billing/portal', {
      method: 'POST',
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
  async getFlashcards(transcriptionId: string): Promise<GenerateFlashcardsResponse | null> {
    try {
      const response = await this.request<GenerateFlashcardsResponse>(`/api/transcription/${transcriptionId}/flashcards`);
      return response;
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
