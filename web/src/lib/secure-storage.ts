import { Capacitor, registerPlugin } from '@capacitor/core';

interface SecureAccountPlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
  sensitive(options: { enabled: boolean }): Promise<void>;
  copyRecovery(options: { phrase: string }): Promise<void>;
  saveRecovery(options: { phrase: string; username?: string }): Promise<void>;
}

export const SecureAccount = registerPlugin<SecureAccountPlugin>('SecureAccount');
const memory = new Map<string, string>();
let blockWrites = false;
export function blockAuthStorageWrites() { blockWrites = true; }
let pending: Promise<unknown> = Promise.resolve();
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation, operation);
  pending = result.catch(() => undefined);
  return result;
}

// Android persists only AES-GCM ciphertext; the encryption key never leaves Keystore.
// Web previews deliberately keep sessions in memory rather than plaintext localStorage.
export const secureStorage = {
  getItem(key: string): Promise<string | null> { return serial(async () => {
    if (!Capacitor.isNativePlatform()) return memory.get(key) ?? null;
    const { value } = await SecureAccount.get({ key });
    if (value !== null) return value;
    const legacy = localStorage.getItem(key);
    if (legacy !== null) {
      await SecureAccount.set({ key, value: legacy });
      localStorage.removeItem(key);
    }
    return legacy;
  }); },
  setItem(key: string, value: string): Promise<void> { return serial(async () => {
    if (blockWrites) return;
    if (Capacitor.isNativePlatform()) {
      await SecureAccount.set({ key, value });
      localStorage.removeItem(key);
    } else memory.set(key, value);
  }); },
  removeItem(key: string): Promise<void> { return serial(async () => {
    if (Capacitor.isNativePlatform()) await SecureAccount.remove({ key });
    memory.delete(key);
    localStorage.removeItem(key);
  }); },
};
