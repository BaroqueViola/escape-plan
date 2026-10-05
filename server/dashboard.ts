// Server dashboard: shows who is connected, in the terminal and on the admin page.

import type { DashboardState, GameServer } from './events.js';
import { players } from './state.js';

// Collect the current numbers (used by the terminal AND the admin page)
export function getDashboardState(io: GameServer): DashboardState {
  return {
    // Only the main namespace '/', so admins are not counted as players
    connected: io.of('/').sockets.size,
    players: [...players.values()],
  };
}

export function printDashboard(io: GameServer, event: string): void {
  const state = getDashboardState(io);

  const time = new Date().toLocaleTimeString();
  console.log(`\n[${time}] ${event}`);
  console.log(`Connected clients: ${state.connected} (joined: ${state.players.length})`);

  if (state.players.length === 0) {
    console.log('  (no players have joined yet)');
  } else {
    state.players.forEach((name, i) => {
      console.log(`  ${i + 1}. ${name}`);
    });
  }

  // Also push the update (and what happened) live to every logged-in admin page
  io.of('/admin').emit('admin:dashboard', state, event);
}