// Gameplay (C) and turn timer (D).
// The rules live in the core (engine.ts, immutable: every call returns a new
// Session). This file keeps the current Session of each game, calls the core,
// and connects the result to sockets and timers.

import type { GameServer, GameSocket, GameSummary } from './events.js';
import { sendDashboard } from './dashboard.js';
import {
  createSession,
  move,
  nextMatch,
  resetSession,
  resolveTimeout,
  restartTurn,
  startMatch,
  stay,
  useAbility,
  voteRematch,
  type ClassId,
  type ErrorCode,
  type PlayerId,
  type Role,
  type Session,
} from '../packages/game-core/src/index.js';
import { AbilityRequest, ClassPick, Direction, PauseAnswer, RematchVote } from './schema.js';
import { players, queue } from './state.js';
import { toGameState, toMatchInfo, toMatchResult, toRematchVotes, type GameKind, type Names, type Viewer } from './view.js';
import { BOARDS, type ModeName } from './modes.js';
import { chooseAiMove } from './ai.js';
import { addFeed, endSpectating, sendSpectatorState, spectatorsOf, startGameSocial, wasKicked } from './social.js';

// One running game between two players
export interface Game {
  id: string;
  mode: ModeName; // Classic or Chaos; also decides chat, emotes, spectating, voice
  aiPlayerId: PlayerId | null;
  boardOptions: import('../packages/game-core/src/index.js').BoardOptions;
  classes: Record<Role, ClassId> | null; // Chaos: the class on each side; null in Classic
  picking: Map<PlayerId, { side: Role; cls: ClassId }> | null; // Chaos rematch: side/class picks so far
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

// ---- Lookups for chat, emotes and spectating (social.ts) ------------------------

export const gameChannel = channel;
export const findGame = (id: string): Game | undefined => games.get(id);
export const gameOfPlayer = (socketId: PlayerId): Game | undefined => gameOf.get(socketId);
export function roleOf(g: Game, socketId: PlayerId): 'warden' | 'prisoner' | null {
  const m = g.session.match;
  if (!m || !g.session.players.includes(socketId)) return null;
  return m.roles.warden === socketId ? 'warden' : 'prisoner';
}
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
  NO_STAYS_LEFT: 'You stayed twice in a row. You have to move this turn',
  NO_ABILITY: 'Your class has no such ability',
  ABILITY_NOT_READY: 'Your ability is not ready yet',
  ILLEGAL_TARGET: 'You cannot use your ability there',
  IN_VOID: 'You are in the Void. Win the challenge to get out',
};

const kindOf = (g: Game): GameKind => ({ mode: g.mode, classes: g.classes });
const roleIn = (g: Game, id: PlayerId): Role | null => {
  const m = g.session.match;
  return m ? (m.roles.warden === id ? 'warden' : 'prisoner') : null;
};

// ---- Broadcasting -----------------------------------------------------------

// Send the current GameState to both players, each with what their side may see
export function broadcastState(io: GameServer, g: Game): void {
  const now = Date.now();
  for (const id of g.session.players) {
    const state = toGameState(g.session, g.names, now, kindOf(g), roleIn(g, id) ?? 'public');
    if (state) io.to(id).emit('game:state', state);
  }
  sendSpectatorState(io, g); // spectators see the board too
  sendDashboard(io); // keep the admin page's Games list live
}

// ---- Admin view ---------------------------------------------------------------

// Every running game with its two players, for the admin page
export function getGames(): GameSummary[] {
  return [...games.values()].map((g) => summarize(g));
}

// One game as the admin page ('all') and spectators ('public') see it
export function summarize(g: Game, viewer: Viewer = 'all'): GameSummary {
  const m = g.session.match;
  const status: GameSummary['status'] =
    g.ready !== null ? 'ready' : g.picking !== null ? 'picking' : g.paused !== null ? 'paused' : m?.status === 'finished' ? 'finished' : 'playing';
  return {
    id: g.id,
    mode: g.mode,
    players: g.session.players.map((id) => {
      const role = roleIn(g, id);
      return { nickname: g.names[id] ?? id, role, cls: role && g.classes ? g.classes[role] : null, score: g.session.scores[id] ?? 0 };
    }),
    status,
    turn: status === 'playing' && m?.status === 'active' ? g.names[m.turn.playerId] ?? null : null,
    ready: g.ready ? [...g.ready].map((id) => g.names[id] ?? id) : [],
    winner: m?.status === 'finished' && m.outcome.winner ? g.names[m.outcome.winner] ?? null : null,
    state: toGameState(g.session, g.names, Date.now(), kindOf(g), viewer),
    spectators: spectatorsOf(g.id),
  };
}

