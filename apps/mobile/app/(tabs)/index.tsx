import { 
  StyleSheet, 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator, 
  RefreshControl, 
  Modal,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useState, useEffect, useRef } from 'react';

import { useDeviceId } from '@/hooks/useDeviceId';
import { useTranscriptions } from '@/hooks/useTranscriptions';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Transcription } from '@lecture/shared';

type UploadStage = 'idle' | 'uploading' | 'starting' | 'done' | 'error';

interface UploadState {
  stage: UploadStage;
  fileName?: string;
  error?: string;
}

const STAGE_MESSAGES: Record<UploadStage, string> = {
  idle: '',
  uploading: 'Uploading audio...',
  starting: 'Starting transcription...',
  done: 'Done!',
  error: 'Upload failed',
};

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  
  const { deviceId, isLoading: isDeviceIdLoading } = useDeviceId();
  const { 
    transcriptions, 
    isLoading, 
    error, 
    uploadAndTranscribe, 
    refresh 
  } = useTranscriptions(deviceId);
  
  const [uploadState, setUploadState] = useState<UploadState>({ stage: 'idle' });

  const handlePickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'video/mp4'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const file = result.assets[0];
      const title = file.name.replace(/\.[^/.]+$/, '') || 'Untitled Lecture';
      
      setUploadState({ stage: 'uploading', fileName: file.name });

      const id = await uploadAndTranscribe(file.uri, title);
      
      setUploadState({ stage: 'starting', fileName: file.name });
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setUploadState({ stage: 'done', fileName: file.name });
      await new Promise(resolve => setTimeout(resolve, 600));
      
      setUploadState({ stage: 'idle' });
      router.push(`/transcription/${id}`);
    } catch (err) {
      console.error('Upload error:', err);
      setUploadState({ 
        stage: 'error', 
        error: err instanceof Error ? err.message : 'Failed to upload' 
      });
      setTimeout(() => setUploadState({ stage: 'idle' }), 3000);
    }
  };

  const showUploadModal = ['uploading', 'starting', 'done'].includes(uploadState.stage);
  const isButtonDisabled = uploadState.stage !== 'idle' && uploadState.stage !== 'error';

  // Count processing items
  const processingCount = transcriptions.filter(
    t => t.status === 'processing' || t.status === 'pending'
  ).length;

  const renderTranscription = ({ item, index }: { item: Transcription; index: number }) => {
    const statusConfig = {
      pending: { color: '#FF9500', label: 'Queued', icon: 'clock' },
      processing: { color: '#007AFF', label: 'Processing', icon: 'waveform' },
      completed: { color: '#34C759', label: 'Completed', icon: 'checkmark.circle.fill' },
      error: { color: '#FF3B30', label: 'Failed', icon: 'xmark.circle.fill' },
    };

    const status = statusConfig[item.status];

    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    const formatDuration = (seconds: number | null) => {
      if (!seconds) return null;
      const mins = Math.floor(seconds / 60);
      const hours = Math.floor(mins / 60);
      if (hours > 0) return `${hours}h ${mins % 60}m`;
      return `${mins} min`;
    };

    return (
      <TouchableOpacity
        style={[
          styles.card, 
          { 
            backgroundColor: colorScheme === 'dark' ? '#1C1C1E' : '#FFFFFF',
            shadowColor: colorScheme === 'dark' ? '#000' : '#000',
          }
        ]}
        onPress={() => router.push(`/transcription/${item.id}`)}
        activeOpacity={0.7}
      >
        {/* Status indicator line */}
        <View style={[styles.statusLine, { backgroundColor: status.color }]} />
        
        <View style={styles.cardContent}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <ThemedText style={styles.cardTitle} numberOfLines={1}>
                {item.title}
              </ThemedText>
            </View>
            <View style={styles.cardMeta}>
              <ThemedText style={styles.cardDate}>
                {formatDate(item.createdAt)}
              </ThemedText>
              {formatDuration(item.audioDuration) && (
                <>
                  <Text style={styles.metaDot}>·</Text>
                  <ThemedText style={styles.cardDuration}>
                    {formatDuration(item.audioDuration)}
                  </ThemedText>
                </>
              )}
            </View>
          </View>

          {/* Progress for processing items */}
          {item.status === 'processing' && (
            <View style={styles.progressSection}>
              <View style={styles.progressRow}>
                <ActivityIndicator size="small" color={status.color} />
                <ThemedText style={styles.progressLabel}>Transcribing...</ThemedText>
                <ThemedText style={[styles.progressPercent, { color: status.color }]}>
                  {Math.round(item.progress * 100)}%
                </ThemedText>
              </View>
              <View style={styles.progressBarContainer}>
                <View 
                  style={[
                    styles.progressBar, 
                    { width: `${Math.max(item.progress * 100, 3)}%`, backgroundColor: status.color }
                  ]} 
                />
              </View>
            </View>
          )}

          {/* Status badge for non-processing items */}
          {item.status !== 'processing' && (
            <View style={styles.statusRow}>
              <View style={[styles.statusBadge, { backgroundColor: `${status.color}15` }]}>
                <IconSymbol name={status.icon as any} size={12} color={status.color} />
                <Text style={[styles.statusLabel, { color: status.color }]}>
                  {status.label}
                </Text>
              </View>
            </View>
          )}

          {/* Preview text for completed items */}
          {item.status === 'completed' && item.transcriptionText && (
            <ThemedText style={styles.previewText} numberOfLines={2}>
              {item.transcriptionText}
            </ThemedText>
          )}

          {/* Error message */}
          {item.status === 'error' && (
            <ThemedText style={styles.errorText} numberOfLines={1}>
              {item.errorMessage || 'Transcription failed'}
            </ThemedText>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (isDeviceIdLoading) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.tint} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header section */}
      <View style={styles.headerSection}>
        {/* Upload Button */}
        <TouchableOpacity
          style={[
            styles.uploadButton, 
            { backgroundColor: colors.tint },
            isButtonDisabled && styles.uploadButtonDisabled
          ]}
          onPress={handlePickAudio}
          disabled={isButtonDisabled}
          activeOpacity={0.8}
        >
          <IconSymbol name="mic.fill" size={20} color="#fff" />
          <Text style={styles.uploadButtonText}>New Transcription</Text>
        </TouchableOpacity>

        {/* Processing indicator */}
        {processingCount > 0 && (
          <View style={[styles.processingBanner, { backgroundColor: `${colors.tint}10` }]}>
            <ActivityIndicator size="small" color={colors.tint} />
            <ThemedText style={[styles.processingText, { color: colors.tint }]}>
              {processingCount} transcription{processingCount > 1 ? 's' : ''} in progress
            </ThemedText>
          </View>
        )}
      </View>

      {/* Upload Progress Modal */}
      <Modal visible={showUploadModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            {uploadState.stage === 'done' ? (
              <View style={styles.doneIcon}>
                <IconSymbol name="checkmark.circle.fill" size={48} color="#34C759" />
              </View>
            ) : (
              <ActivityIndicator size="large" color={colors.tint} style={styles.modalSpinner} />
            )}
            <ThemedText style={styles.modalTitle}>
              {STAGE_MESSAGES[uploadState.stage]}
            </ThemedText>
            {uploadState.fileName && uploadState.stage !== 'done' && (
              <ThemedText style={styles.modalSubtitle} numberOfLines={1}>
                {uploadState.fileName}
              </ThemedText>
            )}
          </View>
        </View>
      </Modal>

      {/* Error Toast */}
      {uploadState.stage === 'error' && (
        <View style={styles.errorBanner}>
          <IconSymbol name="xmark.circle.fill" size={18} color="#FF3B30" />
          <Text style={styles.errorBannerText}>{uploadState.error}</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <IconSymbol name="exclamationmark.triangle.fill" size={18} color="#FF3B30" />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      {/* Transcriptions List */}
      <FlatList
        data={transcriptions}
        renderItem={renderTranscription}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          transcriptions.length === 0 && styles.listContentEmpty
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={isLoading} 
            onRefresh={refresh}
            tintColor={colors.tint}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.tint}10` }]}>
                <IconSymbol name="waveform" size={40} color={colors.tint} />
              </View>
              <ThemedText style={styles.emptyTitle}>
                No transcriptions yet
              </ThemedText>
              <ThemedText style={styles.emptySubtitle}>
                Tap "New Transcription" to upload a lecture recording and convert it to text
              </ThemedText>
            </View>
          ) : null
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 14,
    gap: 10,
  },
  uploadButtonDisabled: {
    opacity: 0.6,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  processingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 10,
    marginTop: 10,
    gap: 8,
  },
  processingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  modalContent: {
    width: '100%',
    maxWidth: 280,
    padding: 28,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  modalSpinner: {
    marginBottom: 20,
  },
  doneIcon: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    opacity: 0.5,
    marginTop: 6,
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    backgroundColor: '#FF3B3015',
    borderRadius: 10,
  },
  errorBannerText: {
    flex: 1,
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  listContentEmpty: {
    flex: 1,
  },
  card: {
    flexDirection: 'row',
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statusLine: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    padding: 14,
  },
  cardHeader: {
    marginBottom: 8,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardDate: {
    fontSize: 13,
    opacity: 0.45,
  },
  metaDot: {
    marginHorizontal: 6,
    opacity: 0.3,
  },
  cardDuration: {
    fontSize: 13,
    opacity: 0.45,
  },
  progressSection: {
    marginTop: 4,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  progressLabel: {
    flex: 1,
    fontSize: 13,
    opacity: 0.6,
  },
  progressPercent: {
    fontSize: 13,
    fontWeight: '600',
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: '#E5E5EA',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  statusRow: {
    flexDirection: 'row',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  previewText: {
    marginTop: 8,
    fontSize: 14,
    opacity: 0.55,
    lineHeight: 20,
  },
  errorText: {
    marginTop: 6,
    fontSize: 13,
    color: '#FF3B30',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 60,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    opacity: 0.5,
    textAlign: 'center',
    lineHeight: 22,
  },
});
