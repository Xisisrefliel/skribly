import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Transcription, Quiz, FlashcardDeck } from '@lecture/shared';
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
  FileText
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { QuizView } from '@/components/QuizView';
import { FlashcardView } from '@/components/FlashcardView';
import { Markdown } from '@/components/Markdown';
import { TableOfContents } from '@/components/TableOfContents';
import { api } from '@/lib/api';
import { formatDate, formatDuration, getStatusStyles, type TranscriptionStatus } from '@/lib/utils';

function StatusBadge({ status }: { status: TranscriptionStatus }) {
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
}

type StudyMode = 'none' | 'quiz' | 'flashcards';

interface EditableTitleProps {
  value: string;
  onChange: (newTitle: string) => void;
  isLoading?: boolean;
}

function EditableTitle({ value, onChange, isLoading }: EditableTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== value) {
      onChange(trimmed);
    } else {
      setEditValue(value);
    }
    setIsEditing(false);
  }, [editValue, value, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  }, [handleSave, value]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="editable-title-input text-2xl font-bold"
        disabled={isLoading}
      />
    );
  }

  return (
    <h1 
      className="editable-title text-2xl font-bold cursor-text"
      onClick={() => setIsEditing(true)}
      title="Click to edit title"
    >
      {value}
      {isLoading && <Loader2 className="inline-block ml-2 h-4 w-4 animate-spin" />}
    </h1>
  );
}

export function TranscriptionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [transcription, setTranscription] = useState<Transcription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  
  // Study features
  const [studyMode, setStudyMode] = useState<StudyMode>('none');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [flashcards, setFlashcards] = useState<FlashcardDeck | null>(null);
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);
  const [isLoadingFlashcards, setIsLoadingFlashcards] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);

  const fetchTranscription = async () => {
    if (!id) return;
    try {
      const data = await api.getTranscription(id);
      setTranscription(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transcription');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTranscription();

    // Poll for updates if processing
    const interval = setInterval(() => {
      if (
        transcription &&
        (transcription.status === 'processing' ||
          transcription.status === 'structuring' ||
          transcription.status === 'pending')
      ) {
        fetchTranscription();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [id, transcription?.status]);

  const handleTitleChange = useCallback(async (newTitle: string) => {
    if (!id || !transcription) return;
    
    setIsSavingTitle(true);
    try {
      await api.updateTranscription(id, { title: newTitle });
      setTranscription(prev => prev ? { ...prev, title: newTitle } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update title');
    } finally {
      setIsSavingTitle(false);
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

  const handleDownloadPdf = async () => {
    if (!id) return;

    setIsGeneratingPdf(true);
    try {
      const { pdfUrl } = await api.generatePdf(id, showRaw ? 'raw' : 'structured');
      window.open(pdfUrl, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate PDF');
    } finally {
      setIsGeneratingPdf(false);
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
      const storedDeck = await api.getFlashcards(id);
      if (storedDeck) {
        setFlashcards(storedDeck);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate flashcards');
    } finally {
      setIsGeneratingFlashcards(false);
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
          onClose={() => setStudyMode('none')} 
          onRegenerate={handleRegenerateFlashcards}
          isRegenerating={isGeneratingFlashcards}
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

  return (
    <div className="max-w-6xl mx-auto animate-fade-in-up">
      <div className="flex gap-8">
        {/* Left sidebar - Table of Contents (hidden on mobile) */}
        {isCompleted && content && (
          <aside className="toc-sidebar hidden lg:block w-56 flex-shrink-0">
            <TableOfContents content={content} />
          </aside>
        )}

        {/* Main content area */}
        <main className="flex-1 min-w-0 document-content">
          {/* Editable Title */}
          <div className="mb-2">
            <EditableTitle 
              value={transcription.title} 
              onChange={handleTitleChange}
              isLoading={isSavingTitle}
            />
          </div>

          {/* Status badge (inline with title area when not completed) */}
          {!isCompleted && (
            <div className="mb-2">
              <StatusBadge status={transcription.status as TranscriptionStatus} />
            </div>
          )}

          {/* Property row (metadata) */}
          <div className="property-row mb-4">
            <div className="property-item">
              <Clock className="h-4 w-4" />
              <span>{formatDate(transcription.createdAt, 'long')}</span>
            </div>
            {transcription.audioDuration && (
              <div className="property-item">
                <FileText className="h-4 w-4" />
                <span>{formatDuration(transcription.audioDuration)}</span>
              </div>
            )}
            {transcription.detectedLanguage && (
              <div className="property-item">
                <Globe className="h-4 w-4" />
                <span>{transcription.detectedLanguage}</span>
              </div>
            )}
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap gap-2 py-4 border-b border-border mb-6">
            <Link to="/">
              <Button variant="outline" className="neu-button">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>

            {isCompleted && (
              <>
                <Button
                  onClick={handleGenerateQuiz}
                  disabled={isLoadingQuiz || isGeneratingQuiz || isLoadingFlashcards || isGeneratingFlashcards}
                  className="neu-button-info"
                >
                  {isLoadingQuiz || isGeneratingQuiz ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {isLoadingQuiz ? 'Loading...' : 'Generating...'}
                    </>
                  ) : (
                    <>
                      <ClipboardCheck className="h-4 w-4 mr-2" />
                      {quiz ? 'Continue Quiz' : 'Take Quiz'}
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleGenerateFlashcards}
                  disabled={isLoadingQuiz || isGeneratingQuiz || isLoadingFlashcards || isGeneratingFlashcards}
                  className="neu-button-purple"
                >
                  {isLoadingFlashcards || isGeneratingFlashcards ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {isLoadingFlashcards ? 'Loading...' : 'Generating...'}
                    </>
                  ) : (
                    <>
                      <Layers className="h-4 w-4 mr-2" />
                      {flashcards ? 'Continue Flashcards' : 'Study Flashcards'}
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={handleDownloadPdf}
                  disabled={isGeneratingPdf}
                  className="neu-button"
                >
                  {isGeneratingPdf ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  {isGeneratingPdf ? 'Generating...' : 'Download PDF'}
                </Button>
              </>
            )}

            {transcription.status === 'error' && (
              <Button onClick={handleRetry} variant="outline" className="neu-button">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            )}

            <Button
              onClick={handleDelete}
              disabled={isDeleting}
              className="neu-button-destructive"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
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

          {/* Progress (when processing) */}
          {isProcessing && (
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-status-info animate-pulse-soft" />
                      {transcription.status === 'pending' && 'Waiting to start...'}
                      {transcription.status === 'processing' && 'Transcribing audio...'}
                      {transcription.status === 'structuring' && 'Structuring notes...'}
                    </span>
                    <span className="font-medium">{Math.round(transcription.progress * 100)}%</span>
                  </div>
                  <Progress value={transcription.progress * 100} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Content */}
          {isCompleted && (
            <div className="document-content">
              {/* View toggle */}
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-muted-foreground">
                  {transcription.whisperModel && `Model: ${transcription.whisperModel}`}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRaw(!showRaw)}
                  className="neu-button"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  {showRaw ? 'Show Structured' : 'Show Raw'}
                </Button>
              </div>

              {/* Markdown content */}
              {showRaw ? (
                <pre className="whitespace-pre-wrap text-sm bg-muted/50 p-4 rounded-lg overflow-x-auto border">
                  {transcription.transcriptionText || 'No raw transcription available'}
                </pre>
              ) : (
                <Markdown 
                  content={content} 
                  collapsible
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
