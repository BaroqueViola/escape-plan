// Chaos class sprites: 32x32 pixel chibis drawn with rectangles, then an
// automatic outline and rim shading. The canvas is 34x34 (1px outline margin).
// spriteUrl(name) turns one into a PNG data URL for <img>.

type Grid = (string | null)[][];
interface Painter {
  g: Grid;
  R(x: number, y: number, w: number, h: number, c: string): void;
  P(x: number, y: number, c: string): void;
  clr(x: number, y: number): void;
  spike(cx: number, top: number, h: number, c: string): void;
}
interface BodyColours { top: string; topS: string; arm?: string; armS?: string; pants: string; pantsS?: string; shoe: string; skin: string }
const OUT = '#120f17';
function mk(): Painter {
  const g: Grid = Array.from({ length: 34 }, () => Array<string | null>(34).fill(null));
  const api: Painter = {
    g,
    R(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && i < 32 && j >= 0 && j < 32) g[j + 1][i + 1] = c; },
    P(x, y, c) { api.R(x, y, 1, 1, c); },
    clr(x, y) { g[y + 1][x + 1] = null; },
    spike(cx, top, h, c) { for (let i = 0; i < h; i++) { const w = 1 + 2 * Math.floor(i / 2); api.R(cx - Math.floor(w / 2), top + i, w, 1, c); } },
  };
  return api;
}
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}
function finish(a: Painter): Grid {
  const g = a.g, H = 34, W = 34;
  const filled = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && !!g[y]![x] && g[y]![x] !== OUT;
  const out = g.map(r => r.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!filled(x, y)) continue;
    let c = g[y]![x]!;
    if (!filled(x + 1, y) || !filled(x, y + 1)) c = shade(c, -0.22);
    else if (!filled(x - 1, y) || !filled(x, y - 1)) c = shade(c, 0.14);
    out[y]![x] = c;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (filled(x, y)) continue;
    if (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1)) out[y]![x] = OUT;
  }
  return out;
}
// shared pieces
function head(a: Painter, skin: string, skinS: string): void {
  a.R(9, 8, 14, 12, skin); a.clr(9, 19); a.clr(22, 19); a.clr(9, 8); a.clr(22, 8);
  a.R(8, 12, 1, 4, skin); a.R(23, 12, 1, 4, skinS);
  a.R(21, 10, 1, 9, skinS); a.R(11, 19, 10, 1, skinS);
}
function eyes(a: Painter, iris: string, opts: { lash?: string; white?: string; pupil?: string } = {}): void {
  const lash = opts.lash || '#1a1416', white = opts.white || '#fbfbf7';
  a.R(11, 13, 3, 1, lash); a.R(18, 13, 3, 1, lash);
  a.R(11, 14, 1, 2, white); a.R(12, 14, 2, 2, iris); a.P(12, 14, white);
  a.R(20, 14, 1, 2, white); a.R(18, 14, 2, 2, iris); a.P(18, 14, white);
  if (opts.pupil) { a.P(13, 15, opts.pupil); a.P(19, 15, opts.pupil); }
}
function body(a: Painter, c: BodyColours): void {
  // c: {top, topS, arm, pants, shoe, skin}
  a.R(10, 20, 12, 7, c.top); a.R(19, 21, 3, 6, c.topS);
  a.R(7, 21, 3, 6, c.arm || c.top); a.R(22, 21, 3, 6, c.armS || c.topS);
  a.R(7, 27, 3, 2, c.skin); a.R(22, 27, 3, 2, c.skin);
  a.R(11, 27, 4, 3, c.pants); a.R(17, 27, 4, 3, c.pantsS || c.pants);
  a.R(10, 30, 5, 2, c.shoe); a.R(17, 30, 5, 2, c.shoe);
}

