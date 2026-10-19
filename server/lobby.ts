// Lobby: players joining with a nickname and leaving.

import type { GameServer, GameSocket } from './events.js';
import { Nickname, QueueRequest } from './schema.js';
import { players, queue, type QueuePick } from './state.js';
import { printDashboard } from "./dashboard.js";
import { chaosSideTaken, gameOfPlayer, matchmake } from './game.js';

// Nicknames of everyone who has joined
function lobbyNames(): string[] {
  return [...players.values()];
}

export function registerLobby(io: GameServer, socket: GameSocket): void {
  // Printing out the Dashboard to the terminal
  printDashboard(io, `Client connected (${socket.id})`);

  // Show the new client who's already in the lobby
  socket.emit('lobby:state', lobbyNames());

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
    if (lobbyNames().includes(nickname)) {
      socket.emit('player:rejected', 'That nickname is already taken');
      return;
    }

    players.set(socket.id, nickname);
    socket.emit('player:welcome', `Welcome, ${nickname}.`);
    io.emit('lobby:state', lobbyNames());
    // Next the player picks Classic or Chaos (player:queue)

    // Printing out the players who joined
    printDashboard(io, `${nickname} joined`);
  });

  // After joining: Classic, or Chaos with a side and class. Then wait for an opponent.
  socket.on('player:queue', (raw) => {
    const parsed = QueueRequest.safeParse(raw);
    if (!parsed.success) {
      socket.emit('player:rejected', parsed.error.issues[0]?.message ?? 'Pick a mode');
      return;
    }
    const nickname = players.get(socket.id);
    if (!nickname) {
      socket.emit('player:rejected', 'Enter a nickname first');
      return;
    }
    if (gameOfPlayer(socket.id)) {
      socket.emit('player:rejected', 'You are already in a match');
      return;
    }
    const request = parsed.data;
    const pick: QueuePick = request.mode === 'classic' ? { mode: 'classic' }
      : { mode: 'chaos', side: request.side, cls: request.cls as Extract<QueuePick, { mode: 'chaos' }>['cls'] };
    if (pick.mode === 'chaos' && chaosSideTaken(io, socket.id, pick.side)) {
      const side = pick.side === 'warden' ? 'prisoner' : 'warden';
      socket.emit('player:sideTaken', `Someone already picked ${pick.side}. You play ${side} this time: pick a ${side} class.`, side);
      return;
    }
    queue.delete(socket.id); // re-queueing moves you to the back
    queue.set(socket.id, pick);
    socket.emit('player:queued', { mode: pick.mode, side: pick.mode === 'chaos' ? pick.side : null, cls: pick.mode === 'chaos' ? pick.cls : null });
    printDashboard(io, `${nickname} is looking for a ${pick.mode === 'chaos' ? `Chaos game as ${pick.side}` : 'Classic game'}`);
    matchmake(io);
  });

  socket.on('player:leaveQueue', () => {
    if (gameOfPlayer(socket.id)) return; // in a match: nothing to leave
    queue.delete(socket.id);
    socket.emit('player:queued', null);
  });

  socket.on('disconnect', () => {
    // Read the nickname before it is deleted, so we can print it
    const nickname = players.get(socket.id);
    queue.delete(socket.id);


    // delete() returns true only if this client had joined
    if (players.delete(socket.id)) {
      io.emit('lobby:state', lobbyNames());
    }

    printDashboard(io, nickname ? `${nickname} left` : `Client disconnected (${socket.id})`);
  });
}