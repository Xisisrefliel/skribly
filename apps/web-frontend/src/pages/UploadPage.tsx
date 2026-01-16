import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { FileUpload } from '@/components/FileUpload';
import { Button } from '@/components/ui/button';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Upload, Zap, Sparkles, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { api, type BillingStatusResponse } from '@/lib/api';

export function UploadPage() {
  useDocumentTitle('Notism - Upload Recording');
  const { isAuthenticated, isLoading } = useAuth();
  const [transcriptionMode, setTranscriptionMode] = useState<'fast' | 'quality'>('quality');
  const [billingStatus, setBillingStatus] = useState<BillingStatusResponse | null>(null);
  const [loadingBillingStatus, setLoadingBillingStatus] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      api.getBillingStatus()
        .then(setBillingStatus)
        .catch(console.error)
        .finally(() => setLoadingBillingStatus(false));
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/sign-in" replace />;
  }

  return (
    <div className="min-h-[calc(100vh-6rem)] p-4 lg:p-6 animate-fade-in-up">
      <div className="max-w-xl mx-auto flex flex-col gap-4">
        {/* Header bar */}
        <div className="neu-floating-card flex items-center gap-4 px-5 py-4">
          <Link to="/app">
            <Button variant="outline" className="neu-button">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-status-purple-soft flex items-center justify-center">
              <Upload className="h-5 w-5 text-status-purple" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Upload Recording</h1>
              <p className="text-xs text-muted-foreground">Add a new recording to transcribe</p>
            </div>
          </div>
        </div>

        {/* Free tier information */}
        {!loadingBillingStatus && billingStatus && !billingStatus.isActive && (
          <div className="neu-floating-card px-5 py-4 bg-status-info-soft border-2 border-status-info/30">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-status-info-soft flex items-center justify-center flex-shrink-0">
                <Info className="h-5 w-5 text-status-info" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-status-info mb-1">Free Tier</h2>
                <p className="text-xs text-foreground/80">
                  {billingStatus.hasFreeTierAvailable ? (
                    <>
                      You have <span className="font-semibold">{billingStatus.freeLimit - billingStatus.transcriptionCount} free transcription</span> remaining.
                      <Link to="/settings" className="text-status-info font-medium hover:underline ml-1">
                        Subscribe
                      </Link> for unlimited access.
                    </>
                  ) : (
                    <>
                      You've used your free transcription.{' '}
                      <Link to="/settings" className="text-status-info font-medium hover:underline">
                        Subscribe
                      </Link> to continue transcribing.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Transcription mode toggle */}
        <div className="neu-floating-card px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-medium">Transcription Mode</h2>
              <p className="text-xs text-muted-foreground">Choose speed vs accuracy</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setTranscriptionMode('fast')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 border-2",
                transcriptionMode === 'fast'
                  ? "bg-status-warning-soft text-status-warning border-status-warning/60 shadow-sm"
                  : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted/70 hover:border-border/50"
              )}
            >
              <Zap className="h-4 w-4" />
              Fast
            </button>
            <button
              onClick={() => setTranscriptionMode('quality')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 border-2",
                transcriptionMode === 'quality'
                  ? "bg-status-purple-soft text-status-purple border-status-purple/60 shadow-sm"
                  : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted/70 hover:border-border/50"
              )}
            >
              <Sparkles className="h-4 w-4" />
              Quality
            </button>
          </div>
        </div>

        {/* File upload component */}
        <FileUpload transcriptionMode={transcriptionMode} />
      </div>
    </div>
  );
}
