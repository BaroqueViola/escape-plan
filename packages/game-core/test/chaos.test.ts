import { describe, expect, it } from 'vitest';
import { createSession, move, resolveTimeout, startMatch, stay, useAbility, FINGERS, MAX_CLONES, VOID_DURATION_MS, VOID_INTRO_MS,
  type Ability, type ActiveMatch, type ChaosState, type ClassId, type Coordinate, type Random,
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
const expectError = <T>(result: Result<T>, code: string) => expect(result).toEqual({ ok: false, error: { code } });

// alice is the warden (Gojo), bob the prisoner. Grid: . free, # rock, T tunnel, W warden, P prisoner.
function game(prisonerClass: ClassId, grid: string[], turn: 'alice' | 'bob' = 'bob', chaos: Partial<ChaosState> = {}):
  Session & { match: ActiveMatch } {
  const cells: Tile[] = [];
  const positions: Record<string, Coordinate> = {};
  grid.forEach((row, y) => [...row].forEach((ch, x) => {
    cells.push(ch === '#' ? 'obstacle' : ch === 'T' ? 'tunnel' : 'free');
    if (ch === 'W') positions.warden = { x, y };
    if (ch === 'P') positions.prisoner = { x, y };
  }));
  return { ...unwrap(createSession(['alice', 'bob'])), match: {
    status: 'active', board: { width: grid[0]!.length, height: grid.length, cells },
    roles: { warden: 'alice', prisoner: 'bob' },
    positions: { warden: positions.warden!, prisoner: positions.prisoner! },
    turn: { playerId: turn, startedAt: 100, deadline: 20100 },
    staysLeft: { warden: 2, prisoner: 2 },
    chaos: { classes: { warden: 'gojo', prisoner: prisonerClass }, stunned: { warden: 0, prisoner: 0 },
      cooldown: { warden: 0, prisoner: 0 }, cracks: [], bar: 0, charges: 0, clones: [], fingers: [],
      collected: 0, stolen: null, locked: 0, wardenClones: [], illusion: 0, scramble: null, inVoid: false,
      events: [], ...chaos },
  } };
}
const T = 200;
const act = (s: Session, who: string, a: Ability) => useAbility(s, who, a, T, seeded(1));
const go = (s: Session, who: string, d: string) => unwrap(move(s, who, d, T, seeded(1)));
const active = (s: Session) => s.match as ActiveMatch;
const chaosOf = (s: Session) => s.match!.chaos!;
const OPEN = ['.......', '.......', '.......', '...P...', '.......', '.......', 'W.....T'];

describe('chaos setup', () => {
  it('startMatch with classes adds the ability state; Classic has none', () => {
    const session = unwrap(createSession(['alice', 'bob']));
    const chaos = unwrap(startMatch(session, 0, seeded(3), { width: 7, height: 7 }, 'alice', { warden: 'gojo', prisoner: 'sukuna' }));
    const c = chaosOf(chaos);
    expect(c.classes).toEqual({ warden: 'gojo', prisoner: 'sukuna' });
    expect(c.fingers).toHaveLength(FINGERS);
    const m = chaos.match!;
    for (const f of c.fingers) {
      expect(m.board.cells[f.y * 7 + f.x]).toBe('free');
      expect([m.positions.warden, m.positions.prisoner]).not.toContainEqual(f);
    }
    expect(unwrap(startMatch(session, 0, seeded(3))).match!.chaos).toBeUndefined();
  });
  it('rejects abilities in Classic, for the wrong class and out of turn', () => {
    const { chaos: _, ...plain } = game('allmight', OPEN).match;
    const classic: Session = { ...game('allmight', OPEN), match: plain };
    expectError(act(classic, 'bob', { kind: 'smash', direction: 'up' }), 'NO_ABILITY');
    expectError(act(game('naruto', OPEN, 'bob', { bar: 2 }), 'bob', { kind: 'smash', direction: 'up' }), 'NO_ABILITY');
    expectError(act(game('allmight', OPEN, 'alice', { bar: 2 }), 'bob', { kind: 'smash', direction: 'up' }), 'OUT_OF_TURN');
    expectError(act(game('allmight', OPEN, 'bob', { bar: 2 }), 'bob', { kind: 'fly' } as unknown as Ability), 'ILLEGAL_TARGET');
  });
});

describe('All Might: smash', () => {
  it('fills the bar 1 per own turn, moves and stays alike, up to 2', () => {
    let s: Session = game('allmight', OPEN);
    expectError(act(s, 'bob', { kind: 'smash', direction: 'left' }), 'ABILITY_NOT_READY');
    s = go(s, 'bob', 'up');
    expect(chaosOf(s).bar).toBe(1);
    s = go(s, 'alice', 'up');
    expect(chaosOf(s).bar).toBe(1); // the warden's turn doesn't charge him
    s = unwrap(stay(s, 'bob', T));
    s = go(s, 'alice', 'down');
    s = go(s, 'bob', 'down');
    expect(chaosOf(s).bar).toBe(2);
  });
  it('a hit through a rock stuns the warden for 2 turns and cracks the ground to the edge', () => {
    const grid = ['.......', '.......', '.......', 'W.#.P..', '.......', '.......', '......T'];
    let s: Session = unwrap(act(game('allmight', grid, 'bob', { bar: 2 }), 'bob', { kind: 'smash', direction: 'left' }));
    let c = chaosOf(s);
    expect(c.bar).toBe(0);
    expect(c.cracks).toEqual([{ x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 0, y: 3 }]);
    expect(c.events).toEqual([{ kind: 'smash', by: 'prisoner', from: { x: 4, y: 3 }, direction: 'left', hit: true },
      { kind: 'skip', role: 'warden' }]);
    expect(c.stunned.warden).toBe(1);
    expect(active(s).turn.playerId).toBe('bob'); // first lost turn
    s = go(s, 'bob', 'right');
    expect(chaosOf(s).stunned.warden).toBe(0);
    expect(active(s).turn.playerId).toBe('bob'); // second lost turn
    s = go(s, 'bob', 'right');
    expect(active(s).turn.playerId).toBe('alice');
    c = chaosOf(s);
    expect(c.bar).toBe(2); // skipped warden turns don't charge him, his own turns do
  });
  it('a miss resets the bar and passes the turn', () => {
    const s = unwrap(act(game('allmight', OPEN, 'bob', { bar: 2 }), 'bob', { kind: 'smash', direction: 'right' }));
    expect(chaosOf(s)).toMatchObject({ bar: 0, stunned: { warden: 0, prisoner: 0 } });
    expect(chaosOf(s).events[0]).toMatchObject({ kind: 'smash', hit: false });
    expect(active(s).turn.playerId).toBe('alice');
    expect(chaosOf(s).cracks).toHaveLength(3);
  });
  it('cannot punch off the edge', () => {
    const grid = ['P......', '.......', '.......', '.......', '.......', '.......', 'W.....T'];
    expectError(act(game('allmight', grid, 'bob', { bar: 2 }), 'bob', { kind: 'smash', direction: 'up' }), 'ILLEGAL_TARGET');
  });
});

describe('Naruto: shadow clones', () => {
  it('banks a clone every turn without the jutsu, up to 3', () => {
    let s: Session = game('naruto', OPEN);
    expectError(act(s, 'bob', { kind: 'clones', clones: [{ x: 3, y: 2, direction: 'up' }] }), 'ABILITY_NOT_READY');
    for (let i = 0; i < 4; i++) {
      s = unwrap(stay(s, 'bob', T));
      s = go(s, 'alice', i % 2 ? 'down' : 'up');
      if (i === 1) s = go(s, 'bob', 'left'), s = go(s, 'alice', 'up');
    }
    expect(chaosOf(s).charges).toBe(MAX_CLONES);
  });
  it('places clones within 2 tiles; they wait a turn, then walk until a rock stops them', () => {
    const grid = ['.......', '.......', '...#...', '...P...', '.......', '.......', 'W.....T'];
    let s: Session = unwrap(act(game('naruto', grid, 'bob', { charges: 2 }), 'bob',
      { kind: 'clones', clones: [{ x: 3, y: 1, direction: 'up' }, { x: 5, y: 3, direction: 'left' }] }));
    expect(chaosOf(s).charges).toBe(0);
    expect(chaosOf(s).clones).toEqual([{ x: 3, y: 1, direction: 'up', fresh: false }, { x: 5, y: 3, direction: 'left', fresh: false }]);
    s = go(s, 'alice', 'right');
    s = unwrap(stay(s, 'bob', T));
    // the left-walker is blocked by Naruto next to it after one step
    expect(chaosOf(s).clones).toEqual([{ x: 3, y: 0, direction: 'up', fresh: false }, { x: 4, y: 3, direction: 'left', fresh: false }]);
    expect(chaosOf(s).charges).toBe(1);
    s = go(s, 'alice', 'right');
    s = unwrap(stay(s, 'bob', T));
    expect(chaosOf(s).clones.map(c => [c.x, c.y])).toEqual([[3, 0], [4, 3]]);
  });
  it('rejects bad placements', () => {
    const grid = ['.......', '.......', '...#...', '...P...', '.......', '.......', 'W.....T'];
    const s = game('naruto', grid, 'bob', { charges: 1 });
    const place = (x: number, y: number, n = 1) =>
      act(s, 'bob', { kind: 'clones', clones: Array.from({ length: n }, (_, i) => ({ x: x + i, y, direction: 'up' as const })) });
    expectError(place(3, 2), 'ILLEGAL_TARGET'); // rock
    expectError(place(3, 0), 'ILLEGAL_TARGET'); // 3 away
    expectError(place(3, 3), 'ILLEGAL_TARGET'); // on Naruto
    expectError(place(1, 3, 2), 'ILLEGAL_TARGET'); // more than banked
  });
  it('the prisoner cannot step onto a clone; the warden crushes one by stepping on it', () => {
    const grid = ['.......', '.......', '.......', '..WP...', '.......', '.......', '......T'];
    const clone = { x: 3, y: 2, direction: 'up' as const, fresh: false };
    expectError(move(game('naruto', grid, 'bob', { clones: [clone] }), 'bob', 'up', T), 'ILLEGAL_MOVE');
    const s = go(game('naruto', grid, 'alice', { clones: [{ ...clone, x: 2, y: 2 }] }), 'alice', 'up');
    expect(s.match!.status).toBe('active');
    expect(chaosOf(s).clones).toEqual([]);
    expect(chaosOf(s).events).toEqual([{ kind: 'poof', at: { x: 2, y: 2 } }]);
    expect(go(game('naruto', grid, 'alice'), 'alice', 'right').match!.status).toBe('finished');
  });
  it('a clone walking into the warden vanishes', () => {
    const grid = ['.......', '.......', '.......', '...P...', '.......', '.W.....', '......T'];
    const s = unwrap(stay(game('naruto', grid, 'bob', { clones: [{ x: 1, y: 4, direction: 'down', fresh: false }] }), 'bob', T));
    expect(chaosOf(s).clones).toEqual([]);
  });
  it('secret swap trades places with a clone, which keeps walking its way', () => {
    const s = unwrap(act(game('naruto', OPEN, 'bob', { clones: [{ x: 5, y: 3, direction: 'down', fresh: false }] }),
      'bob', { kind: 'swap', x: 5, y: 3 }));
    expect(s.match!.positions.prisoner).toEqual({ x: 5, y: 3 });
    expect(chaosOf(s).clones).toEqual([{ x: 3, y: 4, direction: 'down', fresh: false }]);
    expectError(act(game('naruto', OPEN), 'bob', { kind: 'swap', x: 5, y: 3 }), 'ILLEGAL_TARGET');
  });
});

describe('Sukuna: dismantle and shrine', () => {
  it('collects a finger by walking onto it; the warden crushes one and it comes back elsewhere', () => {
    const fingers = [{ x: 3, y: 2 }, { x: 1, y: 6 }, { x: 6, y: 0 }];
    let s: Session = go(game('sukuna', OPEN, 'bob', { fingers }), 'bob', 'up');
    expect(chaosOf(s)).toMatchObject({ collected: 1, fingers: fingers.slice(1) });
    s = go(s, 'alice', 'right');
    const c = chaosOf(s);
    expect(c.fingers).toHaveLength(2);
    expect(c.fingers).not.toContainEqual({ x: 1, y: 6 });
    expect(c.events[0]).toMatchObject({ kind: 'crush', at: { x: 1, y: 6 } });
  });
  it('dismantle breaks a rock next to him and steps onto it, then waits 1 turn', () => {
    const grid = ['.......', '.......', '...#...', '...P#..', '.......', '.......', 'W.....T'];
    let s: Session = unwrap(act(game('sukuna', grid), 'bob', { kind: 'dismantle', direction: 'up' }));
    expect(s.match!.board.cells[2 * 7 + 3]).toBe('free');
    expect(s.match!.positions.prisoner).toEqual({ x: 3, y: 2 });
    expect(chaosOf(s).cooldown.prisoner).toBe(1);
    s = go(s, 'alice', 'up');
    expectError(act(s, 'bob', { kind: 'dismantle', direction: 'right' }), 'ABILITY_NOT_READY'); // waiting
    expectError(act({ ...s, match: { ...active(s), chaos: { ...chaosOf(s), cooldown: { warden: 0, prisoner: 0 } } } }, 'bob',
      { kind: 'dismantle', direction: 'left' }), 'ILLEGAL_TARGET'); // not a rock
    s = go(s, 'bob', 'down');
    s = go(s, 'alice', 'down');
    expect(chaosOf(s).cooldown.prisoner).toBe(0);
    expect(unwrap(act(s, 'bob', { kind: 'dismantle', direction: 'right' })).match!.positions.prisoner).toEqual({ x: 4, y: 3 });
  });
  it('dismantle is blocked during its cooldown', () => {
    const grid = ['.......', '.......', '...#...', '...P...', '.......', '.......', 'W.....T'];
    expectError(act(game('sukuna', grid, 'bob', { cooldown: { warden: 0, prisoner: 1 } }), 'bob',
      { kind: 'dismantle', direction: 'up' }), 'ABILITY_NOT_READY');
  });
  it('the shrine needs 3 fingers and pushes the warden 3 tiles away, stopped by rocks', () => {
    const grid = ['.......', '.......', '.......', '.PW..#.', '.......', '.......', '......T'];
    expectError(act(game('sukuna', grid, 'bob', { collected: 2 }), 'bob', { kind: 'shrine' }), 'ABILITY_NOT_READY');
    const s = unwrap(act(game('sukuna', grid, 'bob', { collected: 3 }), 'bob', { kind: 'shrine' }));
    expect(s.match!.positions.warden).toEqual({ x: 4, y: 3 }); // rock at x 5
    const c = chaosOf(s);
    expect(c.collected).toBe(0);
    expect(c.fingers).toHaveLength(FINGERS);
    expect(c.events[0]).toEqual({ kind: 'shrine', by: 'prisoner', from: { x: 2, y: 3 }, to: { x: 4, y: 3 } });
    const far = unwrap(act(game('sukuna', ['.......', '.P.....', '.......', '.......', '.W.....', '.......', '......T'],
      'bob', { collected: 3 }), 'bob', { kind: 'shrine' }));
    expect(far.match!.positions.warden).toEqual({ x: 1, y: 6 }); // only 2 tiles to the edge
  });
});

describe('chaos timeouts', () => {
  it('a timed-out stay still charges All Might', () => {
    const s = unwrap(resolveTimeout(game('allmight', OPEN), 20_000, seeded(2)));
    expect(chaosOf(s).bar).toBe(1);
  });
});

const vs = (warden: ClassId, prisoner: ClassId) => ({ classes: { warden, prisoner } });

describe('All For One: steal', () => {
  const grid = ['.......', '.......', '.......', '.W.P...', '.......', '.......', '......T'];
  it('steals the prisoner\'s ability: they lose it for 1 turn, he waits 2 to steal again', () => {
    let s: Session = unwrap(act(game('allmight', grid, 'alice', { ...vs('afo', 'allmight'), bar: 2 }), 'alice', { kind: 'steal' }));
    expect(chaosOf(s)).toMatchObject({ stolen: { from: 'allmight', uses: ['smash'] }, locked: 1, cooldown: { warden: 2 } });
    expect(chaosOf(s).events).toEqual([{ kind: 'steal', from: 'allmight' }]);
    expectError(act(s, 'bob', { kind: 'smash', direction: 'up' }), 'ABILITY_NOT_READY');
    s = go(s, 'bob', 'up');
    expect(chaosOf(s).locked).toBe(0);
    expectError(act(s, 'alice', { kind: 'steal' }), 'ABILITY_NOT_READY'); // still holding it
  });
  it('a stolen punch needs no charge and stuns the prisoner for 2 turns', () => {
    let s: Session = game('allmight', grid, 'alice', { ...vs('afo', 'allmight'), stolen: { from: 'allmight', uses: ['smash'] } });
    s = unwrap(act(s, 'alice', { kind: 'smash', direction: 'right' }));
    expect(chaosOf(s)).toMatchObject({ stolen: null, stunned: { prisoner: 1 } });
    expect(chaosOf(s).events[0]).toMatchObject({ kind: 'smash', by: 'warden', hit: true });
    expect(active(s).turn.playerId).toBe('alice'); // the prisoner's turn was skipped
    expectError(act(game('allmight', grid, 'alice', vs('afo', 'allmight')), 'alice', { kind: 'smash', direction: 'right' }), 'NO_ABILITY');
  });
  it('from Sukuna he gets Dismantle and the Shrine, once each', () => {
    const g = ['.......', '.......', '.#.....', '.W.P...', '.......', '.......', '......T'];
    let s: Session = game('sukuna', g, 'alice', { ...vs('afo', 'sukuna'), stolen: { from: 'sukuna', uses: ['dismantle', 'shrine'] } });
    s = unwrap(act(s, 'alice', { kind: 'dismantle', direction: 'up' }));
    expect(s.match!.positions.warden).toEqual({ x: 1, y: 2 });
    expect(chaosOf(s).stolen).toEqual({ from: 'sukuna', uses: ['shrine'] });
    s = go(s, 'bob', 'down'); // prisoner to (3,4)
    s = unwrap(act(s, 'alice', { kind: 'shrine' }));
    expect(s.match!.positions.prisoner).toEqual({ x: 6, y: 4 }); // a tie pushes sideways, 3 tiles
    expect(chaosOf(s).stolen).toBeNull();
  });
  it('from Naruto he places 1 clone that catches the prisoner by walking into them', () => {
    const g = ['.......', '.......', '.W.....', '.......', '...P...', '.......', '......T'];
    let s: Session = game('naruto', g, 'alice', { ...vs('afo', 'naruto'), stolen: { from: 'naruto', uses: ['clones'] } });
    expectError(act(s, 'alice', { kind: 'clones', clones: [{ x: 1, y: 1, direction: 'up' }, { x: 2, y: 2, direction: 'up' }] }), 'ILLEGAL_TARGET');
    expectError(act(s, 'alice', { kind: 'clones', clones: [{ x: 4, y: 2, direction: 'down' }] }), 'ILLEGAL_TARGET'); // 3 away
    s = unwrap(act(s, 'alice', { kind: 'clones', clones: [{ x: 3, y: 2, direction: 'down' }] }));
    expect(chaosOf(s).wardenClones).toEqual([{ x: 3, y: 2, direction: 'down', fresh: false, life: 3 }]);
    expect(chaosOf(s).stolen).toBeNull();
    s = unwrap(stay(s, 'bob', T));
    s = go(s, 'alice', 'left');
    expect(chaosOf(s).wardenClones[0]).toMatchObject({ x: 3, y: 3, life: 2 });
    expectError(move(s, 'bob', 'up', T), 'ILLEGAL_MOVE'); // can't walk into his clone
    s = unwrap(stay(s, 'bob', T));
    s = go(s, 'alice', 'right');
    expect(s.match!.status === 'finished' && s.match!.outcome).toEqual({ winner: 'alice', reason: 'capture' });
    expect(chaosOf(s).events).toContainEqual({ kind: 'clonecatch', at: { x: 3, y: 4 } });
  });
  it('only All For One can steal', () => {
    expectError(act(game('allmight', grid, 'alice'), 'alice', { kind: 'steal' }), 'NO_ABILITY');
  });
});

describe('Sasuke: sharingan', () => {
  it('needs the prisoner in his row or column with no rock in between', () => {
    const open = ['.......', '.......', '.......', '.W...P.', '.......', '.......', '......T'];
    const rock = ['.......', '.......', '.......', '.W.#.P.', '.......', '.......', '......T'];
    const diag = ['.......', '.......', '....P..', '.W.....', '.......', '.......', '......T'];
    expectError(act(game('naruto', rock, 'alice', vs('sasuke', 'naruto')), 'alice', { kind: 'sharingan' }), 'ILLEGAL_TARGET');
    expectError(act(game('naruto', diag, 'alice', vs('sasuke', 'naruto')), 'alice', { kind: 'sharingan' }), 'ILLEGAL_TARGET');
    const s = unwrap(act(game('naruto', open, 'alice', vs('sasuke', 'naruto')), 'alice', { kind: 'sharingan' }));
    expect(chaosOf(s)).toMatchObject({ illusion: 2, cooldown: { warden: 5 } });
    const scramble = chaosOf(s).scramble!;
    for (const d of ['up', 'down', 'left', 'right'] as const) expect(scramble[d]).not.toBe(d);
    expect(new Set(Object.values(scramble)).size).toBe(4);
  });
  it("shuffles the prisoner's keys for 2 turns; a wall just bumps", () => {
    const g = ['.......', '.......', '.......', '.W...P.', '.......', '.......', '......T'];
    const scramble = { up: 'right', right: 'down', down: 'left', left: 'up' } as const;
    let s: Session = game('allmight', g, 'bob', { ...vs('sasuke', 'allmight'), illusion: 2, scramble, bar: 2 });
    expectError(act(s, 'bob', { kind: 'smash', direction: 'left' }), 'ABILITY_NOT_READY'); // no powers in the dark
    s = go(s, 'bob', 'up'); // really goes right
    expect(s.match!.positions.prisoner).toEqual({ x: 6, y: 3 });
    s = go(s, 'alice', 'up');
    s = go(s, 'bob', 'up'); // right again: the edge, so a bump
    expect(s.match!.positions.prisoner).toEqual({ x: 6, y: 3 });
    expect(chaosOf(s).events[0]).toEqual({ kind: 'bump' });
    expect(active(s).turn.playerId).toBe('alice');
    expect(chaosOf(s)).toMatchObject({ illusion: 0, scramble: null });
  });
  it('is ready again 4 of his turns after the illusion ends', () => {
    const g = ['.......', '.......', '.......', '.W...P.', '.......', '.......', '......T'];
    let s: Session = unwrap(act(game('allmight', g, 'alice', vs('sasuke', 'allmight')), 'alice', { kind: 'sharingan' }));
    let blocked = 0;
    for (let turn = 0; turn < 8; turn++) {
      s = unwrap(stay(s, 'bob', T)); // prisoner
      if (!act(s, 'alice', { kind: 'sharingan' }).ok) blocked++; else break;
      s = { ...s, match: { ...active(s), staysLeft: { warden: 2, prisoner: 2 } } };
      s = unwrap(stay(s, 'alice', T));
      s = { ...s, match: { ...active(s), staysLeft: { warden: 2, prisoner: 2 } } };
    }
    expect(blocked).toBe(5); // 1 more during the illusion, then 4
  });
});

describe('Gojo: infinite void', () => {
  const near = ['.......', '.......', '.......', '.W.P...', '.......', '.......', '......T'];
  it('needs the prisoner within 2 tiles', () => {
    const far = ['.......', '.......', '.......', '.W..P..', '.......', '.......', '......T'];
    expectError(act(game('naruto', far, 'alice'), 'alice', { kind: 'void' }), 'ILLEGAL_TARGET');
  });
  it('pulls the prisoner in; hitting every round sends them back for a normal turn', () => {
    let s: Session = unwrap(act(game('naruto', near, 'alice'), 'alice', { kind: 'void' }));
    expect(chaosOf(s)).toMatchObject({ inVoid: true, cooldown: { warden: 3 } });
    expect(active(s).turn.playerId).toBe('bob');
    expect(active(s).turn.deadline - T).toBe(VOID_INTRO_MS + VOID_DURATION_MS); // the title card, then the challenge
    expectError(move(s, 'bob', 'up', T), 'IN_VOID');
    expectError(stay(s, 'bob', T), 'IN_VOID');
    expectError(act(s, 'bob', { kind: 'escape', hits: [true, true] }), 'ILLEGAL_TARGET');
    s = unwrap(act(s, 'bob', { kind: 'escape', hits: [true, true, true] }));
    expect(chaosOf(s)).toMatchObject({ inVoid: false, events: [{ kind: 'escape', escaped: true }] });
    expect(active(s).turn.playerId).toBe('bob');
    expect(unwrap(move(s, 'bob', 'up', T)).match!.positions.prisoner).toEqual({ x: 3, y: 2 });
  });
  it('one miss, or no answer in time, means caught', () => {
    const s = unwrap(act(game('naruto', near, 'alice'), 'alice', { kind: 'void' }));
    const missed = unwrap(act(s, 'bob', { kind: 'escape', hits: [true, false, true] }));
    expect(missed.match!.status === 'finished' && missed.match!.outcome).toEqual({ winner: 'alice', reason: 'capture' });
    const late = unwrap(resolveTimeout(s, 99_999, seeded(1)));
    expect(late.match!.status === 'finished' && late.match!.outcome.reason).toBe('capture');
    expectError(act(game('naruto', near, 'bob'), 'bob', { kind: 'escape', hits: [true, true, true] }), 'ILLEGAL_TARGET');
  });
});