export const SPRITES = {
  naruto() {
    const a = mk(), skin = '#f2c39a', skinS = '#dba479', hair = '#f8d03c', hairS = '#dba51e', hairH = '#fff09a';
    body(a, { top: '#f27b1f', topS: '#d5640f', pants: '#ec7419', pantsS: '#cf5f10', shoe: '#2c418f', skin });
    a.R(10, 20, 12, 2, '#262628'); a.R(7, 21, 3, 2, '#262628'); a.R(22, 21, 3, 2, '#262628');
    a.R(13, 20, 6, 1, '#f4f4f0'); a.R(15, 22, 1, 5, '#c0560c'); a.P(23, 24, '#c8321e');
    a.R(11, 29, 4, 1, '#e8e2d4'); a.R(17, 29, 4, 1, '#e8e2d4');
    head(a, skin, skinS);
    a.R(8, 4, 16, 5, hair);
    a.spike(9, 1, 4, hair); a.spike(13, 0, 5, hair); a.spike(18, 0, 5, hair); a.spike(22, 1, 4, hairS);
    a.R(6, 6, 3, 3, hair); a.P(5, 7, hair); a.R(23, 6, 3, 3, hairS); a.P(26, 7, hairS);
    a.R(12, 2, 1, 3, hairH); a.R(17, 2, 1, 2, hairH);
    a.R(8, 8, 16, 2, '#2c4ea6'); a.R(12, 8, 8, 2, '#cdd5dd'); a.R(12, 9, 8, 1, '#9aa5b0'); a.P(15, 8, '#5e6a75'); a.P(16, 9, '#5e6a75');
    a.R(9, 10, 1, 3, hair); a.R(22, 10, 1, 3, hairS); a.R(10, 10, 2, 1, hair); a.R(20, 10, 2, 1, hairS);
    eyes(a, '#2f86d9');
    a.R(9, 16, 2, 1, '#9a6040'); a.R(9, 18, 2, 1, '#9a6040'); a.R(21, 16, 2, 1, '#9a6040'); a.R(21, 18, 2, 1, '#9a6040');
    a.R(14, 17, 4, 1, '#6a2a22'); a.R(15, 18, 2, 1, '#c0505a');
    return finish(a);
  },
  sukuna() {
    const a = mk(), skin = '#f0c09a', skinS = '#d6a07a', hair = '#f2a3ad', hairS = '#c96f7d', k = '#151215';
    body(a, { top: '#efe9dc', topS: '#cdc4b0', arm: '#efe9dc', armS: '#cdc4b0', pants: '#2b2530', shoe: '#5a3a28', skin });
    a.R(6, 21, 1, 6, '#efe9dc'); a.R(25, 21, 1, 6, '#cdc4b0');
    a.R(14, 20, 4, 2, skin); a.P(15, 22, skin); a.P(16, 22, skin);
    a.R(13, 20, 1, 3, '#a89e88'); a.R(18, 20, 1, 3, '#a89e88');
    a.R(10, 24, 12, 2, '#1c1a1e'); a.R(18, 26, 2, 2, '#1c1a1e');
    a.R(7, 26, 3, 1, k); a.R(22, 26, 3, 1, k);
    head(a, skin, skinS);
    a.R(8, 5, 16, 4, hair);
    a.spike(10, 2, 4, hair); a.spike(13, 0, 5, hair); a.spike(16, 1, 5, hair); a.spike(19, 0, 5, hair); a.spike(22, 2, 4, hairS);
    a.R(14, 2, 1, 3, '#ffd2d8'); a.R(8, 9, 1, 4, '#3a2228'); a.R(23, 9, 1, 4, '#3a2228'); a.R(10, 9, 3, 1, hair); a.R(19, 9, 3, 1, hairS);
    // eyes, narrow and red
    a.R(11, 13, 3, 1, k); a.R(18, 13, 3, 1, k);
    a.R(11, 14, 3, 1, '#d42a2a'); a.R(18, 14, 3, 1, '#d42a2a'); a.P(12, 14, '#ffd36a'); a.P(19, 14, '#ffd36a');
    a.P(14, 12, k); a.P(17, 12, k);
    // second pair of eyes + markings
    a.R(11, 16, 2, 1, '#b8202a'); a.R(19, 16, 2, 1, '#b8202a'); a.P(10, 16, k); a.P(21, 16, k);
    a.R(11, 17, 2, 1, '#4a1a1e'); a.R(19, 17, 2, 1, '#4a1a1e');
    a.R(15, 9, 2, 1, k);
    a.R(14, 18, 4, 1, '#5a1a1e'); a.P(18, 17, '#5a1a1e');
    return finish(a);
  },
  gojo() {
    const a = mk(), skin = '#f4cba6', skinS = '#dcaa82', hair = '#f5f7fb', hairS = '#c9d2e0', navy = '#1f2542', navyS = '#151a32';
    body(a, { top: navy, topS: navyS, pants: '#191e36', shoe: '#0f1015', skin });
    a.R(11, 19, 10, 3, navyS); a.R(15, 22, 2, 5, '#2b3256'); a.P(15, 23, '#e0b84e'); a.P(15, 25, '#e0b84e');
    a.R(7, 26, 3, 1, '#2b3256'); a.R(22, 26, 3, 1, '#2b3256');
    head(a, skin, skinS);
    a.R(8, 4, 16, 6, hair);
    a.spike(10, 1, 5, hair); a.spike(13, 0, 6, hair); a.spike(17, 0, 6, hair); a.spike(21, 1, 5, hairS); a.spike(24, 4, 3, hairS); a.spike(7, 4, 3, hair);
    a.R(12, 2, 1, 4, '#ffffff'); a.R(19, 4, 2, 2, hairS);
    a.R(8, 9, 2, 6, hair); a.R(22, 9, 2, 6, hairS); a.R(10, 10, 4, 1, hair); a.R(18, 10, 3, 1, hairS);
    a.R(9, 12, 14, 3, '#15171e'); a.R(8, 12, 1, 2, '#15171e'); a.R(23, 12, 1, 2, '#15171e'); a.R(10, 12, 4, 1, '#3a4050');
    a.R(15, 17, 3, 1, '#a8604e'); a.P(18, 16, '#a8604e');
    return finish(a);
  },
  sasuke() {
    const a = mk(), skin = '#f2c8a6', skinS = '#d8a882', hair = '#232740', hairS = '#171a2c', hairH = '#41508a';
    // sword behind
    a.R(24, 12, 2, 10, '#5a3f28'); a.R(23, 17, 4, 1, '#c9a84a');
    body(a, { top: '#ecebe6', topS: '#c9c7be', pants: '#2e3550', shoe: '#18181c', skin });
    a.R(14, 20, 4, 3, skin); a.P(15, 23, skin); a.P(16, 23, skin);
    a.R(10, 24, 12, 2, '#6e4bb0'); a.R(10, 24, 12, 1, '#8a68cc'); a.R(15, 26, 2, 3, '#6e4bb0');
    a.R(7, 25, 3, 2, '#2e3550'); a.R(22, 25, 3, 2, '#2e3550');
    head(a, skin, skinS);
    a.R(8, 4, 17, 6, hair);
    a.spike(10, 3, 3, hair); a.spike(14, 2, 4, hair); a.spike(18, 0, 6, hair); a.spike(21, 1, 6, hairS); a.spike(24, 3, 5, hairS); a.R(25, 6, 2, 3, hairS);
    a.R(13, 4, 4, 1, hairH); a.R(17, 2, 2, 1, hairH);
    a.R(8, 9, 2, 9, hair); a.R(22, 9, 2, 9, hairS); a.R(10, 9, 3, 3, hair); a.R(19, 9, 3, 3, hairS); a.R(13, 9, 1, 1, hair);
    eyes(a, '#d71f2a', { pupil: '#120a0a' }); a.P(13, 14, '#120a0a');
    a.R(15, 17, 2, 1, '#a4655a');
    return finish(a);
  },
  afo() {
    const a = mk(), suit = '#1b1b22', suitS = '#121218', mask = '#2a2b36', maskH = '#4c4f62', tube = '#8d939e';
    body(a, { top: suit, topS: suitS, pants: '#17171d', shoe: '#0b0b0e', skin: '#2a2a30' });
    a.R(13, 20, 6, 5, '#e9e9e6'); a.R(15, 21, 2, 5, '#a3152a'); a.R(12, 20, 1, 6, '#2e2f3a'); a.R(19, 20, 1, 6, '#2e2f3a');
    a.R(7, 27, 3, 2, '#2a2a30'); a.R(22, 27, 3, 2, '#2a2a30');
    // tubes
    a.R(5, 10, 3, 2, tube); a.R(5, 12, 2, 9, tube); a.R(25, 10, 2, 2, tube); a.R(25, 12, 2, 9, '#6c717c');
    a.R(9, 4, 14, 3, mask); a.R(8, 6, 16, 14, mask); a.R(10, 3, 12, 1, mask); a.clr(8, 19); a.clr(23, 19);
    a.R(11, 4, 6, 1, maskH); a.R(9, 8, 14, 1, '#2c2d38'); a.R(9, 11, 14, 1, '#2c2d38'); a.R(10, 7, 3, 1, maskH);
    a.R(11, 12, 10, 1, '#7a1824'); a.R(12, 12, 8, 1, '#c22a3a');
    a.R(12, 15, 8, 4, '#2c2d38'); for (let x = 13; x < 20; x += 2) a.R(x, 15, 1, 4, '#4a4c5a');
    a.R(8, 9, 1, 8, maskH); a.R(12, 5, 8, 1, '#5c6078'); a.R(7, 14, 2, 2, tube); a.R(23, 14, 2, 2, tube); a.P(12, 20, '#e9e9e6'); a.P(19, 20, '#e9e9e6');
    return finish(a);
  },
  allmight() {
    const a = mk(), skin = '#e9c29c', skinS = '#c99c74', hair = '#f6d24a', hairS = '#d4a823';
    a.R(11, 20, 10, 7, '#f4f3ee'); a.R(18, 21, 3, 6, '#d2d0c6');
    a.R(8, 21, 3, 6, '#f4f3ee'); a.R(21, 21, 3, 6, '#d2d0c6'); a.R(8, 27, 3, 2, skin); a.R(21, 27, 3, 2, skin);
    a.R(11, 26, 10, 1, '#2b2420');
    a.R(11, 27, 4, 3, '#b19c70'); a.R(17, 27, 4, 3, '#97835a'); a.R(10, 30, 5, 2, '#5a3a24'); a.R(17, 30, 5, 2, '#5a3a24');
    a.R(14, 20, 4, 2, skinS);
    head(a, skin, skinS);
    a.R(8, 5, 16, 4, hair); a.R(9, 4, 14, 1, hair);
    a.spike(11, 1, 4, hair); a.spike(20, 1, 4, hairS); a.P(10, 1, hair); a.P(21, 1, hairS);
    a.R(11, 9, 2, 8, hair); a.R(19, 9, 2, 8, hairS); a.P(11, 17, hair); a.P(20, 17, hairS); a.R(8, 8, 2, 5, hair); a.R(22, 8, 2, 5, hairS);
    a.R(13, 12, 2, 3, '#211d26'); a.R(17, 12, 2, 3, '#211d26'); a.P(13, 13, '#5ac8ff'); a.P(18, 13, '#5ac8ff');
    a.R(10, 15, 1, 3, skinS); a.R(21, 15, 1, 3, skinS);
    a.R(14, 17, 4, 1, '#6a3a30'); a.P(17, 18, '#c0202a'); a.P(17, 19, '#c0202a');
    return finish(a);
  },
  allmightbuff() {
    const a = mk(), skin = '#efc39a', skinS = '#c99a70', hair = '#f8d540', hairS = '#d4a820', blue = '#2f62d6', blueS = '#2149a6', red = '#d9282c';
    a.R(5, 20, 22, 7, blue); a.R(20, 20, 7, 7, blueS);
    a.R(1, 20, 4, 7, blue); a.R(27, 20, 4, 7, blueS); a.R(1, 27, 4, 2, skin); a.R(27, 27, 4, 2, skin);
    a.R(1, 20, 4, 1, '#f2f2f2'); a.R(27, 20, 4, 1, '#f2f2f2'); a.R(1, 25, 4, 1, red); a.R(27, 25, 4, 1, red);
    a.R(9, 21, 5, 2, red); a.R(18, 21, 5, 2, red); a.R(12, 20, 8, 1, '#f2f2f2'); a.R(15, 21, 2, 4, blueS);
    a.R(5, 26, 22, 1, '#f2c21e'); a.R(15, 26, 2, 1, '#fff2a0');
    a.R(9, 27, 5, 3, blue); a.R(18, 27, 5, 3, blueS); a.R(8, 30, 6, 2, red); a.R(18, 30, 6, 2, red);
    a.R(13, 19, 6, 1, skinS);
    a.R(8, 8, 16, 12, skin); a.clr(8, 19); a.clr(23, 19); a.R(22, 9, 2, 10, skinS); a.R(7, 12, 1, 4, skin); a.R(24, 12, 1, 4, skinS);
    a.R(8, 4, 16, 5, hair); a.R(7, 7, 2, 5, hair); a.R(23, 7, 2, 5, hairS);
    ([[7, 0], [8, 1], [9, 2], [10, 3]] as const).forEach(([x, y]) => a.R(x, y, 3, 1, hair));
    ([[22, 0], [21, 1], [20, 2], [19, 3]] as const).forEach(([x, y]) => a.R(x, y, 3, 1, hairS));
    a.R(10, 12, 12, 3, '#3a2e3c'); a.P(12, 13, '#6ad8ff'); a.P(19, 13, '#6ad8ff'); a.R(10, 11, 4, 1, '#3a2e3c'); a.R(18, 11, 4, 1, '#3a2e3c');
    a.R(10, 16, 12, 1, '#5a2a24'); a.R(10, 17, 12, 2, '#fbfbf6'); a.R(10, 19, 12, 0, '#5a2a24');
    [12, 14, 16, 18, 20].forEach(x => a.P(x, 17, '#c9c5bb')); a.R(10, 18, 12, 1, '#e8e4da');
    a.P(9, 15, skinS); a.P(22, 15, skinS);
    return finish(a);
  },
  allmightpunch() {
    const a = mk(), skin = '#efc39a', skinS = '#c99a70', hair = '#f8d540', hairS = '#d4a820', blue = '#2f62d6', blueS = '#2149a6', red = '#d9282c';
    // body turned into the punch, rear arm pulled back, front arm thrown straight out
    a.R(3, 20, 20, 7, blue); a.R(17, 20, 6, 7, blueS);
    a.R(0, 21, 3, 5, blueS); a.R(0, 26, 3, 2, skinS); a.R(0, 21, 3, 1, '#f2f2f2');
    a.R(21, 20, 7, 4, blue); a.R(21, 23, 7, 1, blueS); a.R(21, 20, 1, 4, '#f2f2f2'); a.R(25, 20, 1, 4, red);
    a.R(27, 18, 5, 7, skin); a.R(27, 24, 5, 1, skinS); a.R(31, 18, 1, 7, skinS);
    [19, 21, 23].forEach(y => a.R(28, y, 3, 1, skinS)); a.R(27, 18, 2, 2, skinS);
    a.R(7, 21, 5, 2, red); a.R(14, 21, 5, 2, red); a.R(9, 20, 8, 1, '#f2f2f2'); a.R(12, 21, 2, 4, blueS);
    a.R(3, 26, 20, 1, '#f2c21e'); a.R(12, 26, 2, 1, '#fff2a0');
    a.R(5, 27, 5, 3, blue); a.R(16, 27, 5, 3, blueS); a.R(3, 30, 7, 2, red); a.R(16, 30, 7, 2, red);
    a.R(10, 19, 6, 1, skinS);
    a.R(6, 8, 16, 12, skin); a.clr(6, 19); a.clr(21, 19); a.R(20, 9, 2, 10, skinS); a.R(5, 12, 1, 4, skin); a.R(22, 12, 1, 4, skinS);
    a.R(6, 4, 16, 5, hair); a.R(5, 7, 2, 5, hair); a.R(21, 7, 2, 5, hairS);
    ([[5, 0], [6, 1], [7, 2], [8, 3]] as const).forEach(([x, y]) => a.R(x, y, 3, 1, hair));
    ([[20, 0], [19, 1], [18, 2], [17, 3]] as const).forEach(([x, y]) => a.R(x, y, 3, 1, hairS));
    a.R(8, 12, 12, 3, '#3a2e3c'); a.R(8, 11, 4, 1, '#3a2e3c'); a.R(16, 11, 4, 1, '#3a2e3c'); a.P(11, 13, '#6ad8ff'); a.P(17, 13, '#6ad8ff');
    a.R(8, 16, 12, 1, '#5a2a24'); a.R(8, 17, 12, 2, '#fbfbf6'); a.R(8, 18, 12, 1, '#e8e4da');
    [10, 12, 14, 16, 18].forEach(x => a.P(x, 17, '#c9c5bb'));
    a.P(7, 15, skinS); a.P(20, 15, skinS);
    return finish(a);
  },
  fist() {
    const a = mk(), skin = '#efc39a', skinS = '#c99a70', blue = '#2f62d6', blueS = '#2149a6';
    a.R(0, 11, 9, 10, blue); a.R(0, 18, 9, 3, blueS); a.R(2, 11, 2, 10, '#f2f2f2'); a.R(6, 11, 2, 10, '#d9282c');
    a.R(9, 8, 16, 16, skin); a.R(9, 22, 16, 2, skinS); a.clr(9, 8); a.clr(24, 8); a.clr(24, 23);
    a.R(25, 10, 3, 12, skin); a.R(27, 10, 1, 12, skinS);
    [12, 16, 20].forEach(y => a.R(18, y, 10, 1, skinS));
    a.R(12, 18, 7, 4, skinS); a.R(12, 18, 7, 1, '#b8865e');
    return finish(a);
  },
  fistafo() {
    const a = mk(), skin = '#3a3a44', skinS = '#24242c', blue = '#1b1b22', blueS = '#121218';
    a.R(0, 11, 9, 10, blue); a.R(0, 18, 9, 3, blueS); a.R(2, 11, 2, 10, '#2e2f3a'); a.R(6, 11, 2, 10, '#a3152a');
    a.R(9, 8, 16, 16, skin); a.R(9, 22, 16, 2, skinS); a.clr(9, 8); a.clr(24, 8); a.clr(24, 23);
    a.R(25, 10, 3, 12, skin); a.R(27, 10, 1, 12, skinS);
    [12, 16, 20].forEach(y => a.R(18, y, 10, 1, skinS));
    a.R(12, 18, 7, 4, skinS); a.R(12, 18, 7, 1, '#15151b');
    return finish(a);
  },
  prisoner() {
    const a = mk(), skin = '#f0c49c', skinS = '#d29f74';
    body(a, { top: '#f08a24', topS: '#c86a14', pants: '#f08a24', pantsS: '#c86a14', shoe: '#3a2a20', skin });
    a.R(12, 22, 8, 1, '#ffffff'); a.R(12, 24, 8, 1, '#ffffff');
    head(a, skin, skinS); a.R(9, 6, 14, 4, '#6a4026'); a.R(8, 8, 2, 5, '#6a4026'); a.R(22, 8, 2, 5, '#4e2e1a'); a.R(10, 5, 12, 1, '#6a4026');
    eyes(a, '#4a3020'); a.R(14, 17, 4, 1, '#8a4a3a');
    return finish(a);
  },
  warden() {
    const a = mk(), skin = '#e8bc94', skinS = '#c9986c';
    body(a, { top: '#2a3f7a', topS: '#1c2c5a', pants: '#1c2440', shoe: '#0e0e14', skin });
    a.R(15, 21, 2, 5, '#e8c35a'); a.R(11, 21, 2, 2, '#e8c35a');
    head(a, skin, skinS); a.R(8, 5, 16, 4, '#1c2c5a'); a.R(7, 9, 18, 1, '#111a38'); a.R(14, 6, 4, 2, '#e8c35a');
    eyes(a, '#2a2a3a'); a.R(13, 17, 6, 1, '#6a3a30');
    return finish(a);
  },
};
export type SpriteName = keyof typeof SPRITES;

const cache = new Map<SpriteName, string>();

// PNG data URL of a sprite (34x34; scale it with image-rendering: pixelated)
export function spriteUrl(name: SpriteName): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = 34;
  canvas.height = 34;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  SPRITES[name]().forEach((row, y) => row.forEach((colour, x) => {
    if (colour) { ctx.fillStyle = colour; ctx.fillRect(x, y, 1, 1); }
  }));
  const url = canvas.toDataURL();
  cache.set(name, url);
  return url;
}
