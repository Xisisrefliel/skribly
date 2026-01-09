import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useState } from 'react';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDeviceId } from '@/hooks/useDeviceId';
import { useTranscriptionStatus } from '@/hooks/useTranscriptions';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { apiClient } from '@/services/api';

export default function TranscriptionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  
  const { deviceId } = useDeviceId();
  const { transcription, isLoading, error } = useTranscriptionStatus(id ?? null, deviceId);
  
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { 
      weekday: 'short',
      year: 'numeric',
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const hours = Math.floor(mins / 60);
    if (hours > 0) {
      return `${hours}h ${mins % 60}m`;
    }
    return `${mins} min`;
  };

  const handleExportPDF = async () => {
    if (!transcription?.transcriptionText) return;

    setIsExporting(true);
    try {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>${transcription.title}</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                padding: 48px;
                line-height: 1.7;
                color: #1a1a1a;
                max-width: 680px;
                margin: 0 auto;
              }
              h1 {
                font-size: 28px;
                font-weight: 700;
                margin-bottom: 12px;
                color: #000;
              }
              .meta {
                font-size: 14px;
                color: #666;
                margin-bottom: 32px;
                padding-bottom: 20px;
                border-bottom: 1px solid #e5e5e5;
              }
              .content {
                font-size: 16px;
                white-space: pre-wrap;
                line-height: 1.8;
              }
            </style>
          </head>
          <body>
            <h1>${transcription.title}</h1>
            <div class="meta">
              ${formatDate(transcription.createdAt)}${transcription.audioDuration ? ` · ${formatDuration(transcription.audioDuration)}` : ''}
            </div>
            <div class="content">${transcription.transcriptionText}</div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      const pdfName = `${transcription.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      const pdfUri = `${FileSystem.documentDirectory}${pdfName}`;
      await FileSystem.moveAsync({ from: uri, to: pdfUri });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri);
      } else {
        Alert.alert('PDF Saved', `Saved to: ${pdfUri}`);
      }
    } catch (err) {
      console.error('Export PDF error:', err);
      Alert.alert('Export Failed', 'Failed to export PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportText = async () => {
    if (!transcription?.transcriptionText) return;

    setIsExporting(true);
    try {
      await Share.share({
        message: transcription.transcriptionText,
        title: transcription.title,
      });
    } catch (err) {
      try {
        const textName = `${transcription.title.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
        const textUri = `${FileSystem.documentDirectory}${textName}`;
        await FileSystem.writeAsStringAsync(textUri, transcription.transcriptionText);
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(textUri);
        }
      } catch (fileErr) {
        Alert.alert('Export Failed', 'Failed to share text.');
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Transcription',
      'This will permanently delete the transcription and audio file.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!id || !deviceId) return;
            setIsDeleting(true);
            try {
              apiClient.setDeviceId(deviceId);
              await apiClient.deleteTranscription(id);
              router.back();
            } catch (err) {
              console.error('Delete error:', err);
              Alert.alert('Delete Failed', 'Could not delete transcription.');
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const statusConfig = {
    pending: { color: '#FF9500', label: 'Queued' },
    processing: { color: '#007AFF', label: 'Processing' },
    completed: { color: '#34C759', label: 'Completed' },
    error: { color: '#FF3B30', label: 'Failed' },
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.centerContainer}>
        <Stack.Screen options={{ title: '' }} />
        <ActivityIndicator size="large" color={colors.tint} />
      </ThemedView>
    );
  }

  if (error || !transcription) {
    return (
      <ThemedView style={styles.centerContainer}>
        <Stack.Screen options={{ title: 'Error' }} />
        <IconSymbol name="exclamationmark.triangle.fill" size={48} color="#FF3B30" />
        <ThemedText style={styles.errorTitle}>
          {error || 'Transcription not found'}
        </ThemedText>
        <TouchableOpacity 
          style={[styles.backButton, { backgroundColor: colors.tint }]}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  const status = statusConfig[transcription.status];

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: '',
          headerRight: () => (
            <TouchableOpacity 
              onPress={handleDelete} 
              disabled={isDeleting}
              style={styles.deleteButton}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="#FF3B30" />
              ) : (
                <IconSymbol name="trash" size={20} color="#FF3B30" />
              )}
            </TouchableOpacity>
          ),
        }} 
      />

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Title & Meta */}
        <View style={styles.header}>
          <ThemedText style={styles.title}>{transcription.title}</ThemedText>
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaText}>
              {formatDate(transcription.createdAt)}
            </ThemedText>
            {formatDuration(transcription.audioDuration) && (
              <>
                <Text style={styles.metaDot}>·</Text>
                <ThemedText style={styles.metaText}>
                  {formatDuration(transcription.audioDuration)}
                </ThemedText>
              </>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${status.color}15` }]}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={[styles.statusLabel, { color: status.color }]}>
              {status.label}
            </Text>
          </View>
        </View>

        {/* Processing Status */}
        {transcription.status === 'processing' && (
          <View style={[styles.processingCard, { backgroundColor: colors.secondaryBackground }]}>
            <View style={styles.processingHeader}>
              <ActivityIndicator size="small" color={status.color} />
              <ThemedText style={styles.processingTitle}>Transcribing audio...</ThemedText>
            </View>
            <View style={styles.progressBarContainer}>
              <View 
                style={[
                  styles.progressBar, 
                  { width: `${Math.max((transcription.progress ?? 0) * 100, 3)}%`, backgroundColor: status.color }
                ]} 
              />
            </View>
            <ThemedText style={styles.processingPercent}>
              {Math.round((transcription.progress ?? 0) * 100)}% complete
            </ThemedText>
          </View>
        )}

        {/* Pending Status */}
        {transcription.status === 'pending' && (
          <View style={[styles.pendingCard, { backgroundColor: colors.secondaryBackground }]}>
            <IconSymbol name="clock" size={24} color={status.color} />
            <ThemedText style={styles.pendingText}>
              Waiting in queue...
            </ThemedText>
          </View>
        )}

        {/* Error Status */}
        {transcription.status === 'error' && (
          <View style={styles.errorCard}>
            <IconSymbol name="xmark.circle.fill" size={24} color="#FF3B30" />
            <View style={styles.errorContent}>
              <ThemedText style={styles.errorCardTitle}>Transcription Failed</ThemedText>
              <ThemedText style={styles.errorCardText}>
                {transcription.errorMessage || 'An error occurred during transcription.'}
              </ThemedText>
            </View>
          </View>
        )}

        {/* Transcription Text */}
        {transcription.transcriptionText && (
          <View style={styles.transcriptionSection}>
            <ThemedText style={styles.sectionLabel}>TRANSCRIPTION</ThemedText>
            <View style={[styles.transcriptionCard, { backgroundColor: colors.secondaryBackground }]}>
              <ThemedText style={styles.transcriptionText}>
                {transcription.transcriptionText}
              </ThemedText>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Export Bar */}
      {transcription.status === 'completed' && transcription.transcriptionText && (
        <View style={[styles.exportBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.exportButton, { backgroundColor: colors.tint }]}
            onPress={handleExportPDF}
            disabled={isExporting}
            activeOpacity={0.8}
          >
            {isExporting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <IconSymbol name="doc.fill" size={18} color="#fff" />
                <Text style={styles.exportButtonText}>Export PDF</Text>
              </>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.exportButtonOutline, { borderColor: colors.tint }]}
            onPress={handleExportText}
            disabled={isExporting}
            activeOpacity={0.8}
          >
            {isExporting ? (
              <ActivityIndicator color={colors.tint} size="small" />
            ) : (
              <>
                <IconSymbol name="square.and.arrow.up" size={18} color={colors.tint} />
                <Text style={[styles.exportButtonText, { color: colors.tint }]}>Share</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
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
    padding: 24,
    gap: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 32,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  metaText: {
    fontSize: 14,
    opacity: 0.5,
  },
  metaDot: {
    marginHorizontal: 8,
    opacity: 0.3,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  processingCard: {
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
  },
  processingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  processingTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: '#E5E5EA',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  processingPercent: {
    fontSize: 13,
    opacity: 0.5,
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    gap: 12,
    marginBottom: 20,
  },
  pendingText: {
    fontSize: 15,
    opacity: 0.6,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FF3B3010',
    padding: 16,
    borderRadius: 14,
    gap: 12,
    marginBottom: 20,
  },
  errorContent: {
    flex: 1,
  },
  errorCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF3B30',
    marginBottom: 4,
  },
  errorCardText: {
    fontSize: 14,
    color: '#FF3B30',
    opacity: 0.8,
    lineHeight: 20,
  },
  transcriptionSection: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.4,
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  transcriptionCard: {
    padding: 18,
    borderRadius: 14,
  },
  transcriptionText: {
    fontSize: 16,
    lineHeight: 28,
  },
  exportBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 36,
    borderTopWidth: 1,
    gap: 12,
  },
  exportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 12,
    gap: 8,
  },
  exportButtonOutline: {
    flex: 0.6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 12,
    borderWidth: 2,
    gap: 8,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  deleteButton: {
    padding: 8,
  },
  backButton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorTitle: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
});
