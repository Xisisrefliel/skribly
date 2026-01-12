import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Folder } from '@lecture/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface FolderPickerProps {
  transcriptionId: string;
  currentFolderId: string | null | undefined;
  onFolderChange: (folderId: string | null) => void;
}

export function FolderPicker({ transcriptionId, currentFolderId, onFolderChange }: FolderPickerProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const handleFolderSelect = async (folderId: string | null) => {
    try {
      await api.updateTranscription(transcriptionId, { folderId });
      onFolderChange(folderId);
    } catch (error) {
      console.error('Failed to update folder:', error);
    }
  };

  const currentFolder = folders.find(f => f.id === currentFolderId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 neu-button bg-background/50 hover:bg-background/80 transition-all">
          {currentFolder ? (
            <div className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 rounded-full shadow-sm"
                style={{ backgroundColor: currentFolder.color }}
              />
              <span className="text-xs font-medium">{currentFolder.name}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Select folder</span>
          )}
          <ChevronDown className="h-3 w-3 ml-2 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 neu-dropdown p-1">
        <DropdownMenuItem
          onClick={() => handleFolderSelect(null)}
          className={cn(
            "mb-1 cursor-pointer",
            currentFolderId === null || currentFolderId === undefined
              ? "bg-primary/10 text-primary font-medium"
              : ""
          )}
        >
          <span className="text-xs">No folder</span>
        </DropdownMenuItem>
        {folders.map((folder) => (
          <DropdownMenuItem
            key={folder.id}
            onClick={() => handleFolderSelect(folder.id)}
            className={cn(
              "cursor-pointer",
              currentFolderId === folder.id
                ? "bg-primary/10 text-primary font-medium"
                : ""
            )}
          >
            <div className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 rounded-full shadow-sm"
                style={{ backgroundColor: folder.color }}
              />
              <span className="text-xs">{folder.name}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
