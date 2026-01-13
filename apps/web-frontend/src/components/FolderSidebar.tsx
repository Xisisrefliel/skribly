import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, FolderIcon } from 'lucide-react';
import type { Folder as FolderType } from '@lecture/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

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
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(PRESET_COLORS[0]);
  const [editFolderName, setEditFolderName] = useState('');
  const [editFolderColor, setEditFolderColor] = useState(PRESET_COLORS[0]);

  const fetchFolders = async () => {
    try {
      const data = await api.getFolders();
      setFolders(data);
    } catch (error) {
      console.error('Failed to fetch folders:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFolders();
  }, []);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      const folder = await api.createFolder(newFolderName.trim(), newFolderColor);
      setFolders([...folders, folder]);
      setNewFolderName('');
      setNewFolderColor(PRESET_COLORS[0]);
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleUpdateFolder = async (id: string) => {
    if (!editFolderName.trim()) return;

    try {
      const updatedFolder = await api.updateFolder(id, {
        name: editFolderName.trim(),
        color: editFolderColor,
      });
      setFolders(folders.map(f => f.id === id ? updatedFolder : f));
      setEditingId(null);
      setEditFolderName('');
    } catch (error) {
      console.error('Failed to update folder:', error);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm('Are you sure you want to delete this folder? Transcriptions in this folder will not be deleted.')) {
      return;
    }

    try {
      await api.deleteFolder(id);
      setFolders(folders.filter(f => f.id !== id));
      if (selectedFolderId === id) {
        onFolderSelect(null);
      }
    } catch (error) {
      console.error('Failed to delete folder:', error);
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

        {isLoading ? (
          <div className="text-sm text-muted-foreground px-3 py-2">Loading...</div>
        ) : folders.length === 0 && !isCreating ? (
          <div className="text-xs text-muted-foreground px-3 py-2 italic">
            No folders yet
          </div>
        ) : (
          folders.map((folder) => (
            <div key={folder.id} className="group relative">
              {editingId === folder.id ? (
                <div className="space-y-2 p-2.5 bg-muted/40 rounded-xl border border-border/50">
                  <Input
                    value={editFolderName}
                    onChange={(e) => setEditFolderName(e.target.value)}
                    placeholder="Folder name"
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
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
                        className={cn(
                          "h-5 w-5 rounded-full border-2 transition-all duration-200",
                          editFolderColor === color
                            ? "border-foreground scale-110 shadow-md"
                            : "border-transparent hover:scale-110"
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => handleUpdateFolder(folder.id)}
                      className="h-7 flex-1 text-xs neu-button-success"
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={cancelEdit}
                      className="h-7 flex-1 text-xs neu-button"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center group/item">
                  <button
                    onClick={() => onFolderSelect(folder.id)}
                    className={cn(
                      "flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-200 text-left",
                      selectedFolderId === folder.id
                        ? "neu-sidebar-item-active font-medium"
                        : "neu-sidebar-item text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div
                      className="h-3 w-3 rounded-full shadow-sm flex-shrink-0"
                      style={{ backgroundColor: folder.color }}
                    />
                    <span className="truncate">{folder.name}</span>
                  </button>
                  <div className={cn(
                    "absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-0.5 transition-opacity duration-200",
                    selectedFolderId === folder.id ? "opacity-100" : "opacity-0 group-hover/item:opacity-100"
                  )}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => { e.stopPropagation(); startEdit(folder); }}
                      className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent"
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                      className="h-6 w-6 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {isCreating && (
          <div className="space-y-2 p-2.5 bg-muted/40 rounded-xl border border-border/50 animate-scale-in">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateFolder();
                } else if (e.key === 'Escape') {
                  setIsCreating(false);
                  setNewFolderName('');
                }
              }}
              autoFocus
            />
            <div className="flex gap-1.5 flex-wrap">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewFolderColor(color)}
                  className={cn(
                    "h-5 w-5 rounded-full border-2 transition-all duration-200",
                    newFolderColor === color
                      ? "border-foreground scale-110 shadow-md"
                      : "border-transparent hover:scale-110"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                onClick={handleCreateFolder}
                className="h-7 flex-1 text-xs neu-button-success"
              >
                Create
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsCreating(false);
                  setNewFolderName('');
                }}
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
