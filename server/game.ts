// Gameplay (C) and turn timer (D).
// The rules live in the core (engine.ts, immutable: every call returns a new
// Session). This file keeps the current Session of each game, calls the core,
// and connects the result to sockets and timers.

import type { GameServer, GameSocket } from './events.js';
import {
  createSession,
  move,
  resetSession,
  resolveTimeout,
  restartTurn,
  startMatch,
  voteRematch,
  type ErrorCode,
  type PlayerId,
  type Session,
} from '../packages/game-core/src/index.js';
import { Direction, PauseAnswer, RematchVote } from './schema.js';
import { players } from './state.js';
import { toGameState, toMatchInfo, toMatchResult, toRematchVotes, type Names } from './view.js';

// One running game between two players
interface Game {
  id: string;
  session: Session; // replaced after every successful core call
  names: Names; // socket id -> nickname, captured when the game starts
  timer: NodeJS.Timeout | null; // turn timer
  ready: Set<PlayerId> | null; // during a ready check: who pressed Ready; null = no ready check
  pauseRequest: PlayerId | null; // player waiting for the rival to accept a pause
  paused: { remainingMs: number; resume: Set<PlayerId> } | null; // set while paused
}

// When resuming, the current player gets at least this much time
const MIN_RESUME_MS = 1_000;

const games = new Map<string, Game>(); // game id -> game
const gameOf = new Map<PlayerId, Game>(); // socket id -> game
let nextGameId = 1;

const channel = (g: Game): string => `game:${g.id}`;
const rng = Math.random;

// Core error code -> message for the player
const REASONS: Record<ErrorCode, string> = {
  INVALID_PLAYERS: 'Invalid players',
  INVALID_DIMENSIONS: 'Invalid board size',
  INVALID_RANDOM: 'Server error',
  GENERATION_FAILED: 'Could not create a map',
  INVALID_TIME: 'Server clock error',
  MATCH_EXISTS: 'A match is already in progress',
  NO_ACTIVE_MATCH: 'No match in progress',
  UNKNOWN_PLAYER: 'You are not in this game',
  OUT_OF_TURN: 'Not your turn',
  INVALID_DIRECTION: 'Invalid direction',
  ILLEGAL_MOVE: 'You cannot move there',
  TURN_EXPIRED: 'Your time is up',
  TIMEOUT_NOT_DUE: 'The turn is still running',
  NO_LEGAL_MOVE: 'No legal move',
  NO_FINISHED_MATCH: 'The match has not finished',
  INVALID_VOTE: 'Vote must be true or false',
};

// ---- Broadcasting -----------------------------------------------------------

// Send the current GameState to both players
export function broadcastState(io: GameServer, g: Game): void {
  const state = toGameState(g.session, g.names, Date.now());
  if (state) io.to(channel(g)).emit('game:state', state);
}

// ---- D. Turn timer ----------------------------------------------------------

function cancelTimer(g: Game): void {
  if (g.timer) clearTimeout(g.timer);
  g.timer = null;
}

// (Re)start the timer for the current turn. It fires at turn.deadline.
function startTimer(io: GameServer, g: Game): void {
  cancelTimer(g);
  const match = g.session.match;
  if (match?.status !== 'active') return;

  const delay = Math.max(0, match.turn.deadline - Date.now());
  g.timer = setTimeout(() => onTimeout(io, g), delay);
}

function onTimeout(io: GameServer, g: Game): void {
  g.timer = null;
  if (games.get(g.id) !== g) return; // game was destroyed meanwhile

  // The core plays a random legal move for the player who ran out of time
  const result = resolveTimeout(g.session, Date.now(), rng);
  if (!result.ok) {
    if (result.error.code === 'TIMEOUT_NOT_DUE') startTimer(io, g); // fired a hair early
    else console.error(`Timeout failed in game ${g.id}: ${result.error.code}`);
    return;
  }
  g.session = result.value;
  afterTurn(io, g);
}

// ---- C. Gameplay ------------------------------------------------------------

// After any change to the board: send state, then either end the match or
// start the next player's timer.
function afterTurn(io: GameServer, g: Game): void {
  broadcastState(io, g);
  if (g.session.match?.status === 'finished') endMatch(io, g);
  else startTimer(io, g);
}

function endMatch(io: GameServer, g: Game): void {
  cancelTimer(g);
  if (g.pauseRequest !== null) {
    g.pauseRequest = null; // the match is over, so the pause request no longer applies
    sendPauseStatus(io, g);
  }
  for (const id of g.session.players) {
    const result = toMatchResult(g.session, g.names, id);
    if (result) io.to(id).emit('game:ended', result);
  }
}

