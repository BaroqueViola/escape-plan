// Shared server state, used by the lobby, game and admin code.

// Joined players: socket.id -> nickname
export const players = new Map<string, string>();
