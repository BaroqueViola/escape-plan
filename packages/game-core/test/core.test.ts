import { describe, expect, it, vi } from 'vitest';
import { createSession, generateMap, legalMoves, MAX_GENERATION_ATTEMPTS, move,
  resetSession, resolveTimeout, restartTurn, startMatch, tileAt, validateMap, voteRematch,
  type ActiveMatch, type Board, type Coordinate, type GeneratedMap, type Random,
  type Result, type Session, type Tile } from '../src/index.js';

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}
function seeded(seed: number): Random {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const base = (): Session => unwrap(createSession(['alice', 'bob']));
function fixture(warden: Coordinate = { x: 2, y: 2 }, prisoner: Coordinate = { x: 0, y: 1 },
  active: 'alice' | 'bob' = 'alice'): Session & { match: ActiveMatch } {
  const cells: Tile[] = Array<Tile>(25).fill('free');
  for (let i = 20; i < 25; i++) cells[i] = 'obstacle';
  cells[19] = 'tunnel';
  return { ...base(), match: {
    status: 'active', board: { width: 5, height: 5, cells },
    roles: { warden: 'alice', prisoner: 'bob' }, positions: { warden, prisoner },
    turn: { playerId: active, startedAt: 100, deadline: 10100 },
  } };
}
function expectError<T>(result: Result<T>, code: string): void {
  expect(result).toEqual({ ok: false, error: { code } });
}
const finished = (): Session => unwrap(move(fixture({ x: 1, y: 1 }, { x: 2, y: 1 }), 'alice', 'right', 200));

describe('map generation and validation', () => {
  it.each([[5, 5], [6, 6], [5, 8], [9, 5]])('generates valid %i × %i maps', (width, height) => {
    const map = unwrap(generateMap(seeded(42), { width, height }));
    expect(map.board.cells).toHaveLength(width * height);
    expect(map.board.cells.filter(t => t === 'obstacle')).toHaveLength(Math.floor(width * height * .2));
    expect(map.board.cells.filter(t => t === 'tunnel')).toHaveLength(1);
    expect(map.board.cells.filter(t => t === 'free')).toHaveLength(width * height - Math.floor(width * height * .2) - 1);
    expect(validateMap(map)).toBe(true);
    expect(map.starts.warden).not.toEqual(map.starts.prisoner);
    for (const role of ['warden', 'prisoner'] as const) {
      expect(tileAt(map.board, map.starts[role])).toBe('free');
      expect(legalMoves(map.board, map.starts[role], role).length).toBeGreaterThan(0);
    }
    // Independent flood fill checks generator invariants without validateMap.
    const flood = (start: Coordinate, allowTunnel: boolean): Set<number> => {
      const seen = new Set([start.y * width + start.x]);
      const queue = [start];
      for (let i = 0; i < queue.length; i++) {
        const cell = queue[i]!;
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const x = cell.x + dx!, y = cell.y + dy!;
          if (x < 0 || x >= width || y < 0 || y >= height) continue;
          const index = y * width + x;
          const tile = map.board.cells[index];
          if (!seen.has(index) && (tile === 'free' || (allowTunnel && tile === 'tunnel'))) {
            seen.add(index); queue.push({ x, y });
          }
        }
      }
      return seen;
    };
    expect(flood(map.starts.warden, false).size).toBe(map.board.cells.filter(t => t === 'free').length);
    expect(flood(map.starts.prisoner, true).has(map.board.cells.indexOf('tunnel'))).toBe(true);
  });
  it.each([0, 4, -5, 5.5, Infinity, NaN])('rejects dimension %s', size => {
    expectError(generateMap(seeded(1), { width: size, height: 5 }), 'INVALID_DIMENSIONS');
    expectError(generateMap(seeded(1), { width: 5, height: size }), 'INVALID_DIMENSIONS');
  });
  it('is reproducible and maintains invariants across many seeds', () => {
    expect(generateMap(seeded(123))).toEqual(generateMap(seeded(123)));
    for (let seed = 0; seed < 100; seed++) {
      expect(validateMap(unwrap(generateMap(seeded(seed), { width: 5 + seed % 3, height: 5 })))).toBe(true);
    }
  });
  it('stops after 1,000 invalid candidates', () => {
    const rng = vi.fn(() => 0);
    expectError(generateMap(rng), 'GENERATION_FAILED');
    expect(rng).toHaveBeenCalledTimes(MAX_GENERATION_ATTEMPTS * 24);
  });
  it.each([-1, 1, NaN, Infinity])('rejects invalid random value %s', value => {
    expectError(generateMap(() => value), 'INVALID_RANDOM');
  });
  it('rejects disconnected free cells and inaccessible tunnels', () => {
    // Obstacles at 1..5 isolate the free cell at 0,0.
    const cells: Tile[] = Array<Tile>(25).fill('free');
    for (let i = 1; i <= 5; i++) cells[i] = 'obstacle';
    cells[6] = 'tunnel';
    const map: GeneratedMap = { board: { width: 5, height: 5, cells },
      starts: { warden: { x: 2, y: 2 }, prisoner: { x: 3, y: 2 } } };
    expect(validateMap(map)).toBe(false);
    const trapped: Tile[] = Array<Tile>(25).fill('free');
    trapped[0] = 'tunnel';
    [1, 5, 20, 21, 22].forEach(i => { trapped[i] = 'obstacle'; });
    expect(validateMap({ ...map, board: { ...map.board, cells: trapped } })).toBe(false);
  });
  it('rejects malformed composition, size, starts and unknown tiles', () => {
    const s = fixture();
    const map = { board: s.match.board, starts: s.match.positions };
    expect(validateMap(map)).toBe(true);
    expect(validateMap({ ...map, starts: { ...map.starts, prisoner: map.starts.warden } })).toBe(false);
    expect(validateMap({ ...map, starts: { ...map.starts, warden: { x: 0, y: 4 } } })).toBe(false);
    expect(validateMap({ ...map, starts: { ...map.starts, prisoner: { x: 9, y: 9 } } })).toBe(false);
    expect(validateMap({ ...map, board: { ...map.board, cells: [] } })).toBe(false);
    expect(validateMap({ ...map, board: { ...map.board, cells: Array<Tile>(25).fill('free') } })).toBe(false);
    const cells = [...map.board.cells]; cells[0] = 'unknown' as Tile;
    expect(validateMap({ ...map, board: { ...map.board, cells } })).toBe(false);
  });
});

