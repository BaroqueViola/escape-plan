// Turns the core's Session (socket ids) into what clients receive (nicknames).
// Pure functions, no sockets.

import type { ChaosView, GameState, MatchInfo, MatchResult } from './events.js';
import type { ClassId, Coordinate, Match, PlayerId, Role, Session } from '../packages/game-core/src/index.js';
import type { ModeName } from './modes.js';

// Mode and Chaos classes of a game (classes by role; null in Classic)
export interface GameKind {
  mode: ModeName;
  classes: Record<Role, ClassId> | null;
}
const CLASSIC: GameKind = { mode: 'classic', classes: null };

// Nicknames captured when the game was created (the lobby may already have
// forgotten a player who just disconnected)
export type Names = Readonly<Record<PlayerId, string>>;

const nameOf = (names: Names, id: PlayerId): string => names[id] ?? id;

function scoresByName(session: Session, names: Names): Record<string, number> {
  return Object.fromEntries(session.players.map((id) => [nameOf(names, id), session.scores[id] ?? 0]));
}

// Who is looking: a player by role, 'all' (admin) or 'public' (spectators).
// Only the prisoner's side and the admin can tell Naruto from his clones.
// A prisoner in Sasuke's illusion sees a dark, empty board.
export type Viewer = Role | 'all' | 'public';

function chaosView(m: Match, viewer: Viewer): { view: ChaosView; prisoner: Coordinate } | null {
  const c = m.chaos;
  if (!c) return null;
  const finished = m.status === 'finished';
  const hidden = !finished && c.classes.prisoner === 'naruto' && c.clones.length > 0
    && viewer !== 'prisoner' && viewer !== 'all';
  let prisoner = m.positions.prisoner;
  let clones: ChaosView['clones'] = c.clones.map(({ x, y, direction }) => ({ x, y, direction }));
  if (hidden) {
    // Every figure looks the same and comes in board order
    const figures = [m.positions.prisoner, ...c.clones].map(({ x, y }) => ({ x, y }))
      .sort((a, b) => a.y - b.y || a.x - b.x);
    prisoner = figures[0]!;
    clones = figures.slice(1).map(({ x, y }) => ({ x, y, direction: null }));
  }
  const blind = !finished && viewer === 'prisoner' && c.illusion > 0;
  const view: ChaosView = {
    hidden, bar: c.bar, charges: c.charges, clones, fingers: [...c.fingers], collected: c.collected,
    cooldown: c.cooldown, stunned: c.stunned, cracks: [...c.cracks],
    stolen: c.stolen && { from: c.stolen.from, uses: [...c.stolen.uses] }, locked: c.locked,
    wardenClones: c.wardenClones.map(({ x, y, direction, life }) => ({ x, y, direction, life })),
    illusion: c.illusion, blind, inVoid: c.inVoid,
    events: hidden ? c.events.filter((e) => e.kind !== 'swap') : [...c.events],
  };
  if (blind) {
    // Nothing on the board, and only what they can feel: a bump or a lost turn
    return { prisoner: { x: 0, y: 0 }, view: { ...view, clones: [], fingers: [], cracks: [], wardenClones: [],
      events: view.events.filter((e) => e.kind === 'bump' || e.kind === 'skip') } };
  }
  return { prisoner, view };
}

export function toGameState(session: Session, names: Names, now: number, kind: GameKind = CLASSIC,
  viewer: Viewer = 'all'): GameState | null {
  const m = session.match;
  if (!m) return null;
  const chaos = chaosView(m, viewer);
  return {
    mode: kind.mode,
    classes: kind.classes,
    staysLeft: m.status === 'active' ? m.staysLeft : null,
    board: { width: m.board.width, height: m.board.height,
      cells: chaos?.view.blind ? m.board.cells.map(() => 'free' as const) : m.board.cells },
    positions: !chaos ? m.positions
      : chaos.view.blind ? { warden: { x: 0, y: 0 }, prisoner: chaos.prisoner }
      : { warden: m.positions.warden, prisoner: chaos.prisoner },
    roles: { [nameOf(names, m.roles.warden)]: 'warden', [nameOf(names, m.roles.prisoner)]: 'prisoner' },
    scores: scoresByName(session, names),
    status: m.status,
    turnNickname: m.status === 'active' ? nameOf(names, m.turn.playerId) : null,
    turnDeadline: m.status === 'active' ? m.turn.deadline : null,
    serverTime: now,
    outcome: m.status === 'finished' ? { winner: nameOf(names, m.outcome.winner), reason: m.outcome.reason } : null,
    rematchVotes: m.status === 'finished' ? toRematchVotes(session, names) : {},
    chaos: chaos?.view ?? null,
  };
}

export function toMatchInfo(session: Session, names: Names, playerId: PlayerId, kind: GameKind = CLASSIC): MatchInfo | null {
  const m = session.match;
  if (!m) return null;
  const opponentId = session.players.find((id) => id !== playerId);
  if (opponentId === undefined) return null;
  const roleOf = (id: PlayerId) => (m.roles.warden === id ? 'warden' : 'prisoner');
  const clsOf = (id: PlayerId) => kind.classes?.[roleOf(id)] ?? null;
  return {
    mode: kind.mode,
    you: { nickname: nameOf(names, playerId), role: roleOf(playerId), cls: clsOf(playerId) },
    opponent: { nickname: nameOf(names, opponentId), role: roleOf(opponentId), cls: clsOf(opponentId) },
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
