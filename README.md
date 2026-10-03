# Escape Plan

Phase 2 implements the pure Classic Mode game engine. Networking and UI will be
connected in later phases.

## Development

Use Node.js 22.12+, 24.x, or 26+ and npm, matching Vitest's supported runtimes.

```sh
npm install
npm test
npm run typecheck
npm run build
```

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
the later networking layer.

| Function | Contract |
| --- | --- |
| `createSession([playerA, playerB])` | Creates an empty two-player session with zero scores. |
| `generateMap(rng, options?)` | Generates a valid map and starts; defaults to 5×5 and stops after 1,000 failed candidates. |
| `validateMap(map)` | Checks dimensions, composition, connected free cells, tunnel reachability, and distinct playable starts. |
| `tileAt(board, coordinate)` | Returns a tile, or `undefined` outside the board. |
| `legalMoves(board, position, role)` | Returns legal directions and target coordinates without considering turn ownership. |
| `startMatch(session, now, rng, options?)` | Requires an empty session; generates the board, randomises roles, and starts the warder's turn. |
| `move(session, playerId, direction, now)` | Validates and applies an active player's move before the deadline. |
| `resolveTimeout(session, now, rng)` | At or after expiry, applies a random legal move through the same scoring and turn rules. |
| `voteRematch(session, playerId, accept, now, rng)` | Replaces a finished-match vote; two yes votes create a new match with the winner as warder. |
| `resetSession(session)` | Returns an empty session, preserving identities and clearing scores. |

Dimensions must be integers of at least five in each direction. Obstacles occupy
`floor(width * height * 0.20)` cells, one cell is a tunnel, and the rest are free.
The generator connects all free cells and makes the tunnel reachable; both
starting cells are free, distinct, and have a legal opening move.

The engine never reads the clock or schedules a timer. `now` is a finite,
nonnegative timestamp in milliseconds; active actions cannot predate the current
turn's start. Each turn lasts 10,000 milliseconds. A move exactly at the deadline
is rejected with `TURN_EXPIRED`; a timeout exactly at the deadline is accepted.
An early timeout returns `TIMEOUT_NOT_DUE` without drawing randomness or changing
state. Random generators must return finite values in `[0, 1)`.

Capture occurs when either character moves onto the other's cell, awarding the
warder one point. Tunnel entry awards the prisoner one point. Finished matches
have an outcome and rematch votes, but no active turn. Additional actions cannot
increment scores again. Rematches retain scores and board dimensions. If map
generation fails when the second vote is submitted, retain the previous session
and retry that vote; no partial state change is returned.

The caller must retain only successful transitions and serialise their application.
Socket identity, request deduplication, reconnect handling, timer scheduling,
admin controls, and UI are outside this package.
