// Shared server state, used by the lobby, game and admin code.

import type { Session} from "@escape-plan/game-core";

// Joined players: socket.id -> nickname
export const players = new Map<string, string>();


// The current game. Stored in one object so any file can change it.
export const game: {
  session: Session | null;                               // null until two players start a game
  turnTimer: ReturnType<typeof setTimeout> | null;       // the 10-second timer, if one is running
} = {
  session: null,
  turnTimer: null,
};
