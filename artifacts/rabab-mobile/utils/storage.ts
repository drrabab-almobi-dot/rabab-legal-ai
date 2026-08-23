/**
 * Platform-aware secure storage.
 *
 * - Native (iOS/Android): expo-secure-store (hardware-backed when available)
 * - Web preview: @react-native-async-storage/async-storage (not encrypted, but
 *   the web preview is a dev tool — no real secrets are stored there in production)
 *
 * All methods are async and match the expo-secure-store API surface so callers
 * can switch transparently.
 */
import { Platform } from 'react-native';

type Storage = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

let _storage: Storage | null = null;

async function getStorage(): Promise<Storage> {
  if (_storage) return _storage;

  if (Platform.OS !== 'web') {
    // Native path — SecureStore is fully supported
    const SecureStore = await import('expo-secure-store');
    _storage = {
      getItemAsync: (key) => SecureStore.getItemAsync(key),
      setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
      deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
    };
  } else {
    // Web path — fall back to AsyncStorage (dev/preview only)
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    _storage = {
      getItemAsync: (key) => AsyncStorage.getItem(key),
      setItemAsync: (key, value) => AsyncStorage.setItem(key, value),
      deleteItemAsync: (key) => AsyncStorage.removeItem(key),
    };
  }

  return _storage;
}

export async function getItemAsync(key: string): Promise<string | null> {
  try {
    const store = await getStorage();
    return await store.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  try {
    const store = await getStorage();
    await store.setItemAsync(key, value);
  } catch {
    // ignore — worst case the user has to log in again on next session
  }
}

export async function deleteItemAsync(key: string): Promise<void> {
  try {
    const store = await getStorage();
    await store.deleteItemAsync(key);
  } catch {
    // ignore
  }
}