describe('sessions and match setup', () => {
  it('creates exactly two distinct players and zero scores', () => {
    expect(base()).toEqual({ players: ['alice', 'bob'], scores: { alice: 0, bob: 0 }, match: null });
    expectError(createSession(['alice', 'alice']), 'INVALID_PLAYERS');
    expectError(createSession(['', 'bob']), 'INVALID_PLAYERS');
    expectError(createSession(['alice'] as unknown as readonly [string, string]), 'INVALID_PLAYERS');
  });
  it('supports arbitrary player IDs, including object-property names', () => {
    expect(unwrap(createSession(['__proto__', 'constructor'])).scores.__proto__).toBe(0);
  });
  it('starts with the randomly selected warden and an injected deadline', () => {
    const input = freeze(base());
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const session = unwrap(startMatch(input, 500, seeded(seed), { width: 6, height: 5 }));
      expect(session.match?.status).toBe('active');
      if (session.match?.status !== 'active') throw new Error('Expected active');
      seen.add(session.match.roles.warden);
      expect(session.match.turn).toEqual({ playerId: session.match.roles.warden, startedAt: 500, deadline: 10500 });
      expect(validateMap({ board: session.match.board, starts: session.match.positions })).toBe(true);
    }
    expect(seen.size).toBe(2);
    expect(input).toEqual(base());
  });
  it('rejects invalid setup without mutation', () => {
    const input = freeze(base());
    expectError(startMatch(input, NaN, seeded(1)), 'INVALID_TIME');
    expectError(startMatch(input, -1, seeded(1)), 'INVALID_TIME');
    expectError(startMatch(input, 0, seeded(1), { width: 4, height: 5 }), 'INVALID_DIMENSIONS');
    expectError(startMatch(input, 0, () => 0), 'GENERATION_FAILED');
    expectError(startMatch(freeze(fixture()), 0, seeded(1)), 'MATCH_EXISTS');
    expectError(startMatch(freeze(finished()), 0, seeded(1)), 'MATCH_EXISTS');
    expect(input).toEqual(base());
  });
});

