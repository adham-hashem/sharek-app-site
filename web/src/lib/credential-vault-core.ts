import { normalizeUsername, validUsername } from '../../supabase/functions/_shared/account-rules.ts';
export const AUTOFILL_KEY = 'sharek-device-autofill-v1';
export type RememberedAccount = { username: string; password?: string; recoveryPhrase?: string };
export type VaultSnapshot = { accounts: RememberedAccount[]; lastUsername: string };
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };

export function createCredentialVault(storage: Storage) {
  let pending: Promise<unknown> = Promise.resolve();
  const serial = <T>(action: () => Promise<T>) => {
    const result = pending.then(action, action); pending = result.catch(() => undefined); return result;
  };
  const read = async (): Promise<VaultSnapshot> => {
    const raw = await storage.getItem(AUTOFILL_KEY);
    if (!raw) return { accounts: [], lastUsername: '' };
    const value = JSON.parse(raw) as VaultSnapshot;
    if (!Array.isArray(value.accounts)) throw new Error('Invalid saved account data');
    const accounts = value.accounts.filter(row => row && validUsername(row.username)).map(row => ({
      username: normalizeUsername(row.username),
      password: typeof row.password === 'string' && row.password.length <= 288 ? row.password : undefined,
      recoveryPhrase: typeof row.recoveryPhrase === 'string' && row.recoveryPhrase.length <= 512 ? row.recoveryPhrase : undefined,
    }));
    return { accounts, lastUsername: normalizeUsername(value.lastUsername) };
  };
  return {
    read: () => serial(read),
    save: (entry: { username: string; password?: string; recoveryPhrase?: string | null }) => serial(async () => {
      const username = normalizeUsername(entry.username);
      if (!validUsername(username)) throw new Error('Invalid saved username');
      const current = await read();
      const previous = current.accounts.find(row => row.username === username);
      const next: RememberedAccount = { ...previous, username };
      if (entry.password !== undefined) next.password = entry.password;
      if (entry.recoveryPhrase === null) delete next.recoveryPhrase;
      else if (entry.recoveryPhrase !== undefined) next.recoveryPhrase = entry.recoveryPhrase;
      await storage.setItem(AUTOFILL_KEY, JSON.stringify({ accounts: [next, ...current.accounts.filter(row => row.username !== username)], lastUsername: username }));
    }),
    forget: (username: string) => serial(async () => {
      const current = await read();
      const accounts = current.accounts.filter(row => row.username !== normalizeUsername(username));
      if (!accounts.length) await storage.removeItem(AUTOFILL_KEY);
      else await storage.setItem(AUTOFILL_KEY, JSON.stringify({ accounts, lastUsername: accounts[0].username }));
    }),
    clear: () => serial(() => storage.removeItem(AUTOFILL_KEY)),
  };
}
