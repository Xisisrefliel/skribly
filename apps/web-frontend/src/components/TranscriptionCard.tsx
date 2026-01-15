import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { Transcription, Tag, Folder } from '@lecture/shared';
import { AlertCircle, Clock, FolderIcon, Copy, Globe, Lock, Tag as TagIcon, Check, FolderInput, FolderX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  ContextMenuCheckboxItem,
  ContextMenuLabel,
} from '@/components/ui/context-menu';
import { formatDate, formatDuration, getStatusStyles, type TranscriptionStatus } from '@/lib/utils';
import { cn } from '@/lib/utils';

const extractHeadline = (structuredText: string): string | null => {
  const match = structuredText.match(/^#{1,3}\s+(.+)$/m);
  return match ? match[1].trim() : null;
};

const stripMarkdown = (text: string): string => {
  return text
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const extractSummary = (structuredText: string): string | null => {
  const content = structuredText.replace(/^#{1,3}\s+.*$/gm, '').trim();
  if (!content) return null;

  const paragraph = content.split(/\n\s*\n/)[0]?.trim();
  if (!paragraph) return null;

  const plain = stripMarkdown(paragraph);
  if (!plain) return null;

  const sentenceMatch = plain.match(/^(.*?[.!?])(\s|$)/);
  return (sentenceMatch ? sentenceMatch[1] : plain).trim();
};

function StatusBadge({ status }: { status: TranscriptionStatus }) {
  const styles = getStatusStyles(status);
  
  const statusClass = {
    pending: '',
    processing: 'status-info',
    structuring: 'status-purple',
    completed: 'status-success',
    error: '',
  }[status];

  if (status === 'pending') {
    return <Badge variant="secondary" className="text-[10px] px-2 py-0.5">{styles.label}</Badge>;
  }
  
  if (status === 'error') {
    return <Badge variant="destructive" className="text-[10px] px-2 py-0.5">{styles.label}</Badge>;
  }
  
  return (
    <Badge className={cn(statusClass, "text-[10px] px-2 py-0.5")}>
      {styles.label}
    </Badge>
  );
}

export interface TranscriptionCardProps {
  transcription: Transcription;
  allTags: Tag[];
  allFolders: Folder[];
  currentFolderId?: string | null;
  copiedId: string | null;
  animationDelay?: number;
  onCopyUrl: (transcription: Transcription) => void;
  onTogglePublic: (transcription: Transcription) => void;
  onToggleTag: (transcription: Transcription, tagId: string) => void;
  onMoveToFolder: (transcription: Transcription, folderId: string | null) => void;
  onMoveTag: (sourceTranscriptionId: string, targetTranscriptionId: string, tagId: string) => void;
}

export function TranscriptionCard({
  transcription,
  allTags,
  allFolders,
  currentFolderId,
  copiedId,
  animationDelay = 0,
  onCopyUrl,
  onTogglePublic,
  onToggleTag,
  onMoveToFolder,
  onMoveTag,
}: TranscriptionCardProps) {
  const getFolderName = (folderIdToFind: string | null | undefined): string | null => {
    if (!folderIdToFind) return null;
    const folder = allFolders.find(f => f.id === folderIdToFind);
    return folder?.name || null;
  };

  const getFolderColor = (folderIdToFind: string | null | undefined): string | null => {
    if (!folderIdToFind) return null;
    const folder = allFolders.find(f => f.id === folderIdToFind);
    return folder?.color || null;
  };

  const shouldShowFolderInfo = () => {
    if (!transcription.folderId) return false;
    if (currentFolderId === transcription.folderId) return false;
    return true;
  };

  const renderFoldersMenu = () => {
    if (allFolders.length === 0) return null;

    return (
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <FolderInput className="h-4 w-4" />
          Move to Folder
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="max-h-64 overflow-y-auto">
          <ContextMenuLabel>Folders</ContextMenuLabel>
          {transcription.folderId && (
            <>
              <ContextMenuItem onClick={() => onMoveToFolder(transcription, null)}>
                <FolderX className="h-4 w-4 text-muted-foreground" />
                Remove from Folder
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          {allFolders.map((folder) => {
            const isCurrentFolder = transcription.folderId === folder.id;
            return (
              <ContextMenuItem
                key={folder.id}
                onClick={() => onMoveToFolder(transcription, folder.id)}
                disabled={isCurrentFolder}
              >
                <FolderIcon 
                  className="h-4 w-4" 
                  style={{ color: folder.color || 'currentColor' }}
                />
                <span className={cn(isCurrentFolder && "text-muted-foreground")}>
                  {folder.name}
                </span>
                {isCurrentFolder && (
                  <Check className="h-3.5 w-3.5 ml-auto text-status-success" />
                )}
              </ContextMenuItem>
            );
          })}
        </ContextMenuSubContent>
      </ContextMenuSub>
    );
  };

  const renderTagsMenu = () => {
    const transcriptionTagIds = transcription.tags?.map(t => t.id) || [];
    
    if (allTags.length > 5) {
      return (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <TagIcon className="h-4 w-4" />
            Set Tags
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-h-64 overflow-y-auto">
            <ContextMenuLabel>Tags</ContextMenuLabel>
            {allTags.map((tag) => (
              <ContextMenuCheckboxItem
                key={tag.id}
                checked={transcriptionTagIds.includes(tag.id)}
                onCheckedChange={() => onToggleTag(transcription, tag.id)}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full mr-1.5"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </ContextMenuCheckboxItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      );
    }

    return (
      <>
        {allTags.length > 0 && (
          <>
            <ContextMenuSeparator />
            <ContextMenuLabel>Tags</ContextMenuLabel>
            {allTags.map((tag) => (
              <ContextMenuCheckboxItem
                key={tag.id}
                checked={transcriptionTagIds.includes(tag.id)}
                onCheckedChange={() => onToggleTag(transcription, tag.id)}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full mr-1.5"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </ContextMenuCheckboxItem>
            ))}
          </>
        )}
      </>
    );
  };

  const folderName = getFolderName(transcription.folderId);
  const folderColor = getFolderColor(transcription.folderId);
  const showFolder = shouldShowFolderInfo();
  const [dragHint, setDragHint] = useState<'add' | 'move' | null>(null);
  const generatedHeadline = transcription.structuredText
    ? extractHeadline(transcription.structuredText)
    : null;
  const summaryText = transcription.structuredText
    ? extractSummary(transcription.structuredText)
    : null;
  const cardTitle = transcription.status === 'completed' && generatedHeadline
    ? generatedHeadline
    : transcription.title;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="block outline-none"
        style={{ animationDelay: `${animationDelay}ms` }}
        render={<Link to={`/transcription/${transcription.id}`} />}
      >
        <Card
          className={cn(
            "relative h-full card-hover-lift group animate-fade-in-up overflow-hidden flex flex-col transition-all duration-200",
            dragHint && "ring-1 ring-primary/50"
          )}
          onDragOver={(event) => {
            const isTagDrop = event.dataTransfer.types.includes('application/x-lecture-tag');
            const isMoveDrop = event.dataTransfer.types.includes('application/x-lecture-transcription-tag');

            if (isTagDrop || isMoveDrop) {
              event.preventDefault();
              event.dataTransfer.dropEffect = isMoveDrop ? 'move' : 'copy';
              setDragHint(isMoveDrop ? 'move' : 'add');
            }
          }}
          onDragLeave={() => {
            setDragHint(null);
          }}
          onDrop={(event) => {
            const movePayload = event.dataTransfer.getData('application/x-lecture-transcription-tag');
            const tagId = event.dataTransfer.getData('application/x-lecture-tag');

            if (!movePayload && !tagId) return;

            event.preventDefault();
            event.stopPropagation();
            setDragHint(null);

            if (movePayload) {
              try {
                const parsed = JSON.parse(movePayload) as { sourceId: string; tagId: string };
                if (parsed.tagId && parsed.sourceId && parsed.sourceId !== transcription.id) {
                  onMoveTag(parsed.sourceId, transcription.id, parsed.tagId);
                }
              } catch (error) {
                console.error('Failed to parse dragged tag payload:', error);
              }
              return;
            }

            const currentTagIds = transcription.tags?.map(tag => tag.id) || [];
            if (tagId && !currentTagIds.includes(tagId)) {
              onToggleTag(transcription, tagId);
            }
          }}
        >
          {dragHint && (
            <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl border border-dashed border-primary/60 bg-primary/10 backdrop-blur-sm flex items-center justify-center text-xs font-medium text-primary">
              {dragHint === 'move' ? 'Drop to move tag' : 'Drop to add tag'}
            </div>
          )}
          <CardHeader className="relative z-0 p-3 pb-2">
            {/* Title and status row */}
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <CardTitle className="text-sm font-semibold line-clamp-2 group-hover:text-primary transition-colors duration-200 leading-snug">
                {cardTitle}
              </CardTitle>
              <StatusBadge status={transcription.status as TranscriptionStatus} />
            </div>
            
            {/* Meta row */}
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{formatDate(transcription.createdAt)}</span>
              {!!transcription.audioDuration && !['pdf', 'pptx', 'ppt', 'docx'].includes(transcription.sourceType) && !transcription.whisperModel?.toLowerCase().includes('document') && (
                <>
                  <span className="opacity-40">·</span>
                  <span>{formatDuration(transcription.audioDuration)}</span>
                </>
              )}
              {transcription.isPublic && (
                <>
                  <span className="opacity-40">·</span>
                  <Globe className="h-3 w-3 text-status-success" />
                </>
              )}
            </div>
          </CardHeader>
          
          <CardContent className="relative z-0 p-3 pt-0 space-y-2 flex-1">
            {/* Status-specific content */}
            {(transcription.status === 'processing' || transcription.status === 'structuring') && (
              <div className="space-y-1">
                <Progress value={transcription.progress * 100} className="h-1" />
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-info animate-pulse-soft" />
                  {transcription.status === 'processing' ? 'Transcribing' : 'Structuring'}... {Math.round(transcription.progress * 100)}%
                </p>
              </div>
            )}
            
            {transcription.status === 'completed' && summaryText && (
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {summaryText}
              </p>
            )}
            
            {transcription.status === 'error' && transcription.errorMessage && (
              <div className="flex items-start gap-1.5 text-status-error">
                <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] line-clamp-2">{transcription.errorMessage}</p>
              </div>
            )}
            
            {transcription.status === 'pending' && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                Waiting to start...
              </p>
            )}
            
            {/* Tags */}
            {transcription.tags && transcription.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {transcription.tags.map((tag) => (
                  <span
                    key={tag.id}
                    role="button"
                    tabIndex={0}
                    draggable
                    onClick={() => onToggleTag(transcription, tag.id)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        'application/x-lecture-transcription-tag',
                        JSON.stringify({ sourceId: transcription.id, tagId: tag.id })
                      );
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={(event) => {
                      if (event.dataTransfer.dropEffect === 'none') {
                        onToggleTag(transcription, tag.id);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onToggleTag(transcription, tag.id);
                      }
                    }}
                    className="inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-full cursor-grab active:cursor-grabbing"
                    style={{
                      backgroundColor: `${tag.color}15`,
                      color: tag.color,
                    }}
                    title="Click to remove, drag to move"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
          
          {/* Footer - Folder info */}
          {showFolder && folderName && (
            <div className="relative z-0 px-3 py-1.5 border-t border-border/50 bg-muted/30 mt-auto">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <FolderIcon 
                  className="h-3 w-3" 
                  style={{ color: folderColor || 'currentColor' }}
                />
                <span>Also in <span className="font-medium text-foreground/70">{folderName}</span></span>
              </div>
            </div>
          )}
        </Card>
      </ContextMenuTrigger>
      
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onCopyUrl(transcription)}>
          {copiedId === transcription.id ? (
            <>
              <Check className="h-4 w-4 text-status-success" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy URL
            </>
          )}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {renderFoldersMenu()}
        <ContextMenuItem onClick={() => onTogglePublic(transcription)}>
          {transcription.isPublic ? (
            <>
              <Lock className="h-4 w-4" />
              Make Private
            </>
          ) : (
            <>
              <Globe className="h-4 w-4" />
              Make Public
            </>
          )}
        </ContextMenuItem>
        {renderTagsMenu()}
      </ContextMenuContent>
    </ContextMenu>
  );
}
