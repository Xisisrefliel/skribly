import { useAuth } from '@/contexts/AuthContext';
import { TranscriptionDetail } from '@/components/TranscriptionDetail';
import { Navigate } from 'react-router-dom';

export function TranscriptionPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <TranscriptionDetail />;
}
