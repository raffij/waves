import * as SecureStore from 'expo-secure-store';

// iOS Keychain-backed storage, mirroring the macOS widget's use of the system Keychain.
export class SecureKeyStore {
  constructor(private readonly key: string) {}

  read(): Promise<string | null> {
    return SecureStore.getItemAsync(this.key);
  }

  write(value: string): Promise<void> {
    return SecureStore.setItemAsync(this.key, value);
  }

  clear(): Promise<void> {
    return SecureStore.deleteItemAsync(this.key);
  }
}
