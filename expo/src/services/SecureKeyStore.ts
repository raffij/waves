import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// iOS Keychain-backed storage, mirroring the macOS widget's use of the system
// Keychain. expo-secure-store has no web implementation, so on web this falls
// back to localStorage instead (less secure, but there's no browser Keychain
// equivalent, and this key never leaves the device either way).
export class SecureKeyStore {
  constructor(private readonly key: string) {}

  async read(): Promise<string | null> {
    if (Platform.OS === 'web') {
      return window.localStorage.getItem(this.key);
    }
    return SecureStore.getItemAsync(this.key);
  }

  async write(value: string): Promise<void> {
    if (Platform.OS === 'web') {
      window.localStorage.setItem(this.key, value);
      return;
    }
    return SecureStore.setItemAsync(this.key, value);
  }

  async clear(): Promise<void> {
    if (Platform.OS === 'web') {
      window.localStorage.removeItem(this.key);
      return;
    }
    return SecureStore.deleteItemAsync(this.key);
  }
}
