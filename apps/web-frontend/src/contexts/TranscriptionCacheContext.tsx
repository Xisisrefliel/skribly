import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Transcription, Tag, Folder } from '@lecture/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  key: string;
}

const TRANSCRIPTIONS_STORAGE_KEY = 'lecture:transcriptions-cache:v1';
const TAGS_STORAGE_KEY = 'lecture:tags-cache:v1';
const FOLDERS_STORAGE_KEY = 'lecture:folders-cache:v1';

const loadStoredTranscriptions = (): Record<string, TranscriptionCacheEntry> => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const stored = window.localStorage.getItem(TRANSCRIPTIONS_STORAGE_KEY);
    if (!stored) {
      return {};
    }

    const parsed = JSON.parse(stored) as Record<string, TranscriptionCacheEntry>;
    return parsed ?? {};
  } catch {
    return {};
  }
};

const loadStoredTags = (): { data: Tag[]; loaded: boolean } => {
  if (typeof window === 'undefined') {
    return { data: [], loaded: false };
  }

  try {
    const stored = window.localStorage.getItem(TAGS_STORAGE_KEY);
    if (!stored) {
      return { data: [], loaded: false };
    }

    const parsed = JSON.parse(stored) as Tag[];
    return { data: parsed ?? [], loaded: true };
  } catch {
    return { data: [], loaded: false };
  }
};

const loadStoredFolders = (): { data: Folder[]; loaded: boolean } => {
  if (typeof window === 'undefined') {
    return { data: [], loaded: false };
  }

  try {
    const stored = window.localStorage.getItem(FOLDERS_STORAGE_KEY);
    if (!stored) {
      return { data: [], loaded: false };
    }

    const parsed = JSON.parse(stored) as Folder[];
    return { data: parsed ?? [], loaded: true };
  } catch {
    return { data: [], loaded: false };
  }
};

interface TranscriptionCacheEntry extends CacheEntry<Transcription[]> {
  folderId?: string | null;
  tagIds?: string[];
}

interface TranscriptionCacheContextType {
  // Transcriptions
  transcriptions: Record<string, TranscriptionCacheEntry>;
  isLoadingTranscriptions: boolean;
  transcriptionsError: string | null;
  fetchTranscriptions: (
    folderId?: string | null,
    tagIds?: string[],
    options?: { forceRefresh?: boolean }
  ) => Promise<Transcription[]>;
  getCachedTranscriptions: (folderId?: string | null, tagIds?: string[]) => Transcription[] | null;
  
  // Tags
  tags: Tag[];
  isLoadingTags: boolean;
  fetchTags: () => Promise<Tag[]>;
  refreshTags: () => Promise<Tag[]>;
  addTagOptimistic: (tag: Tag) => void;
  updateTagInCache: (id: string, updates: Partial<Tag>) => void;
  removeTagFromCache: (id: string) => void;
  
  // Folders
  folders: Folder[];
  isLoadingFolders: boolean;
  fetchFolders: () => Promise<Folder[]>;
  refreshFolders: () => Promise<Folder[]>;
  addFolderOptimistic: (folder: Folder) => void;
  updateFolderInCache: (id: string, updates: Partial<Folder>) => void;
  removeFolderFromCache: (id: string) => void;
  
  // Cache management
  invalidateCache: () => void;
  invalidateTranscriptions: (folderId?: string | null, tagIds?: string[]) => void;
  updateTranscriptionInCache: (id: string, updates: Partial<Transcription>) => void;
  addTranscriptionToCache: (transcription: Transcription) => void;
  getCachedTranscription: (id: string, options?: { includeListCache?: boolean }) => Transcription | null;
  cacheTranscriptionDetail: (transcription: Transcription) => void;
  invalidateTranscriptionDetail: (id: string) => void;
}

const TranscriptionCacheContext = createContext<TranscriptionCacheContextType | undefined>(undefined);

const normalizeTagIds = (tagIds?: string[]): string[] | undefined => {
  if (!tagIds || tagIds.length === 0) {
    return undefined;
  }

  return Array.from(new Set(tagIds)).sort();
};

