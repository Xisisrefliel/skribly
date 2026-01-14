import { useEffect, useState } from 'react';
import { X, Plus, Loader2, Check } from 'lucide-react';
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

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

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
    
    // Optimistically add the tag
    addTagOptimistic(optimisticTag);
    setIsCreating(false);
    const savedName = newTagName.trim();
    const savedColor = newTagColor;
    setNewTagName('');
    setNewTagColor(PRESET_COLORS[0]);

    try {
      const createdTag = await api.createTag(savedName, savedColor);
      // Replace optimistic tag with real one
      removeTagFromCache(tempId);
      addTagOptimistic(createdTag);
    } catch (error) {
      // Remove optimistic tag on error
      removeTagFromCache(tempId);
      setCreatingError(error instanceof Error ? error.message : 'Failed to create tag');
      setIsCreating(true);
      setNewTagName(savedName);
      setNewTagColor(savedColor);
      // Refresh to get accurate state
      await refreshTags();
    } finally {
      setIsCreatingLoading(false);
    }
  };

  if (isLoadingTags) {
    return (
      <div className="flex items-center gap-2 px-4 py-2">
        <div className="text-sm text-muted-foreground">Loading tags...</div>
      </div>
    );
  }

  return (
    <div className="neu-floating-card flex items-center gap-2 px-4 py-2.5">
      <div className="flex items-center gap-2 flex-1 overflow-x-auto scrollbar-hide py-0.5">
        {tags.length === 0 && !isCreating ? (
          <div className="text-xs text-muted-foreground italic">No tags yet</div>
        ) : (
          tags.map((tag) => {
            const isSelected = selectedTagIds.includes(tag.id);
            const isTemp = tag.id.startsWith('temp-');
            return (
              <button
                key={tag.id}
                onClick={() => onTagToggle(tag.id)}
                className={cn(
                  "neu-tag-pill cursor-pointer transition-all duration-200 hover:scale-95 whitespace-nowrap relative",
                  isSelected && "neu-tag-pill-active",
                  isTemp && "opacity-70"
                )}
                style={{
                  '--tag-color': tag.color,
                  backgroundColor: isSelected ? tag.color : `${tag.color}18`,
                  color: isSelected ? '#ffffff' : tag.color,
                  borderColor: isSelected ? 'transparent' : `${tag.color}35`,
                  boxShadow: isSelected ? `0 2px 8px -2px ${tag.color}60, inset 0 1px 1px rgba(255,255,255,0.25)` : 'none',
                } as React.CSSProperties}
              >
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
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setIsCreating(true)}
          className="h-7 w-7 shrink-0 rounded-full neu-button-subtle"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
