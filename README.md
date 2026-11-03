# Escape Plan

Escape Plan includes a pure game engine, Socket.IO server, and a React client
with original block-style pixel assets. Classic uses a 5×5 board and 10-second
turns. Optional modes include Chaos (7×7, classes and 20-second turns), Fog of War,
Custom Map, and VS AI. The server owns movement, turn deadlines, scores, and
rematches; the browser renders server state.

See [docs/REQUIREMENTS_AUDIT.md](docs/REQUIREMENTS_AUDIT.md) for the fundamental
implementation checklist, verification results, and current limitations.

## Development

New here? [docs/TWO_COMPUTER_SETUP.md](docs/TWO_COMPUTER_SETUP.md) walks through running
the game, getting an ElevenLabs API key for the voices, and playing on several computers.

Use Node.js `^22.12.0`, `^24.0.0`, or `>=26.0.0` and npm, as declared in
`package.json`.

```sh
npm install
npm test
npm run typecheck
npm run build
```

For play across computers, set the server computer's LAN URL in
`client/src/config.ts` on each player computer (e.g. `http://192.168.1.23:3000`).
Players do not enter an address or port in the game UI. Then:

- **Server computer:** `npm start`. The admin page
  (`http://localhost:3000/admin.html`) opens automatically to view connected
  clients, reset scores, or close the server; set `ADMIN_PASSWORD` before starting the server.
  Set `NO_OPEN=1` to skip opening the browser.
- **Each player computer:** `npm run dev:client`, then open the URL Vite prints
  (normally `http://localhost:5173`). Players enter nicknames and choose the same
  multiplayer mode; the server pairs compatible queued players. Both press
  **Ready** before the first turn timer starts.

The server computer can also run a game client: run `npm run dev:client` in a
second terminal and open its URL alongside the admin page. This supports the
assignment setup with one server/player computer and a second client-only
computer. Express serves the admin page, assets and voice clips; it does not
serve the built React game page at `/`.

Step-by-step instructions for macOS, Windows and Linux are in
[docs/TWO_COMPUTER_SETUP.md](docs/TWO_COMPUTER_SETUP.md).

For client hot reload, run `npm run dev` and `npm run dev:client` in separate
terminals, then open the URL Vite prints. With `SERVER_URL = ''` (the checked-in
default), the browser connects to its own origin and Vite proxies Socket.IO and
voice requests to `localhost:3000`. For remote player computers, set `SERVER_URL`
to the server's LAN URL; an empty value would target each computer's own local
server through its Vite proxy. If the server's `PORT` changes, also update the
configured URL or Vite proxy target as appropriate.

Controls: Arrow keys or WASD, or the on-screen direction buttons. Press **X** or
use **Stay** to skip movement, at most twice consecutively per character; moving
refills that allowance. Highlighted destinations show the client's predicted
legal moves; the server validates every submitted move. The countdown uses the
server's published time and deadline. At zero, the server uses a remaining stay;
only when none remain does it make a random legal move. Both players can agree
to pause, and both must press Resume to continue.

The npm workspace `@escape-plan/game-core` exposes an ESM entry point and generated
TypeScript declarations. Build before importing it from Node.js:

```js
import { createSession, startMatch, move } from '@escape-plan/game-core';

const unwrap = result => {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
};

// Production adapters supply their own clock and randomness.
let session = unwrap(createSession(['alice', 'bob']));
session = unwrap(startMatch(session, 0, Math.random, { width: 5, height: 5 }));
const result = move(session, session.match.turn.playerId, 'up', 100);
if (result.ok) session = result.value;
else console.log(result.error.code); // The chosen direction may be blocked.
```

## Core API

All state types are readonly. Functions return new state without modifying inputs.
Fallible calls return `{ ok: true, value }` or `{ ok: false, error: { code } }`.
Coordinates are zero-based; board cells are row-major (`y * width + x`).
Player IDs are opaque, distinct, nonempty strings; nickname handling belongs to
the server's lobby layer.

