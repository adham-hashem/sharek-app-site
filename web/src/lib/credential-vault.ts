import { Capacitor } from '@capacitor/core';
import { SecureAccount } from './secure-storage';
import { createCredentialVault } from './credential-vault-core';
export type { RememberedAccount, VaultSnapshot } from './credential-vault-core';
const memory = new Map<string, string>();
// Separate from the session adapter: logout clears tokens, while device autofill remains.
// Android stores AES-GCM ciphertext protected by Keystore. Web preview remains memory-only.
export const credentialVault = createCredentialVault({
  getItem: async key => Capacitor.isNativePlatform() ? (await SecureAccount.get({ key })).value : memory.get(key) ?? null,
  setItem: async (key, value) => { if (Capacitor.isNativePlatform()) await SecureAccount.set({ key, value }); else memory.set(key, value); },
  removeItem: async key => { if (Capacitor.isNativePlatform()) await SecureAccount.remove({ key }); else memory.delete(key); },
});
