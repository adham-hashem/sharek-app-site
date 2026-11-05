export function normalizeUsername(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validUsername(value: unknown): boolean {
  return /^[a-z0-9_]{3,24}$/.test(normalizeUsername(value));
}

export function validPassword(value: unknown): value is string {
  return typeof value === 'string' && Array.from(value).length >= 12 && new TextEncoder().encode(value).length <= 72;
}

export function normalizePersonName(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/g, ' ') : '';
}
export function validPersonName(value: unknown): boolean {
  const name = normalizePersonName(value);
  return Array.from(name).length >= 1 && Array.from(name).length <= 50 && /^[\p{L}\p{M}][\p{L}\p{M} .'’\-]*$/u.test(name);
}

export function normalizePhrase(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ') : '';
}

export function constantTimeEqual(a: string, b: string): boolean {
  const aa = new TextEncoder().encode(a), bb = new TextEncoder().encode(b);
  let difference = aa.length ^ bb.length;
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) difference |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  return difference === 0;
}
