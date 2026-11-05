import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import soundUrl from '../../assets/freesound_community-short-success-sound-glockenspiel-treasure-video-game-6346.mp3?url';

// A ticket belongs to one explicit sign-in/registration, never to a restored session.
export type AuthSoundTicket = { consumed: boolean; cancelled: boolean };
let context: AudioContext | null = null;
let buffer: Promise<AudioBuffer> | null = null;
let ready: Promise<void> | null = null;
let foreground = true;
const pending = new Set<AuthSoundTicket>();
const playing = new Set<AudioBufferSourceNode>();
const isForeground = () => foreground && document.visibilityState !== 'hidden';

function leaveForeground() {
  for (const ticket of pending) ticket.cancelled = true;
  for (const source of playing) { try { source.stop(); } catch { /* Already ended. */ } }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') leaveForeground();
});
if (Capacitor.isNativePlatform()) {
  void App.addListener('appStateChange', ({ isActive }) => {
    foreground = isActive;
    if (!isActive) leaveForeground();
  }).catch(() => { /* Document visibility remains available. */ });
}
function load(ctx: AudioContext): Promise<AudioBuffer> {
  if (!buffer) buffer = fetch(soundUrl).then(response => {
    if (!response.ok) throw new Error('Account sound unavailable');
    return response.arrayBuffer();
  }).then(bytes => ctx.decodeAudioData(bytes)).catch(error => { buffer = null; throw error; });
  return buffer;
}
export function cancelAuthSuccessSound(ticket: AuthSoundTicket | null): void {
  if (!ticket) return;
  ticket.cancelled = true; pending.delete(ticket);
}
// Called from the submit gesture to unlock Web Audio; this does not play anything.
export function prepareAuthSuccessSound(ticket: AuthSoundTicket): void {
  if (ticket.consumed || !isForeground()) return;
  // Only a fresh submit/retry gesture may rearm an interrupted operation.
  ticket.cancelled = false;
  pending.add(ticket);
  try {
    if (!context || context.state === 'closed') {
      const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return;
      context = new Audio(); buffer = null;
    }
    ready = context.state === 'running' ? Promise.resolve() : context.resume().catch(() => undefined);
    void load(context).catch(() => undefined);
  } catch { /* Audio availability must not block authentication. */ }
}
export async function playAuthSuccessSoundOnce(ticket: AuthSoundTicket): Promise<void> {
  if (ticket.consumed) return;
  ticket.consumed = true;
  let timeout: number | undefined;
  try {
    const ctx = context;
    if (!ctx || ticket.cancelled || !isForeground()) return;
    const decoded = await Promise.race([
      Promise.all([load(ctx), ready]).then(([decoded]) => decoded),
      new Promise<null>(resolve => { timeout = window.setTimeout(() => resolve(null), 2500); }),
    ]);
    if (!decoded || ticket.cancelled || ctx.state !== 'running' || !isForeground()) return;
    const source = ctx.createBufferSource(), volume = ctx.createGain();
    source.buffer = decoded; source.loop = false; volume.gain.value = 0.28;
    source.connect(volume); volume.connect(ctx.destination);
    source.onended = () => { playing.delete(source); source.disconnect(); volume.disconnect(); };
    playing.add(source); source.start();
  } catch { /* No retries or playback on resume. */ }
  finally { window.clearTimeout(timeout); pending.delete(ticket); }
}
