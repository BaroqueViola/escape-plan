// Gojo's Infinite Void, on the prisoner's screen: the Domain Expansion title
// card, then 3 rounds of stopping a moving line inside a glowing zone with SPACE
// (or a tap). The line gets faster each round. One miss, or running out of
// time, and they are caught. The result goes to the server as `hits`.

import { useEffect, useRef, useState } from 'react';
import { DomainCard, useDomainIntro } from './DomainExpansion';

// sweep: the line crosses the bar in this many ms, then comes back
const ROUNDS = [
  { zone: 12, motion: 'still', sweep: 1100 }, // a wide zone that stays put
  { zone: 7, motion: 'bounce', sweep: 950 }, // jumps somewhere new each time the line turns
  { zone: 3.5, motion: 'slide', sweep: 850 }, // a thin zone gliding back and forth
] as const;
const ROUND_MS = 3000; // time for each press
const SLIDE_MS = 2600;
const PAUSE_MS = 250; // shows the hit before the next round
const SAFETY_MS = 400; // the answer must reach the server before the turn ends

// 0 → 100 → 0, over `period` ms
const wave = (t: number, period: number) => {
  const p = (t / period) % 2;
  return (p < 1 ? p : 2 - p) * 100;
};
const randomSpot = () => 15 + Math.random() * 70;

const sweepOf = (index: number) => ROUNDS[Math.min(index, ROUNDS.length - 1)]!.sweep;

// msLeft: the whole turn, title card included; introMs: what is left of the title card
export function VoidChallenge({ msLeft, introMs, onDone }: { msLeft: number; introMs: number; onDone: (hits: boolean[]) => void }) {
  const intro = useDomainIntro(introMs);
  const [hits, setHits] = useState<boolean[]>([]);
  const [now, setNow] = useState(() => performance.now());
  const endsAt = useRef(performance.now() + msLeft - SAFETY_MS);
  const round = useRef({ index: 0, startedAt: performance.now() + introMs + PAUSE_MS, limit: ROUND_MS, zone: randomSpot(), sweeps: 0 });
  const sent = useRef(false);

  const finish = (all: boolean[]) => {
    if (sent.current) return;
    sent.current = true;
    onDone([...all, false, false, false].slice(0, ROUNDS.length));
  };
  // Where the line and the zone are right now
  const r = round.current;
  const t = Math.max(0, now - r.startedAt);
  const spec = ROUNDS[Math.min(r.index, ROUNDS.length - 1)]!;
  const line = wave(t, spec.sweep);
  const zone = spec.motion === 'slide' ? 10 + wave(t, SLIDE_MS) * 0.8 : r.zone;

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const time = performance.now();
      const cur = round.current;
      // The bouncing zone jumps whenever the line turns at an edge
      const sweeps = Math.floor(Math.max(0, time - cur.startedAt) / sweepOf(cur.index));
      if (ROUNDS[cur.index]?.motion === 'bounce' && sweeps !== cur.sweeps) { cur.sweeps = sweeps; cur.zone = randomSpot(); }
      if (!sent.current && time - cur.startedAt > cur.limit) {
        setHits((h) => { finish([...h, false]); return [...h, false]; }); // too slow
      }
      setNow(time);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function press() {
    const time = performance.now();
    const cur = round.current;
    if (sent.current || time < cur.startedAt) return;
    const at = wave(time - cur.startedAt, sweepOf(cur.index));
    const centre = ROUNDS[cur.index]?.motion === 'slide' ? 10 + wave(time - cur.startedAt, SLIDE_MS) * 0.8 : cur.zone;
    const hit = Math.abs(at - centre) <= (ROUNDS[cur.index]?.zone ?? 0) / 2;
    const next = [...hits, hit];
    setHits(next);
    if (!hit || next.length === ROUNDS.length) { finish(next); return; }
    // Share what time is left between the rounds still to play
    const left = ROUNDS.length - next.length;
    const start = time + PAUSE_MS;
    round.current = { index: next.length, startedAt: start, zone: randomSpot(), sweeps: 0,
      limit: Math.max(800, Math.min(ROUND_MS, (endsAt.current - start) / left)) };
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) press();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const done = sent.current;
  const caught = hits.includes(false);
  const timeLeft = Math.max(0, 1 - t / r.limit);
  if (intro) return <div className="void-overlay dx-wrap" role="dialog" aria-label="Domain Expansion"><DomainCard /></div>;
  return <div className="void-overlay" onPointerDown={(e) => { e.preventDefault(); press(); }} role="dialog" aria-label="Infinite Void challenge">
    <img className="dx-bg dim" src="/assets/domain-bg.png" alt="" />
    <div className="void-top">
      <div className="void-face"><img src="/assets/domain-gojo.png" alt="" /></div>
      <div><b>DOMAIN EXPANSION</b><small>INFINITE VOID</small></div>
    </div>
    <p className="void-round">{done ? (caught ? 'CAUGHT' : 'ESCAPED!') : `ROUND ${r.index + 1} / ${ROUNDS.length}`}</p>
    <div className="void-bar">
      <i className="void-zone" style={{ left: `${zone - spec.zone / 2}%`, width: `${spec.zone}%` }} />
      {!done && <b className="void-line" style={{ left: `${line}%` }} />}
    </div>
    <div className="void-timer"><span style={{ width: `${done ? 0 : timeLeft * 100}%` }} /></div>
    <div className="void-pips">{ROUNDS.map((_, i) => <s key={i} className={hits[i] === true ? 'hit' : hits[i] === false ? 'miss' : i === r.index ? 'now' : ''}>{hits[i] === true ? '✓' : hits[i] === false ? '✕' : i + 1}</s>)}</div>
    <p className="void-help">{done ? (caught ? 'Gojo got you.' : 'Back to the board. Your turn.') : <>Press <span className="keycap">SPACE</span> (or tap) when the line is in the light</>}</p>
  </div>;
}
