// Lobby: players joining with a nickname and leaving.

import type { GameServer, GameSocket } from './events.js';
import { Nickname } from './schema.js';
import { players } from './state.js';

// Nicknames of everyone who has joined
function lobbyNames(): string[] {
  return [...players.values()];
}

export function registerLobby(io: GameServer, socket: GameSocket): void {
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
  });

  socket.on('disconnect', () => {
    // delete() returns true only if this client had joined
    if (players.delete(socket.id)) {
      io.emit('lobby:state', lobbyNames());
    }
  });
}
