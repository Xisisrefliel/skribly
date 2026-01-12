import { useEffect, useState, useRef } from 'react';
import type { Transcription } from '@lecture/shared';
import { Mic, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TranscriptionCard } from '@/components/TranscriptionCard';
import { useTranscriptionCache } from '@/contexts/TranscriptionCacheContext';
import { api } from '@/lib/api';

interface TranscriptionListProps {
  onEmpty?: () => void;
  folderId?: string | null;
  tagIds?: string[];
}

export function TranscriptionList({ onEmpty, folderId, tagIds }: TranscriptionListProps) {
  const {
    fetchTranscriptions,
    tags: allTags,
    fetchTags,
    folders: allFolders,
    fetchFolders,
    invalidateTranscriptions,
    updateTranscriptionInCache,
  } = useTranscriptionCache();
  
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Track if this is the initial load for this filter combination
  const filterKeyRef = useRef<string>('');

  const loadData = async (forceRefresh = false) => {
    const currentKey = `${folderId ?? 'none'}:${tagIds?.join(',') ?? ''}`;
    const isFilterChange = currentKey !== filterKeyRef.current;
    filterKeyRef.current = currentKey;
    
    // If filter changed or force refresh, invalidate cache
    if (isFilterChange || forceRefresh) {
      if (forceRefresh) {
        invalidateTranscriptions();
      }
      setIsLoading(true);
    }
    
    try {
      const data = await fetchTranscriptions(folderId, tagIds);
      setTranscriptions(data);
      setError(null);
      if (data.length === 0 && onEmpty) {
        onEmpty();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transcriptions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    fetchTags();
    fetchFolders();
  }, [folderId, tagIds?.join(',')]);

  useEffect(() => {
    // Poll for updates every 5 seconds if there are processing items
    const interval = setInterval(async () => {
      const hasProcessing = transcriptions.some(
        (t) => t.status === 'processing' || t.status === 'structuring' || t.status === 'pending'
      );
      if (hasProcessing) {
        // Force refresh when polling for processing items
        loadData(true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [transcriptions.length]);

  const handleCopyUrl = async (transcription: Transcription) => {
    const url = `${window.location.origin}/transcription/${transcription.id}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(transcription.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTogglePublic = async (transcription: Transcription) => {
    // Optimistic update (both local state and cache)
    const newIsPublic = !transcription.isPublic;
    setTranscriptions(prev => prev.map(t => 
      t.id === transcription.id ? { ...t, isPublic: newIsPublic } : t
    ));
    updateTranscriptionInCache(transcription.id, { isPublic: newIsPublic });
    
    try {
      await api.updateTranscription(transcription.id, { isPublic: newIsPublic });
    } catch (err) {
      // Revert on error
      setTranscriptions(prev => prev.map(t => 
        t.id === transcription.id ? { ...t, isPublic: transcription.isPublic } : t
      ));
      updateTranscriptionInCache(transcription.id, { isPublic: transcription.isPublic });
      console.error('Failed to update transcription:', err);
    }
  };

  const handleToggleTag = async (transcription: Transcription, tagId: string) => {
    const currentTagIds = transcription.tags?.map(t => t.id) || [];
    const isAdding = !currentTagIds.includes(tagId);
    const newTagIds = isAdding
      ? [...currentTagIds, tagId]
      : currentTagIds.filter(id => id !== tagId);
    
    // Get the tag object for optimistic update
    const tagToToggle = allTags.find(t => t.id === tagId);
    
    // Calculate new tags for optimistic update
    const currentTags = transcription.tags || [];
    const newTags = isAdding && tagToToggle
      ? [...currentTags, tagToToggle]
      : currentTags.filter(tag => tag.id !== tagId);
    
    // Optimistic update (both local state and cache)
    setTranscriptions(prev => prev.map(t => 
      t.id === transcription.id ? { ...t, tags: newTags } : t
    ));
    updateTranscriptionInCache(transcription.id, { tags: newTags });
    
    try {
      await api.updateTranscription(transcription.id, { tagIds: newTagIds });
    } catch (err) {
      // Revert on error
      setTranscriptions(prev => prev.map(t => 
        t.id === transcription.id ? { ...t, tags: transcription.tags } : t
      ));
      updateTranscriptionInCache(transcription.id, { tags: transcription.tags });
      console.error('Failed to update tags:', err);
    }
  };

  const handleMoveToFolder = async (transcription: Transcription, targetFolderId: string | null) => {
    const newFolderId = typeof targetFolderId === 'string' ? targetFolderId : undefined;
    
    // Optimistic update (both local state and cache)
    setTranscriptions(prev =>
      prev.map(t =>
        t.id === transcription.id ? { ...t, folderId: newFolderId } : t
      )
    );
    updateTranscriptionInCache(transcription.id, { folderId: newFolderId });
    
    // Also invalidate cache since folder change affects list filtering
    invalidateTranscriptions();

    try {
      await api.updateTranscription(transcription.id, { folderId: targetFolderId });
    } catch (err) {
      // Revert on error
      const originalFolderId = typeof transcription.folderId === 'string'
        ? transcription.folderId
        : undefined;
      setTranscriptions(prev =>
        prev.map(t =>
          t.id === transcription.id ? { ...t, folderId: originalFolderId } : t
        )
      );
      updateTranscriptionInCache(transcription.id, { folderId: originalFolderId });
      console.error('Failed to move to folder:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="overflow-hidden py-6">
            <CardHeader className="p-3 pb-2">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-status-error/30 bg-status-error-soft">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (transcriptions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="space-y-3">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Mic className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">No transcriptions yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Upload an audio or video file to get started
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {transcriptions.map((transcription, index) => (
        <TranscriptionCard
          key={transcription.id}
          transcription={transcription}
          allTags={allTags}
          allFolders={allFolders}
          currentFolderId={folderId}
          copiedId={copiedId}
          animationDelay={index * 50}
          onCopyUrl={handleCopyUrl}
          onTogglePublic={handleTogglePublic}
          onToggleTag={handleToggleTag}
          onMoveToFolder={handleMoveToFolder}
        />
      ))}
    </div>
  );
}