// Joined players who are not in a game yet (picking a mode or waiting for an opponent)
export function getWaiting(): string[] {
  return [...players].filter(([id]) => !gameOf.has(id)).map(([, name]) => name);
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

  if (g.aiPlayerId !== null && match.turn.playerId === g.aiPlayerId) {
    g.timer = setTimeout(() => onAiTurn(io, g), 650);
    return;
  }

  const delay = Math.max(0, match.turn.deadline - Date.now());
  g.timer = setTimeout(() => onTimeout(io, g), delay);
}

function onAiTurn(io: GameServer, g: Game): void {
  g.timer = null;
  if (games.get(g.id) !== g || !g.aiPlayerId) return;
  const match = g.session.match;
  if (match?.status !== 'active' || match.turn.playerId !== g.aiPlayerId) return;
  const role: Role = match.roles.warden === g.aiPlayerId ? 'warden' : 'prisoner';
  const result = move(g.session, g.aiPlayerId, chooseAiMove(match.board, match.positions, role), Date.now(), rng);
  if (!result.ok) {
    console.error(`AI move failed in game ${g.id}: ${result.error.code}`);
    startTimer(io, g);
    return;
  }
  g.session = result.value;
  afterTurn(io, g);
}

function onTimeout(io: GameServer, g: Game): void {
  g.timer = null;
  if (games.get(g.id) !== g) return; // game was destroyed meanwhile

  // The core keeps the player in place (uses a stay), or plays a random legal move when no stays are left
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
  feedChaos(io, g);
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
  });  sendDashboard(io);
}

// Tell both players about pause requests and the paused state
function sendPauseStatus(io: GameServer, g: Game): void {
  io.to(channel(g)).emit('game:pauseStatus', {
    requestedBy: g.pauseRequest ? g.names[g.pauseRequest] ?? g.pauseRequest : null,
    paused: g.paused !== null,
    remainingMs: g.paused ? g.paused.remainingMs : null,
    resumeReady: g.paused ? [...g.paused.resume].map((id) => g.names[id] ?? id) : [],
  });
  sendDashboard(io);
}

// g.session already holds a fresh active match.
// needReady = true: show the board but keep the clock stopped until both press Ready.
function beginMatch(io: GameServer, g: Game, needReady = false): void {
  for (const id of g.session.players) {
    const info = toMatchInfo(g.session, g.names, id, kindOf(g));
    if (info) io.to(id).emit('game:started', info);
  }
  g.pauseRequest = null; // a new match never starts paused
  g.paused = null;
  broadcastState(io, g);

  if (needReady) {
    cancelTimer(g);
    g.ready = new Set(g.aiPlayerId ? [g.aiPlayerId] : []);
    sendReadyStatus(io, g);
    return; // the timer starts in the game:ready handler
  }
  g.ready = null;
  startTimer(io, g);
}

function destroyGame(io: GameServer, g: Game): void {
  cancelTimer(g);
  games.delete(g.id);
  endSpectating(io, g.id, 'The game you were watching has ended.');
  for (const id of g.session.players) gameOf.delete(id);
  io.in(channel(g)).socketsLeave(channel(g));
  sendDashboard(io);
}

// Queued players who are free to play right now, oldest first
function waitingPlayers(io: GameServer) {
  return [...queue].filter(([id]) => !gameOf.has(id) && players.has(id) && io.sockets.sockets.has(id));
}

// Chaos: is someone already waiting on this side (and nobody on the other)?
// Then the newcomer has to switch: the first to pick a side keeps it.
export function chaosSideTaken(io: GameServer, socketId: PlayerId, side: Role): boolean {
  const chaos = waitingPlayers(io).filter(([id, p]) => id !== socketId && p.mode === 'chaos');
  return chaos.some(([, p]) => p.mode === 'chaos' && p.side === side)
    && !chaos.some(([, p]) => p.mode === 'chaos' && p.side !== side);
}

