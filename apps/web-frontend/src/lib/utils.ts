import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a date string for display
 * @param dateString - ISO date string
 * @param variant - 'short' for compact display, 'long' for full display
 */
export function formatDate(dateString: string, variant: 'short' | 'long' = 'short'): string {
  const options: Intl.DateTimeFormatOptions = variant === 'long'
    ? { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  
  return new Date(dateString).toLocaleDateString('en-US', options);
}

/**
 * Format duration in seconds to human-readable string
 * @param seconds - Duration in seconds
 */
export function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format file size in bytes to human-readable string
 * @param bytes - File size in bytes
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Status types for transcriptions
 */
export type TranscriptionStatus = 'pending' | 'processing' | 'structuring' | 'completed' | 'canceled' | 'error';

/**
 * Get status-specific styling classes
 * @param status - Transcription status
 */
export function getStatusStyles(status: TranscriptionStatus): {
  bg: string;
  text: string;
  border: string;
  label: string;
} {
  switch (status) {
    case 'pending':
      return {
        bg: 'bg-secondary',
        text: 'text-secondary-foreground',
        border: 'border-secondary',
        label: 'Pending'
      };
    case 'processing':
      return {
        bg: 'bg-status-info',
        text: 'text-white',
        border: 'border-status-info',
        label: 'Processing'
      };
    case 'structuring':
      return {
        bg: 'bg-status-purple',
        text: 'text-white',
        border: 'border-status-purple',
        label: 'Structuring'
      };
    case 'completed':
      return {
        bg: 'bg-status-success',
        text: 'text-white',
        border: 'border-status-success',
        label: 'Completed'
      };
    case 'canceled':
      return {
        bg: 'bg-status-warning',
        text: 'text-white',
        border: 'border-status-warning',
        label: 'Canceled'
      };
    case 'error':
      return {
        bg: 'bg-destructive',
        text: 'text-white',
        border: 'border-destructive',
        label: 'Error'
      };
    default:
      return {
        bg: 'bg-muted',
        text: 'text-muted-foreground',
        border: 'border-muted',
        label: status
      };
  }
}
