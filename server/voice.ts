// ElevenLabs text-to-speech, kept on the server so the browser never sees the API key.
//
// Saving credits (free plan: 10,000 credits a month):
// - Every clip is saved to server/.voice-cache/ by (voice, text), so a line is
//   only ever paid for once. Emote lines are made once and reused forever.
// - The Flash model costs about half a credit per character.
// - Daily and monthly caps: when one is reached, voice stops until the next
//   day/month and the game falls back to plain sound effects and text chat.
// - If ElevenLabs fails (no key, bad key, out of credits, offline), voice is
//   switched off for a few minutes instead of retrying on every message.

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Role } from '../packages/game-core/src/index.js';
import type { VoiceStatus } from './events.js';

const API_KEY = process.env.ELEVENLABS_API_KEY ?? '';
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';
const API_URL = process.env.ELEVENLABS_API_URL || 'https://api.elevenlabs.io'; // overridable for testing
const CREDITS_PER_CHAR = MODEL.includes('flash') || MODEL.includes('turbo') ? 0.5 : 1;
// One voice per role. Defaults are ElevenLabs' built-in voices (George, Rachel).
const VOICES: Record<Role, string> = {
  warden: process.env.ELEVENLABS_VOICE_WARDEN || 'JBFqnCBsd6RMkjVDRZzb',
  prisoner: process.env.ELEVENLABS_VOICE_PRISONER || '21m00Tcm4TlvDq8ikWAM',
};
const DAILY_LIMIT = Number(process.env.VOICE_DAILY_CREDITS) || 300;
const MONTHLY_LIMIT = Number(process.env.VOICE_MONTHLY_CREDITS) || 9_000; // leaves room under 10,000
const TIMEOUT_MS = 5_000;
const COOL_OFF_MS = 5 * 60_000; // after an API error, stay quiet this long

const CACHE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.voice-cache');
const USAGE_FILE = path.join(CACHE_DIR, 'usage.json');
const CLIP_ID = /^[a-f0-9]{40}$/;

interface Usage { day: string; month: string; dayCredits: number; monthCredits: number }

const clips = new Map<string, Buffer>(); // clip id -> mp3, loaded lazily from disk
const inFlight = new Map<string, Promise<string | null>>(); // same line requested twice at once
let usage: Usage = loadUsage();
let coolOffUntil = 0;
let lastError: string | null = API_KEY ? null : 'No ELEVENLABS_API_KEY set';

function today(): { day: string; month: string } {
  const iso = new Date().toISOString();
  return { day: iso.slice(0, 10), month: iso.slice(0, 7) };
}

function loadUsage(): Usage {
  const now = today();
  try {
    const saved = JSON.parse(readFileSync(USAGE_FILE, 'utf8')) as Usage;
    return {
      day: now.day, month: now.month,
      dayCredits: saved.day === now.day ? saved.dayCredits : 0,
      monthCredits: saved.month === now.month ? saved.monthCredits : 0,
    };
  } catch {
    return { ...now, dayCredits: 0, monthCredits: 0 };
  }
}

function rollOver(): void {
  const now = today();
  if (usage.month !== now.month) usage = { ...now, dayCredits: 0, monthCredits: 0 };
  else if (usage.day !== now.day) usage = { ...usage, day: now.day, dayCredits: 0 };
}

function saveUsage(): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(USAGE_FILE, JSON.stringify(usage));
  } catch (err) {
    console.error('[Voice] Could not save usage:', err);
  }
}

const clipId = (voice: string, text: string): string =>
  createHash('sha1').update(`${MODEL}|${voice}|${text}`).digest('hex');
const clipFile = (id: string): string => path.join(CACHE_DIR, `${id}.mp3`);

function cached(id: string): boolean {
  if (clips.has(id)) return true;
  if (!existsSync(clipFile(id))) return false;
  clips.set(id, readFileSync(clipFile(id)));
  return true;
}

// Cost of a line that isn't cached yet
export const costOf = (text: string): number => Math.ceil(text.length * CREDITS_PER_CHAR);

// Can a new (not cached) line of this length be made right now?
export function canSpeak(text = ''): boolean {
  rollOver();
  const cost = costOf(text);
  return !!API_KEY && Date.now() >= coolOffUntil
    && usage.dayCredits + cost <= DAILY_LIMIT && usage.monthCredits + cost <= MONTHLY_LIMIT;
}

// Already made (free to play again)?
export function cachedClip(text: string, role: Role): string | null {
  const id = clipId(VOICES[role], text);
  return cached(id) ? id : null;
}

// Turn text into speech in the role's voice. Returns a clip id for
// GET /voice/<id>, or null if voice isn't available (the caller falls back).
export async function speak(text: string, role: Role): Promise<string | null> {
  const voice = VOICES[role];
  const id = clipId(voice, text);
  if (cached(id)) return id; // free
  if (!canSpeak(text)) return null;

  const pending = inFlight.get(id);
  if (pending) return pending;
  const job = generate(id, voice, text).finally(() => inFlight.delete(id));
  inFlight.set(id, job);
  return job;
}

async function generate(id: string, voice: string, text: string): Promise<string | null> {
  // Reserve the credits first so parallel requests can't overshoot the caps
  const cost = costOf(text);
  usage.dayCredits += cost;
  usage.monthCredits += cost;
  try {
    const res = await fetch(`${API_URL}/v1/text-to-speech/${voice}?output_format=mp3_22050_32`, {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: MODEL }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`ElevenLabs answered ${res.status}${await errorDetail(res)}`);
    const audio = Buffer.from(await res.arrayBuffer());
    clips.set(id, audio);
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(clipFile(id), audio);
    lastError = null;
    return id;
  } catch (err) {
    usage.dayCredits -= cost; // nothing was made: give the credits back
    usage.monthCredits -= cost;
    lastError = err instanceof Error ? err.message : String(err);
    coolOffUntil = Date.now() + COOL_OFF_MS;
    console.error(`[Voice] ${lastError}. Using sound effects for ${COOL_OFF_MS / 60_000} minutes.`);
    return null;
  } finally {
    saveUsage();
  }
}

// ElevenLabs explains refusals in the body, e.g. {"detail":{"status":"...","message":"..."}}
async function errorDetail(res: Response): Promise<string> {
  try {
    const { detail } = await res.json() as { detail?: string | { status?: string; message?: string } };
    const text = typeof detail === 'string' ? detail : detail?.message ?? detail?.status;
    return text ? `: ${text.slice(0, 200)}` : '';
  } catch {
    return '';
  }
}

// Audio for GET /voice/:id (only clips the server made itself)
export function getClip(id: string): Buffer | null {
  return CLIP_ID.test(id) && cached(id) ? clips.get(id) ?? null : null;
}

export function voiceStatus(): VoiceStatus {
  rollOver();
  return {
    enabled: !!API_KEY,
    available: canSpeak(),
    creditsToday: usage.dayCredits,
    creditsMonth: usage.monthCredits,
    dailyLimit: DAILY_LIMIT,
    monthlyLimit: MONTHLY_LIMIT,
    lastError,
  };
}

if (!API_KEY) console.log('[Voice] No ELEVENLABS_API_KEY: emotes use plain sound effects, chat is text only.');
