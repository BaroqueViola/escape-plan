// Socket.IO events. Add new events here so TypeScript can check them.

import type { Server, Socket } from 'socket.io';
import type { Coordinate, Role, Tile } from '../packages/game-core/src/index.js';
export type { Role };

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
  spectators: string[]; // nicknames watching this game
}

// What the admin page receives
export interface DashboardState {
  connected: number; // all open player connections
  players: string[]; // nicknames of players who have joined
  games: GameSummary[]; // one per room, two players each
  waiting: string[]; // joined players not in a game yet
  voice: VoiceStatus;
  chatEnabled: boolean; // admin can turn chat off for everyone
  muted: string[]; // nicknames the admin muted (no chat, no emotes)
  feed: FeedEntry[]; // recent chat, emotes and spectator joins, newest first
}

// ---- Chat, emotes, spectating, voice ----------------------------------------

// Emotes: players get the three for their current role; spectators get the crowd set
export const PRISONER_EMOTES = ['laugh', 'cry', 'taunt'] as const;
export const WARDEN_EMOTES = ['angry', 'shock', 'nice'] as const;
export const CROWD_EMOTES = ['fire', 'wow', 'heart', 'popcorn'] as const;
export type PlayerEmote = (typeof PRISONER_EMOTES)[number] | (typeof WARDEN_EMOTES)[number];
export type CrowdEmote = (typeof CROWD_EMOTES)[number];
export type EmoteId = PlayerEmote | CrowdEmote;

export interface ChatMessage {
  id: number;
  from: string; // nickname
  kind: 'player' | 'spectator' | 'admin' | 'system'; // system = a notice such as "Eve was kicked by the admin"
  role: Role | null; // player's role, null for everyone else
  text: string;
  at: number; // epoch ms
}

export interface EmoteEvent {
  from: string;
  kind: 'player' | 'spectator';
  role: Role | null;
  emote: EmoteId;
  clip: string | null; // voice clip id (GET /voice/<id>), null = play the plain sound effect
}

export interface SpectatorInfo {
  count: number;
  names: string[];
}

// What a waiting player sees in the "Spectate a live game" list
export interface LiveGame {
  id: string;
  players: { nickname: string; role: Role | null }[];
  status: GameSummary['status'];
  spectators: number;
}

// Which features are on for this player right now (depends on the game mode)
export interface SocialFeatures {
  chat: boolean;
  emotes: boolean;
  spectate: boolean;
  voice: boolean; // false when there is no API key or today's voice credits are used up
}

export interface VoiceStatus {
  enabled: boolean; // an API key is set
  available: boolean; // a new line can be made right now
  creditsToday: number;
  creditsMonth: number;
  dailyLimit: number;
  monthlyLimit: number;
  lastError: string | null;
}

export interface FeedEntry {
  gameId: string;
  at: number;
  text: string;
}

export interface ServerToClientEvents {
  'lobby:state': (players: string[]) => void;
  'player:welcome': (message: string) => void;
  'player:rejected': (reason: string) => void;
  'player:kicked': (reason: string) => void; // the admin kicked you; the server then disconnects you
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

  // Chat, emotes, spectating
  'social:features': (features: SocialFeatures) => void;
  'social:spectators': (info: SpectatorInfo) => void; // who is watching your game
  'chat:message': (message: ChatMessage) => void;
  'chat:spoken': (messageId: number, clip: string) => void; // voice clip ready for a chat message
  'chat:history': (messages: ChatMessage[]) => void; // when you start watching a game
  'emote:show': (emote: EmoteEvent) => void;
  'spectate:list': (games: LiveGame[]) => void; // live games a waiting player can watch
  'spectate:state': (game: GameSummary) => void; // the game you are watching
  'spectate:ended': (message: string) => void; // the game you watched is over, or you got a match
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

  'chat:send': (message: unknown) => void; // { text, speak }
  'emote:send': (emote: unknown) => void;
  'spectate:watch': (gameId: unknown) => void;
  'spectate:leave': () => void;
  'admin:mute': (nickname: unknown, muted: unknown) => void;
  'admin:chat': (enabled: unknown) => void;
  'admin:watch': (gameId: unknown) => void; // null = stop watching
  'admin:say': (gameId: unknown, text: unknown) => void; // admin message in a game's chat
  'admin:kick': (nickname: unknown, reason: unknown, done?: (error: string | null) => void) => void;
}

// Short names for a server/socket that uses our events
export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
