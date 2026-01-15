import { SignInButton } from '@clerk/clerk-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  ClipboardCheck,
  FolderOpen,
  Layers,
  Loader2,
  Mic,
  Plus
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderSidebar } from '@/components/FolderSidebar';
import { TagFilter } from '@/components/TagFilter';
import { TranscriptionList } from '@/components/TranscriptionList';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function HomePage() {
  useDocumentTitle('Notism - AI Study Assistant');
  const { isAuthenticated, isLoading } = useAuth();

  // All hooks must be called before any conditional returns
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
        window.innerWidth - maxWidth - padding
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="relative overflow-hidden min-h-screen w-full flex flex-col">
        <div className="fixed inset-0 pointer-events-none opacity-80 -z-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.08), transparent 30%), radial-gradient(circle at 80% 0%, rgba(79,70,229,0.12), transparent 26%), radial-gradient(circle at 50% 80%, rgba(12,12,12,0.08), transparent 40%)' }} />
        <div className="fixed inset-0 pointer-events-none -z-10" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '120px 120px' }} />

        <div className="relative z-10 max-w-6xl mx-auto px-6 md:px-10 py-16 md:py-24 flex flex-col gap-16 md:gap-20 flex-1">
          {/* Hero */}
          <div className="flex flex-col gap-10 md:gap-12 animate-fade-in-up">
            <div className="inline-flex items-center gap-3 self-start px-4 py-2 rounded-full neu-floating-card text-sm font-medium text-foreground/80 shadow-inner">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_6px_rgba(16,185,129,0.15)]" />
              <span>Built for students who like clean desks</span>
            </div>

            <div className="grid gap-10 md:gap-12 md:grid-cols-[1.1fr_0.9fr] items-start">
              <div className="space-y-8 text-left">
                <h1 className="text-4xl md:text-6xl font-bold font-display tracking-tight leading-[1.05] text-foreground">
                  Minimal, tactile study space for every lecture you record.
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
                  Upload a session, a slide deck, or a doc; walk away with clean transcripts, calm summaries, and ready-to-use flashcards. Less chrome, more clarity.
                </p>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <SignInButton mode="modal">
                  <Button
                    variant="default"
                    size="xl"
                    className="group relative inline-flex items-center justify-center gap-2 px-10 py-4 text-base font-semibold text-white rounded-[1.25rem] bg-gradient-to-br from-primary/90 to-primary/70 text-shadow-[0_4px_30px_rgba(0,0,0,0.35)] shadow-[0_20px_40px_rgba(0,0,0,0.25)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_25px_45px_rgba(0,0,0,0.35)] active:translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
                  >
                    <span>Start in minutes</span>
                    <ArrowRight className="w-5 h-5 transition-transform duration-200 group-hover:translate-x-1" />
                  </Button>
                </SignInButton>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <div className="h-8 w-8 rounded-lg neu-floating-card flex items-center justify-center">
                      <Mic className="h-4 w-4 text-foreground/70" />
                    </div>
                    <span className="font-medium">No credit card. Drop a recording, PDF, doc, or deck.</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="neu-floating-card p-6 md:p-7 border border-border/60 shadow-inner">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-[0.08em]">Workflow</p>
                    <div className="rounded-full px-3 py-1 text-xs font-semibold bg-primary/10 text-primary">
                      Calm mode
                    </div>
                  </div>
                  <div className="mt-6 space-y-4">
                    {[
                      { title: 'Upload a lecture file', desc: 'Supports audio, video, PDF, Word, and PowerPoint. Drag, drop, done.', icon: FolderOpen },
                      { title: 'Clean transcript & summary', desc: 'Readable notes with section dividers.', icon: Layers },
                      { title: 'Flashcards + quizzes', desc: 'Study-ready sets aligned to your lecture.', icon: ClipboardCheck }
                    ].map((item) => (
                      <div key={item.title} className="flex items-start gap-4 p-3 rounded-xl bg-background/60 border border-border/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                        <div className="h-10 w-10 rounded-xl neu-icon-container flex items-center justify-center shrink-0">
                          <item.icon className="h-5 w-5 text-primary/80" strokeWidth={1.5} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-base font-semibold text-foreground">{item.title}</p>
                          <p className="text-sm text-muted-foreground">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feature strip */}
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { title: 'No clutter UI', desc: 'Skeuomorphic panels, clear hierarchy, zero busywork.', icon: Layers },
              { title: 'Study rhythm', desc: 'Flashcards, quizzes, and summaries stay in one flow.', icon: ClipboardCheck },
              { title: 'Safe uploads', desc: 'Private by default. You control sharing.', icon: FolderOpen }
            ].map((feature) => (
              <div
                key={feature.title}
                className="neu-floating-card border border-border/60 shadow-inner p-5 md:p-6 flex items-start gap-4"
              >
                <div className="h-12 w-12 rounded-2xl neu-icon-container flex items-center justify-center shrink-0">
                  <feature.icon className="h-5 w-5 text-primary/80" strokeWidth={1.5} />
                </div>
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-foreground">{feature.title}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Steps */}
          <div className="neu-floating-card border border-border/60 shadow-inner p-6 md:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">How it feels</p>
                <h2 className="text-2xl md:text-3xl font-display font-semibold mt-2">Quiet, linear, done in three steps.</h2>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-background/70 border border-border text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary/80" />
                <span>Average setup: 90 seconds</span>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { label: '01', title: 'Drop the file', copy: 'Audio, video, PDF/Word/PPT—any length. We keep the edges tidy.' },
                { label: '02', title: 'Let it process', copy: 'Transcription, cleaning, and structuring in the background.' },
                { label: '03', title: 'Open your deck', copy: 'Summaries, flashcards, and quizzes ready to review.' }
              ].map((step) => (
                <div key={step.label} className="rounded-xl bg-background/60 border border-border/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                  <div className="text-xs font-semibold tracking-[0.18em] text-muted-foreground">{step.label}</div>
                  <p className="mt-2 text-lg font-semibold text-foreground">{step.title}</p>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{step.copy}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <footer className="mt-auto flex flex-row flex-wrap items-center justify-between gap-3 text-muted-foreground/80 text-[0.7rem] sm:text-xs pb-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl neu-floating-card flex items-center justify-center">
                <ClipboardCheck className="h-4 w-4 text-primary/80" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Notism</p>
                <p className="text-xs">A calm workspace for lectures you care about.</p>
              </div>
            </div>
            <div className="flex flex-col items-start gap-2 text-xs uppercase tracking-[0.18em] sm:items-end">
              <p>© 2026 Notism</p>
              <div className="flex items-center gap-3 text-[0.65rem] normal-case tracking-normal">
                <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
                <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
              </div>
            </div>
          </footer>
        </div>
      </div>
    );
  }

  const handleTagToggle = (tagId: string) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  return (
    <div className="min-h-[calc(100vh-6rem)] p-4 xl:p-6 animate-fade-in-up">
      <div className="flex gap-4 xl:gap-6 max-w-7xl mx-auto">
        {/* Sidebar - Desktop (xl and up) */}
        <div className="hidden xl:block shrink-0">
          <FolderSidebar
            selectedFolderId={selectedFolderId}
            onFolderSelect={setSelectedFolderId}
          />
        </div>

        {/* Sidebar - Tablet/Mobile (overlay panel) */}
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

        {/* Main content */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Header bar */}
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

          {/* Tag filter bar */}
          <TagFilter
            selectedTagIds={selectedTagIds}
            onTagToggle={handleTagToggle}
          />

          {/* Transcription list */}
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
