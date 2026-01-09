import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'lecture_device_id';

function generateDeviceId(): string {
  // Generate a random UUID-like string
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) {
      result += '-';
    }
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

async function getStoredDeviceId(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(DEVICE_ID_KEY);
  }
  return SecureStore.getItemAsync(DEVICE_ID_KEY);
}

async function storeDeviceId(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(DEVICE_ID_KEY, id);
    return;
  }
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
}

export function useDeviceId() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function initDeviceId() {
      try {
        let id = await getStoredDeviceId();
        
        if (!id) {
          id = generateDeviceId();
          await storeDeviceId(id);
        }

        setDeviceId(id);
      } catch (error) {
        console.error('Failed to get/create device ID:', error);
        // Fallback to a temporary ID
        setDeviceId(generateDeviceId());
      } finally {
        setIsLoading(false);
      }
    }

    initDeviceId();
  }, []);

  return { deviceId, isLoading };
}
