import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
export { normalizeUsername, validUsername, validPassword, normalizePersonName, validPersonName } from '../../supabase/functions/_shared/account-rules.ts';

export type AccountReply = { session?: Session; phrase?: string; setupToken?: string; recoveryToken?: string; needsSetup?: boolean; enrolled?: boolean; username?: string | null; available?: boolean };
export class AccountError extends Error { constructor(public code: string) { super(code); } }
export async function accountRequest(action: string, body: Record<string, unknown> = {}, authenticated = false): Promise<AccountReply> {
  const token = authenticated ? (await supabase.auth.getSession()).data.session?.access_token : null;
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/account-auth`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ action, ...body }), signal: AbortSignal.timeout(30000), cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok) throw new AccountError(result.code ?? 'SERVICE_UNAVAILABLE');
    return result;
  } catch (error) {
    if (error instanceof AccountError) throw error;
    throw new AccountError('NETWORK_ERROR');
  }
}
