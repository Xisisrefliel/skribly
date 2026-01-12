import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Transcription } from '@lecture/shared';
import { Mic, AlertCircle, Clock, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { api } from '@/lib/api';
import { formatDate, formatDuration, getStatusStyles, type TranscriptionStatus } from '@/lib/utils';

function StatusBadge({ status }: { status: TranscriptionStatus }) {
  const styles = getStatusStyles(status);
  
  // Map status to CSS class for the skeuomorphic styling
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
  
  return (
    <Badge className={statusClass}>
      {styles.label}
    </Badge>
  );
}

interface TranscriptionListProps {
  onEmpty?: () => void;
}

export function TranscriptionList({ onEmpty }: TranscriptionListProps) {
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTranscriptions = async () => {
    try {
      const data = await api.getTranscriptions();
      setTranscriptions(data);
      if (data.length === 0 && onEmpty) {
        onEmpty();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transcriptions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTranscriptions();

    // Poll for updates every 5 seconds if there are processing items
    const interval = setInterval(() => {
      const hasProcessing = transcriptions.some(
        (t) => t.status === 'processing' || t.status === 'structuring' || t.status === 'pending'
      );
      if (hasProcessing) {
        fetchTranscriptions();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [transcriptions.length]);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-status-error/30 bg-status-error-soft">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (transcriptions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="space-y-3">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Mic className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">No transcriptions yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Upload an audio or video file to get started
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {transcriptions.map((transcription, index) => (
        <Link 
          key={transcription.id} 
          to={`/transcription/${transcription.id}`}
          className="block outline-none"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <Card className="h-full card-hover-lift group animate-fade-in-up">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg line-clamp-2 group-hover:text-primary transition-colors">
                    {transcription.title}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatDate(transcription.createdAt)}</span>
                    {transcription.audioDuration && (
                      <>
                        <span className="text-muted-foreground/50">·</span>
                        <span>{formatDuration(transcription.audioDuration)}</span>
                      </>
                    )}
                  </CardDescription>
                </div>
                <StatusBadge status={transcription.status as TranscriptionStatus} />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {(transcription.status === 'processing' || transcription.status === 'structuring') && (
                <div className="space-y-2">
                  <Progress value={transcription.progress * 100} className="h-2" />
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-info animate-pulse-soft" />
                    {transcription.status === 'processing' ? 'Transcribing' : 'Structuring'}... {Math.round(transcription.progress * 100)}%
                  </p>
                </div>
              )}
              {transcription.status === 'completed' && transcription.structuredText && (
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                    {transcription.structuredText.slice(0, 150)}...
                  </p>
                </div>
              )}
              {transcription.status === 'error' && transcription.errorMessage && (
                <div className="flex items-start gap-2 text-status-error">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <p className="text-sm line-clamp-2">
                    {transcription.errorMessage}
                  </p>
                </div>
              )}
              {transcription.status === 'pending' && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                  Waiting to start...
                </p>
              )}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