// Tell both players who has pressed Ready
function sendReadyStatus(io: GameServer, g: Game): void {
  io.to(channel(g)).emit('game:readyStatus', {
    waiting: g.ready !== null,
    ready: g.ready ? [...g.ready].map((id) => g.names[id] ?? id) : [],
  });
}

// Tell both players about pause requests and the paused state
function sendPauseStatus(io: GameServer, g: Game): void {
  io.to(channel(g)).emit('game:pauseStatus', {
    requestedBy: g.pauseRequest ? g.names[g.pauseRequest] ?? g.pauseRequest : null,
    paused: g.paused !== null,
    remainingMs: g.paused ? g.paused.remainingMs : null,
    resumeReady: g.paused ? [...g.paused.resume].map((id) => g.names[id] ?? id) : [],
  });
}

// g.session already holds a fresh active match.
// needReady = true: show the board but keep the clock stopped until both press Ready.
function beginMatch(io: GameServer, g: Game, needReady = false): void {
  for (const id of g.session.players) {
    const info = toMatchInfo(g.session, g.names, id);
    if (info) io.to(id).emit('game:started', info);
  }
  g.pauseRequest = null; // a new match never starts paused
  g.paused = null;
  broadcastState(io, g);

  if (needReady) {
    cancelTimer(g);
    g.ready = new Set();
    sendReadyStatus(io, g);
    return; // the timer starts in the game:ready handler
  }
  g.ready = null;
  startTimer(io, g);
}

function destroyGame(io: GameServer, g: Game): void {
  cancelTimer(g);
  games.delete(g.id);
  for (const id of g.session.players) gameOf.delete(id);
  io.in(channel(g)).socketsLeave(channel(g));
}

// Pair up joined players who aren't in a game yet.
// Called by lobby.ts after someone joins, and below after a game ends.
export function matchmake(io: GameServer): void {
  const waiting = [...players].filter(([id]) => !gameOf.has(id) && io.sockets.sockets.has(id));

  for (;;) {
    const [a, b] = waiting.splice(0, 2);
    if (!a || !b) return;

    const created = createSession([a[0], b[0]]);
    const started = created.ok ? startMatch(created.value, Date.now(), rng) : created;
    if (!started.ok) {
      console.error(`Could not start a match: ${started.error.code}`);
      continue;
    }

    const g: Game = {
      id: String(nextGameId++),
      session: started.value,
      names: { [a[0]]: a[1], [b[0]]: b[1] },
      timer: null,
      ready: null,
      pauseRequest: null,
      paused: null,
    };
    games.set(g.id, g);
    for (const id of g.session.players) {
      gameOf.set(id, g);
      io.sockets.sockets.get(id)?.join(channel(g));
    }
    beginMatch(io, g, true); // new pair: wait for both to press Ready
  }
}

// Admin "Reset" button: scores back to 0, timer cancelled, fresh match for every game
export function resetGame(io: GameServer): void {
  for (const g of games.values()) {
    cancelTimer(g);
    g.session = resetSession(g.session); // scores 0, no match
    io.to(channel(g)).emit('server:reset', 'The server reset the game and scores.');

    const restarted = startMatch(g.session, Date.now(), rng);
    if (!restarted.ok) {
      console.error(`Could not restart game ${g.id}: ${restarted.error.code}`);
      continue;
    }
    g.session = restarted.value;
    beginMatch(io, g, true); // after a reset: wait for both to press Ready
  }
}

