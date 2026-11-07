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
// The website keeps the Supabase session in localStorage (standard browser behavior) so
// users stay signed in across reloads; memory is the fallback when storage is blocked.
function webGet(key: string): string | null {
  try { const value = localStorage.getItem(key); if (value !== null) return value; } catch { /* storage blocked */ }
  return memory.get(key) ?? null;
}
function webSet(key: string, value: string) {
  memory.set(key, value);
  try { localStorage.setItem(key, value); } catch { /* storage blocked: memory only */ }
}
export const secureStorage = {
  getItem(key: string): Promise<string | null> { return serial(async () => {
    if (!Capacitor.isNativePlatform()) return webGet(key);
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
    } else webSet(key, value);
  }); },
  removeItem(key: string): Promise<void> { return serial(async () => {
    if (Capacitor.isNativePlatform()) await SecureAccount.remove({ key });
    memory.delete(key);
    try { localStorage.removeItem(key); } catch { /* storage blocked */ }
  }); },
};
