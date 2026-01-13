import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SignInButton } from '@clerk/clerk-react';
import { 
  CloudUpload, 
  Mic, 
  ClipboardCheck, 
  Layers, 
  Plus,
  Loader2,
  FolderOpen,
  FileVideo,
  FileAudio,
  FileText,
  Presentation,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { TranscriptionList } from '@/components/TranscriptionList';
import { FolderSidebar } from '@/components/FolderSidebar';
import { TagFilter } from '@/components/TagFilter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Drawer } from '@/components/ui/drawer';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const mainFeatures = [
  {
    icon: CloudUpload,
    title: 'Drop Anything',
    description: 'We accept Audio, Video, PDF, and PowerPoint. Just drag and drop your lecture materials.',
    color: 'text-status-info',
    bg: 'bg-status-info-soft',
  },
  {
    icon: Mic,
    title: 'AI Transcription',
    description: 'Our AI instantly extracts text and speech, creating a perfect searchable transcript.',
    color: 'text-status-purple',
    bg: 'bg-status-purple-soft',
  },
  {
    icon: ClipboardCheck,
    title: 'Interactive Quizzes',
    description: 'Automatically generate quizzes to test your understanding of the core concepts.',
    color: 'text-status-success',
    bg: 'bg-status-success-soft',
  },
  {
    icon: Layers,
    title: 'Smart Flashcards',
    description: 'Complex topics are broken down into easy-to-review flashcards for long-term retention.',
    color: 'text-status-warning',
    bg: 'bg-status-warning-soft',
  },
];