// Pair up queued players who aren't in a game yet: two Classic players, or a
// Chaos prisoner with a Chaos warden. Called after someone queues and after a game ends.
export function matchmake(io: GameServer): void {
  for (;;) {
    const waiting = waitingPlayers(io);
    const classic = waiting.filter(([ , p]) => p.mode === 'classic');
    const classicPair = classic.length >= 2 ? [classic[0]![0], classic[1]![0]] as const : null;
    if (classicPair) {
      startGame(io, classicPair[0], classicPair[1], 'classic', null);
      continue;
    }
    const fog = waiting.filter(([ , p]) => p.mode === 'fog');
    if (fog.length >= 2) {
      startGame(io, fog[0]![0], fog[1]![0], 'fog', null);
      continue;
    }
    const custom = waiting.filter((entry): entry is [PlayerId, Extract<import('./state.js').QueuePick, { mode: 'custom' }>] => entry[1].mode === 'custom');
    if (custom.length >= 2) {
      startGame(io, custom[0]![0], custom[1]![0], 'classic', null, custom[0]![1].board);
      continue;
    }
    const prisoner = waiting.find(([, p]) => p.mode === 'chaos' && p.side === 'prisoner');
    const warden = waiting.find(([, p]) => p.mode === 'chaos' && p.side === 'warden');
    if (prisoner?.[1].mode === 'chaos' && warden?.[1].mode === 'chaos') {
      startGame(io, warden[0], prisoner[0], 'chaos', { warden: warden[1].cls, prisoner: prisoner[1].cls });
      continue;
    }
    return;
  }
}

