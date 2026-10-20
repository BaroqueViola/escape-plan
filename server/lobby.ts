// Lobby: players joining with a nickname and leaving.

import type { GameServer, GameSocket } from './events.js';
import { CustomMapSettingsRequest, Nickname, QueueRequest } from './schema.js';
import { addJoinedPlayer, customMapSettings, hostPlayerId, players, queue, removeJoinedPlayer, setCustomMapSettings, type QueuePick } from './state.js';
import { printDashboard } from "./dashboard.js";
import { chaosSideTaken, gameOfPlayer, matchmake } from './game.js';

// Nicknames of everyone who has joined
function lobbyNames(): string[] {
  return [...players.values()];
}

function broadcastCustomSettings(io: GameServer): void {
  for (const id of players.keys()) sendCustomSettings(io, id);
}

function sendCustomSettings(io: GameServer, id: string): void {
  const host = hostPlayerId();
  io.to(id).emit('lobby:customSettings', {
    host: host ? players.get(host) ?? null : null,
    isHost: id === host,
    board: { ...customMapSettings },
  });
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

    addJoinedPlayer(socket.id, nickname);
    socket.emit('player:welcome', `Welcome, ${nickname}.`);
    io.emit('lobby:state', lobbyNames());
    broadcastCustomSettings(io);
    // Next the player picks Classic or Chaos (player:queue)

    // Printing out the players who joined
    printDashboard(io, `${nickname} joined`);
  });

  socket.on('player:customSettings:get', () => {
    if (players.has(socket.id)) sendCustomSettings(io, socket.id);
  });

  socket.on('player:customSettings:set', (raw, done) => {
    if (!players.has(socket.id)) {
      done({ ok: false, reason: 'Join the lobby before changing map settings.' });
      return;
    }
    if (socket.id !== hostPlayerId()) {
      done({ ok: false, reason: 'Only the first player in the lobby can change map settings.' });
      return;
    }
    const parsedSettings = CustomMapSettingsRequest.safeParse(raw);
    if (!parsedSettings.success) {
      done({ ok: false, reason: parsedSettings.error.issues[0]?.message ?? 'Invalid map settings.' });
      return;
    }
    setCustomMapSettings(parsedSettings.data);
    for (const [id, queued] of queue) if (queued.mode === 'custom') {
      const updated: QueuePick = { mode: 'custom', board: { ...customMapSettings } };
      queue.set(id, updated);
      io.to(id).emit('player:queued', { mode: 'custom', side: null, cls: null, board: updated.board });
    }
    broadcastCustomSettings(io);
    done({ ok: true });
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
    let pick: QueuePick;
    if (request.mode === 'classic') pick = { mode: 'classic' };
    else if (request.mode === 'custom') pick = { mode: 'custom', board: { ...customMapSettings } };
    else pick = { mode: 'chaos', side: request.side, cls: request.cls as Extract<QueuePick, { mode: 'chaos' }>['cls'] };
    if (pick.mode === 'chaos' && chaosSideTaken(io, socket.id, pick.side)) {
      const side = pick.side === 'warden' ? 'prisoner' : 'warden';
      socket.emit('player:sideTaken', `Someone already picked ${pick.side}. You play ${side} this time: pick a ${side} class.`, side);
      return;
    }
    queue.delete(socket.id); // re-queueing moves you to the back
    queue.set(socket.id, pick);
    socket.emit('player:queued', { mode: pick.mode, side: pick.mode === 'chaos' ? pick.side : null, cls: pick.mode === 'chaos' ? pick.cls : null, ...(pick.mode === 'custom' ? { board: pick.board } : {}) });
    printDashboard(io, `${nickname} is looking for a ${pick.mode === 'chaos' ? `Chaos game as ${pick.side}` : pick.mode === 'custom' ? 'custom map game' : 'Classic game'}`);
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
    if (removeJoinedPlayer(socket.id)) {
      io.emit('lobby:state', lobbyNames());
      broadcastCustomSettings(io);
    }

    printDashboard(io, nickname ? `${nickname} left` : `Client disconnected (${socket.id})`);
  });
}
