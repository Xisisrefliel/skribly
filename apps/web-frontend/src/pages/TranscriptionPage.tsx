import { TranscriptionDetail } from '@/components/TranscriptionDetail';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function TranscriptionPage() {
  useDocumentTitle('Notism - Transcription');
  return <TranscriptionDetail />;
}
