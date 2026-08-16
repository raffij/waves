import { useEffect, useState } from 'react';
import { SecureKeyStore } from '../services/SecureKeyStore';

const keyStore = new SecureKeyStore('wave-hastings-tidecheck-api-key');

export interface ApiKeyState {
  /** undefined = still reading from storage, null = no key saved */
  apiKey: string | null | undefined;
  saveKey: (key: string) => Promise<void>;
  resetKey: () => Promise<void>;
}

// Reads the TideCheck API key from secure storage on mount, and exposes
// save/reset so the rest of the app never touches SecureKeyStore directly.
export function useApiKey(): ApiKeyState {
  const [apiKey, setApiKey] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    keyStore.read().then(setApiKey);
  }, []);

  const saveKey = async (key: string) => {
    await keyStore.write(key);
    setApiKey(key);
  };

  const resetKey = async () => {
    await keyStore.clear();
    setApiKey(null);
  };

  return { apiKey, saveKey, resetKey };
}
