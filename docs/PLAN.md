# Phase 2 — Pure Classic Mode Game Core

## Summary

Implement the DOCX section 11 phase 2 goal: map generation, path validation, movement, roles, turns, wins, and scoring as testable TypeScript functions. Include pure rematch and reset transitions.

The exit criterion is that all game-rule unit tests pass without a UI or running server. The repository currently has Express but no game code or test setup, so add only the TypeScript and Vitest tooling needed for this phase.

## Implementation

### Package and state

- Create `packages/game-core` as an independently importable ESM TypeScript package, with strict type checking and Vitest tests. Add root commands for testing, type checking, and building it.
- Define typed board cells, coordinates, player IDs, roles, directions, scores, active turns, deadlines, match outcomes, and rematch votes.
- Represent a session with exactly two players, persistent scores, and either no match, an active match, or a finished match.
- Expose functions for session creation, map generation/validation, legal-move enumeration, match start, movement, timeout resolution, rematch voting, and reset.
- Return new state on successful transitions. Rejected actions return typed errors and leave input state unchanged.
- Pass timestamps and randomness into functions. The package must not read the clock, schedule timers, access sockets, or depend on Express.

### Maps and match setup

- Default to 5×5; accept integer width and height of at least five.
- Allocate `floor(width × height × 0.20)` obstacles, one tunnel, and the remaining cells as free. This gives the required 19/5/1 composition on 5×5.
- Shuffle coordinates using injected randomness, place tiles, and select distinct free starting cells.
- Use breadth-first search to require all free cells to form one connected region, with the tunnel reachable from the prisoner’s start and both characters having a legal opening move.
- Retry invalid candidates up to 1,000 times, then return a generation error without changing session state.
- Randomly assign first-match roles. On every match, generate a fresh board and starting positions and give the warden the first turn.

### Moves, turns, and outcomes

- Permit one orthogonal step by the active player into a legal cell: both roles can enter free cells; only the prisoner can enter the tunnel; neither can enter obstacles or leave the board.
- Reject unknown players, moves outside an active match, out-of-turn requests, invalid directions, blocked targets, and moves submitted at or after the deadline.
- Start each turn with a deadline of supplied time plus 10,000 milliseconds. After a successful nonterminal move, switch players and set a new deadline.
- Resolve expiry through an explicit function. At or after the deadline, choose a random legal move for the active player and process it through the same transition logic. An early expiry request changes nothing.
- Treat either character moving onto the other’s cell as capture and a warden victory. Entering the tunnel produces a prisoner victory.
- Award the winner exactly one point, record the winner and reason, and stop turn advancement. Further moves or expiry calls cannot award additional points.

### Rematch and reset

- Accept rematch votes only for a finished match. Each player’s latest vote replaces their previous vote.
- Start a new match only when both players accept. Preserve scores, assign the previous winner as warden, regenerate the map and positions, and clear votes.
- Reset clears the match and votes and sets both scores to zero while preserving player identities. The next ordinary match randomises roles again.
- Keep server controls, socket events, nickname validation, reconnection handling, UI, and Enhanced Mode outside this phase.

## Test Plan

- Verify tile counts on 5×5, 6×6, and rectangular boards; reject invalid dimensions.
- Check connectivity, tunnel reachability, distinct free starts, bounded generation failure, and reproducibility with seeded randomness.
- Test all four directions, boundaries, obstacles, role-specific tunnel access, player identity, turn ownership, and immutability after rejection.
- Verify warden-first ordering, alternating turns, exact deadline boundaries, random legal timeout moves, and timeout-triggered victories.
- Test both capture directions, tunnel escape, score increments, and rejection of actions after a match ends.
- Test one-sided consent, declined/replaced votes, mutual rematch, winner-as-warden assignment, retained scores, and reset from active and finished matches.
- Run repeated seeded generations to check map invariants and scripted complete matches to verify lifecycle transitions.
- Acceptance: unit tests, strict type checking, and package build pass; the package imports without starting any server or timer.

## Confirmed Defaults

- Configurable boards with 20% obstacles rounded down and one tunnel.
- Timeout selects a random legal move.
- Rematch and reset belong in this phase as pure rules.
- Add minimal package/test tooling because the phase 1 foundation is not present; do not implement the remaining phase 1 networking work.
