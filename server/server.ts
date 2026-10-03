// Escape Plan game server
// Express serves the web page; Socket.IO handles live game events.
// Run with `npm run dev`, then open http://localhost:3000

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { Nickname } from './schema.js';

// Socket.IO events. Add new events here so TypeScript can check them.
interface ServerToClientEvents {
  'lobby:state': (players: string[]) => void;
  'player:welcome': (message: string) => void;
  'player:rejected': (reason: string) => void;
}

// Client data is `unknown` until validated with Zod
interface ClientToServerEvents {
  'player:join': (nickname: unknown) => void;
}

const PORT = Number(process.env.PORT) || 3000;

const app = express();
// Socket.IO needs a real HTTP server, not the Express app itself
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: '*' },
});

// Serve files from the client/ folder
app.use(express.static(path.join(import.meta.dirname, '..', 'client')));

// Placeholder until client/index.html exists
app.get('/', (req, res) => {
  res.send('Hello world');
});

// Joined players: socket.id -> nickname
const players = new Map<string, string>();

// Runs once per client; `socket` is that one client
io.on('connection', (socket) => {
  // Show the new client who's already in the lobby
  socket.emit('lobby:state', [...players.values()]);

  socket.on('player:join', (raw) => {
    const result = Nickname.safeParse(raw);
    if (!result.success) {
      socket.emit('player:rejected', result.error.issues[0]?.message ?? 'Invalid nickname');
      return;
    }
    const nickname = result.data;

    if (players.has(socket.id)) {
      socket.emit('player:rejected', 'You have already joined');
      return;
    }
    if ([...players.values()].includes(nickname)) {
      socket.emit('player:rejected', 'That nickname is already taken');
      return;
    }

    players.set(socket.id, nickname);
    socket.emit('player:welcome', `Welcome, ${nickname}.`);
    io.emit('lobby:state', [...players.values()]);
  });

  socket.on('disconnect', () => {
    // delete() returns true only if this client had joined
    if (players.delete(socket.id)) {
      io.emit('lobby:state', [...players.values()]);
    }
  });
});

// Use httpServer.listen, not app.listen, so Socket.IO is included
httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
