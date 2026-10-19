// Shared server state, used by the lobby, game and admin code.

import type { ClassId, Role } from '../packages/game-core/src/index.js';

// Joined players: socket.id -> nickname
export const players = new Map<string, string>();

// What a player queued for: Classic, or Chaos with a side and class
export type QueuePick = { mode: 'classic' } | { mode: 'chaos'; side: Role; cls: ClassId };

// Players looking for a match: socket.id -> pick, oldest first
export const queue = new Map<string, QueuePick>();
