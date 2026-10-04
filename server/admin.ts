// Admin area: a separate '/admin' namespace that only the server operator can join.

import { resetSession } from "@escape-plan/game-core";
import type { GameServer } from './events.js';
import { getDashboardState, printDashboard} from './dashboard.js';
import { game } from "./state.js";

// Read the password from an environment variable; fall back to a default for local testing
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';

export function registerAdmin(io: GameServer): void {
  const admin = io.of('/admin');

  // Runs BEFORE a connection is accepted: check the password
  admin.use((socket, next) => {
    const password: unknown = socket.handshake.auth.password;
    if (password === ADMIN_PASSWORD) {
      next();                                       // let them in
    } else {
      next(new Error('Wrong admin password'));      // refuse the connection
    }
  });

  // Runs only for admins who passed the password check
  admin.on('connection', (socket) => {
    console.log(`\n[Admin] Admin connected (${socket.id})`);

    // Send the current dashboard immediately so the page isn't empty
    socket.emit('admin:dashboard', getDashboardState(io));

    socket.on('disconnect', () => {
      console.log(`\n[Admin] Admin disconnected (${socket.id})`);
    });

    // Reset button
    socket.on('admin:reset', (done) => {
      // 1. Stop the turn timer so it can't fire after the reset
      if (game.turnTimer !== null) {
        clearTimeout(game.turnTimer);
        game.turnTimer = null;
      }

      // 2. Clear the match and set both scores to 0 (keeps the same two players)
      if (game.session !== null) {
        game.session = resetSession(game.session);
      }

      // 3. Tell every player on the main namespace
      io.emit('server:reset');

      // 4. Log it, refresh the admin dashboard, and confirm to the admin who clicked
      printDashboard(io, 'Admin reset the game');
      if (typeof done === 'function') {
        done(true);
      }
    });
  });
}