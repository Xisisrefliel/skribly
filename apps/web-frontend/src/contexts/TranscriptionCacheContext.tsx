import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Transcription, Tag, Folder } from '@lecture/shared';
import { api } from '@/lib/api';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  key: string;
}

interface TranscriptionCacheContextType {
  // Transcriptions
  transcriptions: CacheEntry<Transcription[]> | null;
  isLoadingTranscriptions: boolean;
  transcriptionsError: string | null;
  fetchTranscriptions: (folderId?: string | null, tagIds?: string[]) => Promise<Transcription[]>;
  
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
  invalidateTranscriptions: () => void;
  updateTranscriptionInCache: (id: string, updates: Partial<Transcription>) => void;
}

const TranscriptionCacheContext = createContext<TranscriptionCacheContextType | undefined>(undefined);

// Cache key generator for transcriptions based on filters
function getCacheKey(folderId?: string | null, tagIds?: string[]): string {
  const folderPart = folderId === null ? 'all' : folderId ?? 'none';
  const tagsPart = tagIds?.sort().join(',') ?? '';
  return `${folderPart}:${tagsPart}`;
}

export function TranscriptionCacheProvider({ children }: { children: ReactNode }) {
  // Transcriptions cache
  const [transcriptions, setTranscriptions] = useState<CacheEntry<Transcription[]> | null>(null);
  const [isLoadingTranscriptions, setIsLoadingTranscriptions] = useState(false);
  const [transcriptionsError, setTranscriptionsError] = useState<string | null>(null);
  
  // Tags cache
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [tagsLoaded, setTagsLoaded] = useState(false);
  
  // Folders cache
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [foldersLoaded, setFoldersLoaded] = useState(false);

  const fetchTranscriptions = useCallback(async (folderId?: string | null, tagIds?: string[]): Promise<Transcription[]> => {
    const cacheKey = getCacheKey(folderId, tagIds);
    
    // Return cached data if key matches and data is fresh (less than 5 minutes old)
    if (transcriptions && transcriptions.key === cacheKey) {
      const age = Date.now() - transcriptions.timestamp;
      if (age < 5 * 60 * 1000) {
        return transcriptions.data;
      }
    }
    
    setIsLoadingTranscriptions(true);
    setTranscriptionsError(null);
    
    try {
      const folderFilter = folderId === null ? undefined : folderId;
      const data = await api.getTranscriptions(folderFilter, tagIds);
      
      setTranscriptions({
        data,
        timestamp: Date.now(),
        key: cacheKey,
      });
      
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
    setTranscriptions(null);
    setTags([]);
    setTagsLoaded(false);
    setFolders([]);
    setFoldersLoaded(false);
  }, []);

  const invalidateTranscriptions = useCallback(() => {
    setTranscriptions(null);
  }, []);

  const updateTranscriptionInCache = useCallback((id: string, updates: Partial<Transcription>) => {
    setTranscriptions(prev => {
      if (!prev) return prev;
      
      return {
        ...prev,
        data: prev.data.map(t => 
          t.id === id ? { ...t, ...updates } : t
        ),
      };
    });
  }, []);

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