export function registerGame(io: GameServer, socket: GameSocket): void {
  socket.on('game:ready', () => {
    const g = gameOf.get(socket.id);
    if (!g || g.ready === null) return; // not in a ready check: nothing to do

    g.ready.add(socket.id);
    if (g.ready.size < g.session.players.length) {
      sendReadyStatus(io, g); // one player ready, still waiting for the other
      return;
    }

    // Both ready: give the first player a full 10 seconds from now
    const restarted = restartTurn(g.session, Date.now());
    if (!restarted.ok) {
      console.error(`Could not start the turn in game ${g.id}: ${restarted.error.code}`);
      return;
    }
    g.session = restarted.value;
    g.ready = null;
    sendReadyStatus(io, g); // waiting: false -> clients hide the Ready screen
    broadcastState(io, g); // new deadline
    startTimer(io, g);
  });

  // ---- Pause (needs the rival's consent) ----
  socket.on('game:pauseRequest', () => {
    const g = gameOf.get(socket.id);
    if (!g) return;
    if (g.session.match?.status !== 'active' || g.ready !== null || g.paused !== null) {
      socket.emit('game:rejected', 'You can only pause during a running match');
      return;
    }
    if (g.pauseRequest !== null) {
      socket.emit('game:rejected', 'A pause request is already waiting for an answer');
      return;
    }
    g.pauseRequest = socket.id;
    sendPauseStatus(io, g); // the rival sees Accept / Decline; the clock keeps running
  });

  socket.on('game:pauseAnswer', (raw) => {
    const answer = PauseAnswer.safeParse(raw);
    if (!answer.success) {
      socket.emit('game:rejected', answer.error.issues[0]?.message ?? 'Invalid answer');
      return;
    }
    const g = gameOf.get(socket.id);
    if (!g || g.pauseRequest === null) return;
    if (g.pauseRequest === socket.id) {
      socket.emit('game:rejected', 'Your rival has to answer your pause request');
      return;
    }

    const requester = g.pauseRequest;
    g.pauseRequest = null;
    const match = g.session.match;

    if (!answer.data) {
      io.to(requester).emit('game:rejected', `${g.names[socket.id] ?? 'Your rival'} declined to pause.`);
      sendPauseStatus(io, g);
      return;
    }
    if (match?.status !== 'active' || g.ready !== null || g.paused !== null) {
      sendPauseStatus(io, g); // the match ended meanwhile: nothing to pause
      return;
    }

    // Both agreed: stop the clock and remember how much time was left
    cancelTimer(g);
    g.paused = {
      remainingMs: Math.min(match.turn.deadline - match.turn.startedAt, Math.max(MIN_RESUME_MS, match.turn.deadline - Date.now())),
      resume: new Set(),
    };
    sendPauseStatus(io, g);
  });

  socket.on('game:resume', () => {
    const g = gameOf.get(socket.id);
    if (!g || g.paused === null) return;

    g.paused.resume.add(socket.id);
    if (g.paused.resume.size < g.session.players.length) {
      sendPauseStatus(io, g); // still waiting for the other player
      return;
    }

    // Both pressed Resume: continue with the time that was left
    const restarted = restartTurn(g.session, Date.now(), g.paused.remainingMs);
    if (!restarted.ok) {
      console.error(`Could not resume game ${g.id}: ${restarted.error.code}`);
      return;
    }
    g.session = restarted.value;
    g.paused = null;
    sendPauseStatus(io, g);
    broadcastState(io, g); // new deadline
    startTimer(io, g);
  });

  socket.on('game:move', (raw) => {
    const direction = Direction.safeParse(raw);
    if (!direction.success) {
      socket.emit('game:rejected', direction.error.issues[0]?.message ?? 'Invalid direction');
      return;
    }
    const g = gameOf.get(socket.id);
    if (!g) {
      socket.emit('game:rejected', 'You are not in a match');
      return;
    }
    if (g.ready !== null) {
      socket.emit('game:rejected', 'Both players must press Ready first');
      return;
    }
    if (g.paused !== null) {
      socket.emit('game:rejected', 'The game is paused. Both players must press Resume');
      return;
    }

    const result = move(g.session, socket.id, direction.data, Date.now());
    if (!result.ok) {
      socket.emit('game:rejected', REASONS[result.error.code]); // timer keeps running
      return;
    }
    g.session = result.value;
    afterTurn(io, g); // the other player's 10 s starts now, or the match ends
  });

  socket.on('game:rematchVote', (raw) => {
    const vote = RematchVote.safeParse(raw);
    if (!vote.success) {
      socket.emit('game:rejected', vote.error.issues[0]?.message ?? 'Invalid vote');
      return;
    }
    const g = gameOf.get(socket.id);
    if (!g) {
      socket.emit('game:rejected', 'You are not in a match');
      return;
    }

    // Core starts a new match (previous winner = warden) once both accept
    const result = voteRematch(g.session, socket.id, vote.data, Date.now(), rng);
    if (!result.ok) {
      socket.emit('game:rejected', REASONS[result.error.code]);
      return;
    }
    g.session = result.value;

    if (g.session.match?.status === 'active') beginMatch(io, g);
    else {
      broadcastState(io, g);
      io.to(channel(g)).emit('game:rematchStatus', toRematchVotes(g.session, g.names));
    }
  });

  socket.on('disconnect', () => {
    const g = gameOf.get(socket.id);
    if (!g) return;

    destroyGame(io, g); // also cancels the timer
    const leaver = g.names[socket.id] ?? 'Your opponent';
    for (const id of g.session.players) {
      if (id !== socket.id) io.to(id).emit('game:opponentLeft', `${leaver} left the game.`);
    }
    matchmake(io); // the remaining player may be paired with someone waiting
  });
}
