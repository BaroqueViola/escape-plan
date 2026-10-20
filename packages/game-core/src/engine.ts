import type { ClassId } from './classes.js';
import { applyAbility, chaosMoves, endTurn, newChaos, VOID_ROUNDS } from './chaos.js';
import { DEFAULT_BOARD, generateMap, randomIndex, sameCell } from './map.js';
import { failure, success, type Ability, type ActiveMatch, type Board, type BoardOptions, type ChaosState,
  type Coordinate, type Direction, type PlayerId, type Random, type Result, type Role, type Session } from './types.js';

export const TURN_DURATION_MS = 10_000;
export const VOID_DURATION_MS = 10_000; // time for the whole Void challenge (3 rounds of up to 3 s)
export const VOID_INTRO_MS = 1_500; // the Domain Expansion title card plays first; the challenge time starts after it
// A player may skip moving this many turns in a row, then must move
export const MAX_STAYS = 2;
const fullStays = { warden: MAX_STAYS, prisoner: MAX_STAYS } as const;
const positionKey = (board: Board, positions: Readonly<Record<Role, Coordinate>>, next: Role,
  staysLeft: Readonly<Record<Role, number>>, chaos: ChaosState | undefined): string => {
  const persistentChaos = chaos ? (({ events: _events, ...state }) => state)(chaos) : null;
  return JSON.stringify({ cells: board.cells, warden: positions.warden, prisoner: positions.prisoner,
    next, staysLeft, chaos: persistentChaos });
};
const validTime = (now: number): boolean => Number.isFinite(now) && now >= 0
  && Number.isFinite(now + TURN_DURATION_MS);
