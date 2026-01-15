import type { Response } from 'express';
import type { TranscriptionStatus } from '@lecture/shared';

export interface TranscriptionEventPayload {
  transcriptionId: string;
  status: TranscriptionStatus;
  progress: number;
  errorMessage?: string | null;
  updatedAt: string;
}

const clientsByUser = new Map<string, Set<Response>>();

export function addTranscriptionEventClient(userId: string, res: Response): void {
  const existing = clientsByUser.get(userId) ?? new Set<Response>();
  existing.add(res);
  clientsByUser.set(userId, existing);
}

export function removeTranscriptionEventClient(userId: string, res: Response): void {
  const existing = clientsByUser.get(userId);
  if (!existing) return;

  existing.delete(res);
  if (existing.size === 0) {
    clientsByUser.delete(userId);
  }
}

export function broadcastTranscriptionUpdate(userId: string, payload: TranscriptionEventPayload): void {
  const clients = clientsByUser.get(userId);
  if (!clients || clients.size === 0) return;

  const message = `event: transcription\ndata: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((res) => {
    res.write(message);
  });
}

export function broadcastTranscriptionPing(userId: string): void {
  const clients = clientsByUser.get(userId);
  if (!clients || clients.size === 0) return;

  const message = 'event: ping\ndata: {}\n\n';
  clients.forEach((res) => {
    res.write(message);
  });
}
