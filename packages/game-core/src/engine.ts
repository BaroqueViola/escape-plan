import { DEFAULT_BOARD, generateMap, legalMoves, randomIndex, sameCell } from './map.js';
import { failure, success, type ActiveMatch, type BoardOptions, type Coordinate, type PlayerId,
  type Random, type Result, type Role, type Session } from './types.js';

export const TURN_DURATION_MS = 10_000;
const validTime = (now: number): boolean => Number.isFinite(now) && now >= 0
  && Number.isFinite(now + TURN_DURATION_MS);
export function createSession(players: readonly [PlayerId, PlayerId]): Result<Session> {
  if (players.length !== 2 || players.some(p => typeof p !== 'string' || p.length === 0)
    || players[0] === players[1]) return failure('INVALID_PLAYERS');
  return success({ players: [players[0], players[1]],
    scores: { [players[0]]: 0, [players[1]]: 0 }, match: null });
}
function setup(session: Session, now: number, rng: Random, options: BoardOptions,
  warden?: PlayerId): Result<Session> {
  if (!validTime(now)) return failure('INVALID_TIME');
  const map = generateMap(rng, options);
  if (!map.ok) return map;
  if (warden === undefined) {
    const draw = randomIndex(rng, 2);
    if (!draw.ok) return draw;
    warden = session.players[draw.value]!;
  }
  const prisoner = session.players.find(p => p !== warden)!;
  return success({ ...session, match: {
    status: 'active', board: map.value.board, positions: map.value.starts,
    roles: { warden, prisoner }, turn: { playerId: warden, startedAt: now, deadline: now + TURN_DURATION_MS },
  } });
}
export function startMatch(session: Session, now: number, rng: Random,
  options: BoardOptions = DEFAULT_BOARD): Result<Session> {
  if (session.match !== null) return failure('MATCH_EXISTS');
  return setup(session, now, rng, options);
}
function transition(session: Session, match: ActiveMatch, role: Role,
  target: Coordinate, now: number): Result<Session> {
  const positions = { ...match.positions, [role]: target };
  const capture = sameCell(positions.warden, positions.prisoner);
  const escape = !capture && role === 'prisoner'
    && match.board.cells[target.y * match.board.width + target.x] === 'tunnel';
  if (capture || escape) {
    const winner = capture ? match.roles.warden : match.roles.prisoner;
    return success({ ...session,
      scores: { ...session.scores, [winner]: session.scores[winner]! + 1 },
      match: { status: 'finished', board: match.board, roles: match.roles, positions,
        outcome: { winner, reason: capture ? 'capture' : 'escape' }, rematchVotes: {} },
    });
  }
  const next = role === 'warden' ? match.roles.prisoner : match.roles.warden;
  return success({ ...session, match: { ...match, positions,
    turn: { playerId: next, startedAt: now, deadline: now + TURN_DURATION_MS } } });
}
export function move(session: Session, playerId: PlayerId, direction: string, now: number): Result<Session> {
  if (!session.players.includes(playerId)) return failure('UNKNOWN_PLAYER');
  const match = session.match;
  if (match?.status !== 'active') return failure('NO_ACTIVE_MATCH');
  if (!validTime(now) || now < match.turn.startedAt) return failure('INVALID_TIME');
  if (match.turn.playerId !== playerId) return failure('OUT_OF_TURN');
  if (!['up', 'down', 'left', 'right'].includes(direction)) return failure('INVALID_DIRECTION');
  if (now >= match.turn.deadline) return failure('TURN_EXPIRED');
  const role = match.roles.warden === playerId ? 'warden' : 'prisoner';
  const action = legalMoves(match.board, match.positions[role], role).find(m => m.direction === direction);
  return action ? transition(session, match, role, action.target, now) : failure('ILLEGAL_MOVE');
}
export function resolveTimeout(session: Session, now: number, rng: Random): Result<Session> {
  const match = session.match;
  if (match?.status !== 'active') return failure('NO_ACTIVE_MATCH');
  if (!validTime(now) || now < match.turn.startedAt) return failure('INVALID_TIME');
  if (now < match.turn.deadline) return failure('TIMEOUT_NOT_DUE');
  const role = match.roles.warden === match.turn.playerId ? 'warden' : 'prisoner';
  const actions = legalMoves(match.board, match.positions[role], role);
  if (!actions.length) return failure('NO_LEGAL_MOVE');
  const draw = randomIndex(rng, actions.length);
  return draw.ok ? transition(session, match, role, actions[draw.value]!.target, now) : draw;
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
export function voteRematch(session: Session, playerId: PlayerId, accept: boolean,
  now: number, rng: Random): Result<Session> {
  if (!session.players.includes(playerId)) return failure('UNKNOWN_PLAYER');
  const match = session.match;
  if (match?.status !== 'finished') return failure('NO_FINISHED_MATCH');
  if (typeof accept !== 'boolean') return failure('INVALID_VOTE');
  const rematchVotes = { ...match.rematchVotes, [playerId]: accept };
  const voted = { ...session, match: { ...match, rematchVotes } };
  return session.players.every(p => rematchVotes[p] === true)
    ? setup(voted, now, rng, match.board, match.outcome.winner) : success(voted);
}
export function resetSession(session: Session): Session {
  return { ...session, scores: { [session.players[0]]: 0, [session.players[1]]: 0 }, match: null };
}
