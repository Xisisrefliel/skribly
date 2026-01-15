import { useCallback, useEffect, useState } from 'react';
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
    getCachedTranscriptions,
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

  const tagKey = tagIds?.join(',') ?? '';
  const cachedTranscriptions = getCachedTranscriptions(folderId, tagIds);
  const matchesFilters = useCallback((transcription: Transcription) => {
    if (folderId != null && transcription.folderId !== folderId) {
      return false;
    }

    if (!tagIds || tagIds.length === 0) {
      return true;
    }

    const transcriptionTagIds = transcription.tags?.map(tag => tag.id) ?? [];
    return tagIds.some(tagId => transcriptionTagIds.includes(tagId));
  }, [folderId, tagIds]);

  const applyFilters = useCallback((items: Transcription[]) => (
    items.filter(matchesFilters)
  ), [matchesFilters]);

  const loadData = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) {
      invalidateTranscriptions(folderId, tagIds);
    }

    try {
      const data = await fetchTranscriptions(folderId, tagIds, { forceRefresh });
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
  }, [fetchTranscriptions, folderId, invalidateTranscriptions, onEmpty, tagIds]);

  useEffect(() => {
    const initialCache = getCachedTranscriptions(folderId, tagIds);
    if (initialCache !== null) {
      setTranscriptions(initialCache);
      setIsLoading(false);
    } else {
      setTranscriptions([]);
      setIsLoading(true);
    }

    loadData();
    fetchTags();
    fetchFolders();
  }, [fetchFolders, fetchTags, folderId, loadData, tagKey]);

  useEffect(() => {
    if (cachedTranscriptions !== null) {
      setTranscriptions(cachedTranscriptions);
    }
  }, [cachedTranscriptions]);

  useEffect(() => {
    const hasActiveTranscriptions = transcriptions.some(transcription =>
      transcription.status === 'pending' ||
      transcription.status === 'processing' ||
      transcription.status === 'structuring'
    );

    if (!hasActiveTranscriptions) {
      return;
    }

    const interval = window.setInterval(() => {
      loadData(true);
    }, 12000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadData, transcriptions]);

  const handleCopyUrl = async (transcription: Transcription) => {
    const url = `${window.location.origin}/transcription/${transcription.id}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(transcription.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTogglePublic = async (transcription: Transcription) => {
    // Optimistic update (both local state and cache)
    const newIsPublic = !transcription.isPublic;
    setTranscriptions(prev => applyFilters(prev.map(t => 
      t.id === transcription.id ? { ...t, isPublic: newIsPublic } : t
    )));
    updateTranscriptionInCache(transcription.id, { isPublic: newIsPublic });
    
    try {
      await api.updateTranscription(transcription.id, { isPublic: newIsPublic });
    } catch (err) {
      // Revert on error
      setTranscriptions(prev => applyFilters(prev.map(t => 
        t.id === transcription.id ? { ...t, isPublic: transcription.isPublic } : t
      )));
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
    setTranscriptions(prev => applyFilters(prev.map(t => 
      t.id === transcription.id ? { ...t, tags: newTags } : t
    )));
    updateTranscriptionInCache(transcription.id, { tags: newTags });
    
    try {
      await api.updateTranscription(transcription.id, { tagIds: newTagIds });
    } catch (err) {
      // Revert on error
      setTranscriptions(prev => applyFilters(prev.map(t => 
        t.id === transcription.id ? { ...t, tags: transcription.tags } : t
      )));
      updateTranscriptionInCache(transcription.id, { tags: transcription.tags });
      console.error('Failed to update tags:', err);
    }
  };

  const handleMoveToFolder = async (transcription: Transcription, targetFolderId: string | null) => {
    const newFolderId = typeof targetFolderId === 'string' ? targetFolderId : undefined;
    
    // Optimistic update (both local state and cache)
    setTranscriptions(prev => applyFilters(
      prev.map(t =>
        t.id === transcription.id ? { ...t, folderId: newFolderId } : t
      )
    ));
    updateTranscriptionInCache(transcription.id, { folderId: newFolderId });

    try {
      await api.updateTranscription(transcription.id, { folderId: targetFolderId });
    } catch (err) {
      // Revert on error
      const originalFolderId = typeof transcription.folderId === 'string'
        ? transcription.folderId
        : undefined;
      setTranscriptions(prev => applyFilters(
        prev.map(t =>
          t.id === transcription.id ? { ...t, folderId: originalFolderId } : t
        )
      ));
      updateTranscriptionInCache(transcription.id, { folderId: originalFolderId });
      console.error('Failed to move to folder:', err);
    }
  };

  const handleMoveTag = async (sourceTranscriptionId: string, targetTranscriptionId: string, tagId: string) => {
    if (sourceTranscriptionId === targetTranscriptionId) return;

    const sourceTranscription = transcriptions.find(t => t.id === sourceTranscriptionId);
    const targetTranscription = transcriptions.find(t => t.id === targetTranscriptionId);

    if (!sourceTranscription || !targetTranscription) return;

    const sourceTagIds = sourceTranscription.tags?.map(tag => tag.id) || [];
    const targetTagIds = targetTranscription.tags?.map(tag => tag.id) || [];

    if (!sourceTagIds.includes(tagId)) return;

    const tagToMove = sourceTranscription.tags?.find(tag => tag.id === tagId)
      ?? allTags.find(tag => tag.id === tagId);

    const newSourceTagIds = sourceTagIds.filter(id => id !== tagId);
    const newTargetTagIds = targetTagIds.includes(tagId) ? targetTagIds : [...targetTagIds, tagId];

    const newSourceTags = (sourceTranscription.tags || []).filter(tag => tag.id !== tagId);
    const newTargetTags = targetTagIds.includes(tagId)
      ? (targetTranscription.tags || [])
      : [...(targetTranscription.tags || []), ...(tagToMove ? [tagToMove] : [])];

    setTranscriptions(prev => applyFilters(prev.map(t => {
      if (t.id === sourceTranscriptionId) {
        return { ...t, tags: newSourceTags };
      }
      if (t.id === targetTranscriptionId) {
        return { ...t, tags: newTargetTags };
      }
      return t;
    })));

    updateTranscriptionInCache(sourceTranscriptionId, { tags: newSourceTags });
    updateTranscriptionInCache(targetTranscriptionId, { tags: newTargetTags });

    try {
      await Promise.all([
        api.updateTranscription(sourceTranscriptionId, { tagIds: newSourceTagIds }),
        api.updateTranscription(targetTranscriptionId, { tagIds: newTargetTagIds }),
      ]);
    } catch (err) {
      setTranscriptions(prev => applyFilters(prev.map(t => {
        if (t.id === sourceTranscriptionId) {
          return { ...t, tags: sourceTranscription.tags };
        }
        if (t.id === targetTranscriptionId) {
          return { ...t, tags: targetTranscription.tags };
        }
        return t;
      })));

      updateTranscriptionInCache(sourceTranscriptionId, { tags: sourceTranscription.tags });
      updateTranscriptionInCache(targetTranscriptionId, { tags: targetTranscription.tags });
      console.error('Failed to move tag:', err);
    }
  };

  const handleCancelTranscription = async (transcription: Transcription) => {
    if (
      transcription.status === 'completed' ||
      transcription.status === 'error' ||
      transcription.status === 'canceled'
    ) {
      return;
    }

    const previousStatus = transcription.status;
    const previousProgress = transcription.progress;
    const previousError = transcription.errorMessage;

    setTranscriptions(prev => prev.map(t =>
      t.id === transcription.id
        ? { ...t, status: 'canceled', errorMessage: null }
        : t
    ));
    updateTranscriptionInCache(transcription.id, {
      status: 'canceled',
      errorMessage: null,
    });

    try {
      await api.cancelTranscription(transcription.id);
    } catch (err) {
      setTranscriptions(prev => prev.map(t =>
        t.id === transcription.id
          ? { ...t, status: previousStatus, progress: previousProgress, errorMessage: previousError }
          : t
      ));
      updateTranscriptionInCache(transcription.id, {
        status: previousStatus,
        progress: previousProgress,
        errorMessage: previousError,
      });
      setError(err instanceof Error ? err.message : 'Failed to cancel transcription');
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
            animationDelay={index * 80}
            onCopyUrl={handleCopyUrl}
            onTogglePublic={handleTogglePublic}
            onToggleTag={handleToggleTag}
            onMoveToFolder={handleMoveToFolder}
            onMoveTag={handleMoveTag}
            onCancelTranscription={handleCancelTranscription}
          />

      ))}
    </div>
  );
}
