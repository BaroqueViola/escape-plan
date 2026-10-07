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

// Ready check before a new match: who has pressed Ready (nicknames)
export interface ReadyStatus {
  waiting: boolean; // true until both players are ready; the turn timer is paused
  ready: string[];
}

// Pause with consent: one player asks, the other must accept; both press Resume
export interface PauseStatus {
  requestedBy: string | null; // nickname of the player waiting for an answer, or null
  paused: boolean; // true while the game is paused (timer stopped, moves blocked)
  remainingMs: number | null; // time left for the current player, frozen while paused
  resumeReady: string[]; // nicknames who pressed Resume
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

// One running game (Socket.IO room game:<id>), as the admin page sees it
export interface GameSummary {
  id: string;
  players: { nickname: string; role: Role | null; score: number }[];
  status: 'ready' | 'playing' | 'paused' | 'finished'; // ready = waiting for both to press Ready
  turn: string | null; // nickname whose turn it is, while playing
  ready: string[]; // nicknames who pressed Ready, during the ready check
  winner: string | null; // nickname, once the match is finished
  state: GameState | null; // the full board, so the admin can watch the game live
}

// What the admin page receives
export interface DashboardState {
  connected: number; // all open player connections
  players: string[]; // nicknames of players who have joined
  games: GameSummary[]; // one per room, two players each
  waiting: string[]; // joined players not in a game yet
}

export interface ServerToClientEvents {
  'lobby:state': (players: string[]) => void;
  'player:welcome': (message: string) => void;
  'player:rejected': (reason: string) => void;
  'admin:dashboard': (state: DashboardState, event?: string) => void; // event: what just happened, for the activity log

  // Gameplay
  'game:readyStatus': (status: ReadyStatus) => void; // ready check: who is ready, still waiting?
  'game:pauseStatus': (status: PauseStatus) => void; // pause request / paused / who pressed Resume
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

  'game:ready': () => void; // player pressed the Ready button
  'game:pauseRequest': () => void; // ask the rival to pause
  'game:pauseAnswer': (accept: unknown) => void; // answer the rival's pause request
  'game:resume': () => void; // ready to continue after a pause
  'game:move': (direction: unknown) => void;
  'game:rematchVote': (accept: unknown) => void;
}

// Short names for a server/socket that uses our events
export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
