import { TranscriptionDetail } from '@/components/TranscriptionDetail';

export function TranscriptionPage() {
  // Allow viewing transcriptions without auth (TranscriptionDetail handles public/private logic)
  return <TranscriptionDetail />;
}
