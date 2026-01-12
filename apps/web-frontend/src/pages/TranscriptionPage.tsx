import { useAuth } from '@/contexts/AuthContext';
import { TranscriptionDetail } from '@/components/TranscriptionDetail';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export function TranscriptionPage() {
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

  return <TranscriptionDetail />;
}
