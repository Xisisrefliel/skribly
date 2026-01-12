import { useAuth } from '@/contexts/AuthContext';
import { FileUpload } from '@/components/FileUpload';
import { Button } from '@/components/ui/button';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Upload } from 'lucide-react';

export function UploadPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-[calc(100vh-6rem)] p-4 lg:p-6 animate-fade-in-up">
      <div className="max-w-xl mx-auto flex flex-col gap-4">
        {/* Header bar */}
        <div className="neu-floating-card flex items-center gap-4 px-5 py-4">
          <Link to="/">
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
              <p className="text-xs text-muted-foreground">Add a new lecture to transcribe</p>
            </div>
          </div>
        </div>

        {/* File upload component */}
        <FileUpload />
      </div>
    </div>
  );
}