| Function | Contract |
| --- | --- |
| `createSession([playerA, playerB])` | Creates an empty two-player session with zero scores. |
| `generateMap(rng, options?)` | Generates a valid map and starts; defaults to 5×5 and stops after 1,000 failed candidates. |
| `validateMap(map, obstacleDensity?)` | Checks dimensions, composition (20% obstacles by default), connected free cells, tunnel reachability, distinct playable starts, and starting-position fairness constraints. |
| `tileAt(board, coordinate)` | Returns a tile, or `undefined` outside the board. |
| `legalMoves(board, position, role)` | Returns legal directions and target coordinates without considering turn ownership. |
| `startMatch(session, now, rng, options?, warden?, classes?)` | Requires an empty session; generates the board, randomises roles unless a warden is supplied, and starts the warden's turn. Classes enable Chaos rules. |
| `move(session, playerId, direction, now, rng?)` | Validates and applies an active player's move before the deadline. |
| `stay(session, playerId, now, rng?)` | Consumes one remaining stay and passes the turn without moving. |
| `resolveTimeout(session, now, rng)` | At or after expiry, consumes a stay if available, otherwise applies a random legal move; an unanswered Chaos Void challenge ends in capture. |
| `restartTurn(session, now, durationMs?)` | Restarts the active player's deadline using the mode's duration, or a supplied remaining duration when resuming. |
| `voteRematch(session, playerId, accept, now, rng, startWhenAgreed?)` | Replaces a finished-match vote; two yes votes normally create a new match with the winner as warden (random roles after a draw). Pass `false` to record votes without starting. |
| `nextMatch(session, now, rng, warden, options?, classes?)` | Starts a new match from a finished session with an explicit warden, retaining scores. |
| `useAbility(session, playerId, ability, now, rng?)` | Validates and applies a Chaos ability. |
| `resetSession(session)` | Returns an empty session, preserving identities and clearing scores. |

Dimensions must be integers from 5 to 20 in each direction. Obstacles occupy
`floor(width * height * obstacleDensity / 100)` cells; density defaults to 20%
and supports integer percentages from 5% to 30%. One cell is a tunnel, and the
rest are free (19 free, 5 obstacles and 1 tunnel on the default 5×5 board).
The generator connects all free cells and makes the tunnel reachable; both
starting cells are free, distinct, and have a legal opening move.
Validation also requires two independent prisoner-to-tunnel routes, a minimum
starting separation and distance from the tunnel, and a warden start close
enough to contest the race to the exit. Custom Map settings are controlled by
the earliest joined player who is still connected.

The engine never reads the clock or schedules a timer. `now` is a finite,
nonnegative timestamp in milliseconds; active actions cannot predate the current
turn's start. Classic, Custom Map, Fog of War and VS AI turns last 10,000
milliseconds (10 seconds); normal Chaos turns last 20,000 milliseconds. Chaos's
Void challenge has a separate 1,500 ms intro plus a 10,000 ms challenge deadline.
A move exactly at the deadline
is rejected with `TURN_EXPIRED`; a timeout exactly at the deadline is accepted.
An early timeout returns `TIMEOUT_NOT_DUE` without drawing randomness or changing
state. Random generators must return finite values in `[0, 1)`.

Capture occurs when either character moves onto the other's cell, awarding the
warden one point. Tunnel entry awards the prisoner one point. Finished matches
have an outcome and rematch votes, but no active turn. Additional actions cannot
increment scores again. Rematches retain scores and board dimensions. If map
generation fails when the second vote is submitted, retain the previous session
and retry that vote; no partial state change is returned.

A third occurrence of the same position, next role, stay allowances and
persistent Chaos state ends the match in a draw without changing scores.
For Custom Map rematches, the current automatic rematch path retains dimensions
but regenerates with the default 20% obstacle density; it does not retain a
non-default custom density. VS AI next rounds swap roles rather than assigning
the previous winner as warden. Use Classic for the assignment baseline.

The caller must retain only successful transitions and serialise their application.
Socket identity, request deduplication, reconnect handling, timer scheduling,
admin controls, and UI are outside this package.
