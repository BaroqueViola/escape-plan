// Game modes and which social features each one has.
// Classic is the original game. Chaos adds classes with abilities on a bigger
// board. The chat, emote, spectate and voice code checks these flags per game.

import type { BoardOptions } from '../packages/game-core/src/index.js';

export type ModeName = 'classic' | 'chaos' | 'fog' | 'ai';

export interface ModeFeatures {
  chat: boolean; // players and spectators can type to each other
  emotes: boolean; // emote buttons (players: voiced, spectators: silent)
  spectate: boolean; // waiting players can watch this game
  voice: boolean; // ElevenLabs voice lines for emotes and "Speak it" chat
}

export const MODES: Record<ModeName, ModeFeatures> = {
  classic: { chat: true, emotes: true, spectate: true, voice: true },
  chaos: { chat: true, emotes: true, spectate: true, voice: true },
  fog: { chat: true, emotes: true, spectate: true, voice: true },
  ai: { chat: true, emotes: true, spectate: true, voice: true },
};

// Board size per mode: Chaos needs room for clones, fingers and smashes
export const BOARDS: Record<ModeName, BoardOptions> = {
  classic: { width: 5, height: 5 },
  chaos: { width: 7, height: 7 },
  fog: { width: 5, height: 5 },
  ai: { width: 5, height: 5 },
};

// Games without a mode (older code paths) count as Classic
export const DEFAULT_MODE: ModeName = 'classic';

export function features(mode: ModeName): ModeFeatures {
  return MODES[mode];
}
