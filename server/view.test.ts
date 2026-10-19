import { describe, expect, it } from 'vitest';
import type { ActiveMatch, Session } from '../packages/game-core/src/index.js';
import { toGameState } from './view.js';

// Naruto at (3,3) with clones at (1,1) and (5,3); the warden is alice
function narutoGame(): Session {
  return { players: ['alice', 'bob'], scores: { alice: 0, bob: 0 }, match: {
    status: 'active', board: { width: 7, height: 7, cells: Array(49).fill('free') },
    roles: { warden: 'alice', prisoner: 'bob' },
    positions: { warden: { x: 0, y: 6 }, prisoner: { x: 3, y: 3 } },
    turn: { playerId: 'alice', startedAt: 0, deadline: 10_000 }, staysLeft: { warden: 2, prisoner: 2 },
    chaos: { classes: { warden: 'gojo', prisoner: 'naruto' }, stunned: { warden: 0, prisoner: 0 },
      cooldown: { warden: 0, prisoner: 0 }, cracks: [], bar: 0, charges: 0, fingers: [], collected: 0,
      stolen: null, locked: 0, wardenClones: [], illusion: 0, scramble: null, inVoid: false,
      clones: [{ x: 5, y: 3, direction: 'left', fresh: false }, { x: 1, y: 1, direction: 'up', fresh: false }],
      events: [{ kind: 'swap' }] },
  } satisfies ActiveMatch };
}
const names = { alice: 'Ann', bob: 'Ben' };
const kind = { mode: 'chaos' as const, classes: { warden: 'gojo' as const, prisoner: 'naruto' as const } };

describe('Chaos view', () => {
  it('the warden and spectators cannot tell Naruto from his clones', () => {
    for (const viewer of ['warden', 'public'] as const) {
      const state = toGameState(narutoGame(), names, 0, kind, viewer)!;
      expect(state.chaos?.hidden).toBe(true);
      expect(state.positions.prisoner).toEqual({ x: 1, y: 1 }); // first figure in board order
      expect(state.chaos?.clones).toEqual([{ x: 3, y: 3, direction: null }, { x: 5, y: 3, direction: null }]);
      expect(state.chaos?.events).toEqual([]); // the swap is secret
    }
  });
  it('Naruto and the admin see the real Naruto and where each clone walks', () => {
    for (const viewer of ['prisoner', 'all'] as const) {
      const state = toGameState(narutoGame(), names, 0, kind, viewer)!;
      expect(state.chaos?.hidden).toBe(false);
      expect(state.positions.prisoner).toEqual({ x: 3, y: 3 });
      expect(state.chaos?.clones).toEqual([{ x: 5, y: 3, direction: 'left' }, { x: 1, y: 1, direction: 'up' }]);
      expect(state.chaos?.events).toEqual([{ kind: 'swap' }]);
    }
  });
  it('a prisoner in the illusion sees a dark, empty board; everyone else sees it all', () => {
    const base = narutoGame();
    const m = base.match as ActiveMatch;
    const cells = m.board.cells.map((t, i) => (i === 10 ? 'obstacle' as const : t));
    const s: Session = { ...base, match: { ...m, board: { ...m.board, cells },
      chaos: { ...m.chaos!, classes: { warden: 'sasuke', prisoner: 'naruto' }, illusion: 2,
        scramble: { up: 'left', left: 'down', down: 'right', right: 'up' }, events: [{ kind: 'sharingan' }] } } };
    const dark = toGameState(s, names, 0, kind, 'prisoner')!;
    expect(dark.chaos).toMatchObject({ blind: true, illusion: 2, clones: [], fingers: [], events: [] });
    expect(dark.board.cells.every((t) => t === 'free')).toBe(true);
    expect(dark.positions).toEqual({ warden: { x: 0, y: 0 }, prisoner: { x: 0, y: 0 } });
    expect(JSON.stringify(dark)).not.toContain('scramble'); // the shuffled keys stay secret
    for (const viewer of ['warden', 'public', 'all'] as const) {
      const state = toGameState(s, names, 0, kind, viewer)!;
      expect(state.chaos).toMatchObject({ blind: false, illusion: 2 });
      expect(state.board.cells[10]).toBe('obstacle');
    }
  });
});
