import { useEffect, useState, useCallback, useRef, memo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ClipboardCheck,
  Clock,
  Download,
  Eye,
  FileText,
  Globe,
  Layers,
  Loader2,
  Lock,
  MoreVertical,
  Music,
  Presentation,
  RefreshCw,
  Share2,
  Trash2,
  Unlock,
  Video,
} from 'lucide-react';
import type { FlashcardDeck, Quiz, SourceFileDownload, Transcription } from '@lecture/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FlashcardView } from '@/components/FlashcardView';
import { Markdown } from '@/components/Markdown';
import { Progress } from '@/components/ui/progress';
import { QuizView } from '@/components/QuizView';
import { Skeleton } from '@/components/ui/skeleton';
import { TableOfContents } from '@/components/TableOfContents';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useTranscriptionCache } from '@/contexts/TranscriptionCacheContext';
import { formatDate, formatDuration, getStatusStyles, type TranscriptionStatus } from '@/lib/utils';

const StatusBadge = memo(function StatusBadge({ status }: { status: TranscriptionStatus }) {
  const styles = getStatusStyles(status);
  
  const statusClass = {
    pending: '',
    processing: 'status-info',
    structuring: 'status-purple',
    completed: 'status-success',
    canceled: 'status-warning',
    error: '',
  }[status];

  if (status === 'pending') {
    return <Badge variant="secondary">{styles.label}</Badge>;
  }
  
  if (status === 'error') {
    return <Badge variant="destructive">{styles.label}</Badge>;
  }
  
  return <Badge className={statusClass}>{styles.label}</Badge>;
});

const getProgressLabel = (status: TranscriptionStatus, progressValue: number): string => {
  if (status === 'pending') {
    return 'Queued for processing';
  }

  if (status === 'structuring') {
    return progressValue >= 95 ? 'Finalizing notes' : 'Structuring notes';
  }

  if (status === 'processing') {
    if (progressValue < 5) return 'Preparing upload';
    if (progressValue < 15) return 'Preparing audio';
    if (progressValue < 85) return 'Transcribing audio';
    if (progressValue < 90) return 'Wrapping up transcript';
    return 'Final review';
  }

  return 'Processing';
};

type StudyMode = 'none' | 'quiz' | 'flashcards';

interface EditableTitleProps {
  value: string;
  onChange: (newTitle: string) => void;
}

const EditableTitle = memo(function EditableTitle({ value, onChange }: EditableTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [displayValue, setDisplayValue] = useState(value);
  const draftValueRef = useRef(displayValue);
  const prevValueRef = useRef(value);
  const titleRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (value !== prevValueRef.current) {
      setDisplayValue(value);
      draftValueRef.current = value;
      prevValueRef.current = value;
    }
  }, [value]);

  useEffect(() => {
    if (isEditing && titleRef.current) {
      titleRef.current.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(titleRef.current);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    const nextValue = draftValueRef.current.trim();
    if (!nextValue) {
      if (titleRef.current) {
        titleRef.current.textContent = displayValue;
      }
      draftValueRef.current = displayValue;
      setIsEditing(false);
      return;
    }

    setDisplayValue(nextValue);
    draftValueRef.current = nextValue;
    if (nextValue !== value) {
      onChange(nextValue);
    }
    setIsEditing(false);
  }, [value, onChange, displayValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (titleRef.current) {
        titleRef.current.textContent = displayValue;
      }
      draftValueRef.current = displayValue;
      setIsEditing(false);
    }
  }, [handleSave, displayValue]);

  const handleStartEdit = useCallback(() => {
    if (titleRef.current) {
      titleRef.current.textContent = displayValue;
    }
    draftValueRef.current = displayValue;
    setIsEditing(true);
  }, [displayValue]);

  return (
    <h1
      className="editable-title text-3xl font-bold tracking-tight"
      title="Click to edit title"
      onClick={handleStartEdit}
    >
      <span
        ref={titleRef}
        contentEditable={isEditing}
        suppressContentEditableWarning
        onInput={(event) => {
          draftValueRef.current = event.currentTarget.textContent ?? '';
        }}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`inline-block cursor-text focus:outline-none transition-[background-color,box-shadow] duration-150 ${
          isEditing
            ? 'text-foreground bg-muted/40 shadow-inner rounded-md caret-primary px-2 py-1'
            : 'hover:text-primary/80 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent px-2 py-1'
        }`}
      >
        {displayValue}
      </span>
    </h1>
  );
});

