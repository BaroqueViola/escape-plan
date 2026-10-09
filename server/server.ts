// Escape Plan game server
// Express serves the web page; Socket.IO handles live game events.
// Run with `npm start`; the admin page opens automatically

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
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

// The server computer is for the admin page only; players run the game page
// on their own computers (`npm run dev:client`) and connect via config.ts.
const ADMIN_PATH = '/admin.html';
app.get(ADMIN_PATH, (_req, res) => res.sendFile(path.join(__dirname, '..', 'client', 'admin.html')));
// The admin page reuses the game's pixel images
app.use('/assets', express.static(path.join(__dirname, '..', 'client', 'dist', 'assets')));
app.get('/', (_req, res) => res.redirect(ADMIN_PATH));

// Admin namespace: set up once, not per player
registerAdmin(io);


// Runs once per client; each area adds its own event handlers
io.on('connection', (socket) => {
  registerLobby(io, socket);
  registerGame(io, socket);
});

// Use httpServer.listen, not app.listen, so Socket.IO is included
httpServer.listen(PORT, () => {
  const adminUrl = `http://localhost:${PORT}${ADMIN_PATH}`;
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Admin page: ${adminUrl}`);
  if (process.env.NO_OPEN !== '1') openInBrowser(adminUrl);
});

// Opens the admin page in the default browser on macOS, Windows or Linux
function openInBrowser(url: string) {
  const [command, args] =
    process.platform === 'darwin' ? ['open', [url]] :
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] :
    ['xdg-open', [url]];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => console.log(`Open ${url} in your browser.`));
  child.unref();
}
