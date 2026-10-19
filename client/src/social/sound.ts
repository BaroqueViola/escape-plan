// Sound for emotes and spoken chat.
// Voice clips come from our server (GET /voice/<id>), never from ElevenLabs
// directly, so the browser never needs the API key. If a clip is missing or
// can't play, a short plain sound effect made with the Web Audio API plays instead.

import type { PlayerEmote } from '../../../server/events';
import { SERVER_URL } from '../config';

const MUTE_KEY = 'escape-plan:muted';
let muted = readMuted();
let ctx: AudioContext | null = null;

function readMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

export const isMuted = (): boolean => muted;
export function setMuted(value: boolean): void {
  muted = value;
  try { localStorage.setItem(MUTE_KEY, value ? '1' : '0'); } catch { /* private window: keep it for this visit */ }
}

// Browsers only allow sound after the player clicks something; call this on any click
export function unlockAudio(): void {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

// Notes for each emote's fallback sound effect: a frequency in Hz, or [Hz, seconds] for a longer note
type Note = number | [number, number];
const EFFECTS: Record<PlayerEmote, Note[]> = {
  laugh: [520, 520, 520, [780, 0.4]], // "he-he-he HAAA"
  cry: [520, 440, 360],
  taunt: [440, 660, 990],
  angry: [180, 140],
  shock: [300, 900],
  nice: [520, 780],
};
const STEP = 0.11; // seconds per short note

export function playEffect(emote: PlayerEmote): void {
  if (muted) return;
  unlockAudio();
  if (!ctx) return;
  let t = ctx.currentTime;
  for (const note of EFFECTS[emote]) {
    const [freq, length] = typeof note === 'number' ? [note, STEP] : note;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length - 0.01);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + length);
    t += length + (length > STEP ? 0 : 0.02); // small gap between the "he"s
  }
}

// Play a voice clip; if it fails, run `fallback` (the plain sound effect, or nothing for chat)
export function playClip(clip: string | null, fallback?: () => void): void {
  if (muted) return;
  if (!clip) { fallback?.(); return; }
  let failed = false;
  const fail = () => { if (!failed) { failed = true; fallback?.(); } };
  const audio = new Audio(`${SERVER_URL}/voice/${clip}`);
  audio.addEventListener('error', fail, { once: true });
  audio.play().catch(fail);
}

// "Domain Expansion. Infinite Void." when Gojo opens the Void. The server makes
// the line once at startup; without it, a deep hit and a rising shimmer play.
export function playDomainLine(): void {
  playClip('line/domain', playDomainEffect);
}

function playDomainEffect(): void {
  if (muted) return;
  unlockAudio();
  if (!ctx) return;
  const t = ctx.currentTime;
  const tone = (type: OscillatorType, from: number, to: number, start: number, length: number, volume: number) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t + start);
    osc.frequency.exponentialRampToValueAtTime(to, t + start + length);
    gain.gain.setValueAtTime(0.0001, t + start);
    gain.gain.exponentialRampToValueAtTime(volume, t + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + start + length);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(t + start);
    osc.stop(t + start + length);
  };
  tone('sine', 110, 40, 0, 0.7, 0.25); // the hit
  tone('triangle', 330, 1320, 0.1, 1.1, 0.05); // the shimmer
  tone('triangle', 495, 1980, 0.18, 1.0, 0.035);
}
