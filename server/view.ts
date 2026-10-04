// Turns the core's Session (socket ids) into what clients receive (nicknames).
// Pure functions, no sockets.

import type { GameState, MatchInfo, MatchResult } from './events.js';
import type { PlayerId, Session } from '../packages/game-core/src/index.js';

// Nicknames captured when the game was created (the lobby may already have
// forgotten a player who just disconnected)
export type Names = Readonly<Record<PlayerId, string>>;

const nameOf = (names: Names, id: PlayerId): string => names[id] ?? id;

function scoresByName(session: Session, names: Names): Record<string, number> {
  return Object.fromEntries(session.players.map((id) => [nameOf(names, id), session.scores[id] ?? 0]));
}

export function toGameState(session: Session, names: Names, now: number): GameState | null {
  const m = session.match;
  if (!m) return null;
  return {
    board: { width: m.board.width, height: m.board.height, cells: m.board.cells },
    positions: m.positions,
    roles: { [nameOf(names, m.roles.warder)]: 'warder', [nameOf(names, m.roles.prisoner)]: 'prisoner' },
    scores: scoresByName(session, names),
    status: m.status,
    turnNickname: m.status === 'active' ? nameOf(names, m.turn.playerId) : null,
    turnDeadline: m.status === 'active' ? m.turn.deadline : null,
    serverTime: now,
    outcome: m.status === 'finished' ? { winner: nameOf(names, m.outcome.winner), reason: m.outcome.reason } : null,
    rematchVotes: m.status === 'finished' ? toRematchVotes(session, names) : {},
  };
}

export function toMatchInfo(session: Session, names: Names, playerId: PlayerId): MatchInfo | null {
  const m = session.match;
  if (!m) return null;
  const opponentId = session.players.find((id) => id !== playerId);
  if (opponentId === undefined) return null;
  const roleOf = (id: PlayerId) => (m.roles.warder === id ? 'warder' : 'prisoner');
  return {
    you: { nickname: nameOf(names, playerId), role: roleOf(playerId) },
    opponent: { nickname: nameOf(names, opponentId), role: roleOf(opponentId) },
  };
}

export function toMatchResult(session: Session, names: Names, playerId: PlayerId): MatchResult | null {
  const m = session.match;
  if (m?.status !== 'finished') return null;
  return {
    result: m.outcome.winner === playerId ? 'Win' : 'Lost',
    winner: nameOf(names, m.outcome.winner),
    reason: m.outcome.reason,
    scores: scoresByName(session, names),
  };
}

export function toRematchVotes(session: Session, names: Names): Record<string, boolean> {
  const m = session.match;
  if (m?.status !== 'finished') return {};
  return Object.fromEntries(Object.entries(m.rematchVotes).map(([id, vote]) => [nameOf(names, id), vote]));
}
