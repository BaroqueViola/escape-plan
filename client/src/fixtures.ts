import type { GameState, MatchInfo, MatchResult } from '../../server/events';

const cells: GameState['board']['cells'] = [
  'free', 'free', 'obstacle', 'free', 'free',
  'free', 'free', 'free', 'free', 'obstacle',
  'obstacle', 'free', 'tunnel', 'free', 'free',
  'free', 'free', 'obstacle', 'free', 'free',
  'free', 'free', 'free', 'obstacle', 'free',
];

export const fixtureNames = ['lobby', 'warder', 'prisoner', 'timeout', 'capture', 'escape', 'waiting', 'reset'] as const;
export type FixtureName = typeof fixtureNames[number];

export function fixture(name: FixtureName): { info: MatchInfo | null; state: GameState | null; result: MatchResult | null; votes: Record<string, boolean> } {
  if (name === 'lobby' || name === 'reset') return { info: null, state: null, result: null, votes: {} };
  const me = name === 'prisoner' || name === 'escape' ? 'prisoner' : 'warder';
  const opponent = me === 'warder' ? 'prisoner' : 'warder';
  const finished = name === 'capture' || name === 'escape' || name === 'waiting';
  const state: GameState = {
    board: { width: 5, height: 5, cells },
    positions: { warder: { x: 1, y: 1 }, prisoner: { x: name === 'escape' ? 2 : 3, y: 2 } },
    roles: { Alex: me, Morgan: opponent },
    scores: { Alex: name === 'capture' ? 2 : 1, Morgan: name === 'escape' ? 2 : 0 },
    status: finished ? 'finished' : 'active',
    turnNickname: finished ? null : name === 'prisoner' ? 'Morgan' : 'Alex',
    turnDeadline: finished ? null : Date.now() + (name === 'timeout' ? 800 : 9000),
    serverTime: Date.now(),
    outcome: finished ? { winner: name === 'escape' ? 'Morgan' : 'Alex', reason: name === 'escape' ? 'escape' : 'capture' } : null,
    rematchVotes: name === 'waiting' ? { Alex: true } : {},
  };
  return {
    info: { you: { nickname: 'Alex', role: me }, opponent: { nickname: 'Morgan', role: opponent } },
    state,
    result: finished ? { result: name === 'escape' ? 'Lost' : 'Win', winner: name === 'escape' ? 'Morgan' : 'Alex', reason: name === 'escape' ? 'escape' : 'capture', scores: state.scores } : null,
    votes: name === 'waiting' ? { Alex: true } : {},
  };
}
