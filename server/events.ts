// Socket.IO events. Add new events here so TypeScript can check them.

import type { Server, Socket } from 'socket.io';

export interface ServerToClientEvents {
  'lobby:state': (players: string[]) => void;
  'player:welcome': (message: string) => void;
  'player:rejected': (reason: string) => void;
}

// Client data is `unknown` until validated with Zod
export interface ClientToServerEvents {
  'player:join': (nickname: unknown) => void;
}

// Short names for a server/socket that uses our events
export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
