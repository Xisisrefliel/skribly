import { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';
import type { Tag } from '@lecture/shared';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TagEditorProps {
  transcriptionId: string;
  currentTagIds: string[];
  onTagsChange: (tagIds: string[]) => void;
}

export function TagEditor({ transcriptionId, currentTagIds, onTagsChange }: TagEditorProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(currentTagIds);

  useEffect(() => {
    setSelectedTagIds(currentTagIds);
  }, [currentTagIds]);

  const fetchTags = async () => {
    try {
      const data = await api.getTags();
      setTags(data);
    } catch (error) {
      console.error('Failed to fetch tags:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const handleTagToggle = (tagId: string) => {
    const newSelected = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter(id => id !== tagId)
      : [...selectedTagIds, tagId];
    setSelectedTagIds(newSelected);
  };

  const handleSave = async () => {
    try {
      await api.updateTranscription(transcriptionId, { tagIds: selectedTagIds });
      onTagsChange(selectedTagIds);
    } catch (error) {
      console.error('Failed to update tags:', error);
    }
  };

  const handleCancel = () => {
    setSelectedTagIds(currentTagIds);
    onTagsChange(currentTagIds);
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading tags...</div>;
  }

  return (
    <div className="space-y-3 p-1">
      <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto pr-1">
        {tags.length === 0 ? (
          <div className="text-sm text-muted-foreground italic p-2">No tags available. Create tags from the home page.</div>
        ) : (
          tags.map((tag) => {
            const isSelected = selectedTagIds.includes(tag.id);
            return (
              <Badge
                key={tag.id}
                onClick={() => handleTagToggle(tag.id)}
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:scale-105 flex items-center gap-1.5 border py-1",
                  isSelected
                    ? "shadow-md ring-1 ring-offset-1 ring-offset-background"
                    : "opacity-70 hover:opacity-100 hover:shadow-sm"
                )}
                style={{
                  backgroundColor: isSelected ? tag.color : `${tag.color}20`,
                  color: isSelected ? '#ffffff' : tag.color,
                  borderColor: isSelected ? 'transparent' : `${tag.color}40`,
                  boxShadow: isSelected ? `0 2px 8px -2px ${tag.color}60` : 'none',
                }}
              >
                {tag.name}
                {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
              </Badge>
            );
          })
        )}
      </div>
      <div className="flex gap-2 pt-2 border-t border-border">
        <Button
          size="sm"
          onClick={handleSave}
          className="h-8 neu-button-primary flex-1"
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCancel}
          className="h-8 neu-button flex-1"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