export function createSession(players: readonly [PlayerId, PlayerId]): Result<Session> {
  if (players.length !== 2 || players.some(p => typeof p !== 'string' || p.length === 0)
    || players[0] === players[1]) return failure('INVALID_PLAYERS');
  return success({ players: [players[0], players[1]],
    scores: { [players[0]]: 0, [players[1]]: 0 }, match: null });
}
function setup(session: Session, now: number, rng: Random, options: BoardOptions,
  warden?: PlayerId, classes?: Readonly<Record<Role, ClassId>>): Result<Session> {
  if (warden !== undefined && !session.players.includes(warden)) return failure('UNKNOWN_PLAYER');
  if (!validTime(now)) return failure('INVALID_TIME');
  const map = generateMap(rng, options);
  if (!map.ok) return map;
  if (warden === undefined) {
    const draw = randomIndex(rng, 2);
    if (!draw.ok) return draw;
    warden = session.players[draw.value]!;
  }
  const prisoner = session.players.find(p => p !== warden)!;
  const chaos = classes ? newChaos(classes, map.value.board, map.value.starts, rng) : null;
  if (chaos && !chaos.ok) return chaos;
  return success({ ...session, match: {
    status: 'active', board: map.value.board, positions: map.value.starts,
    roles: { warden, prisoner }, turn: { playerId: warden, startedAt: now, deadline: now + TURN_DURATION_MS },
    staysLeft: fullStays, ...(chaos ? { chaos: chaos.value } : {}),
    repetitions: { [positionKey(map.value.board, map.value.starts, 'warden', fullStays, chaos?.value)]: 1 },
  } });
}
// warden: who plays warden (Chaos players pick their side); random when left out.
// classes: the Chaos class on each side; Classic leaves it out.
export function startMatch(session: Session, now: number, rng: Random,
  options: BoardOptions = DEFAULT_BOARD, warden?: PlayerId, classes?: Readonly<Record<Role, ClassId>>): Result<Session> {
  if (session.match !== null) return failure('MATCH_EXISTS');
  return setup(session, now, rng, options, warden, classes);
}
// Start the next match of a finished one with chosen roles (Chaos rematch,
// after both players picked their side again). Scores are kept.
export function nextMatch(session: Session, now: number, rng: Random, warden: PlayerId,
  options?: BoardOptions, classes?: Readonly<Record<Role, ClassId>>): Result<Session> {
  const match = session.match;
  if (match?.status !== 'finished') return failure('NO_FINISHED_MATCH');
  return setup(session, now, rng, options ?? match.board, warden, classes);
}
// What a turn changed. Board and chaos default to the match's own.
interface TurnChange {
  readonly positions: Readonly<Record<Role, Coordinate>>;
  readonly staysLeft?: number; // the mover's stays after this turn (a move or ability refills them)
  readonly board?: Board;
  readonly chaos?: ChaosState;
  readonly used?: Ability['kind'];
}
// The match ends: capture (the warden wins) or escape (the prisoner wins)
function finish(session: Session, match: ActiveMatch, board: Board, positions: Readonly<Record<Role, Coordinate>>,
  chaos: ChaosState | undefined, reason: 'capture' | 'escape'): Result<Session> {
  const winner = reason === 'capture' ? match.roles.warden : match.roles.prisoner;
  return success({ ...session,
    scores: { ...session.scores, [winner]: session.scores[winner]! + 1 },
    match: { status: 'finished', board, roles: match.roles, positions, ...(chaos ? { chaos } : {}),
      outcome: { winner, reason }, rematchVotes: {} },
  });
}
function finishStalemate(session: Session, match: ActiveMatch, board: Board,
  positions: Readonly<Record<Role, Coordinate>>, chaos: ChaosState | undefined): Result<Session> {
  return success({ ...session,
    match: { status: 'finished', board, roles: match.roles, positions,
      ...(chaos ? { chaos } : {}),
      outcome: { winner: null, reason: 'stalemate' }, rematchVotes: {} },
  });
}
function transition(session: Session, match: ActiveMatch, role: Role, change: TurnChange,
  now: number, rng: Random): Result<Session> {
  const { positions, staysLeft = MAX_STAYS, board = match.board } = change;
  let chaos = change.chaos ?? (match.chaos && { ...match.chaos, events: [] });
  const capture = sameCell(positions.warden, positions.prisoner);
  const escape = !capture && role === 'prisoner'
    && board.cells[positions.prisoner.y * board.width + positions.prisoner.x] === 'tunnel';
  if (capture || escape) return finish(session, match, board, positions, chaos, capture ? 'capture' : 'escape');
  let next: Role = role === 'warden' ? 'prisoner' : 'warden';
  let duration = TURN_DURATION_MS;
  if (chaos) {
    const ended = endTurn(chaos, board, positions, role, change.used ?? null, rng);
    if (!ended.ok) return ended;
    chaos = ended.value;
    if (chaos.events.some(e => e.kind === 'clonecatch')) return finish(session, match, board, positions, chaos, 'capture');
    if (chaos.inVoid) duration = VOID_INTRO_MS + VOID_DURATION_MS; // the prisoner's next turn is the Void challenge
    // A stunned player loses their turn; it still counts as a turn passing for them
    else if (chaos.stunned[next] > 0) {
      chaos = { ...chaos, stunned: { ...chaos.stunned, [next]: chaos.stunned[next] - 1 },
        events: [...chaos.events, { kind: 'skip', role: next }] };
      const skipped = endTurn(chaos, board, positions, next, null, rng);
      if (!skipped.ok) return skipped;
      chaos = skipped.value;
      next = role;
      if (chaos.events.some(e => e.kind === 'clonecatch')) return finish(session, match, board, positions, chaos, 'capture');
    }
  }
  const repetitions = match.repetitions ?? {};
  {
    const staysAfterTurn = { ...match.staysLeft, [role]: staysLeft };
    const key = positionKey(board, positions, next, staysAfterTurn, chaos);
    const count = (repetitions[key] ?? 0) + 1;
    if (count >= 3) return finishStalemate(session, match, board, positions, chaos);
    return success({ ...session, match: { ...match, board, positions,
      repetitions: { ...repetitions, [key]: count },
      staysLeft: staysAfterTurn, ...(chaos ? { chaos } : {}),
      turn: { playerId: match.roles[next], startedAt: now, deadline: now + duration } } });
  }
}
// Checks shared by every action on your own turn; returns the active match and your role
function ownTurn(session: Session, playerId: PlayerId, now: number): Result<{ match: ActiveMatch; role: Role }> {
  if (!session.players.includes(playerId)) return failure('UNKNOWN_PLAYER');
  const match = session.match;
  if (match?.status !== 'active') return failure('NO_ACTIVE_MATCH');
  if (!validTime(now) || now < match.turn.startedAt) return failure('INVALID_TIME');
  if (match.turn.playerId !== playerId) return failure('OUT_OF_TURN');
  return success({ match, role: match.roles.warden === playerId ? 'warden' : 'prisoner' });
}
// rng is only used in Chaos (a crushed finger comes back on a random tile)
export function move(session: Session, playerId: PlayerId, direction: string, now: number,
  rng: Random = Math.random): Result<Session> {
  const own = ownTurn(session, playerId, now);
  if (!own.ok) return own;
  const { match, role } = own.value;
  if (!['up', 'down', 'left', 'right'].includes(direction)) return failure('INVALID_DIRECTION');
  if (now >= match.turn.deadline) return failure('TURN_EXPIRED');
  if (match.chaos?.inVoid) return failure('IN_VOID');
  // In Sasuke's illusion the keys are shuffled, and walking into a wall just bumps
  const scramble = role === 'prisoner' ? match.chaos?.scramble : null;
  const real = scramble ? scramble[direction as Direction] : direction;
  const action = chaosMoves(match.board, match.positions, role, match.chaos).find(m => m.direction === real);
  if (!action && scramble && match.chaos) {
    return transition(session, match, role, { positions: match.positions, chaos: { ...match.chaos, events: [{ kind: 'bump' }] } }, now, rng);
  }
  return action ? transition(session, match, role, { positions: { ...match.positions, [role]: action.target } }, now, rng)
    : failure('ILLEGAL_MOVE');
}
// Skip moving this turn. Each role may stay MAX_STAYS turns in a row.
export function stay(session: Session, playerId: PlayerId, now: number, rng: Random = Math.random): Result<Session> {
  const own = ownTurn(session, playerId, now);
  if (!own.ok) return own;
  const { match, role } = own.value;
  if (now >= match.turn.deadline) return failure('TURN_EXPIRED');
  if (match.chaos?.inVoid) return failure('IN_VOID');
  if (match.staysLeft[role] <= 0) return failure('NO_STAYS_LEFT');
  return transition(session, match, role, { positions: match.positions, staysLeft: match.staysLeft[role] - 1 }, now, rng);
}
const ABILITIES: readonly string[] = ['smash', 'clones', 'swap', 'dismantle', 'shrine', 'steal', 'sharingan', 'void', 'escape'];
// Use your Chaos class's ability. It takes your turn and refills your stays.
export function useAbility(session: Session, playerId: PlayerId, ability: Ability, now: number,
  rng: Random = Math.random): Result<Session> {
  const own = ownTurn(session, playerId, now);
  if (!own.ok) return own;
  const { match, role } = own.value;
  if (now >= match.turn.deadline) return failure('TURN_EXPIRED');
  if (!match.chaos) return failure('NO_ABILITY');
  if (typeof ability !== 'object' || ability === null || !ABILITIES.includes(ability.kind)) return failure('ILLEGAL_TARGET');
  if (ability.kind === 'escape') return escapeVoid(session, match, role, ability.hits, now);
  if (match.chaos.inVoid) return failure('IN_VOID');
  const used = applyAbility(match.board, match.positions, match.chaos, role, ability, rng);
  if (!used.ok) return used;
  return transition(session, match, role, { ...used.value, used: ability.kind }, now, rng);
}
// When the clock runs out the player stays put if they have a stay left,
// otherwise a random legal move is played.
// The prisoner's Void challenge: hit every round to get back to the board and take
// a normal turn; miss one and they are caught. It is not a turn of its own.
function escapeVoid(session: Session, match: ActiveMatch, role: Role, hits: readonly boolean[], now: number): Result<Session> {
  const chaos = match.chaos;
  if (role !== 'prisoner' || !chaos?.inVoid) return failure('ILLEGAL_TARGET');
  if (!Array.isArray(hits) || hits.length !== VOID_ROUNDS || hits.some(h => typeof h !== 'boolean')) return failure('ILLEGAL_TARGET');
  const escaped = hits.every(h => h);
  const after = { ...chaos, inVoid: false, events: [{ kind: 'escape', escaped } as const] };
  if (!escaped) return finish(session, match, match.board, match.positions, after, 'capture');
  return success({ ...session, match: { ...match, chaos: after,
    turn: { playerId: match.turn.playerId, startedAt: now, deadline: now + TURN_DURATION_MS } } });
}
export function resolveTimeout(session: Session, now: number, rng: Random): Result<Session> {
  const match = session.match;
  if (match?.status !== 'active') return failure('NO_ACTIVE_MATCH');
  if (!validTime(now) || now < match.turn.startedAt) return failure('INVALID_TIME');
  if (now < match.turn.deadline) return failure('TIMEOUT_NOT_DUE');
  if (match.chaos?.inVoid) { // no answer from the Void counts as a miss
    return finish(session, match, match.board, match.positions,
      { ...match.chaos, inVoid: false, events: [{ kind: 'escape', escaped: false }] }, 'capture');
  }
  const role = match.roles.warden === match.turn.playerId ? 'warden' : 'prisoner';
  if (match.staysLeft[role] > 0) {
    return transition(session, match, role, { positions: match.positions, staysLeft: match.staysLeft[role] - 1 }, now, rng);
  }
  const actions = chaosMoves(match.board, match.positions, role, match.chaos);
  if (!actions.length) return failure('NO_LEGAL_MOVE');
  const draw = randomIndex(rng, actions.length);
  return draw.ok ? transition(session, match, role,
    { positions: { ...match.positions, [role]: actions[draw.value]!.target } }, now, rng) : draw;
}
// Restart the current player's turn clock at `now` (same player, same board).
// Used after a ready check (full 10 s) and when resuming a pause (the time that was left).
export function restartTurn(session: Session, now: number,
  durationMs: number = TURN_DURATION_MS): Result<Session> {
  const match = session.match;
  if (match?.status !== 'active') return failure('NO_ACTIVE_MATCH');
  if (!validTime(now) || now < match.turn.startedAt) return failure('INVALID_TIME');
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > TURN_DURATION_MS) return failure('INVALID_TIME');
  return success({ ...session, match: { ...match,
    turn: { playerId: match.turn.playerId, startedAt: now, deadline: now + durationMs } } });
}
// startWhenAgreed = false only records the votes (Chaos: players pick sides first, then nextMatch)
export function voteRematch(session: Session, playerId: PlayerId, accept: boolean,
  now: number, rng: Random, startWhenAgreed = true): Result<Session> {
  if (!session.players.includes(playerId)) return failure('UNKNOWN_PLAYER');
  const match = session.match;
  if (match?.status !== 'finished') return failure('NO_FINISHED_MATCH');
  if (typeof accept !== 'boolean') return failure('INVALID_VOTE');
  const rematchVotes = { ...match.rematchVotes, [playerId]: accept };
  const voted = { ...session, match: { ...match, rematchVotes } };
  return startWhenAgreed && session.players.every(p => rematchVotes[p] === true)
    ? setup(voted, now, rng, match.board, match.outcome.winner ?? undefined) : success(voted);
}
export function resetSession(session: Session): Session {
  return { ...session, scores: { [session.players[0]]: 0, [session.players[1]]: 0 }, match: null };
}
