# Escape Plan Requirements and Implementation Plan

This brief separates the assignment baseline in the PDF from the proposed Node.js implementation in the DOCX. Where the DOCX refers to a 5 x 5 board, treat that as the minimum board size, not a fixed maximum. A larger grid is permitted, provided the game retains the assignment rules and a valid, playable map.

## 1. Project requirements from the assignment PDF

### Network and deployment

- Build Escape Plan as a two-player or multiplayer online game using socket programming and a client-server model.
- Demonstrate play across at least two computers: one computer may run both the server and a game client, while another runs a game client connected to that server.
- Clients know the server address and port from source configuration; players must not be asked to enter them.
- The server displays the current number of connected clients and a list of connected clients.

### Player identity and display

- Each player enters a nickname before the game begins.
- Show a personalised welcome message, for example `Welcome, Alice.`
- Display each player's name and score in the game client.

### Map and roles

- Use a board of at least 5 x 5 blocks. The required 5 x 5 baseline composition is 19 free blocks, 5 obstacle blocks (20%), and 1 tunnel block.
- Include a warden and a prisoner.
- Both characters may enter free blocks and may not enter obstacle blocks.
- Only the prisoner may enter the tunnel block.
- At the beginning of every match, the server randomly places the blocks without creating a deadlock and randomly assigns roles.
- The server randomly places both characters on free blocks. The warden always moves first.

### Turns, outcomes, and replay

- A player has 10 seconds per turn to move one block up, down, left, or right.
- Players alternate turns.
- The prisoner wins by reaching the tunnel; the warden wins by catching the prisoner.
- Increase the winner's score by one.
- At match end, show each client `Win` or `Lost`, both current scores, and a Rematch button.
- Start a rematch only when both players agree. The previous winner becomes the warden.
- Provide a server reset button that resets the game and both players' scores.

## 2. DOCX implementation: Classic Mode MVP

Classic Mode is the default, grading-critical mode. It implements the assignment rules only: no abilities, special map effects, external AI, or speech services. It must remain playable independently of Enhanced Mode.

### Architecture and stack

- **Language:** TypeScript on Node.js.
- **Client:** React with Vite for nickname entry, lobby, board, controls, timer, scores, result screen, rematch flow, and mode selection.
- **Server:** Node.js with Express, Socket.IO, health/admin routes, and an authoritative game engine.
- **Networking:** Socket.IO for bidirectional events, rooms, reconnect handling, acknowledgements, and JSON payloads.
- **Shared contract:** TypeScript types plus Zod schemas for shared events and untrusted-payload validation.
- **State:** In-memory connected players, match, turn deadline, map, roles, rematch votes, and scores.
- **Quality:** Vitest and `socket.io-client` for tests; ESLint and Prettier for code quality.

The server is authoritative: clients submit intended actions, while the server validates them, changes state, checks outcomes, updates scores, and broadcasts the one canonical state. Clients never determine an authoritative score or advance a turn locally.

### Classic Mode flow

1. A client connects to the server URL configured in source, supplies a nickname, receives the connected-player list, and sees the welcome message.
2. Once two players are ready, the server generates a valid random map, assigns first-match roles, chooses legal free starting cells, and starts with the warden.
3. Only the active player may request one legal orthogonal move. The server controls and publishes the 10-second deadline.
4. If a turn expires, the proposed MVP behaviour is that the server selects a random legal move, then continues the match.
5. The server detects tunnel escape or capture, increments the winner's score, and sends the end result and rematch eligibility to both clients.
6. A rematch requires both votes; the previous winner is warden. An admin reset clears the current match and all scores.

### Map generation and validation

- Generate all board tiles on the server. For the 5 x 5 baseline, allocate 5 obstacles, 1 non-obstacle tunnel, and 19 free cells. For a larger board, preserve the assignment constraints while defining the extra-cell composition explicitly.
- Select distinct free starting positions for warden and prisoner.
- Model traversable cells as an orthogonal graph and use breadth-first search to confirm the prisoner can reach the tunnel and both players have a legal move.
- Regenerate maps that fail validation. This is how the implementation guarantees no deadlock.