const sortTranscriptionsByCreatedAt = (data: Transcription[]): Transcription[] =>
  [...data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

const transcriptionMatchesFilters = (
  transcription: Transcription,
  folderId?: string | null,
  tagIds?: string[]
): boolean => {
  if (folderId != null && transcription.folderId !== folderId) {
    return false;
  }

  if (!tagIds || tagIds.length === 0) {
    return true;
  }

  const transcriptionTagIds = transcription.tags?.map(tag => tag.id) ?? [];
  return tagIds.some(tagId => transcriptionTagIds.includes(tagId));
};

// Cache key generator for transcriptions based on filters
function getCacheKey(folderId?: string | null, tagIds?: string[]): string {
  const folderPart = folderId == null ? 'all' : folderId;
  const tagsPart = normalizeTagIds(tagIds)?.join(',') ?? '';
  return `${folderPart}:${tagsPart}`;
}

export function TranscriptionCacheProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, getToken } = useAuth();

  // Transcriptions cache
  const [transcriptions, setTranscriptions] = useState<Record<string, TranscriptionCacheEntry>>(loadStoredTranscriptions);
  const [isLoadingTranscriptions, setIsLoadingTranscriptions] = useState(false);
  const [transcriptionsError, setTranscriptionsError] = useState<string | null>(null);
  const [transcriptionDetails, setTranscriptionDetails] = useState<Record<string, CacheEntry<Transcription>>>({});
  
  const storedTags = loadStoredTags();
  const storedFolders = loadStoredFolders();

  // Tags cache
  const [tags, setTags] = useState<Tag[]>(storedTags.data);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [tagsLoaded, setTagsLoaded] = useState(storedTags.loaded);
  
  // Folders cache
  const [folders, setFolders] = useState<Folder[]>(storedFolders.data);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [foldersLoaded, setFoldersLoaded] = useState(storedFolders.loaded);

  const getCachedTranscriptions = useCallback((folderId?: string | null, tagIds?: string[]): Transcription[] | null => {
    const cacheKey = getCacheKey(folderId, tagIds);
    return transcriptions[cacheKey]?.data ?? null;
  }, [transcriptions]);

  const getCachedTranscription = useCallback((
    id: string,
    options?: { includeListCache?: boolean }
  ): Transcription | null => {
    const detailEntry = transcriptionDetails[id];
    if (detailEntry) {
      return detailEntry.data;
    }

    if (options?.includeListCache) {
      const entries = Object.values(transcriptions);
      for (const entry of entries) {
        const match = entry.data.find(transcription => transcription.id === id);
        if (match) {
          return match;
        }
      }
    }

    return null;
  }, [transcriptionDetails, transcriptions]);

  const cacheTranscriptionDetail = useCallback((transcription: Transcription) => {
    setTranscriptionDetails(prev => ({
      ...prev,
      [transcription.id]: {
        data: transcription,
        timestamp: Date.now(),
        key: transcription.id,
      },
    }));
  }, []);

  const invalidateTranscriptionDetail = useCallback((id: string) => {
    setTranscriptionDetails(prev => {
      if (!prev[id]) {
        return prev;
      }

      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const fetchTranscriptions = useCallback(async (
    folderId?: string | null,
    tagIds?: string[],
    options?: { forceRefresh?: boolean }
  ): Promise<Transcription[]> => {
    const cacheKey = getCacheKey(folderId, tagIds);
    const cachedEntry = transcriptions[cacheKey];

    if (cachedEntry && !options?.forceRefresh) {
      return cachedEntry.data;
    }

    setIsLoadingTranscriptions(true);
    setTranscriptionsError(null);

    try {
      const normalizedTags = normalizeTagIds(tagIds);
      const folderFilter = folderId === null ? undefined : folderId;
      const data = await api.getTranscriptions(folderFilter, normalizedTags);

      setTranscriptions(prev => ({
        ...prev,
        [cacheKey]: {
          data,
          timestamp: Date.now(),
          key: cacheKey,
          folderId,
          tagIds: normalizedTags,
        },
      }));

      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load transcriptions';
      setTranscriptionsError(errorMessage);
      throw err;
    } finally {
      setIsLoadingTranscriptions(false);
    }
  }, [transcriptions]);

  const fetchTags = useCallback(async (): Promise<Tag[]> => {
    // Return cached tags if already loaded
    if (tagsLoaded && tags.length >= 0) {
      return tags;
    }
    
    setIsLoadingTags(true);
    
    try {
      const data = await api.getTags();
      setTags(data);
      setTagsLoaded(true);
      return data;
    } catch (err) {
      console.error('Failed to fetch tags:', err);
      return [];
    } finally {
      setIsLoadingTags(false);
    }
  }, [tags, tagsLoaded]);

  const refreshTags = useCallback(async (): Promise<Tag[]> => {
    // Force refresh by resetting the loaded flag
    setTagsLoaded(false);
    setIsLoadingTags(true);
    
    try {
      const data = await api.getTags();
      setTags(data);
      setTagsLoaded(true);
      return data;
    } catch (err) {
      console.error('Failed to refresh tags:', err);
      return [];
    } finally {
      setIsLoadingTags(false);
    }
  }, []);

  const fetchFolders = useCallback(async (): Promise<Folder[]> => {
    // Return cached folders if already loaded
    if (foldersLoaded && folders.length >= 0) {
      return folders;
    }
    
    setIsLoadingFolders(true);
    
    try {
      const data = await api.getFolders();
      setFolders(data);
      setFoldersLoaded(true);
      return data;
    } catch (err) {
      console.error('Failed to fetch folders:', err);
      return [];
    } finally {
      setIsLoadingFolders(false);
    }
  }, [folders, foldersLoaded]);

  const refreshFolders = useCallback(async (): Promise<Folder[]> => {
    // Force refresh by resetting the loaded flag
    setFoldersLoaded(false);
    setIsLoadingFolders(true);
    
    try {
      const data = await api.getFolders();
      setFolders(data);
      setFoldersLoaded(true);
      return data;
    } catch (err) {
      console.error('Failed to refresh folders:', err);
      return [];
    } finally {
      setIsLoadingFolders(false);
    }
  }, []);

  const invalidateCache = useCallback(() => {
    setTranscriptions({});
    setTranscriptionDetails({});
    setTags([]);
    setTagsLoaded(false);
    setFolders([]);
    setFoldersLoaded(false);

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(TRANSCRIPTIONS_STORAGE_KEY);
      window.localStorage.removeItem(TAGS_STORAGE_KEY);
      window.localStorage.removeItem(FOLDERS_STORAGE_KEY);
    }
  }, []);

  const invalidateTranscriptions = useCallback((folderId?: string | null, tagIds?: string[]) => {
    if (folderId === undefined && tagIds === undefined) {
      setTranscriptions({});
      return;
    }

    const cacheKey = getCacheKey(folderId, tagIds);
    setTranscriptions(prev => {
      if (!prev[cacheKey]) {
        return prev;
      }

      const next = { ...prev };
      delete next[cacheKey];
      return next;
    });
  }, []);

  const updateTranscriptionInCache = useCallback((id: string, updates: Partial<Transcription>) => {
    setTranscriptionDetails(prev => {
      const existing = prev[id];
      if (!existing) {
        return prev;
      }

      return {
        ...prev,
        [id]: {
          ...existing,
          data: { ...existing.data, ...updates },
          timestamp: Date.now(),
        },
      };
    });

    setTranscriptions(prev => {
      const keys = Object.keys(prev);
      if (keys.length === 0) {
        return prev;
      }

      let updatedTranscription: Transcription | null = null;

      const updatedEntries = Object.fromEntries(
        keys.map(key => {
          const entry = prev[key];
          const data = entry.data.map(transcription => {
            if (transcription.id !== id) {
              return transcription;
            }

            const merged = { ...transcription, ...updates };
            updatedTranscription = merged;
            return merged;
          });

          return [key, { ...entry, data }];
        })
      ) as Record<string, TranscriptionCacheEntry>;

      if (!updatedTranscription) {
        return prev;
      }

      const resolvedTranscription = updatedTranscription;

      return Object.fromEntries(
        Object.entries(updatedEntries).map(([key, entry]) => {
          const hasTranscription = entry.data.some(transcription => transcription.id === id);
          const shouldInclude = transcriptionMatchesFilters(resolvedTranscription, entry.folderId, entry.tagIds);

          let data = entry.data;

          if (shouldInclude && !hasTranscription) {
            data = sortTranscriptionsByCreatedAt([...entry.data, resolvedTranscription]);
          } else if (!shouldInclude && hasTranscription) {
            data = entry.data.filter(transcription => transcription.id !== id);
          }

          return [key, { ...entry, data }];
        })
      ) as Record<string, TranscriptionCacheEntry>;
    });
  }, []);

  const addTranscriptionToCache = useCallback((transcription: Transcription) => {
    setTranscriptions(prev => {
      const keys = Object.keys(prev);
      if (keys.length === 0) {
        return prev;
      }

      return Object.fromEntries(
        keys.map(key => {
          const entry = prev[key];
          const matches = transcriptionMatchesFilters(transcription, entry.folderId, entry.tagIds);
          const exists = entry.data.some(item => item.id === transcription.id);

          if (!matches || exists) {
            return [key, entry];
          }

          const data = sortTranscriptionsByCreatedAt([...entry.data, transcription]);
          return [key, { ...entry, data }];
        })
      ) as Record<string, TranscriptionCacheEntry>;
    });
  }, []);

  const refreshTranscriptionById = useCallback(async (transcriptionId: string) => {
    try {
      const transcription = await api.getTranscription(transcriptionId);
      updateTranscriptionInCache(transcriptionId, transcription);
      cacheTranscriptionDetail(transcription);
    } catch (error) {
      console.error('Failed to refresh transcription:', error);
    }
  }, [cacheTranscriptionDetail, updateTranscriptionInCache]);

  // Optimistic updates for tags
  const addTagOptimistic = useCallback((tag: Tag) => {
    setTags(prev => [...prev, tag]);
  }, []);

  const updateTagInCache = useCallback((id: string, updates: Partial<Tag>) => {
    setTags(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const removeTagFromCache = useCallback((id: string) => {
    setTags(prev => prev.filter(t => t.id !== id));
  }, []);

  // Optimistic updates for folders
  const addFolderOptimistic = useCallback((folder: Folder) => {
    setFolders(prev => [...prev, folder]);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const controller = new AbortController();
    let isActive = true;
    let reconnectTimeout: number | null = null;

    const scheduleReconnect = () => {
      if (!isActive) return;
      reconnectTimeout = window.setTimeout(() => {
        connect();
      }, 5000);
    };

    const connect = async () => {
      try {
        const token = await getToken();
        if (!token || !isActive) return;

        const response = await fetch('/api/transcriptions/events', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error('Failed to connect to transcription events stream');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (isActive) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() ?? '';

          chunks.forEach((chunk) => {
            const lines = chunk.split('\n');
            const eventLine = lines.find(line => line.startsWith('event:'));
            const dataLine = lines.find(line => line.startsWith('data:'));

            const eventType = eventLine?.replace('event:', '').trim();
            const payloadText = dataLine?.replace('data:', '').trim();

            if (!eventType || !payloadText || eventType === 'ping' || eventType === 'ready') {
              return;
            }

            if (eventType === 'transcription') {
              try {
                const payload = JSON.parse(payloadText) as {
                  transcriptionId: string;
                  status: Transcription['status'];
                  progress: number;
                  errorMessage?: string | null;
                  updatedAt?: string;
                };

                updateTranscriptionInCache(payload.transcriptionId, {
                  status: payload.status,
                  progress: payload.progress,
                  errorMessage: payload.errorMessage ?? null,
                  updatedAt: payload.updatedAt ?? new Date().toISOString(),
                });

                if (payload.status === 'completed') {
                  refreshTranscriptionById(payload.transcriptionId);
                }
              } catch (error) {
                console.error('Failed to parse transcription event payload:', error);
              }
            }
          });
        }

        scheduleReconnect();
      } catch (error) {
        if (isActive) {
          console.error('Transcription events stream error:', error);
          scheduleReconnect();
        }
      }
    };

    connect();

    return () => {
      isActive = false;
      controller.abort();
      if (reconnectTimeout) {
        window.clearTimeout(reconnectTimeout);
      }
    };
  }, [getToken, isAuthenticated, refreshTranscriptionById, updateTranscriptionInCache]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(TRANSCRIPTIONS_STORAGE_KEY, JSON.stringify(transcriptions));
    } catch {
      // Ignore storage errors
    }
  }, [transcriptions]);

  useEffect(() => {
    if (typeof window === 'undefined' || !tagsLoaded) {
      return;
    }

    try {
      window.localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(tags));
    } catch {
      // Ignore storage errors
    }
  }, [tags, tagsLoaded]);

  useEffect(() => {
    if (typeof window === 'undefined' || !foldersLoaded) {
      return;
    }

    try {
      window.localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));
    } catch {
      // Ignore storage errors
    }
  }, [folders, foldersLoaded]);

  const updateFolderInCache = useCallback((id: string, updates: Partial<Folder>) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, []);

  const removeFolderFromCache = useCallback((id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
  }, []);

  return (
    <TranscriptionCacheContext.Provider
      value={{
        transcriptions,
        isLoadingTranscriptions,
        transcriptionsError,
        fetchTranscriptions,
        getCachedTranscriptions,
        tags,
        isLoadingTags,
        fetchTags,
        refreshTags,
        addTagOptimistic,
        updateTagInCache,
        removeTagFromCache,
        folders,
        isLoadingFolders,
        fetchFolders,
        refreshFolders,
        addFolderOptimistic,
        updateFolderInCache,
        removeFolderFromCache,
        invalidateCache,
        invalidateTranscriptions,
        updateTranscriptionInCache,
        addTranscriptionToCache,
        getCachedTranscription,
        cacheTranscriptionDetail,
        invalidateTranscriptionDetail,
      }}
    >
      {children}
    </TranscriptionCacheContext.Provider>
  );
}

export function useTranscriptionCache() {
  const context = useContext(TranscriptionCacheContext);
  if (context === undefined) {
    throw new Error('useTranscriptionCache must be used within a TranscriptionCacheProvider');
  }
  return context;
}
