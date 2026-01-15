import { useEffect, useState, useCallback } from 'react';
import { X, Plus, Loader2, Check, Pencil } from 'lucide-react';
import type { Tag } from '@lecture/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useTranscriptionCache } from '@/contexts/TranscriptionCacheContext';

interface TagFilterProps {
  selectedTagIds: string[];
  onTagToggle: (tagId: string) => void;
}

const PRESET_COLORS = [
  '#0ea5e9', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
];

const UNDO_TIMEOUT = 4000;

interface DeletedTag {
  tag: Tag;
  wasSelected: boolean;
  timeoutId: ReturnType<typeof setTimeout>;
}

export function TagFilter({ selectedTagIds, onTagToggle }: TagFilterProps) {
  const { 
    tags, 
    isLoadingTags, 
    fetchTags, 
    refreshTags,
    addTagOptimistic,
    removeTagFromCache,
  } = useTranscriptionCache();
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingLoading, setIsCreatingLoading] = useState(false);
  const [creatingError, setCreatingError] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);
  const [deletedTag, setDeletedTag] = useState<DeletedTag | null>(null);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  useEffect(() => {
    return () => {
      if (deletedTag?.timeoutId) {
        clearTimeout(deletedTag.timeoutId);
      }
    };
  }, [deletedTag]);

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticTag: Tag = {
      id: tempId,
      name: newTagName.trim(),
      color: newTagColor,
      createdAt: new Date().toISOString(),
      userId: '',
    };

    setIsCreatingLoading(true);
    setCreatingError(null);
    
    addTagOptimistic(optimisticTag);
    setIsCreating(false);
    const savedName = newTagName.trim();
    const savedColor = newTagColor;
    setNewTagName('');
    setNewTagColor(PRESET_COLORS[0]);

    try {
      const createdTag = await api.createTag(savedName, savedColor);
      removeTagFromCache(tempId);
      addTagOptimistic(createdTag);
    } catch (error) {
      removeTagFromCache(tempId);
      setCreatingError(error instanceof Error ? error.message : 'Failed to create tag');
      setIsCreating(true);
      setNewTagName(savedName);
      setNewTagColor(savedColor);
      await refreshTags();
    } finally {
      setIsCreatingLoading(false);
    }
  };

  const commitDelete = useCallback(async (tag: Tag) => {
    try {
      await api.deleteTag(tag.id);
    } catch {
      await refreshTags();
    }
  }, [refreshTags]);

  const handleDeleteTag = useCallback((tag: Tag) => {
    if (tag.id.startsWith('temp-')) return;

    if (deletedTag?.timeoutId) {
      clearTimeout(deletedTag.timeoutId);
      commitDelete(deletedTag.tag);
    }

    const wasSelected = selectedTagIds.includes(tag.id);
    setDeletingTagId(tag.id);
    removeTagFromCache(tag.id);

    if (wasSelected) {
      onTagToggle(tag.id);
    }

    const timeoutId = setTimeout(() => {
      setDeletedTag(null);
      commitDelete(tag);
    }, UNDO_TIMEOUT);

    setDeletedTag({ tag, wasSelected, timeoutId });
    setDeletingTagId(null);
  }, [deletedTag, selectedTagIds, removeTagFromCache, onTagToggle, commitDelete]);

  const handleUndo = useCallback(() => {
    if (!deletedTag) return;

    clearTimeout(deletedTag.timeoutId);
    addTagOptimistic(deletedTag.tag);
    
    if (deletedTag.wasSelected) {
      onTagToggle(deletedTag.tag.id);
    }
    
    setDeletedTag(null);
  }, [deletedTag, addTagOptimistic, onTagToggle]);

  const handleDismissUndo = useCallback(() => {
    if (!deletedTag) return;

    clearTimeout(deletedTag.timeoutId);
    commitDelete(deletedTag.tag);
    setDeletedTag(null);
  }, [deletedTag, commitDelete]);

  if (isLoadingTags) {
    return (
      <div className="flex items-center gap-2 px-4 py-2">
        <div className="text-sm text-muted-foreground">Loading tags...</div>
      </div>
    );
  }

  return (
    <div className="relative">
      {deletedTag && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-10 neu-floating-card !py-1.5 !px-3 flex items-center gap-2 text-xs animate-scale-in">
          <span className="text-muted-foreground">
            Deleted "<span className="font-medium text-foreground">{deletedTag.tag.name}</span>"
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleUndo}
            className="h-5 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
          >
            Undo
          </Button>
          <button
            onClick={handleDismissUndo}
            className="p-0.5 rounded hover:bg-muted"
            aria-label="Dismiss"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      )}
      
      <div className="neu-floating-card flex items-center gap-2 px-4 py-2.5">
        <div className="flex items-center gap-2 flex-1 overflow-x-auto scrollbar-hide py-0.5">
          {tags.length === 0 && !isCreating ? (
            <div className="text-xs text-muted-foreground italic">No tags yet</div>
          ) : (
            tags.map((tag) => {
              const isSelected = selectedTagIds.includes(tag.id);
              const isTemp = tag.id.startsWith('temp-');
              const isDeleting = deletingTagId === tag.id;
              
              return (
                <button
                  key={tag.id}
                  onClick={() => {
                    if (isEditMode && !isTemp) {
                      handleDeleteTag(tag);
                    } else {
                      onTagToggle(tag.id);
                    }
                  }}
                  draggable={!isTemp && !isEditMode}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/x-lecture-tag', tag.id);
                    event.dataTransfer.setData('text/plain', tag.id);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  className={cn(
                    "neu-tag-pill cursor-pointer transition-all duration-200 hover:scale-95 whitespace-nowrap",
                    isSelected && "neu-tag-pill-active",
                    isTemp && "opacity-70",
                    isEditMode && !isTemp && "animate-wiggle",
                    isDeleting && "opacity-50 scale-95"
                  )}
                  style={{
                    '--tag-color': tag.color,
                    backgroundColor: isSelected ? tag.color : `${tag.color}18`,
                    color: isSelected ? '#ffffff' : tag.color,
                    borderColor: isSelected ? 'transparent' : `${tag.color}35`,
                    boxShadow: isSelected ? `0 2px 8px -2px ${tag.color}60, inset 0 1px 1px rgba(255,255,255,0.25)` : 'none',
                  } as React.CSSProperties}
                >
                  {isEditMode && !isTemp && (
                    <span 
                      className="inline-flex items-center justify-center h-3 w-3 -ml-0.5 mr-1 rounded-full bg-destructive text-white text-[8px] font-bold"
                      aria-hidden="true"
                    >
                      −
                    </span>
                  )}
                  {tag.name}
                  {isTemp && (
                    <Loader2 className="h-2.5 w-2.5 ml-1.5 animate-spin inline-block opacity-60" />
                  )}
                </button>
              );
            })
          )}
        </div>
        
        {isCreating ? (
          <div className="flex items-center gap-2 neu-floating-card !py-1.5 !px-3 animate-scale-in">
            {creatingError && (
              <div className="absolute -top-8 left-0 right-0 text-[10px] text-status-error bg-status-error-soft px-2 py-1 rounded flex items-center gap-1.5 whitespace-nowrap">
                <X className="h-2.5 w-2.5" />
                {creatingError}
              </div>
            )}
            <Input
              value={newTagName}
              onChange={(e) => {
                setNewTagName(e.target.value);
                setCreatingError(null);
              }}
              placeholder="Tag name"
              disabled={isCreatingLoading}
              className="no-focus-ring h-6 w-24 text-xs bg-transparent border-none shadow-none focus-visible:ring-0 focus-visible:outline-none focus:ring-0 focus:outline-none focus:border-none focus:bg-transparent focus:shadow-none selection:bg-transparent selection:text-inherit disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isCreatingLoading) {
                  handleCreateTag();
                } else if (e.key === 'Escape') {
                  setIsCreating(false);
                  setNewTagName('');
                  setCreatingError(null);
                }
              }}
              autoFocus
            />
            <div className="flex gap-1 items-center border-l border-border/50 pl-2">
              {PRESET_COLORS.slice(0, 4).map((color) => (
                <button
                  key={color}
                  onClick={() => setNewTagColor(color)}
                  disabled={isCreatingLoading}
                  className={cn(
                    "h-4 w-4 rounded-full border-2 transition-all duration-200",
                    newTagColor === color
                      ? "border-foreground scale-110 shadow-sm"
                      : "border-transparent hover:scale-110",
                    isCreatingLoading && "opacity-50 cursor-not-allowed"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCreateTag}
              disabled={isCreatingLoading || !newTagName.trim()}
              className="h-6 px-2.5 text-xs rounded-full hover:bg-primary/10 hover:text-primary disabled:opacity-50"
            >
              {isCreatingLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Add
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsCreating(false);
                setNewTagName('');
                setCreatingError(null);
              }}
              disabled={isCreatingLoading}
              className="h-6 w-6 p-0 rounded-full hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {tags.length > 0 && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsEditMode(!isEditMode)}
                className={cn(
                  "h-7 w-7 shrink-0 rounded-full neu-button-subtle",
                  isEditMode && "bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                )}
                title={isEditMode ? "Done editing" : "Edit tags"}
              >
                {isEditMode ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Pencil className="h-3 w-3" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setIsCreating(true);
                setIsEditMode(false);
              }}
              className="h-7 w-7 shrink-0 rounded-full neu-button-subtle"
              title="Add tag"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