### Suggested project structure

| Path | Responsibility |
| --- | --- |
| `apps/server` | Express/Socket.IO entry point, connection management, admin routes, timers, sessions |
| `apps/client` | Connection, lobby, board, timer, result, and mode UI |
| `packages/game-core` | Pure map, movement, win, turn, and ability functions |
| `packages/protocol` | Shared events, Zod schemas, enums, and errors |
| `tests` | Unit, integration, and two-client end-to-end tests |

### Protocol, validation, and resilience

- Suggested client events: `player:join`, `lobby:ready`, `game:move`, `game:rematchVote`; reserve `game:ability` for Enhanced Mode.
- Suggested server events: `lobby:state`, `game:state`, `game:rejected`, `game:ended`, and `server:reset`.
- Validate socket identity, nickname uniqueness and length, mode, match ID, turn ownership, deadline, direction/target, and every incoming payload.
- Reject spectators, unknown sockets, duplicate actions, illegal moves, and out-of-turn requests.
- Use the server clock for deadlines and a `clientActionId` to make retry/reconnect handling idempotent.
- Handle disconnection with a clear pause or end transition after a short grace period.
- Use board symbols/text labels, keyboard controls, and visible focus states; do not communicate required meaning by colour alone.

### MVP acceptance and testing

- Unit-test tile counts, map reachability, access rules, legal moves, turn order, timeout handling, capture, tunnel victory, scoring, and rematch role assignment.
- Test malformed/stale/duplicate/out-of-turn protocol requests.
- Run an integration test with two Socket.IO clients through a full match, rematch, and reset.
- Manually demonstrate two computers, configured endpoint, lobby/dashboard lists, invalid-move rejection, both win conditions, timer expiry, scoring, mutual rematch, and server reset.

## 3. DOCX implementation: Enhanced Mode

Enhanced Mode is a separate ruleset on the same authoritative engine and network protocol. Build it only after Classic Mode passes its acceptance criteria. Enhanced-mode failures must not affect Classic Mode; rerun the Classic test suite whenever shared game code changes.

### Prioritised optional features

| Priority | Feature | Intended behaviour |
| --- | --- | --- |
| P1 | Role abilities | Prisoner cloak hides the prisoner for one turn. Warden barrier adds a temporary obstacle only when map connectivity remains valid. |
| P1 | AI shadow clone | A decoy prisoner uses a simple legal-move/pathfinding policy; this is the preferred small, explainable AI feature. |
| P1 | Fog of war | Send each client a filtered view within a limited radius; optionally have obstacles block line of sight. |
| P2 | Character classes | Balanced, explicitly specified abilities for selected prisoner candidates (Rogue, Sukuna, Naruto) and warden candidates (Gojo, Eraser Head, Darth Vader). |
| P2 | Power-ups | Server-placed, limited-duration items such as a vision jammer or a two-tile warden tool; the server validates every effect. |
| P3 | AI opponent | Optional single-player mode using shortest-path evaluation and alpha-beta search, only after multiplayer is stable. |

### Backlog only

- Alternate maps: vacuum, moving obstacles, and Neon Shibuya illusions.
- Other experiments: confusion movement, repetition draws, bonus tiles, multiple prisoners, and prisoner's-dilemma mechanics.

### Enhanced-mode safeguards

- Define ability cooldowns, ranges, durations, uses, and counterplay before implementation.
- Re-run connectivity validation before placing any temporary or permanent obstacle, including barriers.
- Keep API keys on the server and out of source control. Optional ElevenLabs text-to-speech needs a non-AI fallback.
- Select a small, testable feature set: the DOCX recommends one AI feature plus two or three non-AI features.
