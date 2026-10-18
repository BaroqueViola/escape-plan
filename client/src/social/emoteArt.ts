// Pixel art for the emotes: our own prisoner and warden pulling faces
// (Clash Royale style), plus four crowd emotes for spectators.
// Each sprite is a grid of letters; each letter is a colour in PALETTE.
// Plain data with no imports, so the game page (sprites.tsx) and the server
// (the admin page's emote images, GET /emotes/<id>.svg) both use it.

export interface EmoteSprite { label: string; grid: string[] }

export const PALETTE: Record<string, string> = {
  h:'#3b2a20', H:'#5a4030', s:'#f0c090', S:'#d9a070', e:'#1e1e1e', y:'#e8b84a', k:'#2a2a2a',
  g:'#24442f', G:'#3d6b4a', m:'#2a1d14', r:'#c0392b', b:'#5ab8f0', B:'#2f86c9', w:'#ffffff',
  p:'#f08a8a', R:'#e0705a', o:'#e8572a', Y:'#f5c542', W:'#fff3b0', n:'#8a5a2a', v:'#7a2a1a'
};

const PRISONER_BASE = [
  '....hhhhhhhh....',
  '..hhhhhhhhhhhh..',
  '.hhhhhHhhhhhhhh.',
  '.hhhhhhhhhHhhhh.',
  '.hhsshhhhhhsshh.',
  '.hssssssssssssh.',
  '.ssssssssssssss.',
  '.ssssssssssssss.',
  '.ssssssssssssss.',
  '.ssssssssssssss.',
  '.ssssssssssssss.',
  '..ssssssssssss..',
  '...SssssssssS...',
  '.yykkyykkyykkyy.',
  'yykkyykkyykkyykk',
  'yykkyykkyykkyykk',
];

const WARDEN_BASE = [
  '...gggggggggg...',
  '..gggggggggggg..',
  '..ggggggyygggg..',
  '..ggggggyygggg..',
  'GGGGGGGGGGGGGGGG',
  '.ssssssssssssss.',
  '.ssssssssssssss.',
  '.ssssssssssssss.',
  '.ssssssssssssss.',
  '.ssssssssssssss.',
  '.sssmmmmmmmmsss.',
  '..ssssssssssss..',
  '...SssssssssS...',
  '.GGGGGyyyyGGGGG.',
  'GGGGGGGyyGGGGGGG',
  'GGGGGGGyyGGGGGGG',
];

function paint(base: string[], pts: [string, [number, number][]][], recolor?: Record<string, string>): string[] {
  const g = base.map(r => [...r]);
  if (recolor) for (const row of g) for (let i = 0; i < row.length; i++) { const c = recolor[row[i]!]; if (c) row[i] = c; }
  for (const [c, list] of pts) for (const [x, y] of list) { const row = g[y]; if (row && x >= 0 && x < row.length) row[x] = c; }
  return g.map(r => r.join(''));
}
const span = (y: number, x0: number, x1: number): [number, number][] => { const a: [number, number][] = []; for (let x = x0; x <= x1; x++) a.push([x, y]); return a; };

export const PLAYER_EMOTE_ART = {
  // Player emotes (voiced)
  laugh: { label: 'HEHEHE', grid: paint(PRISONER_BASE, [
    ['e', [[3,8],[5,8],[4,7],[10,8],[12,8],[11,7]]],
    ['e', [...span(10,4,11)]],
    ['r', [...span(11,5,10)]],
    ['e', [...span(12,6,9)]],
    ['p', [[2,9],[3,9],[12,9],[13,9]]],
    ['b', [[1,8],[14,8],[1,9],[14,9]]],
  ]) },
  cry: { label: 'NOOO', grid: paint(PRISONER_BASE, [
    ['e', [...span(7,3,5), ...span(7,10,12), [2,6],[13,6]]],
    ['b', [[4,8],[4,9],[4,10],[3,11],[11,8],[11,9],[11,10],[12,11],[4,12],[11,12]]],
    ['e', [...span(10,6,9), [5,11],[10,11]]],
  ]) },
  taunt: { label: 'CATCH ME!', grid: paint(PRISONER_BASE, [
    ['e', [...span(8,3,5), [10,7],[11,7],[10,8],[11,8]]],
    ['w', [[10,7]]],
    ['e', [...span(10,6,10)]],
    ['r', [[8,11],[9,11],[8,12],[9,12]]],
  ]) },
  angry: { label: 'GRRR!', grid: paint(WARDEN_BASE, [
    ['e', [[2,5],[3,5],[4,6],[5,6],[13,5],[12,5],[11,6],[10,6], [4,7],[5,7],[10,7],[11,7]]],
    ['m', [...span(9,4,11)]],
    ['e', [...span(10,4,11), ...span(12,5,10)]],
    ['w', [...span(11,5,10)]],
    ['e', [[7,11]]],
  ], { s: 'R' }) },
  shock: { label: 'WHAT?!', grid: paint(WARDEN_BASE, [
    ['w', [[3,6],[4,6],[3,7],[11,6],[12,6],[12,7],[4,7],[11,7]]],
    ['e', [[4,7],[11,7]]],
    ['e', [[7,11],[8,11],[7,12],[8,12],[6,11],[9,11]]],
    ['b', [[14,5],[14,6]]],
  ]) },
  nice: { label: 'NICE!', grid: paint(WARDEN_BASE, [
    ['e', [...span(7,3,5), [11,6],[11,7],[12,7]]],
    ['e', [[9,11],[10,11],[11,10]]],
  ]) },
};

export const CROWD_EMOTE_ART = {
  fire: { label: 'FIRE', grid: [
    '....o.....','...oo.....','...ooo..o.','..oooo.oo.','..ooYoooo.',
    '.ooYYYooo.','.oYYYYYoo.','.oYYWYYYo.','.ooYYYYoo.','..oooooo..' ] },
  wow: { label: 'WOW', grid: [
    '...YYYY...','.YYYYYYYY.','.YwwYYwwY.','YYweYYweYY','YYYYYYYYYY',
    'YYYYeeYYYY','YYYeeeeYYY','.YYYeeYYY.','.YYYYYYYY.','...YYYY...' ] },
  heart: { label: 'LOVE', grid: [
    '..........','.rr...rr..','rrrr.rrrr.','rwrrrrrrr.','rrrrrrrrr.',
    '.rrrrrrr..','..rrrrr...','...rrr....','....r.....','..........' ] },
  popcorn: { label: 'POPCORN', grid: [
    '..W.WW.W..','.WWWWWWWW.','.WYWWWYWW.','..WWWWWW..','.rwrwrwrw.',
    '.rwrwrwrw.','..rwrwrw..','..rwrwrw..','..rwrwrw..','..rrrrrr..' ] },
};

// The same pixels as an SVG file, for the admin page
export function emoteSvg(id: string): string | null {
  const art = (PLAYER_EMOTE_ART as Record<string, EmoteSprite>)[id] ?? (CROWD_EMOTE_ART as Record<string, EmoteSprite>)[id];
  if (!art) return null;
  const rects = art.grid.flatMap((row, y) => [...row].map((c, x) =>
    c === '.' ? '' : `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${PALETTE[c]}"/>`)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${art.grid[0]?.length ?? 0} ${art.grid.length}" shape-rendering="crispEdges">${rects}</svg>`;
}
