// The class picker's live demo: a small board that plays each class's ability
// in 4 steps, lighting up the key being pressed, then loops.

import { useEffect, useState } from 'react';
import type { ClassId } from '../../../server/events';
import { KeyCap, PixelSprite } from './Menus';
import type { SpriteName } from './pixelSprites';

// Board rows: . floor  # rock  T tunnel  x broken rock; letters are characters (see sp)
// Overlay rows: r reach  s selected  h / v punch line  c crack  f finger  g Gojo's range
//               M red domain  k line of sight  d darkness
interface Frame {
  title: string;
  step: number; // which step of the class card this frame shows
  keys: string[];
  text: string;
  grid: string[];
  ov?: string[];
  sp: Record<string, SpriteName | `${SpriteName}:ghost`>;
  badges?: Record<string, string>; // "x,y" -> label
  arrows?: Record<string, string>;
  fx?: Record<string, 'boom' | 'poof' | 'wind'>;
  banner?: string; // drawn over the board (Gojo's Void)
}

const DEMOS: Partial<Record<ClassId, Frame[]>> = {
  allmight: [
    { title: 'Charge up', step: 0, keys: [], text: 'The bar fills 1 per turn. Full after 2 turns.',
      grid: ['..#..', '.....', 'A..S.', '#....', '...T.'], sp: { A: 'allmight', S: 'sasuke' }, badges: { '0,2': 'BAR 2/2' } },
    { title: 'Transform', step: 1, keys: ['Q'], text: 'He turns buff, ready to punch.',
      grid: ['..#..', '.....', 'A..S.', '#....', '...T.'], sp: { A: 'allmightbuff', S: 'sasuke' } },
    { title: 'Punch', step: 2, keys: ['D'], text: 'The punch flies that way. The warden is stunned for 2 turns.',
      grid: ['..#..', '.....', 'A..S.', '#....', '...T.'], ov: ['.....', '.....', '.hhhh', '.....', '.....'],
      sp: { A: 'allmightpunch', S: 'sasuke' }, badges: { '3,2': 'STUN 2' }, fx: { '3,2': 'boom' } },
    { title: 'Ground cracked', step: 3, keys: [], text: 'The line stays cracked. He drops back to weak form.',
      grid: ['..#..', '.....', 'A..S.', '#....', '...T.'], ov: ['.....', '.....', '.cccc', '.....', '.....'],
      sp: { A: 'allmight', S: 'sasuke' }, badges: { '3,2': 'STUNNED' } },
  ],
  naruto: [
    { title: 'Open the jutsu', step: 0, keys: ['Q'], text: 'Tiles within 2 light up.',
      grid: ['.#...', '..N..', '...#.', '#....', '...T.'], ov: ['..r..', '.r.r.', 'r.r..', '..r..', '.....'], sp: { N: 'naruto' } },
    { title: 'Place and point', step: 1, keys: ['Click', '↓'], text: 'Click a tile, then an arrow for its path.',
      grid: ['.#...', '..N..', '..C#.', '#....', '...T.'], sp: { N: 'naruto', C: 'naruto:ghost' }, arrows: { '2,2': '↓' }, fx: { '2,2': 'poof' } },
    { title: 'Finish', step: 2, keys: ['Enter'], text: 'Clones walk 1 tile each turn.',
      grid: ['.#...', '..N..', '...#.', '#.C..', '...T.'], sp: { N: 'naruto', C: 'naruto:ghost' }, arrows: { '2,3': '↓' } },
    { title: 'Secret swap', step: 3, keys: ['E', 'Click'], text: 'Trade places with a clone. The warden sees nothing.',
      grid: ['.#...', '..C..', '...#.', '#.N..', '...T.'], sp: { N: 'naruto', C: 'naruto:ghost' }, badges: { '2,3': 'SWAPPED' } },
  ],
  sukuna: [
    { title: 'Dismantle', step: 0, keys: ['Q'], text: 'Rocks next to him light up.',
      grid: ['.....', '..#..', '.K#..', '.....', '...T.'], ov: ['f....', '.....', '..s..', '....f', '.....'], sp: { K: 'sukuna' } },
    { title: 'Break and step', step: 0, keys: ['Click'], text: 'The rock breaks and he moves onto it. Cooldown 1.',
      grid: ['.....', '..#..', '..K..', '.....', '...T.'], ov: ['f....', '.....', '.....', '....f', '.....'], sp: { K: 'sukuna' },
      badges: { '2,2': 'CD 1' }, fx: { '2,2': 'boom' } },
    { title: 'Collect fingers', step: 1, keys: ['D'], text: 'Walk onto a finger to pick it up. 3 needed.',
      grid: ['.....', '..#..', '..x..', '....K', '...T.'], sp: { K: 'sukuna' }, badges: { '4,3': '3/3' } },
    { title: 'Malevolent Shrine', step: 2, keys: ['E'], text: 'The warden is pushed 3 tiles away.',
      grid: ['.....', 'W.#..', '..x..', '....K', '...T.'], ov: ['MMMMM', 'MMMMM', 'MMMMM', 'MMMMM', 'MMMMM'],
      sp: { K: 'sukuna', W: 'gojo' }, fx: { '0,1': 'wind' } },
  ],
  afo: [
    { title: 'Steal', step: 0, keys: ['Q'], text: 'Takes the prisoner\'s ability. Cooldown 2.',
      grid: ['.A...', '.....', '#.#..', '.O...', '...T.'], ov: ['.....', '.M...', '.M...', '.....', '.....'],
      sp: { A: 'allmight', O: 'afo' }, badges: { '1,0': 'STOLEN' } },
    { title: 'Prisoner locked', step: 0, keys: [], text: 'They can\'t use it for 1 turn.',
      grid: ['.A...', '.....', '#.#..', '.O...', '...T.'], sp: { A: 'allmight', O: 'afo' }, badges: { '1,0': 'LOCKED 1' } },
    { title: 'Use it', step: 1, keys: ['E', 'W'], text: 'Fires it once, no charge-up. Here, the punch.',
      grid: ['.A...', '.....', '#.#..', '.O...', '...T.'], ov: ['.v...', '.v...', '.v...', '.....', '.....'],
      sp: { A: 'allmight', O: 'afo' }, badges: { '1,0': 'STUN 2' }, fx: { '1,0': 'boom' } },
    { title: 'Second move', step: 2, keys: ['R'], text: 'From Sukuna he also gets the Shrine on R.',
      grid: ['.....', '.K#..', '..x..', '....O', '...T.'], ov: ['MMMMM', 'MMMMM', 'MMMMM', 'MMMMM', 'MMMMM'],
      sp: { K: 'sukuna', O: 'afo' }, fx: { '1,1': 'wind' } },
  ],
  sasuke: [
    { title: 'Line of sight', step: 0, keys: [], text: 'The prisoner is in his row, with nothing in between.',
      grid: ['.....', 'S...N', '..#..', '#....', '...T.'], ov: ['.....', '.kkk.', '.....', '.....', '.....'], sp: { S: 'sasuke', N: 'naruto' } },
    { title: 'Sharingan', step: 1, keys: ['Q'], text: 'The illusion lasts 2 turns.',
      grid: ['.....', 'S...N', '..#..', '#....', '...T.'], ov: ['.....', '.MMM.', '.....', '.....', '.....'],
      sp: { S: 'sasuke', N: 'naruto' }, badges: { '4,1': 'TRAPPED 2' } },
    { title: 'Prisoner\'s view', step: 1, keys: ['?', '?', '?', '?'], text: 'They see nothing, and their keys are secretly shuffled.',
      grid: ['.....', '.....', '..#..', '#....', '...T.'], ov: ['ddddd', 'ddddd', 'ddddd', 'ddddd', 'ddddd'], sp: {} },
    { title: 'Cooldown', step: 2, keys: [], text: 'Ready again 4 turns after the illusion ends.',
      grid: ['.....', 'S....', '..#N.', '#....', '...T.'], sp: { S: 'sasuke', N: 'naruto' }, badges: { '0,1': 'CD 4' } },
  ],
  gojo: [
    { title: 'In range', step: 0, keys: [], text: 'The prisoner is within 2 tiles.',
      grid: ['.....', '.....', '..G.N', '#....', '...T.'], ov: ['..g..', '.ggg.', 'gg.gg', '.ggg.', '..g..'], sp: { G: 'gojo', N: 'naruto' } },
    { title: 'Infinite Void', step: 1, keys: ['Q'], text: 'Pulls the prisoner into the Void. Cooldown 3.',
      grid: ['.....', '.....', '..G.N', '#....', '...T.'], ov: ['ggggg', 'ggggg', 'ggggg', 'ggggg', 'ggggg'],
      sp: { G: 'gojo', N: 'naruto' }, badges: { '4,2': 'VOID' } },
    { title: 'Prisoner\'s challenge', step: 1, keys: ['SPACE'], text: 'Stop the line in the zone, 3 rounds.',
      grid: ['.....', '.....', '.....', '.....', '.....'], ov: ['ggggg', 'ggggg', 'ggggg', 'ggggg', 'ggggg'], sp: {},
      banner: 'SPACE when the line hits the light' },
    { title: 'Result', step: 2, keys: [], text: 'Hit all 3 and they\'re back on the board. Miss once and they\'re caught.',
      grid: ['.....', '.....', '..G.N', '#....', '...T.'], sp: { G: 'gojo', N: 'naruto' }, badges: { '4,2': 'ESCAPED 3/3' } },
  ],
};
const FRAME_MS = 2200;

