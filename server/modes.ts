// Game modes and which social features each one has.
// Every game is Classic for now. When a new mode is added (e.g. a friend's mode),
// add its name to ModeName and its features to MODES; the chat, emote,
// spectate and voice code already checks these flags per game.

export type ModeName = 'classic';

export interface ModeFeatures {
  chat: boolean; // players and spectators can type to each other
  emotes: boolean; // emote buttons (players: voiced, spectators: silent)
  spectate: boolean; // waiting players can watch this game
  voice: boolean; // ElevenLabs voice lines for emotes and "Speak it" chat
}

export const MODES: Record<ModeName, ModeFeatures> = {
  classic: { chat: true, emotes: true, spectate: true, voice: true },
};

// New games start in this mode
export const DEFAULT_MODE: ModeName = 'classic';

export function features(mode: ModeName): ModeFeatures {
  return MODES[mode];
}
