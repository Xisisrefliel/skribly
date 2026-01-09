import { useState, useEffect, useCallback, useRef } from 'react';
import type { Transcription } from '@lecture/shared';
import { apiClient } from '../services/api';

// Polling interval for processing items (in ms)
const POLLING_INTERVAL = 3000;

export function useTranscriptions(deviceId: string | null) {
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Set device ID on the API client
  useEffect(() => {
    if (deviceId) {
      apiClient.setDeviceId(deviceId);
    }
  }, [deviceId]);

  // Fetch transcriptions
  const fetchTranscriptions = useCallback(async (showLoading = false) => {
    if (!deviceId) return;

    try {
      if (showLoading) setIsLoading(true);
      setError(null);
      const data = await apiClient.getTranscriptions();
      setTranscriptions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch transcriptions');
    } finally {
      setIsLoading(false);
    }
  }, [deviceId]);

  // Initial fetch
  useEffect(() => {
    fetchTranscriptions(true);
  }, [fetchTranscriptions]);

  // Auto-poll when there are processing items
  useEffect(() => {
    const hasProcessingItems = transcriptions.some(
      t => t.status === 'processing' || t.status === 'pending'
    );

    if (hasProcessingItems && !pollingRef.current) {
      // Start polling
      pollingRef.current = setInterval(() => {
        fetchTranscriptions(false);
      }, POLLING_INTERVAL);
    } else if (!hasProcessingItems && pollingRef.current) {
      // Stop polling
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [transcriptions, fetchTranscriptions]);

  // Upload and start transcription
  const uploadAndTranscribe = async (fileUri: string, title: string) => {
    if (!deviceId) {
      throw new Error('Device ID not available');
    }

    // Upload the file
    const uploadResult = await apiClient.uploadAudio(fileUri, title);

    // Start transcription
    await apiClient.startTranscription(uploadResult.id);

    // Refresh the list
    await fetchTranscriptions(false);

    return uploadResult.id;
  };

  // Get a single transcription
  const getTranscription = async (id: string) => {
    return apiClient.getTranscription(id);
  };

  // Delete a transcription
  const deleteTranscription = async (id: string) => {
    if (!deviceId) {
      throw new Error('Device ID not available');
    }
    await apiClient.deleteTranscription(id);
    // Remove from local state immediately for better UX
    setTranscriptions(prev => prev.filter(t => t.id !== id));
  };

  // Refresh transcriptions (manual pull-to-refresh)
  const refresh = useCallback(() => {
    fetchTranscriptions(true);
  }, [fetchTranscriptions]);

  return {
    transcriptions,
    isLoading,
    error,
    uploadAndTranscribe,
    getTranscription,
    deleteTranscription,
    refresh,
  };
}

// Hook for polling a single transcription status
export function useTranscriptionStatus(id: string | null, deviceId: string | null) {
  const [transcription, setTranscription] = useState<Transcription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !deviceId) {
      setIsLoading(false);
      return;
    }

    apiClient.setDeviceId(deviceId);

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let isMounted = true;

    const fetchStatus = async () => {
      try {
        const data = await apiClient.getTranscription(id);
        if (!isMounted) return;
        
        setTranscription(data);
        setError(null);

        // Stop polling if completed or errored
        if (data.status === 'completed' || data.status === 'error') {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch transcription');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    // Initial fetch
    fetchStatus();

    // Poll every 3 seconds while processing
    intervalId = setInterval(fetchStatus, POLLING_INTERVAL);

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [id, deviceId]);

  return { transcription, isLoading, error };
}
