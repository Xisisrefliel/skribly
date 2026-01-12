import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Transcription } from '@lecture/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { api } from '@/lib/api';

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getStatusBadge(status: Transcription['status']) {
  switch (status) {
    case 'pending':
      return <Badge variant="secondary">Pending</Badge>;
    case 'processing':
      return <Badge variant="default" className="bg-blue-500">Processing</Badge>;
    case 'structuring':
      return <Badge variant="default" className="bg-purple-500">Structuring</Badge>;
    case 'completed':
      return <Badge variant="default" className="bg-green-500">Completed</Badge>;
    case 'error':
      return <Badge variant="destructive">Error</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
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
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (transcriptions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <div className="space-y-2">
            <svg
              className="mx-auto h-12 w-12 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
            <h3 className="font-semibold">No transcriptions yet</h3>
            <p className="text-sm text-muted-foreground">
              Upload an audio or video file to get started
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {transcriptions.map((transcription) => (
        <Link key={transcription.id} to={`/transcription/${transcription.id}`}>
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg line-clamp-2">
                  {transcription.title}
                </CardTitle>
                {getStatusBadge(transcription.status)}
              </div>
              <CardDescription>
                {formatDate(transcription.createdAt)}
                {transcription.audioDuration && (
                  <> · {formatDuration(transcription.audioDuration)}</>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(transcription.status === 'processing' || transcription.status === 'structuring') && (
                <div className="space-y-1">
                  <Progress value={transcription.progress * 100} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {Math.round(transcription.progress * 100)}%
                  </p>
                </div>
              )}
              {transcription.status === 'completed' && transcription.structuredText && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {transcription.structuredText.slice(0, 150)}...
                </p>
              )}
              {transcription.status === 'error' && transcription.errorMessage && (
                <p className="text-sm text-destructive line-clamp-2">
                  {transcription.errorMessage}
                </p>
              )}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