// In Chaos `a` plays warden; in Classic the core picks the warden at random
function startGame(io: GameServer, a: PlayerId, b: PlayerId, mode: ModeName, classes: Record<Role, ClassId> | null, boardOptions = BOARDS[mode], aiPlayerId: PlayerId | null = null): void {
  const created = createSession([a, b]);
  const forcedWarden = mode === 'chaos' ? a : mode === 'ai' ? (rng() < 0.5 ? a : b) : undefined;
  const started = created.ok ? startMatch(created.value, Date.now(), rng, boardOptions, forcedWarden, classes ?? undefined) : created;
  if (!started.ok) {
    console.error(`Could not start a match: ${started.error.code}`);
    for (const id of [a, b]) { // don't retry the same pair forever: back to the mode menu
      queue.delete(id);
      io.to(id).emit('player:queued', null);
      io.to(id).emit('game:rejected', 'Could not start a match. Pick a mode again.');
    }
    return;
  }

  const g: Game = {
    id: String(nextGameId++),
    mode,
    aiPlayerId,
    boardOptions,
    classes,
    picking: null,
    session: started.value,
    names: { [a]: aiPlayerId === a ? 'AI' : players.get(a) ?? a, [b]: aiPlayerId === b ? 'AI' : players.get(b) ?? b },
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
  startGameSocial(io, g); // stops spectating, sends chat/emote features
  feedPicks(io, g);
  beginMatch(io, g, true); // new pair: wait for both to press Ready
}

function startAiGame(io: GameServer, humanId: PlayerId): void {
  const aiId = `ai:${nextGameId}`;
  startGame(io, humanId, aiId, 'ai', null, BOARDS.ai, aiId);
}

// ---- Admin live feed: class picks, abilities and Void results ----------------

const CLASS_NAMES: Record<ClassId, string> = {
  allmight: 'All Might', naruto: 'Naruto', sukuna: 'Sukuna', afo: 'All For One', sasuke: 'Sasuke', gojo: 'Gojo',
};

function nameIn(g: Game, role: Role): string {
  const id = g.session.players.find((p) => roleIn(g, p) === role);
  return (id && g.names[id]) ?? role;
}

function feedPicks(io: GameServer, g: Game): void {
  if (!g.classes) return;
  const { prisoner, warden } = g.classes;
  addFeed(io, g.id, `${nameIn(g, 'prisoner')} picked ${CLASS_NAMES[prisoner]} · ${nameIn(g, 'warden')} picked ${CLASS_NAMES[warden]}`, true);
}

// One line per ability or Void result from the turn that just happened
function feedChaos(io: GameServer, g: Game): void {
  const chaos = g.session.match?.chaos;
  if (!chaos || !g.classes) return;
  const who = (role: Role) => `${nameIn(g, role)} (${CLASS_NAMES[g.classes![role]]})`;
  for (const e of chaos.events) {
    const line = e.kind === 'smash' ? `${who(e.by)} used Smash Punch${e.hit ? ' and stunned their rival' : ' and missed'}`
      : e.kind === 'clones' ? `${who(e.by)} used ${e.by === 'prisoner' ? `Shadow Clone ×${e.count}` : 'a stolen clone'}`
      : e.kind === 'swap' ? `${who('prisoner')} swapped with a clone`
      : e.kind === 'dismantle' ? `${who(e.by)} used Dismantle on a rock`
      : e.kind === 'shrine' ? `${who(e.by)} used Malevolent Shrine`
      : e.kind === 'steal' ? `${who('warden')} stole ${CLASS_NAMES[e.from]}'s power`
      : e.kind === 'sharingan' ? `${who('warden')} used Sharingan`
      : e.kind === 'void' ? `${who('warden')} used Infinite Void`
      : e.kind === 'escape' ? `${nameIn(g, 'prisoner')} ${e.escaped ? 'escaped the Void' : 'was caught in the Void'}`
      : e.kind === 'clonecatch' ? `${who('warden')}'s clone caught the prisoner`
      : null;
    if (line) addFeed(io, g.id, line, true);
  }
}

// Chaos rematch: tell both players who has picked a side and class
function sendPickingStatus(io: GameServer, g: Game): void {
  const picks = g.picking ?? new Map<PlayerId, { side: Role; cls: ClassId }>();
  const taken: Partial<Record<Role, string>> = {};
  for (const [id, p] of picks) taken[p.side] = g.names[id] ?? id;
  io.to(channel(g)).emit('game:picking', {
    picking: g.picking !== null,
    picked: [...picks.keys()].map((id) => g.names[id] ?? id),
    taken,
    wardenRequired: g.session.match?.status === 'finished' && g.session.match.outcome.winner
      ? g.names[g.session.match.outcome.winner] ?? g.session.match.outcome.winner : null,
  });
  sendDashboard(io);
}

// Admin "Reset" button: scores back to 0, timer cancelled, fresh match for every game
export function resetGame(io: GameServer): void {
  for (const g of games.values()) {
    cancelTimer(g);
    // Chaos games keep their sides and classes; Classic picks a new warden at random
    const warden = g.mode === 'chaos' ? g.session.match?.roles.warden : undefined;
    g.session = resetSession(g.session); // scores 0, no match
    if (g.picking !== null) {
      g.picking = null;
      sendPickingStatus(io, g);
    }
    io.to(channel(g)).emit('server:reset', 'The server reset the game and scores.');

    const restarted = startMatch(g.session, Date.now(), rng, g.boardOptions, warden, g.classes ?? undefined);
    if (!restarted.ok) {
      console.error(`Could not restart game ${g.id}: ${restarted.error.code}`);
      continue;
    }
    g.session = restarted.value;
    beginMatch(io, g, true); // after a reset: wait for both to press Ready
  }
}

export function registerGame(io: GameServer, socket: GameSocket): void {
  socket.on('player:playAi', () => {
    if (!players.has(socket.id) || gameOf.has(socket.id)) {
      socket.emit('player:rejected', 'Join the lobby before starting a VS AI game');
      return;
    }
    queue.delete(socket.id);
    startAiGame(io, socket.id);
  });

  socket.on('game:ready', () => {
    const g = gameOf.get(socket.id);
    if (!g || g.ready === null) return; // not in a ready check: nothing to do

    g.ready.add(socket.id);
    if (g.ready.size < g.session.players.length) {
      sendReadyStatus(io, g); // one player ready, still waiting for the other
      return;
    }

    // Both ready: use this mode's full turn duration from now
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

    const result = move(g.session, socket.id, direction.data, Date.now(), rng);
    if (!result.ok) {
      socket.emit('game:rejected', REASONS[result.error.code]); // timer keeps running
      return;
    }
    g.session = result.value;
    afterTurn(io, g); // the other player's mode-specific turn starts now, or the match ends
  });

  socket.on('game:stay', () => {
    const g = gameOf.get(socket.id);
    if (!g) {
      socket.emit('game:rejected', 'You are not in a match');
      return;
    }
    if (g.ready !== null || g.paused !== null) {
      socket.emit('game:rejected', g.ready !== null ? 'Both players must press Ready first' : 'The game is paused. Both players must press Resume');
      return;
    }
    const result = stay(g.session, socket.id, Date.now(), rng);
    if (!result.ok) {
      socket.emit('game:rejected', REASONS[result.error.code]);
      return;
    }
    g.session = result.value;
    afterTurn(io, g);
  });

  // Chaos: use your class's ability. It takes your turn, like a move.
  socket.on('game:ability', (raw) => {
    const ability = AbilityRequest.safeParse(raw);
    if (!ability.success) {
      socket.emit('game:rejected', ability.error.issues[0]?.message ?? 'Unknown ability');
      return;
    }
    const g = gameOf.get(socket.id);
    if (!g) {
      socket.emit('game:rejected', 'You are not in a match');
      return;
    }
    if (g.ready !== null || g.paused !== null) {
      socket.emit('game:rejected', g.ready !== null ? 'Both players must press Ready first' : 'The game is paused. Both players must press Resume');
      return;
    }
    const result = useAbility(g.session, socket.id, ability.data, Date.now(), rng);
    if (!result.ok) {
      socket.emit('game:rejected', REASONS[result.error.code]);
      return;
    }
    g.session = result.value;
    afterTurn(io, g);
  });

  // Chaos rematch: pick a side and class again. The first to lock in a side keeps it.
  socket.on('game:pick', (raw) => {
    const pick = ClassPick.safeParse(raw);
    if (!pick.success) {
      socket.emit('game:rejected', pick.error.issues[0]?.message ?? 'Invalid pick');
      return;
    }
    const g = gameOf.get(socket.id);
    if (!g || g.picking === null) return;
    const previousWinner = g.session.match?.status === 'finished' ? g.session.match.outcome.winner : null;
    if (previousWinner && (socket.id === previousWinner ? pick.data.side !== 'warden' : pick.data.side !== 'prisoner')) {
      socket.emit('game:rejected', socket.id === previousWinner
        ? 'The previous winner must play warden in the rematch.'
        : 'The previous winner is assigned warden; choose prisoner.');
      return;
    }
    const other = [...g.picking].find(([id]) => id !== socket.id);
    if (other && other[1].side === pick.data.side) {
      const side: Role = pick.data.side === 'warden' ? 'prisoner' : 'warden';
      socket.emit('player:sideTaken', `${g.names[other[0]] ?? 'Your rival'} already took ${pick.data.side}. Pick a ${side} class.`, side);
      return;
    }
    g.picking.set(socket.id, pick.data);
    if (g.picking.size < g.session.players.length) {
      sendPickingStatus(io, g);
      return;
    }

    const picks = g.picking;
    const wardenId = [...picks].find(([, p]) => p.side === 'warden')![0];
    const classes = { warden: picks.get(wardenId)!.cls, prisoner: [...picks].find(([, p]) => p.side === 'prisoner')![1].cls };
    const next = nextMatch(g.session, Date.now(), rng, wardenId, g.boardOptions, classes);
    if (!next.ok) {
      socket.emit('game:rejected', REASONS[next.error.code]); // e.g. map generation failed: try again
      return;
    }
    g.session = next.value;
    g.classes = classes;
    g.picking = null;
    feedPicks(io, g);
    for (const [id, p] of picks) queue.set(id, { mode: 'chaos', ...p }); // a later new opponent uses these picks
    sendPickingStatus(io, g);
    beginMatch(io, g);
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

    if (g.mode === 'ai') {
      if (!vote.data || g.session.match?.status !== 'finished' || !g.aiPlayerId) return;
      const warden = g.session.match.roles.prisoner;
      const next = nextMatch(g.session, Date.now(), rng, warden, g.boardOptions);
      if (!next.ok) {
        socket.emit('game:rejected', REASONS[next.error.code]);
        return;
      }
      g.session = next.value;
      beginMatch(io, g);
      return;
    }

    // Classic: the core starts a new match (previous winner = warden) once both accept.
    // Chaos: both accept -> both pick a side and class again first (game:pick).
    const chaos = g.mode === 'chaos';
    if (g.picking !== null) return; // already picking
    const result = voteRematch(g.session, socket.id, vote.data, Date.now(), rng, !chaos);
    if (!result.ok) {
      socket.emit('game:rejected', REASONS[result.error.code]);
      return;
    }
    g.session = result.value;

    const m = g.session.match;
    if (m?.status === 'active') beginMatch(io, g);
    else if (chaos && m?.status === 'finished' && g.session.players.every((id) => m.rematchVotes[id] === true)) {
      g.picking = new Map();
      io.to(channel(g)).emit('game:rematchStatus', toRematchVotes(g.session, g.names));
      sendPickingStatus(io, g);
    } else {
      broadcastState(io, g);
      io.to(channel(g)).emit('game:rematchStatus', toRematchVotes(g.session, g.names));
    }
  });

  socket.on('game:leave', () => {
    const g = gameOf.get(socket.id);
    if (!g) return;
    destroyGame(io, g);
    for (const id of g.session.players) {
      queue.delete(id);
      io.to(id).emit('player:queued', null);
      if (id !== socket.id) io.to(id).emit('game:opponentLeft', `${g.names[socket.id] ?? 'Your opponent'} left the match.`);
    }
    matchmake(io);
  });

  socket.on('disconnect', () => {
    const g = gameOf.get(socket.id);
    if (!g) return;

    destroyGame(io, g); // also cancels the timer
    const leaver = g.names[socket.id] ?? 'Your opponent';
    const message = wasKicked(socket.id) ? `${leaver} was kicked by the admin.` : `${leaver} left the game.`;
    for (const id of g.session.players) {
      if (id !== socket.id) io.to(id).emit('game:opponentLeft', message);
    }
    matchmake(io); // the remaining player may be paired with someone waiting
  });
}