const secondaryFeatures = [
  { icon: FileAudio, text: 'Audio (MP3, WAV, M4A)' },
  { icon: FileVideo, text: 'Video (MP4, MOV, AVI)' },
  { icon: FileText, text: 'PDF Documents' },
  { icon: Presentation, text: 'PowerPoint Slides' },
  { icon: CheckCircle2, text: 'Automatic Summarization' },
  { icon: CheckCircle2, text: 'Key Concept Extraction' },
  { icon: CheckCircle2, text: 'Study Folders & Tags' },
  { icon: CheckCircle2, text: 'Cross-platform Sync' },
];

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
      <div className="min-h-screen flex flex-col">
        {/* Simple Background - No heavy animations */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-linear-to-b from-primary/5 via-transparent to-transparent" />
        </div>

        {/* Hero Section */}
        <div className="relative flex-1 flex flex-col items-center justify-center text-center px-4 pt-24 pb-20 max-w-7xl mx-auto w-full">
          <div className="relative space-y-8 max-w-4xl animate-fade-in-up p-8 sm:p-12 lg:p-16 rounded-[3rem] overflow-hidden">
            {/* Subtle glass effect for the hero area */}
            <div className="absolute inset-0 bg-background/40 backdrop-blur-sm -z-10 rounded-[3rem] border border-white/20 shadow-2xl shadow-primary/5" />
            
            <h1 className="text-4xl sm:text-6xl lg:text-8xl font-extrabold tracking-tight font-display text-foreground leading-[1.05]">
              Transform your <span className="text-primary italic relative">
                Lectures
                <svg className="absolute -bottom-2 left-0 w-full h-3 text-primary/20" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0 5 Q 25 0, 50 5 T 100 5" fill="none" stroke="currentColor" strokeWidth="4" />
                </svg>
              </span> into <br className="hidden sm:block" />
              Study Mastery
            </h1>
            
            <p className="text-lg sm:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed px-4 font-medium">
              Upload recordings, PDFs, or slides. We'll handle the transcription, 
              summarization, and generate the perfect study materials for you.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8 px-4">
              <SignInButton mode="modal">
                <Button 
                  size="xl" 
                  className="w-full sm:w-auto h-16 px-10 text-xl font-bold neu-button-primary rounded-[1.25rem] group flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-primary/20"
                >
                  <div className="bg-white rounded-xl p-2 mr-4 flex items-center justify-center shadow-lg shrink-0 transition-transform group-hover:rotate-[-5deg]">
                    <svg className="w-6 h-6" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  </div>
                  Sign in with Google
                </Button>
              </SignInButton>
              
              <Button 
                variant="ghost" 
                size="xl" 
                className="w-full sm:w-auto h-16 px-10 text-xl font-bold rounded-[1.25rem] group flex items-center justify-center transition-all hover:bg-white/50 backdrop-blur-sm"
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              >
                How it works
                <ArrowRight className="ml-3 h-6 w-6 transition-transform group-hover:translate-x-2" />
              </Button>
            </div>
          </div>
        </div>

        {/* Core Features Grid */}
        <div id="features" className="py-20 px-4 relative">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16 space-y-4">
              <h2 className="text-3xl sm:text-4xl font-bold font-display tracking-tight">Everything you need to study smarter</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Notism uses state-of-the-art AI to transform your learning materials into active study tools.
              </p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
              {mainFeatures.map((feature) => (
                <Card 
                  key={feature.title} 
                  className="neu-floating-card border-none hover:translate-y-[-4px] transition-all duration-300 rounded-[2rem] overflow-hidden group/card"
                >
                  <CardContent className="p-6 lg:p-8">
                    <div className={`
                      w-14 h-14 lg:w-16 lg:h-16 rounded-2xl ${feature.bg} 
                      flex items-center justify-center mb-6 neu-icon-container
                    `}>
                      <feature.icon className={`w-7 h-7 lg:w-8 lg:h-8 ${feature.color}`} />
                    </div>
                    <h3 className="text-lg lg:text-xl font-bold mb-3 font-display tracking-tight">{feature.title}</h3>
                    <p className="text-sm lg:text-base text-muted-foreground leading-relaxed">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        {/* Expanded Capabilities Section */}
        <div className="py-24 px-4 max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
            <div className="space-y-10 order-2 lg:order-1">
              <div className="space-y-4">
                <h2 className="text-3xl sm:text-5xl font-bold font-display tracking-tight leading-tight">
                  From raw media to <br />
                  <span className="text-primary italic">ready-to-use</span> knowledge.
                </h2>
                <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-xl">
                  Whether it's a 2-hour lecture recording or a 100-page PDF, 
                  our system handles the heavy lifting so you can focus on learning.
                </p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {secondaryFeatures.map((feature) => (
                  <div key={feature.text} className="flex items-center space-x-3 p-4 rounded-2xl bg-muted/40 border border-border/50 hover:bg-muted/60 hover:border-primary/30 transition-all duration-200 group cursor-default">
                    <div className="p-2.5 rounded-xl bg-card shadow-sm group-hover:text-primary transition-colors duration-200 neu-icon-container">
                      <feature.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                    <span className="font-semibold text-xs sm:text-sm tracking-tight">{feature.text}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative group order-1 lg:order-2 w-full">
              <div className="absolute -inset-10 bg-primary/5 rounded-[3rem] blur-3xl opacity-50" />
              {/* Safari Fix: Use a container with explicit padding for aspect ratio fallback */}
              <div className="relative w-full overflow-hidden neu-floating-card rounded-[2.5rem] border-none shadow-2xl">
                <div className="aspect-square sm:aspect-video lg:aspect-square xl:aspect-video flex items-center justify-center p-6 sm:p-10">
                  {/* Visual placeholder for the app interface */}
                  <div className="w-full h-full rounded-2xl bg-muted/30 border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center space-y-6 p-6 text-center shadow-inner">
                    <div className="p-5 rounded-3xl bg-background text-primary neu-icon-container shadow-xl">
                      <CloudUpload className="h-10 w-10 sm:h-12 sm:w-12" />
                    </div>
                    <div className="space-y-2">
                      <p className="font-bold text-xl sm:text-2xl font-display tracking-tight">Ready for your first upload?</p>
                      <p className="text-muted-foreground text-sm sm:text-base max-w-xs mx-auto">Drag and drop your lecture video or audio file right here.</p>
                    </div>
                    <Button 
                      className="neu-button-primary rounded-xl px-10 h-12 text-base font-semibold transition-all hover:scale-105 active:scale-95 shadow-lg"
                      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    >
                      Select File
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="py-16 text-center text-sm text-muted-foreground mt-auto">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-8">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg neu-icon-container">
                <span className="text-white font-bold text-xl">N</span>
              </div>
              <div className="text-left">
                <span className="block font-bold text-foreground text-xl font-display tracking-tight">Notism</span>
                <span className="text-xs text-muted-foreground">© 2026. All rights reserved.</span>
              </div>
            </div>
            <div className="flex items-center space-x-8">
              <a href="#" className="hover:text-primary font-medium transition-colors duration-200 underline-offset-4 hover:underline">Privacy</a>
              <a href="#" className="hover:text-primary font-medium transition-colors duration-200 underline-offset-4 hover:underline">Terms</a>
              <a href="#" className="hover:text-primary font-medium transition-colors duration-200 underline-offset-4 hover:underline">Contact</a>
            </div>
          </div>
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
