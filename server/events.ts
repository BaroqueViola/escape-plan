// Socket.IO events. Add new events here so TypeScript can check them.

import type { Server, Socket } from 'socket.io';
import type { Coordinate, Role, Tile } from '../packages/game-core/src/index.js';

// ---- Data sent to clients (names, not socket ids) ----------------------------

export interface GameState {
  board: { width: number; height: number; cells: readonly Tile[] }; // row by row
  positions: Record<Role, Coordinate>;
  roles: Record<string, Role>; // nickname -> role
  scores: Record<string, number>; // nickname -> score
  status: 'active' | 'finished';
  turnNickname: string | null; // null once the match is finished
  turnDeadline: number | null; // epoch ms on the server clock
  serverTime: number; // time left = turnDeadline - serverTime (no clock sync needed)
  outcome: { winner: string; reason: 'capture' | 'escape' } | null;
  rematchVotes: Record<string, boolean>;
}

export interface MatchInfo {
  you: { nickname: string; role: Role };
  opponent: { nickname: string; role: Role };
}

export interface MatchResult {
  result: 'Win' | 'Lost'; // for the player receiving it
  winner: string; // nickname
  reason: 'capture' | 'escape';
  scores: Record<string, number>;
}

// ---- Events ------------------------------------------------------------------

// What the admin page receives
export interface DashboardState {
  connected: number; // all open player connections
  players: string[]; // nicknames of players who have joined
}

export interface ServerToClientEvents {
  'lobby:state': (players: string[]) => void;
  'player:welcome': (message: string) => void;
  'player:rejected': (reason: string) => void;
  'admin:dashboard': (state: DashboardState, event?: string) => void; // event: what just happened, for the activity log

  // Gameplay
  'game:started': (info: MatchInfo) => void; // each match, per player: your role + opponent
  'game:state': (state: GameState) => void; // after every move / timeout, to both players
  'game:rejected': (reason: string) => void; // bad move or vote, only to the sender
  'game:ended': (result: MatchResult) => void; // per player: Win / Lost, reason, scores
  'game:rematchStatus': (votes: Record<string, boolean>) => void; // nickname -> accepted?
  'game:opponentLeft': (message: string) => void;
  'server:reset': (message: string) => void; // admin Reset button was pressed
}

// Client data is `unknown` until validated with Zod
export interface ClientToServerEvents {
  'player:join': (nickname: unknown) => void;
  'admin:reset': (done: (ok: boolean) => void) => void; // admin asking for reset

  'game:move': (direction: unknown) => void;
  'game:rematchVote': (accept: unknown) => void;
}

// Short names for a server/socket that uses our events
export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