export function TranscriptionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const {
    getCachedTranscription,
    cacheTranscriptionDetail,
    invalidateTranscriptionDetail,
  } = useTranscriptionCache();
  const [transcription, setTranscription] = useState<Transcription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [showRaw, setShowRaw] = useState(false);
  
  // Study features
  const [studyMode, setStudyMode] = useState<StudyMode>('none');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [flashcards, setFlashcards] = useState<FlashcardDeck | null>(null);
  const [flashcardDecks, setFlashcardDecks] = useState<FlashcardDeck[]>([]);
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);
  const [isLoadingFlashcards, setIsLoadingFlashcards] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [sourceFiles, setSourceFiles] = useState<SourceFileDownload[]>([]);
  const [isLoadingSourceFiles, setIsLoadingSourceFiles] = useState(false);
  const [activeSourceDownload, setActiveSourceDownload] = useState<string | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isRecreatingNote, setIsRecreatingNote] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);


  const transcriptionStatus = transcription?.status;

  useEffect(() => {
    if (!id) return;

    let isMounted = true;

    const cached = getCachedTranscription(id, { includeListCache: true });
    if (cached) {
      if (isMounted) {
        setTranscription(cached);
        setIsLoading(false);
      }
      // Silently refresh in background
      (async () => {
        try {
          const data = await api.getTranscription(id);
          if (isMounted) {
            setTranscription(data);
            cacheTranscriptionDetail(data);
          }
        } catch {
          // Ignore errors on silent refresh
        }
      })();
      return;
    }

    // Initial fetch
    (async () => {
      if (isMounted) setIsLoading(true);
      try {
        try {
          const data = await api.getTranscription(id);
          if (isMounted) {
            setTranscription(data);
            cacheTranscriptionDetail(data);
          }
        } catch {
          const data = await api.getPublicTranscription(id);
          if (isMounted) {
            setTranscription(data);
            cacheTranscriptionDetail(data);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load transcription');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [id]);

  useEffect(() => {
    // Connect to SSE for real-time updates if processing
    if (
      !transcriptionStatus ||
      (transcriptionStatus !== 'processing' &&
        transcriptionStatus !== 'structuring' &&
        transcriptionStatus !== 'pending')
    ) {
      return;
    }

    if (!isAuthenticated || !id) {
      return;
    }

    const eventSource = new EventSource('/api/transcriptions/events');

    const handleTranscriptionUpdate = (event: Event) => {
      const messageEvent = event as MessageEvent;
      try {
        const payload = JSON.parse(messageEvent.data) as {
          transcriptionId: string;
          status: TranscriptionStatus;
          progress: number;
          errorMessage?: string | null;
        };

        // Only update if this is for the current transcription
        if (payload.transcriptionId === id) {
          setTranscription(prev =>
            prev
              ? {
                  ...prev,
                  status: payload.status,
                  progress: payload.progress,
                }
              : null
          );

          // Close connection when processing is done
          if (
            payload.status === 'completed' ||
            payload.status === 'error' ||
            payload.status === 'canceled'
          ) {
            eventSource.close();
            // Refresh data after processing completes
            (async () => {
              try {
                const data = await api.getTranscription(id);
                setTranscription(data);
                cacheTranscriptionDetail(data);
              } catch {
                // Ignore errors
              }
            })();
          }
        }
      } catch (err) {
        console.error('Failed to parse transcription event:', err);
      }
    };

    eventSource.addEventListener('transcription', handleTranscriptionUpdate);
    eventSource.addEventListener('ping', () => {
      // Heartbeat, no action needed
    });

    eventSource.onerror = () => {
      console.error('SSE connection error');
      eventSource.close();
    };

    return () => {
      eventSource.removeEventListener('transcription', handleTranscriptionUpdate);
      eventSource.close();
    };
  }, [transcriptionStatus, isAuthenticated, id]);

  useEffect(() => {
    if (!id || !transcription) return;

    let isActive = true;

    const loadSourceFiles = async () => {
      setIsLoadingSourceFiles(true);
      try {
        const files = await api.getSourceDownloadUrls(id, !isAuthenticated && transcription.isPublic);
        if (isActive) {
          setSourceFiles(files);
        }
      } catch {
        if (isActive) {
          setSourceFiles([]);
        }
      } finally {
        if (isActive) {
          setIsLoadingSourceFiles(false);
        }
      }
    };

    loadSourceFiles();

    return () => {
      isActive = false;
    };
  }, [id, transcription?.isPublic, isAuthenticated]);

  const handleTitleChange = useCallback(async (newTitle: string) => {
    if (!id || !transcription) return;
    try {
      await api.updateTranscription(id, { title: newTitle });
      setTranscription(prev => prev ? { ...prev, title: newTitle } : null);
      invalidateTranscriptionDetail(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update title');
    }
  }, [id, invalidateTranscriptionDetail, transcription]);

  const handleDelete = async () => {
    if (!id || !confirm('Are you sure you want to delete this transcription?')) return;

    setIsDeleting(true);
    try {
      await api.deleteTranscription(id);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setIsDeleting(false);
    }
  };

  

  const getSourceExtension = (current: Transcription) => {
    const originalName = current.originalFileName?.trim();
    if (originalName && originalName.includes('.')) {
      const extension = originalName.split('.').pop();
      if (extension) {
        return extension;
      }
    }

    const mimeType = current.mimeType ?? '';
    const mimeExtensionMap: Record<string, string> = {
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'audio/wav': 'wav',
      'video/mp4': 'mp4',
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    };

    return (
      mimeExtensionMap[mimeType] ??
      (current.sourceType === 'audio'
        ? 'mp3'
        : current.sourceType === 'video'
          ? 'mp4'
          : current.sourceType)
    );
  };

  const getSourceFileIcon = (file: SourceFileDownload) => {
    switch (file.sourceType) {
      case 'video':
        return Video;
      case 'audio':
        return Music;
      case 'pdf':
        return FileText;
      case 'ppt':
      case 'pptx':
        return Presentation;
      default:
        return FileText;
    }
  };

  const triggerDownload = async (url: string, filename: string) => {
    // For same-origin URLs (backend endpoints), use simple redirect
    if (url.startsWith('/')) {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return;
    }

    // For external URLs, fetch as blob (used for source file downloads)
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to download file');
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const handleDownloadSourceFile = async (file: SourceFileDownload) => {
    if (!id || !transcription) return;

    setActiveSourceDownload(file.originalName);
    try {
      const files = await api.getSourceDownloadUrls(id, !isAuthenticated && transcription.isPublic);
      setSourceFiles(files);

      const latestFile = files.find((item) => item.originalName === file.originalName) ?? file;
      const fallbackName = transcription.originalFileName?.trim() || `${transcription.title}.${getSourceExtension(transcription)}`;
      await triggerDownload(latestFile.url, latestFile.originalName?.trim() || fallbackName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download source file');
    } finally {
      setActiveSourceDownload(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (!id || !transcription) return;

    setIsDownloadingPdf(true);
    try {
      const pdfUrl = transcription.pdfKey
        ? await api.getPdfDownloadUrl(id)
        : await api.generatePdf(id);

      await triggerDownload(pdfUrl, `${transcription.title}.pdf`);

      if (!transcription.pdfKey) {
        try {
          const data = await api.getTranscription(id);
          setTranscription(data);
          cacheTranscriptionDetail(data);
        } catch {
          // Ignore errors on silent refresh
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download PDF');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleRetry = async () => {
    if (!id || !transcription) return;
    try {
      await api.reprocessTranscription(id);
      try {
        const data = await api.getTranscription(id);
        setTranscription(data);
        cacheTranscriptionDetail(data);
      } catch {
        // Ignore errors on silent refresh
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry transcription');
    }
  };

  const handleCancel = async () => {
    if (!id || !transcription) return;
    setIsCanceling(true);

    try {
      await api.cancelTranscription(id);
      setTranscription(prev => prev ? { ...prev, status: 'canceled' } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel transcription');
    } finally {
      setIsCanceling(false);
    }
  };

  const handleRecreateNote = async () => {
    if (!id) return;
    setIsRecreatingNote(true);
    setError(null);
    try {
      await api.restructureTranscription(id);
      invalidateTranscriptionDetail(id);
      try {
        const data = await api.getTranscription(id);
        setTranscription(data);
        cacheTranscriptionDetail(data);
      } catch {
        // Ignore errors on silent refresh
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate notes');
    } finally {
      setIsRecreatingNote(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!id) return;
    
    if (quiz) {
      setStudyMode('quiz');
      return;
    }
    
    setIsLoadingQuiz(true);
    setError(null);
    try {
      const storedQuiz = await api.getQuiz(id);
      if (storedQuiz) {
        setQuiz(storedQuiz);
        setStudyMode('quiz');
        return;
      }
    } catch {
      // Ignore fetch errors, will try to generate
    } finally {
      setIsLoadingQuiz(false);
    }
    
    setIsGeneratingQuiz(true);
    try {
      const generatedQuiz = await api.regenerateQuiz(id, 10);
      setQuiz(generatedQuiz);
      setStudyMode('quiz');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate quiz');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleGenerateFlashcards = async () => {
    if (!id) return;
    
    if (flashcards) {
      setStudyMode('flashcards');
      return;
    }
    
    setIsLoadingFlashcards(true);
    setError(null);
    try {
      const response = await api.getFlashcards(id);
      if (response && response.deck) {
        setFlashcards(response.deck);
        setFlashcardDecks(response.decks || [response.deck]);
        setStudyMode('flashcards');
        return;
      }
    } catch {
      // Ignore fetch errors, will try to generate
    } finally {
      setIsLoadingFlashcards(false);
    }
    
    setIsGeneratingFlashcards(true);
    try {
      const generatedDeck = await api.regenerateFlashcards(id, 20);
      setFlashcards(generatedDeck);
      setFlashcardDecks(prev => [generatedDeck, ...prev]);
      setStudyMode('flashcards');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate flashcards');
    } finally {
      setIsGeneratingFlashcards(false);
    }
  };

  const handleRegenerateQuiz = async () => {
    if (!id) return;
    setIsGeneratingQuiz(true);
    setError(null);
    try {
      const generatedQuiz = await api.regenerateQuiz(id, 10);
      setQuiz(generatedQuiz);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate quiz');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleRegenerateFlashcards = async () => {
    if (!id) return;
    setIsGeneratingFlashcards(true);
    setError(null);
    try {
      const generatedDeck = await api.regenerateFlashcards(id, 20);
      setFlashcards(generatedDeck);
      setFlashcardDecks(prev => [generatedDeck, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate flashcards');
    } finally {
      setIsGeneratingFlashcards(false);
    }
  };

  const handleShare = async () => {
    if (!id || !transcription) return;
    
    // Use public URL if transcription is public, otherwise use regular URL
    const baseUrl = window.location.origin;
    const url = transcription.isPublic 
      ? `${baseUrl}/transcription/${id}` // Public URL (will be handled by public route)
      : window.location.href; // Regular URL (requires auth)
    
    try {
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleToggleVisibility = async () => {
    if (!id || !transcription || !isAuthenticated) return;
    
    const newIsPublic = !transcription.isPublic;
    setIsUpdatingVisibility(true);
    try {
      await api.updateTranscription(id, { isPublic: newIsPublic });
      setTranscription(prev => prev ? { ...prev, isPublic: newIsPublic } : null);
      invalidateTranscriptionDetail(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update visibility');
    } finally {
      setIsUpdatingVisibility(false);
    }
  };

  // Show Quiz view
  if (studyMode === 'quiz' && quiz) {
    return (
      <div className="max-w-4xl mx-auto">
        <QuizView 
          quiz={quiz} 
          onClose={() => setStudyMode('none')} 
          onRegenerate={handleRegenerateQuiz}
          isRegenerating={isGeneratingQuiz}
        />
      </div>
    );
  }

  // Show Flashcard view
  if (studyMode === 'flashcards' && flashcards) {
    return (
      <div className="max-w-4xl mx-auto">
        <FlashcardView 
          deck={flashcards} 
          decks={flashcardDecks}
          transcriptionId={id}
          onClose={() => setStudyMode('none')} 
          onRegenerate={handleRegenerateFlashcards}
          isRegenerating={isGeneratingFlashcards}
          onDeckSelect={setFlashcards}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex gap-6">
          {/* TOC skeleton */}
          <div className="hidden lg:block w-56 flex-shrink-0">
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
          {/* Content skeleton */}
          <div className="flex-1 space-y-6">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-4 w-48" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-32" />
            </div>
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error && !transcription) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card className="border-status-error/30 bg-status-error-soft">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-status-error mb-4">
              <AlertCircle className="h-5 w-5" />
              <p>{error || 'Transcription not found'}</p>
            </div>
            <Link to="/app">
              <Button variant="outline" className="neu-button">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!transcription) {
    return null;
  }

  const isProcessing =
    transcription.status === 'processing' ||
    transcription.status === 'structuring' ||
    transcription.status === 'pending';

  const isCompleted = transcription.status === 'completed';
  const content = transcription.structuredText || transcription.transcriptionText || '';
  const showSourcePanel = isLoadingSourceFiles || sourceFiles.length > 0;
  const sourcePanelTitle = sourceFiles.length > 1 ? 'Sources' : 'Source';
  const progressValue = Math.round((transcription.progress ?? 0) * 100);
  const progressLabel = getProgressLabel(transcription.status as TranscriptionStatus, progressValue);

  return (
    <div className="max-w-6xl mx-auto animate-fade-in-up">
      <div className="flex gap-8">
        {/* Left sidebar - Back button and Table of Contents (hidden on mobile) */}
        <aside className="toc-sidebar hidden lg:block w-56 flex-shrink-0 sticky top-6 self-start max-h-[calc(100vh-3rem)]">
          <div className="mb-4">
            <Link to="/app">
              <Button variant="outline" className="neu-button w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
          </div>
          {isCompleted && content && (
            <TableOfContents content={content} maxHeight="calc(100vh - 10rem)" />
          )}
        </aside>

        {/* Main content area */}
        <main className="flex-1 min-w-0 document-content">
          {/* Header section with gradient background */}
          <div className="mb-8 pb-6 border-b border-border/60 relative">
            {/* Subtle gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent -z-10 rounded-2xl opacity-50" />
            
            {/* Editable Title */}
            <div className="mb-4">
              {isAuthenticated ? (
                <EditableTitle 
                  value={transcription.title} 
                  onChange={handleTitleChange}
                />
              ) : (
                <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                  {transcription.title}
                </h1>
              )}
            </div>

            {/* Status badge (inline with title area when not completed) */}
            {!isCompleted && (
              <div className="mb-4">
                <StatusBadge status={transcription.status as TranscriptionStatus} />
              </div>
            )}

            {/* Property row (metadata) - Skeuomorphic styling */}
            <div className="flex flex-wrap gap-3 mt-2">
              <div className="neu-button-subtle flex items-center gap-2 px-4 py-2 select-none cursor-default">
                <Clock className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">{formatDate(transcription.createdAt, 'long')}</span>
              </div>
              
              {!!transcription.audioDuration && !['pdf', 'pptx', 'ppt', 'docx'].includes(transcription.sourceType) && !transcription.whisperModel?.toLowerCase().includes('document') && (
                <div className="neu-button-subtle flex items-center gap-2 px-4 py-2 select-none cursor-default">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">{formatDuration(transcription.audioDuration)}</span>
                </div>
              )}
              
              {transcription.detectedLanguage && (
                <div className="neu-button-subtle flex items-center gap-2 px-4 py-2 select-none cursor-default">
                  <Globe className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">{transcription.detectedLanguage}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action bar - Enhanced styling */}
          <div className="flex flex-col gap-3 py-5 px-4 bg-muted/40 rounded-xl border border-border/50 mb-8 sm:flex-row sm:items-center sm:justify-between">
            {/* Left side - Study actions */}
            <div className="flex flex-wrap items-center gap-2">
              {isCompleted && isAuthenticated && (
                <>
                  <Button
                    onClick={handleGenerateQuiz}
                    disabled={isLoadingQuiz || isGeneratingQuiz || isLoadingFlashcards || isGeneratingFlashcards}
                    size="sm"
                    className="neu-button-info"
                    title={quiz ? 'Continue Quiz' : 'Take Quiz'}
                  >
                    {isLoadingQuiz || isGeneratingQuiz ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ClipboardCheck className="h-4 w-4" />
                    )}
                    <span className="ml-1.5">Quiz</span>
                  </Button>

                  <Button
                    onClick={handleGenerateFlashcards}
                    disabled={isLoadingQuiz || isGeneratingQuiz || isLoadingFlashcards || isGeneratingFlashcards}
                    size="sm"
                    className="neu-button-purple"
                    title={flashcards ? 'Continue Flashcards' : 'Study Flashcards'}
                  >
                    {isLoadingFlashcards || isGeneratingFlashcards ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Layers className="h-4 w-4" />
                    )}
                    <span className="ml-1.5">Flashcards</span>
                  </Button>
                </>
              )}

              {isAuthenticated && transcription.status === 'error' && (
                <Button onClick={handleRetry} variant="outline" size="sm" className="neu-button" title="Retry transcription">
                  <RefreshCw className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1.5">Retry</span>
                </Button>
              )}
            </div>

            {/* Right side - Management actions */}
            <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
              {isAuthenticated && (
                <Button
                  onClick={handleDownloadPdf}
                  disabled={isDownloadingPdf}
                  size="sm"
                  className="neu-button text-foreground xl:hidden"
                  title={transcription.pdfKey ? 'Download structured PDF' : 'Generate PDF'}
                >
                  {isDownloadingPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="ml-2">
                    {isDownloadingPdf
                      ? 'Preparing PDF...'
                      : transcription.pdfKey
                        ? 'Download PDF'
                        : 'Generate PDF'}
                  </span>
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="neu-button"
                    aria-label="Open actions menu"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={handleShare}
                    title={transcription.isPublic ? 'Copy public shareable link' : 'Copy link (requires sign-in)'}
                  >
                    {isCopied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Share2 className="h-4 w-4" />
                    )}
                    <span>{isCopied ? 'Copied!' : 'Copy share link'}</span>
                  </DropdownMenuItem>

                  {isCompleted && (
                    <DropdownMenuItem onClick={() => setShowRaw(!showRaw)}>
                      <Eye className="h-4 w-4" />
                      <span>{showRaw ? 'Show Structured' : 'Show Raw'}</span>
                    </DropdownMenuItem>
                  )}

                  {isAuthenticated && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={handleRecreateNote}
                        disabled={isProcessing || isRecreatingNote || !transcription.transcriptionText}
                      >
                        {isRecreatingNote ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                        <span>{isRecreatingNote ? 'Regenerating...' : 'Regenerate notes'}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleToggleVisibility}
                        disabled={isUpdatingVisibility}
                        title={transcription.isPublic ? 'Make private' : 'Make public'}
                      >
                        {isUpdatingVisibility ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : transcription.isPublic ? (
                          <Unlock className="h-4 w-4" />
                        ) : (
                          <Lock className="h-4 w-4" />
                        )}
                        <span>{transcription.isPublic ? 'Make private' : 'Make public'}</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={handleDelete}
                        disabled={isDeleting}
                        variant="destructive"
                        title="Delete transcription"
                      >
                        {isDeleting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <Card className="border-status-error/30 bg-status-error-soft mb-6">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 text-status-error">
                  <AlertCircle className="h-5 w-5" />
                  <p>{error}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Progress (when processing) - Enhanced styling */}
          {isProcessing && (
            <Card className="mb-6 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="w-2.5 h-2.5 rounded-full bg-status-info animate-pulse-soft shadow-lg shadow-status-info/50" />
                      {progressLabel}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-primary">{progressValue}%</span>
                      {isAuthenticated && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="neu-button-destructive"
                          onClick={handleCancel}
                          disabled={isCanceling}
                        >
                          {isCanceling ? 'Canceling...' : 'Cancel'}
                        </Button>
                      )}
                    </div>
                  </div>
                  <Progress value={progressValue} className="h-2" />
                </div>
              </CardContent>
            </Card>
          )}

          {transcription.status === 'canceled' && (
            <Card className="mb-6 border-status-warning/30 bg-status-warning-soft">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 text-status-warning">
                  <AlertCircle className="h-5 w-5" />
                  <p>Transcription canceled. You can reprocess anytime.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Content */}
          {isCompleted && (
            <div className="document-content">
              {/* Markdown content - Enhanced container */}
              {showRaw ? (
                <div className="bg-gradient-to-br from-muted/40 to-muted/20 rounded-xl border border-border/50 p-6">
                  <pre className="whitespace-pre-wrap text-sm overflow-x-auto font-mono leading-relaxed">
                    {transcription.transcriptionText || 'No raw transcription available'}
                  </pre>
                </div>
              ) : (
                <div className="prose prose-lg max-w-none dark:prose-invert prose-headings:font-semibold prose-p:text-foreground/90 prose-a:text-primary prose-strong:text-foreground prose-code:text-primary">
                  <Markdown 
                    content={content} 
                    collapsible
                  />
                </div>
              )}
            </div>
          )}
        </main>

        {/* Right sidebar - Source file player (hidden on mobile) */}
        {showSourcePanel && (
          <aside className="hidden xl:block w-64 flex-shrink-0 sticky top-6 self-start">
            <Card className="!gap-3 p-4 neu-panel">
              <CardHeader className="p-0">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  {sourcePanelTitle}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 space-y-4">
                {isLoadingSourceFiles ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading sources...</span>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
                    {sourceFiles.map((file) => {
                      const Icon = getSourceFileIcon(file);
                      const isDownloading = activeSourceDownload === file.originalName;

                      return (
                        <button
                          key={`${file.originalName}-${file.sourceType}`}
                          onClick={() => handleDownloadSourceFile(file)}
                          disabled={!!activeSourceDownload}
                          className="w-full flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-3 text-left hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={`Download ${file.originalName}`}
                        >
                          <span className="flex items-center gap-3 min-w-0">
                            <span className="flex h-10 w-10 items-center justify-center">
                              <Icon className="h-5 w-5 text-primary" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-foreground truncate">
                                {file.originalName}
                              </span>
                              <span className="block text-xs text-muted-foreground">Download</span>
                            </span>
                          </span>
                          {isDownloading ? (
                            <Loader2 className="h-4 w-4 text-primary animate-spin" />
                          ) : (
                            <Download className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {isAuthenticated && (
                  <Button
                    onClick={handleDownloadPdf}
                    disabled={isDownloadingPdf}
                    size="sm"
                    className="neu-button w-full text-foreground"
                    title={transcription.pdfKey ? 'Download structured PDF' : 'Generate PDF'}
                  >
                    {isDownloadingPdf ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    <span className="ml-2">
                      {isDownloadingPdf
                        ? 'Preparing PDF...'
                        : transcription.pdfKey
                          ? 'Download PDF'
                          : 'Generate PDF'}
                    </span>
                  </Button>
                )}
              </CardContent>
            </Card>
          </aside>
        )}
      </div>
    </div>
  );
}