describe('movement and turns', () => {
  it.each([
    ['up', { x: 2, y: 1 }], ['down', { x: 2, y: 3 }],
    ['left', { x: 1, y: 2 }], ['right', { x: 3, y: 2 }],
  ] as const)('moves %s and changes turn without mutating input', (direction, target) => {
    const input = freeze(fixture());
    const next = unwrap(move(input, 'alice', direction, 250));
    expect(next.match?.positions.warden).toEqual(target);
    if (next.match?.status !== 'active') throw new Error('Expected active');
    expect(next.match.turn).toEqual({ playerId: 'bob', startedAt: 250, deadline: 10250 });
    expect(input.match.positions.warden).toEqual({ x: 2, y: 2 });
    const after = unwrap(move(next, 'bob', 'right', 300));
    expect(after.match?.status === 'active' && after.match.turn.playerId).toBe('alice');
  });
  it.each([
    [{ x: 0, y: 0 }, 'left'], [{ x: 0, y: 0 }, 'up'],
    [{ x: 4, y: 0 }, 'right'], [{ x: 2, y: 3 }, 'down'],
  ] as const)('rejects blocked or out-of-bounds moves', (position, direction) => {
    const input = freeze(fixture(position));
    expectError(move(input, 'alice', direction, 200), 'ILLEGAL_MOVE');
  });
  it('allows only prisoners into the tunnel', () => {
    expectError(move(fixture({ x: 3, y: 3 }), 'alice', 'right', 200), 'ILLEGAL_MOVE');
    expect(legalMoves(fixture().match.board, { x: 3, y: 3 }, 'prisoner').map(m => m.direction)).toContain('right');
    expect(legalMoves(fixture().match.board, { x: 3, y: 3 }, 'warden').map(m => m.direction)).not.toContain('right');
    expect(legalMoves(fixture().match.board, { x: 3, y: 3 }, 'prisoner').map(m => m.direction)).not.toContain('down');
  });
  it('rejects identities, invalid directions, inactive matches, and invalid time', () => {
    const input = freeze(fixture());
    expectError(move(input, 'eve', 'up', 200), 'UNKNOWN_PLAYER');
    expectError(move(input, 'bob', 'up', 200), 'OUT_OF_TURN');
    expectError(move(input, 'alice', 'diagonal', 200), 'INVALID_DIRECTION');
    expectError(move(input, 'alice', 'up', NaN), 'INVALID_TIME');
    expectError(move(input, 'alice', 'up', 99), 'INVALID_TIME');
    expectError(move(base(), 'alice', 'up', 200), 'NO_ACTIVE_MATCH');
  });
  it('accepts a move just before, but not at or after, the deadline', () => {
    const input = freeze(fixture());
    expect(move(input, 'alice', 'up', 10099).ok).toBe(true);
    expectError(move(input, 'alice', 'up', 10100), 'TURN_EXPIRED');
    expectError(move(input, 'alice', 'up', 10101), 'TURN_EXPIRED');
  });
  it('enumerates boundary moves and rejects noninteger coordinates', () => {
    const board = fixture().match.board;
    expect(legalMoves(board, { x: 0, y: 0 }, 'warden').map(m => m.direction)).toEqual(['down', 'right']);
    expect(tileAt(board, { x: .5, y: 0 })).toBeUndefined();
    expect(tileAt(board, { x: 0, y: 5 })).toBeUndefined();
  });
});

describe('timeout and outcomes', () => {
  it('does not consume randomness before expiry and rejects bad time', () => {
    const rng = vi.fn(() => .5);
    const input = freeze(fixture());
    expectError(resolveTimeout(input, 10099, rng), 'TIMEOUT_NOT_DUE');
    expectError(resolveTimeout(input, 99, rng), 'INVALID_TIME');
    expectError(resolveTimeout(input, Infinity, rng), 'INVALID_TIME');
    expect(rng).not.toHaveBeenCalled();
  });
  it.each([10100, 15000])('resolves at/after expiry %i using a random legal move', now => {
    const input = freeze(fixture());
    const actions = legalMoves(input.match.board, input.match.positions.warden, 'warden');
    for (let i = 0; i < actions.length; i++) {
      const next = unwrap(resolveTimeout(input, now, () => (i + .1) / actions.length));
      expect(next.match?.positions.warden).toEqual(actions[i]!.target);
      expect(next.match?.status === 'active' && next.match.turn.deadline).toBe(now + 10000);
    }
    expectError(resolveTimeout(input, now, () => 1), 'INVALID_RANDOM');
  });
  it('guards against no legal moves in a caller-supplied invalid state', () => {
    const input = fixture({ x: 0, y: 0 });
    const cells = [...input.match.board.cells]; cells[1] = 'obstacle'; cells[5] = 'obstacle';
    const invalid = { ...input, match: { ...input.match, board: { ...input.match.board, cells } } };
    expectError(resolveTimeout(freeze(invalid), 10100, () => 0), 'NO_LEGAL_MOVE');
  });
  it.each(['warden', 'prisoner'] as const)('awards capture when %s moves onto the opponent', role => {
    const input = freeze(fixture({ x: 1, y: 1 }, { x: 2, y: 1 }, role === 'warden' ? 'alice' : 'bob'));
    const next = unwrap(move(input, role === 'warden' ? 'alice' : 'bob', role === 'warden' ? 'right' : 'left', 200));
    expect(next.scores).toEqual({ alice: 1, bob: 0 });
    expect(next.match?.status === 'finished' && next.match.outcome).toEqual({ winner: 'alice', reason: 'capture' });
    expect(next.match).not.toHaveProperty('turn');
    expectError(move(next, 'alice', 'up', 300), 'NO_ACTIVE_MATCH');
    expectError(resolveTimeout(next, 20000, () => 0), 'NO_ACTIVE_MATCH');
    expect(input.scores).toEqual({ alice: 0, bob: 0 });
  });
  it('awards a prisoner escape', () => {
    const next = unwrap(move(freeze(fixture({ x: 0, y: 0 }, { x: 3, y: 3 }, 'bob')), 'bob', 'right', 200));
    expect(next.scores).toEqual({ alice: 0, bob: 1 });
    expect(next.match?.status === 'finished' && next.match.outcome).toEqual({ winner: 'bob', reason: 'escape' });
  });
  it('detects timeout capture and tunnel victories with the same rules', () => {
    const capture = unwrap(resolveTimeout(fixture({ x: 1, y: 1 }, { x: 2, y: 1 }), 10100, () => .99));
    expect(capture.match?.status === 'finished' && capture.match.outcome.reason).toBe('capture');
    const escape = unwrap(resolveTimeout(fixture({ x: 0, y: 0 }, { x: 3, y: 3 }, 'bob'), 10100, () => .99));
    expect(escape.match?.status === 'finished' && escape.match.outcome.reason).toBe('escape');
    expect(escape.scores.bob).toBe(1);
  });
});

