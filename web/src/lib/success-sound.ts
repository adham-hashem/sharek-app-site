import soundUrl from '../../assets/driken5482-retro-coin-1-236677.mp3?url';
const LEDGER_KEY = 'sharek-success-sounds-v1';
let context: AudioContext | null = null;
let buffer: Promise<AudioBuffer> | null = null;
let ready: Promise<void> | null = null;
const handled = new Set<string>();
const isForeground = () => document.visibilityState !== 'hidden';
try { for (const key of JSON.parse(sessionStorage.getItem(LEDGER_KEY) ?? '[]')) if (typeof key === 'string') handled.add(key); } catch { /* Memory-only deduplication if storage is disabled. */ }
function audioContext(): AudioContext | null {
  if (context && context.state !== 'closed') return context;
  const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Audio) return null;
  context = new Audio(); buffer = null; ready = null; return context;
}
function load(ctx: AudioContext): Promise<AudioBuffer> {
  if (!buffer) buffer = fetch(soundUrl).then(response => {
    if (!response.ok) throw new Error('Sound asset unavailable');
    return response.arrayBuffer();
  }).then(bytes => ctx.decodeAudioData(bytes)).catch(error => { buffer = null; throw error; });
  return buffer;
}
// Unlock from the qualifying gesture, without starting any audible source.
export function prepareSuccessSound(): void {
  try {
    const ctx = audioContext(); if (!ctx) return;
    ready = ctx.state === 'running' ? Promise.resolve() : ctx.resume().catch(() => undefined);
    void load(ctx).catch(() => undefined);
  } catch { /* Sound never prevents a meal operation. */ }
}
export async function playSuccessSoundOnce(kind: 'published' | 'received', operationId: string): Promise<void> {
  const key = `${kind}:${operationId}`;
  if (!operationId || handled.has(key) || !isForeground()) return;
  handled.add(key);
  try { sessionStorage.setItem(LEDGER_KEY, JSON.stringify([...handled].slice(-512))); } catch { /* Only event IDs are stored. */ }
  try {
    const ctx = audioContext(); if (!ctx) return;
    let timeout: number | undefined;
    const decoded = await Promise.race([Promise.all([load(ctx), ready]).then(([decoded]) => decoded), new Promise<null>(resolve => { timeout = window.setTimeout(() => resolve(null), 2500); })]).finally(() => window.clearTimeout(timeout));
    if (!decoded || ctx.state !== 'running' || !isForeground()) return;
    const source = ctx.createBufferSource(), volume = ctx.createGain();
    source.buffer = decoded; source.loop = false; volume.gain.value = 0.28;
    source.connect(volume); volume.connect(ctx.destination);
    source.onended = () => { source.disconnect(); volume.disconnect(); }; source.start();
  } catch { /* No delayed replay; other audio and notifications stay independent. */ }
}