// Which step of the class card is playing, for highlighting it next to the demo
export function useDemoFrame(cls: ClassId): { frame: Frame | null; index: number } {
  const frames = DEMOS[cls] ?? [];
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
    if (!frames.length) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % frames.length), FRAME_MS);
    return () => window.clearInterval(id);
  }, [cls, frames.length]);
  return { frame: frames[index] ?? null, index };
}

export function ClassDemo({ cls, frame, index }: { cls: ClassId; frame: Frame; index: number }) {
  const total = DEMOS[cls]?.length ?? 0;
  return <div className="class-demo">
    <span className="demo-tag">● DEMO</span>
    <div className="demo-board" style={{ gridTemplateColumns: `repeat(${frame.grid[0]!.length}, 1fr)` }}>
      {frame.grid.flatMap((row, y) => [...row].map((ch, x) => {
        const id = `${x},${y}`;
        const tile = ch === '#' ? 'obstacle' : ch === 'T' ? 'tunnel' : 'free';
        const ov = frame.ov?.[y]?.[x] ?? '.';
        const sprite = frame.sp[ch];
        const [name, ghost] = sprite ? sprite.split(':') as [SpriteName, string?] : [null];
        return <div key={id} className={`demo-tile${ch === 'x' ? ' rubble' : ''}${ov !== '.' ? ` ov-${ov === 'M' ? 'red' : ov}` : ''}`}>
          <img className="terrain" src={`/assets/${tile}-chaos.svg`} alt="" />
          {ov === 'f' && <span className="finger" />}
          {name && <PixelSprite name={name} size={48} className={ghost ? 'ghost' : ''} />}
          {frame.arrows?.[id] && <span className="clone-arrow down">{frame.arrows[id]}</span>}
          {frame.fx?.[id] && <span key={`${index}`} className={`fx ${frame.fx[id]}`} />}
          {frame.badges?.[id] && <span className="stun-badge">{frame.badges[id]}</span>}
        </div>;
      }))}
      {frame.banner && <div className="demo-banner"><p>{frame.banner}</p><div className="demo-bar"><i /><b /></div></div>}
    </div>
    <div className="demo-press">
      <span className="demo-keys">{frame.keys.length ? frame.keys.map((k, i) => <KeyCap key={`${k}${i}`} k={k} pressed />) : <span className="keycap">…</span>}</span>
      <div><strong>{frame.keys.length ? `Pressing ${frame.keys.join(' + ')}` : frame.title}</strong><small>{frame.text}</small></div>
    </div>
    <div className="demo-progress">{Array.from({ length: total }, (_, i) => <s key={i} className={i <= index ? 'on' : ''} />)}</div>
  </div>;
}
