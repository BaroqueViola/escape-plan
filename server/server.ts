// Escape Plan game server
// Express serves the web page; Socket.IO handles live game events.
// Run with `npm run dev`, then open http://localhost:3000

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import type { GameServer } from './events.js';
import { registerLobby } from './lobby.js';
import { registerAdmin} from "./admin.js";
import { registerGame } from './game.js';

const PORT = Number(process.env.PORT) || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
// Socket.IO needs a real HTTP server, not the Express app itself
const httpServer = createServer(app);
const io: GameServer = new Server(httpServer, {
  cors: { origin: '*' },
});

// Serve files from the client/ folder
app.use(express.static(path.join(__dirname, '..', 'client')));

// Placeholder until client/index.html exists
app.get('/', (req, res) => {
  res.send('Hello world');
});

// Admin namespace: set up once, not per player
registerAdmin(io);


// Runs once per client; each area adds its own event handlers
io.on('connection', (socket) => {
  registerLobby(io, socket);
  registerGame(io, socket);
});

// Use httpServer.listen, not app.listen, so Socket.IO is included
httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});