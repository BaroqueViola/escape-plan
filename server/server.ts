// Escape Plan game server
// Express serves the web page; Socket.IO handles live game events.
// Run with `npm run dev`, then open http://localhost:3000

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';

// Socket.IO events. Add new events here so TypeScript can check them.
interface ServerToClientEvents {
  online: (count: number) => void;
}

interface ClientToServerEvents {}

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

let online = 0;

// Runs once per client; `socket` is that one client
io.on('connection', (socket) => {
  online++;
  io.emit('online', online);

  socket.on('disconnect', () => {
    online--;
    io.emit('online', online);
  });
});

// Use httpServer.listen, not app.listen, so Socket.IO is included
httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
