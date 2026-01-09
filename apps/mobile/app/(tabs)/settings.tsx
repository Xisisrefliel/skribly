import { StyleSheet, View, Text, TouchableOpacity, Alert, Linking } from 'react-native';
import * as Application from 'expo-application';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDeviceId } from '@/hooks/useDeviceId';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { deviceId } = useDeviceId();

  const appVersion = Application.nativeApplicationVersion ?? '1.0.0';
  const buildVersion = Application.nativeBuildVersion ?? '1';

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@lecture.app?subject=Lecture App Support');
  };

  const handleCopyDeviceId = () => {
    if (deviceId) {
      // Note: expo-clipboard could be used here for actual copy functionality
      Alert.alert('Device ID', deviceId, [{ text: 'OK' }]);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* About Section */}
      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>About</ThemedText>
        
        <View style={[styles.card, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
          <View style={styles.row}>
            <ThemedText style={styles.label}>Version</ThemedText>
            <ThemedText style={styles.value}>{appVersion} ({buildVersion})</ThemedText>
          </View>
        </View>
      </View>

      {/* Support Section */}
      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Support</ThemedText>
        
        <View style={[styles.card, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.row} onPress={handleContactSupport}>
            <ThemedText style={styles.label}>Contact Support</ThemedText>
            <ThemedText style={[styles.value, { color: colors.tint }]}>Email</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      {/* Device Section */}
      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Device</ThemedText>
        
        <View style={[styles.card, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.row} onPress={handleCopyDeviceId}>
            <ThemedText style={styles.label}>Device ID</ThemedText>
            <ThemedText style={styles.valueSmall} numberOfLines={1}>
              {deviceId ? `${deviceId.substring(0, 8)}...` : 'Loading...'}
            </ThemedText>
          </TouchableOpacity>
        </View>
        <ThemedText style={styles.hint}>
          Your device ID is used to sync your transcriptions. Tap to view full ID.
        </ThemedText>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <ThemedText style={styles.footerText}>
          Lecture Transcription App
        </ThemedText>
        <ThemedText style={styles.footerSubtext}>
          Powered by Groq Whisper
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    opacity: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  label: {
    fontSize: 16,
  },
  value: {
    fontSize: 16,
    opacity: 0.6,
  },
  valueSmall: {
    fontSize: 14,
    opacity: 0.6,
    maxWidth: 150,
  },
  hint: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 8,
    marginLeft: 4,
  },
  footer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 32,
  },
  footerText: {
    fontSize: 14,
    opacity: 0.5,
  },
  footerSubtext: {
    fontSize: 12,
    opacity: 0.3,
    marginTop: 4,
  },
});
