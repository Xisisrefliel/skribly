import { FolderSidebar } from '@/components/FolderSidebar';
import { TagFilter } from '@/components/TagFilter';
import { TranscriptionList } from '@/components/TranscriptionList';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { SignInButton } from '@clerk/clerk-react';
import {
  ArrowRight,
  ClipboardCheck,
  FolderOpen,
  Layers,
  Loader2,
  Mic,
  Plus
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';



export function HomePage() {
  useDocumentTitle('Notism - AI Study Assistant');
  const { isAuthenticated, isLoading } = useAuth();

  // All hooks must be called before any conditional returns
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[85vh] text-center max-w-5xl mx-auto space-y-24">

        {/* Hero Section */}
        <div className="space-y-10 animate-fade-in-up md:px-0">
          <div className="space-y-5">
            <h1 className="text-5xl md:text-7xl font-bold font-display tracking-tight text-foreground">
              Lectures, <br className="md:hidden" />
              <span className="text-primary italic">Mastered.</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-medium leading-relaxed">
              Transform recordings into perfect notes, quizzes, and flashcards.
            </p>
          </div>

          <div className="flex flex-col items-center gap-5">
            <SignInButton mode="modal">
              <button
                className="group relative inline-flex items-center justify-center px-12 py-5 text-xl font-bold text-white transition-all duration-200 bg-primary rounded-xl neu-button-primary hover:scale-[1.02] active:scale-[0.98] outline-none focus:ring-4 focus:ring-primary/20"
              >
                <span className="mr-2">Get Started</span>
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </button>
            </SignInButton>
            <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
              No credit card required
            </p>
          </div>
        </div>

        {/* Minimal Feature Grid - Text & Icon Focus, No Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 w-full px-4 md:px-12">
          {[
            { icon: Mic, title: "Record", desc: "Upload audio or video files directly." },
            { icon: Layers, title: "Process", desc: "AI transcribes and summarizes instantly." },
            { icon: ClipboardCheck, title: "Master", desc: "Get quizzes and flashcards automatically." }
          ].map((feature) => (
            <div key={feature.title} className="flex flex-col items-center space-y-4 group">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-300 neu-icon-container group-hover:scale-110"
              >
                <feature.icon className="w-8 h-8 text-primary/80" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-bold font-display tracking-tight">{feature.title}</h3>
              <p className="text-base text-muted-foreground leading-normal max-w-[250px]">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Footer (Minimal) */}
        <footer className="w-full pt-12 pb-8 flex flex-col items-center space-y-4 opacity-50 hover:opacity-100 transition-opacity">
          <div className="w-12 h-1 rounded-full bg-border" />
          <p className="text-sm font-medium text-muted-foreground">© 2026 Notism</p>
        </footer>
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

        {/* Sidebar - Tablet/Mobile (slide-over drawer) */}
        <Drawer
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          side="left"
          title="Folders"
        >
          <div className="p-3">
            <FolderSidebar
              selectedFolderId={selectedFolderId}
              onFolderSelect={(id) => {
                setSelectedFolderId(id);
                setSidebarOpen(false);
              }}
              compact
            />
          </div>
        </Drawer>

        {/* Main content */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Header bar */}
          <div className="neu-floating-card flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setSidebarOpen(true)}
                className="xl:hidden h-9 w-9 neu-button rounded-xl"
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
