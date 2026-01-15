import { useEffect, useState, useCallback, useRef, memo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Transcription, Quiz, FlashcardDeck, SourceFileDownload } from '@lecture/shared';
  import { 
    ArrowLeft, 
    Trash2, 
    RefreshCw, 
    Download, 
    ClipboardCheck, 
    Layers,
    Loader2,
    Clock,
    Globe,
    AlertCircle,
    Eye,
    FileText,
    Presentation,
    Share2,
    Check,
    Lock,
    Unlock,
    Music,
    Video,
    MoreVertical
  } from 'lucide-react';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Button } from '@/components/ui/button';
  import { Badge } from '@/components/ui/badge';
  import { Progress } from '@/components/ui/progress';
  import { Skeleton } from '@/components/ui/skeleton';
  import { QuizView } from '@/components/QuizView';
  import { FlashcardView } from '@/components/FlashcardView';
  import { Markdown } from '@/components/Markdown';
  import { TableOfContents } from '@/components/TableOfContents';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu';

import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate, formatDuration, getStatusStyles, type TranscriptionStatus } from '@/lib/utils';

const StatusBadge = memo(function StatusBadge({ status }: { status: TranscriptionStatus }) {
  const styles = getStatusStyles(status);
  
  const statusClass = {
    pending: '',
    processing: 'status-info',
    structuring: 'status-purple',
    completed: 'status-success',
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

  const fetchTranscription = useCallback(async () => {
    if (!id) return;
    try {
      // Try authenticated route first
      try {
        const data = await api.getTranscription(id);
        setTranscription(data);
      } catch (authErr) {
        // If auth fails, try public route
        try {
          const data = await api.getPublicTranscription(id);
          setTranscription(data);
        } catch {
          // Both failed, show error
          throw authErr;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transcription');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const transcriptionStatus = transcription?.status;

  useEffect(() => {
    fetchTranscription();
  }, [fetchTranscription]);

  useEffect(() => {
    // Poll for updates if processing
    if (
      !transcriptionStatus ||
      (transcriptionStatus !== 'processing' &&
        transcriptionStatus !== 'structuring' &&
        transcriptionStatus !== 'pending')
    ) {
      return;
    }

    const interval = setInterval(() => {
      fetchTranscription();
    }, 3000);

    return () => clearInterval(interval);
  }, [transcriptionStatus, fetchTranscription]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update title');
    }
  }, [id, transcription]);

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

  const handleDownloadSourceFile = async (file: SourceFileDownload) => {
    if (!id || !transcription) return;

    setActiveSourceDownload(file.originalName);
    try {
      const files = await api.getSourceDownloadUrls(id, !isAuthenticated && transcription.isPublic);
      setSourceFiles(files);

      const latestFile = files.find((item) => item.originalName === file.originalName) ?? file;
      const a = document.createElement('a');
      const fallbackName = transcription.originalFileName?.trim() || `${transcription.title}.${getSourceExtension(transcription)}`;
      a.href = latestFile.url;
      a.download = latestFile.originalName?.trim() || fallbackName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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

      const a = document.createElement('a');
      a.href = pdfUrl;
      a.download = `${transcription.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      if (!transcription.pdfKey) {
        await fetchTranscription();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download PDF');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleRetry = async () => {
    if (!id) return;
    try {
      await api.startTranscription(id);
      fetchTranscription();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry');
    }
  };

  const handleRecreateNote = async () => {
    if (!id) return;
    setIsRecreatingNote(true);
    setError(null);
    try {
      await api.restructureTranscription(id);
      fetchTranscription();
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
            <Link to="/">
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

  return (
    <div className="max-w-6xl mx-auto animate-fade-in-up">
      <div className="flex gap-8">
        {/* Left sidebar - Back button and Table of Contents (hidden on mobile) */}
        <aside className="toc-sidebar hidden lg:block w-56 flex-shrink-0 sticky top-6 self-start max-h-[calc(100vh-3rem)]">
          <div className="mb-4">
            <Link to="/">
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
          <div className="flex items-center justify-between py-5 px-4 bg-muted/40 rounded-xl border border-border/50 mb-8">
            {/* Left side - Study actions */}
            <div className="flex items-center gap-1.5">
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
                    <span className="hidden sm:inline ml-1.5">Quiz</span>
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
                    <span className="hidden sm:inline ml-1.5">Flashcards</span>
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
            <div className="flex items-center gap-1.5">
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
                  <div className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="w-2.5 h-2.5 rounded-full bg-status-info animate-pulse-soft shadow-lg shadow-status-info/50" />
                      {transcription.status === 'pending' && 'Waiting to start...'}
                      {transcription.status === 'processing' && 'Transcribing audio...'}
                      {transcription.status === 'structuring' && 'Structuring notes...'}
                    </span>
                    <span className="font-bold text-primary">{Math.round(transcription.progress * 100)}%</span>
                  </div>
                  <Progress value={transcription.progress * 100} className="h-2" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Content */}
          {isCompleted && (
            <div className="document-content">
              {/* View toggle - Enhanced styling */}
              <div className="flex items-center justify-between mb-6 p-4 bg-muted/30 rounded-xl border border-border/50">
                <div className="text-sm font-medium text-muted-foreground">
                  {transcription.whisperModel && (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary/60 animate-pulse" />
                      Model: {transcription.whisperModel}
                    </span>
                  )}
                </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRaw(!showRaw)}
                    className="neu-button hover:bg-primary/10 transition-all duration-200"
                  >
                  <Eye className="h-4 w-4 mr-2" />
                  {showRaw ? 'Show Structured' : 'Show Raw'}
                </Button>
              </div>

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
                            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-background/70 border border-border/50">
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
                    className="neu-button w-full"
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