describe('restartTurn (ready check)', () => {
  it('gives the same player a fresh deadline without changing the board', () => {
    const input = freeze(fixture());
    const next = unwrap(restartTurn(input, 50_000));
    if (next.match?.status !== 'active') throw new Error('Expected active');
    expect(next.match.turn).toEqual({ playerId: 'alice', startedAt: 50_000, deadline: 60_000 });
    expect(next.match.board).toBe(input.match.board);
    expect(next.match.positions).toEqual(input.match.positions);
    expect(input.match.turn.deadline).toBe(10100);
  });
  it('lets a move succeed after the original deadline once restarted', () => {
    const late = 30_000;
    expectError(move(fixture(), 'alice', 'up', late), 'TURN_EXPIRED');
    expect(move(unwrap(restartTurn(fixture(), late)), 'alice', 'up', late + 1).ok).toBe(true);
  });
  it('resumes a paused turn with only the time that was left', () => {
    const next = unwrap(restartTurn(freeze(fixture()), 50_000, 4_000));
    if (next.match?.status !== 'active') throw new Error('Expected active');
    expect(next.match.turn).toEqual({ playerId: 'alice', startedAt: 50_000, deadline: 54_000 });
    expectError(restartTurn(fixture(), 50_000, 0), 'INVALID_TIME');
    expectError(restartTurn(fixture(), 50_000, 10_001), 'INVALID_TIME');
    expectError(restartTurn(fixture(), 50_000, NaN), 'INVALID_TIME');
  });
  it('rejects missing or finished matches and invalid time', () => {
    expectError(restartTurn(base(), 0), 'NO_ACTIVE_MATCH');
    expectError(restartTurn(finished(), 300), 'NO_ACTIVE_MATCH');
    expectError(restartTurn(fixture(), NaN), 'INVALID_TIME');
    expectError(restartTurn(fixture(), 99), 'INVALID_TIME');
  });
});

