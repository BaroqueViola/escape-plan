// Escape Plan game server
// Express serves the web page; Socket.IO handles live game events.
// Run with `npm run dev`, then open http://localhost:3000

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import type { GameServer } from './events.js';
import { registerLobby } from './lobby.js';

const PORT = Number(process.env.PORT) || 3000;

const app = express();
// Socket.IO needs a real HTTP server, not the Express app itself
const httpServer = createServer(app);
const io: GameServer = new Server(httpServer, {
  cors: { origin: '*' },
});

// Serve files from the client/ folder
app.use(express.static(path.join(import.meta.dirname, '..', 'client')));

// Placeholder until client/index.html exists
app.get('/', (req, res) => {
  res.send('Hello world');
});

// Runs once per client; each area adds its own event handlers
io.on('connection', (socket) => {
  registerLobby(io, socket);
});

// Use httpServer.listen, not app.listen, so Socket.IO is included
httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
