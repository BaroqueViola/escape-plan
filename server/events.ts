// Socket.IO events. Add new events here so TypeScript can check them.

import type { Server, Socket } from 'socket.io';

// What the admin page receives
export interface DashboardState {
  connected: number; // all open player connections
  players: string[]; // nicknames of players who have joined
}

export interface ServerToClientEvents {
  'lobby:state': (players: string[]) => void;
  'player:welcome': (message: string) => void;
  'player:rejected': (reason: string) => void;
  'admin:dashboard': (state: DashboardState) => void;
  'server:reset': () => void; // tell players the game was reset
}

// Client data is `unknown` until validated with Zod
export interface ClientToServerEvents {
  'player:join': (nickname: unknown) => void;
  'admin:reset': (done: (ok: boolean) => void) => void; // admin asking for reset
}

// Short names for a server/socket that uses our events
export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
