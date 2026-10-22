// Shared server state, used by the lobby, game and admin code.

import type { ClassId, Role } from '../packages/game-core/src/index.js';

// Joined players: socket.id -> nickname
export const players = new Map<string, string>();
let lobbyHostId: string | null = null;

export interface CustomMapSettings { width: number; height: number; obstacleDensity: number }
export let customMapSettings: CustomMapSettings = { width: 5, height: 5, obstacleDensity: 20 };
export function setCustomMapSettings(settings: CustomMapSettings): void { customMapSettings = settings; }
export function hostPlayerId(): string | null { return lobbyHostId; }
export function addJoinedPlayer(id: string, nickname: string): void {
  players.set(id, nickname);
  if (lobbyHostId === null) lobbyHostId = id;
}
export function removeJoinedPlayer(id: string): boolean {
  const removed = players.delete(id);
  if (removed && lobbyHostId === id) lobbyHostId = players.keys().next().value ?? null;
  return removed;
}

// What a player queued for: Classic, or Chaos with a side and class
export type QueuePick = { mode: 'classic' | 'fog' } | { mode: 'custom'; board: CustomMapSettings } | { mode: 'chaos'; side: Role; cls: ClassId };

// Players looking for a match: socket.id -> pick, oldest first
export const queue = new Map<string, QueuePick>();