describe('rematch and reset', () => {
  it('requires two yes votes and allows votes to be replaced', () => {
    const input = freeze(finished());
    let session = unwrap(voteRematch(input, 'alice', true, 300, seeded(1)));
    expect(session.match?.status).toBe('finished');
    session = unwrap(voteRematch(session, 'alice', false, 300, seeded(1)));
    session = unwrap(voteRematch(session, 'bob', true, 300, seeded(1)));
    expect(session.match?.status).toBe('finished');
    if (session.match?.status !== 'finished') throw new Error('Expected finished');
    expect(session.match.rematchVotes).toEqual({ alice: false, bob: true });
    session = unwrap(voteRematch(freeze(session), 'alice', true, 500, seeded(3)));
    expect(session.scores).toEqual({ alice: 1, bob: 0 });
    expect(session.match?.roles).toEqual({ warden: 'alice', prisoner: 'bob' });
    expect(session.match?.board).not.toBe(input.match?.board);
    expect(session.match).not.toHaveProperty('rematchVotes');
    expect(session.match?.status === 'active' && session.match.turn.deadline).toBe(10500);
    expect(input.match?.status === 'finished' && input.match.rematchVotes).toEqual({});
  });
  it('assigns a winning prisoner as warden and retains larger board dimensions', () => {
    const initial = unwrap(startMatch(base(), 0, seeded(2), { width: 6, height: 8 }));
    if (!initial.match) throw new Error('Expected match');
    const end: Session = { ...initial, scores: { alice: 0, bob: 2 },
      match: { status: 'finished', board: initial.match.board,
        roles: { warden: 'alice', prisoner: 'bob' }, positions: initial.match.positions,
        outcome: { winner: 'bob', reason: 'escape' }, rematchVotes: { alice: true } } };
    const next = unwrap(voteRematch(freeze(end), 'bob', true, 400, seeded(4)));
    expect(next.match?.roles.warden).toBe('bob');
    expect(next.match?.board.width).toBe(6); expect(next.match?.board.height).toBe(8);
    expect(next.scores.bob).toBe(2);
  });
  it('rejects invalid rematch actions and preserves state on generation failure', () => {
    expectError(voteRematch(base(), 'alice', true, 0, seeded(1)), 'NO_FINISHED_MATCH');
    expectError(voteRematch(fixture(), 'alice', true, 0, seeded(1)), 'NO_FINISHED_MATCH');
    expectError(voteRematch(finished(), 'eve', true, 0, seeded(1)), 'UNKNOWN_PLAYER');
    expectError(voteRematch(finished(), 'alice', 'yes' as unknown as boolean, 0, seeded(1)), 'INVALID_VOTE');
    const oneVote = freeze(unwrap(voteRematch(finished(), 'alice', true, 0, seeded(1))));
    expectError(voteRematch(oneVote, 'bob', true, 300, () => 0), 'GENERATION_FAILED');
    expectError(voteRematch(oneVote, 'bob', true, NaN, seeded(1)), 'INVALID_TIME');
    expect(oneVote.match?.status === 'finished' && oneVote.match.rematchVotes).toEqual({ alice: true });
  });
  it.each(['active', 'finished', 'empty'])('resets %s sessions', state => {
    const original = state === 'active' ? fixture() : state === 'finished' ? finished() : base();
    const input = freeze({ ...original, scores: { alice: 3, bob: 5 } });
    const reset = resetSession(input);
    expect(reset).toEqual(base());
    expect(reset).not.toBe(input);
    const seen = new Set<string>();
    for (let seed = 0; seed < 20; seed++) seen.add(unwrap(startMatch(reset, 1000, seeded(seed))).match!.roles.warden);
    expect(seen.size).toBe(2);
  });
  it('runs a scripted match, mutual rematch, second win, then reset', () => {
    let session: Session = freeze(fixture({ x: 1, y: 1 }, { x: 3, y: 1 }));
    session = unwrap(move(session, 'alice', 'right', 200));
    session = unwrap(move(session, 'bob', 'left', 300));
    session = unwrap(voteRematch(session, 'alice', true, 400, seeded(8)));
    session = unwrap(voteRematch(session, 'bob', true, 500, seeded(8)));
    if (session.match?.status !== 'active') throw new Error('Expected active');
    // Walk the warden toward the prisoner; the prisoner deliberately walks toward capture.
    for (let step = 0; step < 1000 && session.match?.status === 'active'; step++) {
      const match = session.match;
      const role = match.turn.playerId === match.roles.warden ? 'warden' : 'prisoner';
      const target = match.positions[role === 'warden' ? 'prisoner' : 'warden'];
      const path = pathTo(match.board, match.positions[role], target);
      session = unwrap(move(session, match.turn.playerId, path[0]!, match.turn.startedAt + 1));
    }
    expect(session.match?.status).toBe('finished');
    expect(session.scores).toEqual({ alice: 2, bob: 0 });
    expect(resetSession(session)).toEqual(base());
  });
});

function pathTo(board: Board, start: Coordinate, target: Coordinate): string[] {
  const queue = [{ position: start, path: [] as string[] }];
  const seen = new Set([`${start.x},${start.y}`]);
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]!;
    if (node.position.x === target.x && node.position.y === target.y) return node.path;
    for (const action of legalMoves(board, node.position, 'warden')) {
      const key = `${action.target.x},${action.target.y}`;
      if (!seen.has(key)) { seen.add(key); queue.push({ position: action.target, path: [...node.path, action.direction] }); }
    }
  }
  throw new Error('Expected connected free cells');
}
