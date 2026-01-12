import { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  CloudUpload, 
  Mic, 
  ClipboardCheck, 
  Layers, 
  Plus,
  Loader2,
  Sparkles,
  FolderOpen
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { TranscriptionList } from '@/components/TranscriptionList';
import { FolderSidebar } from '@/components/FolderSidebar';
import { TagFilter } from '@/components/TagFilter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Drawer } from '@/components/ui/drawer';

const features = [
  {
    icon: CloudUpload,
    title: '1. Upload',
    description: 'Drop your lecture recording (audio or video)',
    color: 'text-status-info',
    bg: 'bg-status-info-soft',
  },
  {
    icon: Mic,
    title: '2. Transcribe',
    description: 'AI converts speech to structured text',
    color: 'text-status-purple',
    bg: 'bg-status-purple-soft',
  },
  {
    icon: ClipboardCheck,
    title: '3. Quiz',
    description: 'Generate quizzes to test your knowledge',
    color: 'text-status-success',
    bg: 'bg-status-success-soft',
  },
  {
    icon: Layers,
    title: '4. Flashcards',
    description: 'Create flashcards for key concepts',
    color: 'text-status-warning',
    bg: 'bg-status-warning-soft',
  },
];

export function HomePage() {
  const { isAuthenticated, isLoading, signIn } = useAuth();
  
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
      <div className="min-h-[80vh] flex flex-col">
        {/* Hero Section */}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-12">
          <div className="space-y-4 max-w-2xl animate-fade-in-up">
            {/* AI Badge */}
            <div className="inline-flex items-center rounded-full border border-status-success/30 bg-status-success-soft px-3 py-1.5 text-sm text-status-success mb-4">
              <span className="relative flex h-2 w-2 mr-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-status-success"></span>
              </span>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Powered by AI
            </div>
            
            {/* Hero Title - More vibrant gradient */}
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-linear-to-br from-foreground via-foreground/90 to-primary/80 bg-clip-text text-transparent">
              Turn Lectures into <br className="hidden sm:block" />
              Study Materials
            </h1>
            
            <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
              Upload audio or video recordings and get AI-powered transcriptions, 
              quizzes, and flashcards to supercharge your learning.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 mt-8 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            <Button 
              size="lg" 
              onClick={signIn} 
              className="text-base px-8 neu-button-primary"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </Button>
          </div>
        </div>

        {/* Features Section */}
        <div className="py-16 px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-12">How it works</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {features.map((feature, index) => (
                <Card 
                  key={feature.title} 
                  className="border-0 bg-transparent shadow-none group"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <CardContent className="py-6 text-center">
                    <div className={`
                      mx-auto w-14 h-14 rounded-2xl ${feature.bg} 
                      flex items-center justify-center mb-4
                      transition-transform duration-200 group-hover:scale-110
                    `}>
                      <feature.icon className={`w-7 h-7 ${feature.color}`} />
                    </div>
                    <h3 className="font-semibold mb-1">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="py-6 text-center text-sm text-muted-foreground border-t">
          <p>Lecture - AI-powered learning assistant</p>
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
                <p className="text-xs text-muted-foreground hidden sm:block">Upload lectures and study smarter</p>
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
