// Gojo's Domain Expansion: a title card everyone in the game sees for the
// first moments of the Void (the server adds this time to the turn), then the
// prisoner plays the challenge and everyone else sees the Void cover.

import { useEffect, useState } from 'react';
import type { GameState } from '../../../server/events';
import { playDomainLine } from '../social/sound';

export const VOID_INTRO_MS = 1_500; // same as the server's VOID_INTRO_MS
export const VOID_DURATION_MS = 10_000; // same as the server's VOID_DURATION_MS

// How much of the title card is still to play, from the turn's deadline
export function introLeft(state: GameState): number {
  if (state.turnDeadline == null) return 0;
  return Math.max(0, Math.min(VOID_INTRO_MS, state.turnDeadline - state.serverTime - VOID_DURATION_MS));
}

// True while the title card is showing; plays the voice line once when it starts
export function useDomainIntro(ms: number): boolean {
  const [showing, setShowing] = useState(ms > 0);
  useEffect(() => {
    if (ms <= 0) return;
    playDomainLine();
    const timer = setTimeout(() => setShowing(false), ms);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return showing;
}

export function DomainCard() {
  return <div className="dx-card" role="img" aria-label="Domain Expansion: Infinite Void">
    <img className="dx-bg" src="/assets/domain-bg.png" alt="" />
    <img className="dx-gojo" src="/assets/domain-gojo.png" alt="" />
    <div className="dx-text"><b>DOMAIN EXPANSION</b><span>INFINITE VOID · 無量空処</span></div>
  </div>;
}

// What the warden and spectators see: the title card, then the Void cover
export function VoidWatch({ ms, wardenClass }: { ms: number; wardenClass: string }) {
  const intro = useDomainIntro(ms);
  if (intro) return <div className="dx-wrap"><DomainCard /></div>;
  return <div className="board-veil void"><b>INFINITE VOID</b><p>{wardenClass} pulled the prisoner into the Void. One miss and they're caught.</p></div>;
}
