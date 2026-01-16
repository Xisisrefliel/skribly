import { AnimatePresence, motion } from 'framer-motion';
import { FolderOpen, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderSidebar } from '@/components/FolderSidebar';
import { TagFilter } from '@/components/TagFilter';
import { TranscriptionList } from '@/components/TranscriptionList';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function AuthenticatedHome() {
  useDocumentTitle('Notism - AI Study Assistant');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarPosition, setSidebarPosition] = useState<{
    left: number;
    top: number;
    width: number;
    originX: number;
    originY: number;
  } | null>(null);
  const folderButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!sidebarOpen) {
      setSidebarPosition(null);
      return;
    }

    const updatePosition = () => {
      if (!folderButtonRef.current) return;

      const rect = folderButtonRef.current.getBoundingClientRect();
      const padding = 16;
      const maxWidth = Math.min(360, window.innerWidth - padding * 2);
      const left = Math.min(
        Math.max(padding, rect.left - 8),
        window.innerWidth - maxWidth - padding,
      );
      const top = rect.bottom + 12;
      const originX = rect.left + rect.width / 2 - left;
      const originY = rect.top + rect.height / 2 - top;

      setSidebarPosition({
        left,
        top,
        width: maxWidth,
        originX,
        originY,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen) {
      document.body.style.overflow = '';
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  const handleTagToggle = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    );
  };

  return (
    <div className="min-h-[calc(100vh-6rem)] p-4 xl:p-6 animate-fade-in-up">
      <div className="flex gap-4 xl:gap-6 max-w-7xl mx-auto">
        <div className="hidden xl:block shrink-0">
          <FolderSidebar
            selectedFolderId={selectedFolderId}
            onFolderSelect={setSelectedFolderId}
          />
        </div>

        <AnimatePresence>
          {sidebarOpen && sidebarPosition && (
            <>
              <motion.div
                className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSidebarOpen(false)}
                aria-hidden="true"
              />
              <motion.div
                className="fixed z-50"
                style={{
                  left: sidebarPosition.left,
                  top: sidebarPosition.top,
                  width: sidebarPosition.width,
                  transformOrigin: `${sidebarPosition.originX}px ${sidebarPosition.originY}px`,
                }}
                initial={{ opacity: 0, scale: 0.35, y: -12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -8 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                role="dialog"
                aria-modal="true"
                aria-label="Folders"
                id="folder-panel"
              >
                <div className="neu-floating-card border border-border/70 shadow-2xl p-3 max-h-[calc(100vh-8rem)] overflow-y-auto scrollbar-hide">
                  <FolderSidebar
                    selectedFolderId={selectedFolderId}
                    onFolderSelect={(id) => {
                      setSelectedFolderId(id);
                      setSidebarOpen(false);
                    }}
                    compact
                  />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div className="neu-floating-card flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4">
            <div className="flex items-center gap-3">
              <Button
                ref={folderButtonRef}
                variant="ghost"
                size="icon-sm"
                onClick={() => setSidebarOpen((prev) => !prev)}
                className="xl:hidden h-9 w-9 neu-button rounded-xl"
                aria-expanded={sidebarOpen}
                aria-controls="folder-panel"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-base sm:text-lg font-semibold">My Transcriptions</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">Upload content and study smarter</p>
              </div>
            </div>
            <Link to="/upload">
              <Button className="neu-button-primary h-9 sm:h-10">
                <Plus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">New Upload</span>
              </Button>
            </Link>
          </div>

          <TagFilter
            selectedTagIds={selectedTagIds}
            onTagToggle={handleTagToggle}
          />

          <div className="flex-1">
            <TranscriptionList
              folderId={selectedFolderId}
              tagIds={selectedTagIds.length > 0 ? selectedTagIds : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
