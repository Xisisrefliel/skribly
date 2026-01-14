import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, FolderIcon, Loader2, Check, X as XIcon } from 'lucide-react';
import type { Folder as FolderType } from '@lecture/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useTranscriptionCache } from '@/contexts/TranscriptionCacheContext';

interface FolderSidebarProps {
  selectedFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
  /** When true, removes outer card styling (for use inside drawer) */
  compact?: boolean;
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

export function FolderSidebar({ selectedFolderId, onFolderSelect, compact = false }: FolderSidebarProps) {
  const { 
    folders, 
    isLoadingFolders, 
    fetchFolders, 
    refreshFolders,
    addFolderOptimistic,
    updateFolderInCache,
    removeFolderFromCache,
  } = useTranscriptionCache();
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingLoading, setIsCreatingLoading] = useState(false);
  const [creatingError, setCreatingError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isUpdatingId, setIsUpdatingId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(PRESET_COLORS[0]);
  const [editFolderName, setEditFolderName] = useState('');
  const [editFolderColor, setEditFolderColor] = useState(PRESET_COLORS[0]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    const tempId = `temp-${Date.now()}`;
    const optimisticFolder: FolderType = {
      id: tempId,
      name: newFolderName.trim(),
      color: newFolderColor,
      createdAt: new Date().toISOString(),
      userId: '',
    };

    setIsCreatingLoading(true);
    setCreatingError(null);
    
    // Optimistically add the folder
    addFolderOptimistic(optimisticFolder);
    setIsCreating(false);
    setNewFolderName('');
    setNewFolderColor(PRESET_COLORS[0]);

    try {
      const createdFolder = await api.createFolder(newFolderName.trim(), newFolderColor);
      // Replace optimistic folder with real one
      removeFolderFromCache(tempId);
      addFolderOptimistic(createdFolder);
    } catch (error) {
      // Remove optimistic folder on error
      removeFolderFromCache(tempId);
      setCreatingError(error instanceof Error ? error.message : 'Failed to create folder');
      setIsCreating(true);
      setNewFolderName(newFolderName.trim());
      setNewFolderColor(newFolderColor);
      // Refresh to get accurate state
      await refreshFolders();
    } finally {
      setIsCreatingLoading(false);
    }
  };

  const handleUpdateFolder = async (id: string) => {
    if (!editFolderName.trim()) return;

    const folder = folders.find(f => f.id === id);
    if (!folder) return;

    setIsUpdatingId(id);
    
    // Optimistically update
    updateFolderInCache(id, {
      name: editFolderName.trim(),
      color: editFolderColor,
    });

    try {
      const updatedFolder = await api.updateFolder(id, {
        name: editFolderName.trim(),
        color: editFolderColor,
      });
      // Update with server response
      updateFolderInCache(id, updatedFolder);
      setEditingId(null);
      setEditFolderName('');
    } catch (error) {
      // Revert on error
      updateFolderInCache(id, folder);
      await refreshFolders();
      // Keep edit mode open and show error
      const errorMsg = error instanceof Error ? error.message : 'Failed to update folder';
      // You could add a toast notification here instead
      console.error('Failed to update folder:', errorMsg);
    } finally {
      setIsUpdatingId(null);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm('Are you sure you want to delete this folder? Transcriptions in this folder will not be deleted.')) {
      return;
    }

    setIsDeletingId(id);
    
    // Optimistically remove
    const folder = folders.find(f => f.id === id);
    removeFolderFromCache(id);
    
    if (selectedFolderId === id) {
      onFolderSelect(null);
    }

    try {
      await api.deleteFolder(id);
    } catch (error) {
      // Revert on error
      if (folder) {
        addFolderOptimistic(folder);
      }
      await refreshFolders();
      const errorMsg = error instanceof Error ? error.message : 'Failed to delete folder';
      // You could add a toast notification here instead
      console.error('Failed to delete folder:', errorMsg);
      // Show a more user-friendly error
      if (confirm(`${errorMsg}\n\nWould you like to try again?`)) {
        handleDeleteFolder(id);
      }
    } finally {
      setIsDeletingId(null);
    }
  };

  const startEdit = (folder: FolderType) => {
    setEditingId(folder.id);
    setEditFolderName(folder.name);
    setEditFolderColor(folder.color);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditFolderName('');
  };

  return (
    <div className={cn(
      "space-y-3 h-fit overflow-y-auto scrollbar-hide",
      compact 
        ? "w-full" 
        : "neu-floating-card w-56 p-3 max-h-[calc(100vh-8rem)]"
    )}>
      {!compact && (
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Folders</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setIsCreating(true)}
            className="h-6 w-6 neu-button-subtle rounded-full"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="space-y-1">
        {/* Add folder button for compact mode */}
        {compact && (
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-xs font-medium text-muted-foreground">Organize your content</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsCreating(true)}
              className="h-6 w-6 neu-button-subtle rounded-full"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        <button
          onClick={() => onFolderSelect(null)}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-200",
            selectedFolderId === null
              ? "neu-sidebar-item-active font-medium"
              : "neu-sidebar-item text-muted-foreground hover:text-foreground"
          )}
        >
          <FolderIcon className="h-4 w-4" />
          All Transcriptions
        </button>

        {isLoadingFolders ? (
          <div className="text-sm text-muted-foreground px-3 py-2">Loading...</div>
        ) : folders.length === 0 && !isCreating ? (
          <div className="text-xs text-muted-foreground px-3 py-2 italic">
            No folders yet
          </div>
        ) : (
          folders.map((folder) => {
            const isUpdating = isUpdatingId === folder.id;
            const isDeleting = isDeletingId === folder.id;
            const isTemp = folder.id.startsWith('temp-');
            
            return (
              <div 
                key={folder.id} 
                className={cn(
                  "group relative transition-all duration-200",
                  isDeleting && "opacity-50 pointer-events-none",
                  isTemp && "opacity-70"
                )}
              >
                {editingId === folder.id ? (
                  <div className="space-y-2 p-2.5 bg-muted/40 rounded-xl border border-border/50">
                    <Input
                      value={editFolderName}
                      onChange={(e) => setEditFolderName(e.target.value)}
                      placeholder="Folder name"
                      className="h-8 text-sm"
                      disabled={isUpdating}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isUpdating) {
                          handleUpdateFolder(folder.id);
                        } else if (e.key === 'Escape') {
                          cancelEdit();
                        }
                      }}
                      autoFocus
                    />
                    <div className="flex gap-1.5 flex-wrap">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => setEditFolderColor(color)}
                          disabled={isUpdating}
                          className={cn(
                            "h-5 w-5 rounded-full border-2 transition-all duration-200",
                            editFolderColor === color
                              ? "border-foreground scale-110 shadow-md"
                              : "border-transparent hover:scale-110",
                            isUpdating && "opacity-50 cursor-not-allowed"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => handleUpdateFolder(folder.id)}
                        disabled={isUpdating || !editFolderName.trim()}
                        className="h-7 flex-1 text-xs neu-button-success"
                      >
                        {isUpdating ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Check className="h-3 w-3 mr-1.5" />
                            Save
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={cancelEdit}
                        disabled={isUpdating}
                        className="h-7 flex-1 text-xs neu-button"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center group/item">
                    <button
                      onClick={() => !isDeleting && onFolderSelect(folder.id)}
                      disabled={isDeleting}
                      className={cn(
                        "flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-200 text-left",
                        selectedFolderId === folder.id
                          ? "neu-sidebar-item-active font-medium"
                          : "neu-sidebar-item text-muted-foreground hover:text-foreground",
                        isDeleting && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {isUpdating && (
                        <Loader2 className="h-3 w-3 mr-1.5 animate-spin text-muted-foreground" />
                      )}
                      <div
                        className="h-3 w-3 rounded-full shadow-sm flex-shrink-0"
                        style={{ backgroundColor: folder.color }}
                      />
                      <span className="truncate">{folder.name}</span>
                      {isTemp && (
                        <span className="text-[10px] text-muted-foreground/60 ml-auto">Creating...</span>
                      )}
                    </button>
                    {!isDeleting && (
                      <div className={cn(
                        "absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-0.5 transition-opacity duration-200",
                        selectedFolderId === folder.id ? "opacity-100" : "opacity-0 group-hover/item:opacity-100"
                      )}>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e) => { e.stopPropagation(); startEdit(folder); }}
                          disabled={isUpdating}
                          className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent"
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                          disabled={isUpdating}
                          className="h-6 w-6 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {isCreating && (
          <div className="space-y-2 p-2.5 bg-muted/40 rounded-xl border border-border/50 animate-scale-in">
            {creatingError && (
              <div className="text-xs text-status-error bg-status-error-soft px-2 py-1 rounded flex items-center gap-1.5">
                <XIcon className="h-3 w-3" />
                {creatingError}
              </div>
            )}
            <Input
              value={newFolderName}
              onChange={(e) => {
                setNewFolderName(e.target.value);
                setCreatingError(null);
              }}
              placeholder="Folder name"
              className="h-8 text-sm"
              disabled={isCreatingLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isCreatingLoading) {
                  handleCreateFolder();
                } else if (e.key === 'Escape') {
                  setIsCreating(false);
                  setNewFolderName('');
                  setCreatingError(null);
                }
              }}
              autoFocus
            />
            <div className="flex gap-1.5 flex-wrap">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewFolderColor(color)}
                  disabled={isCreatingLoading}
                  className={cn(
                    "h-5 w-5 rounded-full border-2 transition-all duration-200",
                    newFolderColor === color
                      ? "border-foreground scale-110 shadow-md"
                      : "border-transparent hover:scale-110",
                    isCreatingLoading && "opacity-50 cursor-not-allowed"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                onClick={handleCreateFolder}
                disabled={isCreatingLoading || !newFolderName.trim()}
                className="h-7 flex-1 text-xs neu-button-success"
              >
                {isCreatingLoading ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create'
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsCreating(false);
                  setNewFolderName('');
                  setCreatingError(null);
                }}
                disabled={isCreatingLoading}
                className="h-7 flex-1 text-xs neu-button"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
