// Chaos abilities in the game: the Q / E keys, picking a target on the board,
// the ability buttons, and what the board draws for clones, fingers, cracks
// and stuns. The server checks everything again; this only helps aim.

import { useEffect, useState, type ReactNode } from 'react';
import type { ChaosEvent, ClassId, GameState, MatchInfo, Role } from '../../../server/events';
import { CLASS_INFO } from './classInfo';
import type { SpriteName } from './pixelSprites';
import { introLeft } from './DomainExpansion';
import { VoidChallenge } from './VoidChallenge';

export type Direction = 'up' | 'down' | 'left' | 'right';
interface Spot { x: number; y: number }
interface PendingClone extends Spot { direction: Direction | null }
// What the player is aiming at after pressing Q or E
type Targeting =
  | { kind: 'aim' } // All Might transformed (or All For One's stolen punch): a direction throws it
  | { kind: 'clones'; placed: PendingClone[] } // Naruto (or All For One's one stolen clone) placing clones
  | { kind: 'swap' } // Naruto picking a clone to swap with
  | { kind: 'dismantle' }; // Sukuna (or All For One) picking a rock
type StolenKind = 'smash' | 'clones' | 'dismantle' | 'shrine';

// Same numbers as the game core
export const SMASH_CHARGE = 2;
export const MAX_CLONES = 3;
export const CLONE_RANGE = 2;
export const FINGERS = 3;
export const VOID_RANGE = 2;

const STEP: Record<Direction, Spot> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const ARROW: Record<Direction, string> = { up: '↑', down: '↓', left: '←', right: '→' };
export const KEY_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'up', ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right', w: 'up', a: 'left', s: 'down', d: 'right',
};
const key = (p: Spot) => `${p.x},${p.y}`;
const same = (a: Spot, b: Spot) => a.x === b.x && a.y === b.y;
const tileOf = (state: GameState, p: Spot) =>
  p.x < 0 || p.y < 0 || p.x >= state.board.width || p.y >= state.board.height ? undefined : state.board.cells[p.y * state.board.width + p.x];
const add = (p: Spot, d: Direction): Spot => ({ x: p.x + STEP[d].x, y: p.y + STEP[d].y });
const distance = (a: Spot, b: Spot) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
// Same row or column with no rock in between (Sasuke)
function inSight(state: GameState, a: Spot, b: Spot): boolean {
  if ((a.x !== b.x && a.y !== b.y) || same(a, b)) return false;
  const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
  for (let p = { x: a.x + dx, y: a.y + dy }; !same(p, b); p = { x: p.x + dx, y: p.y + dy }) {
    if (tileOf(state, p) === 'obstacle') return false;
  }
  return true;
}
// All For One fires a stolen ability with E; the Shrine (from Sukuna) is on R
const stolenKey = (k: StolenKind): 'E' | 'R' => (k === 'shrine' ? 'R' : 'E');
const STOLEN_LABEL: Record<StolenKind, string> = { smash: 'SMASH', clones: 'CLONE', dismantle: 'DISMANTLE', shrine: 'SHRINE' };

export type AbilityRequest =
  | { kind: 'smash'; direction: Direction }
  | { kind: 'clones'; clones: { x: number; y: number; direction: Direction }[] }
  | { kind: 'swap'; x: number; y: number }
  | { kind: 'dismantle'; direction: Direction }
  | { kind: 'shrine' }
  | { kind: 'steal' }
  | { kind: 'sharingan' }
  | { kind: 'void' }
  | { kind: 'escape'; hits: boolean[] };

// What the board needs to draw the targeting
export interface BoardChaos {
  marks: Map<string, string>; // tile -> extra class (mark-aim, mark-reach, mark-sel)
  pending: PendingClone[]; // clones being placed, not sent yet
  onTile?: (x: number, y: number) => void;
  prisonerSprite?: SpriteName; // All Might's buff / punch forms
  overlay?: ReactNode; // drawn over the board (the Void challenge)
}

export function useChaosControls({ state, info, myTurn, send }: {
  state: GameState | null; info: MatchInfo | null; myTurn: boolean; send: (ability: AbilityRequest) => void;
}) {
  const [targeting, setTargeting] = useState<Targeting | null>(null);
  const turnKey = `${state?.turnNickname}-${state?.turnDeadline}`;
  useEffect(() => { setTargeting(null); }, [turnKey]); // a new turn clears any aiming

  const cls = info?.you.cls ?? null;
  const chaos = state?.chaos ?? null;
  const role = info?.you.role ?? null;
  const active = !!state && !!chaos && !!cls && !!role && myTurn;
  const me = state && role ? state.positions[role] : null;
  const warden = role === 'warden';
  const cooldown = chaos && role ? chaos.cooldown[role] : 0;
  // The prisoner has no powers while All For One holds theirs, in the illusion, or in the Void
  const powerless = !warden && !!chaos && (chaos.locked > 0 || chaos.illusion > 0 || chaos.inVoid);
  const stolen = warden && cls === 'afo' ? chaos?.stolen ?? null : null;
  const holds = (k: StolenKind) => !!stolen?.uses.includes(k);
  const maxClones = warden ? 1 : chaos?.charges ?? 0;
  // Where the prisoner might be: with Naruto's clones hidden, any figure could be him
  const figures: Spot[] = state && chaos ? [state.positions.prisoner, ...(chaos.hidden ? chaos.clones : [])] : [];

  // What each ability can target right now
  const cloneSpots: Spot[] = [];
  const rocks: Direction[] = [];
  if (state && chaos && me) {
    for (let y = me.y - CLONE_RANGE; y <= me.y + CLONE_RANGE; y++) for (let x = me.x - CLONE_RANGE; x <= me.x + CLONE_RANGE; x++) {
      const p = { x, y };
      if (distance(p, me) > CLONE_RANGE || same(p, me) || tileOf(state, p) !== 'free') continue;
      const taken = [state.positions.warden, state.positions.prisoner, ...chaos.clones, ...chaos.wardenClones];
      if (taken.some((c) => same(c, p))) continue;
      cloneSpots.push(p);
    }
    (Object.keys(STEP) as Direction[]).forEach((d) => { if (tileOf(state, add(me, d)) === 'obstacle') rocks.push(d); });
  }
  const ready = {
    smash: warden ? holds('smash') : !powerless && (chaos?.bar ?? 0) >= SMASH_CHARGE,
    clones: (warden ? holds('clones') : !powerless && (chaos?.charges ?? 0) > 0) && cloneSpots.length > 0,
    swap: !powerless && (chaos?.clones.length ?? 0) > 0,
    dismantle: (warden ? holds('dismantle') : !powerless && cooldown === 0) && rocks.length > 0,
    shrine: warden ? holds('shrine') : !powerless && (chaos?.collected ?? 0) >= FINGERS,
    steal: cls === 'afo' && cooldown === 0 && !stolen,
    sharingan: cls === 'sasuke' && cooldown === 0 && !!me && figures.some((f) => state && inSight(state, me, f)),
    void: cls === 'gojo' && cooldown === 0 && !!me && figures.some((f) => distance(me, f) <= VOID_RANGE),
  };

  // E or R for All For One: fire what he stole, with that class's aiming
  function fireStolen(k: StolenKind) {
    if (!ready[k]) return;
    if (k === 'smash') setTargeting(targeting?.kind === 'aim' ? null : { kind: 'aim' });
    if (k === 'clones') setTargeting(targeting?.kind === 'clones' ? null : { kind: 'clones', placed: [] });
    if (k === 'dismantle') setTargeting(targeting?.kind === 'dismantle' ? null : { kind: 'dismantle' });
    if (k === 'shrine') send({ kind: 'shrine' });
  }
  function primary() { // Q
    if (!active) return;
    if (targeting) { setTargeting(null); return; }
    if (cls === 'allmight' && ready.smash) setTargeting({ kind: 'aim' });
    if (cls === 'naruto' && ready.clones) setTargeting({ kind: 'clones', placed: [] });
    if (cls === 'sukuna' && ready.dismantle) setTargeting({ kind: 'dismantle' });
    if (cls === 'afo' && ready.steal) send({ kind: 'steal' });
    if (cls === 'sasuke' && ready.sharingan) send({ kind: 'sharingan' });
    if (cls === 'gojo' && ready.void) send({ kind: 'void' });
  }
  function secondary() { // E
    if (!active) return;
    if (cls === 'naruto' && ready.swap) setTargeting(targeting?.kind === 'swap' ? null : { kind: 'swap' });
    if (cls === 'sukuna' && ready.shrine) send({ kind: 'shrine' });
    const k = stolen?.uses.find((u) => stolenKey(u) === 'E');
    if (k) fireStolen(k);
  }
  function third() { // R: All For One's second stolen move (the Shrine)
    if (!active) return;
    const k = stolen?.uses.find((u) => stolenKey(u) === 'R');
    if (k) fireStolen(k);
  }
  function finishClones() {
    if (targeting?.kind !== 'clones') return;
    const done = targeting.placed.filter((c): c is PendingClone & { direction: Direction } => c.direction !== null);
    if (done.length) send({ kind: 'clones', clones: done });
    setTargeting(null);
  }
  function direction(d: Direction): boolean {
    if (!targeting) return false;
    if (targeting.kind === 'aim') send({ kind: 'smash', direction: d });
    if (targeting.kind === 'dismantle' && rocks.includes(d)) send({ kind: 'dismantle', direction: d });
    if (targeting.kind === 'clones') {
      const last = targeting.placed[targeting.placed.length - 1];
      if (last && last.direction === null) {
        setTargeting({ kind: 'clones', placed: [...targeting.placed.slice(0, -1), { ...last, direction: d }] });
      }
    }
    return true; // while aiming, direction keys never move you
  }
  function onTile(x: number, y: number) {
    if (!active || !targeting || !me) return;
    const p = { x, y };
    if (targeting.kind === 'clones') {
      const placed = targeting.placed;
      if (placed.some((c) => same(c, p))) { setTargeting({ kind: 'clones', placed: placed.filter((c) => !same(c, p)) }); return; }
      const waiting = placed.some((c) => c.direction === null);
      if (!waiting && placed.length < maxClones && cloneSpots.some((s) => same(s, p))) {
        setTargeting({ kind: 'clones', placed: [...placed, { x, y, direction: null }] });
      }
    }
    if (targeting.kind === 'swap' && chaos?.clones.some((c) => same(c, p))) send({ kind: 'swap', x, y });
    if (targeting.kind === 'dismantle') {
      const d = rocks.find((r) => same(add(me, r), p));
      if (d) send({ kind: 'dismantle', direction: d });
    }
  }
  // Keyboard: returns true when the key was used here
  function onKey(event: KeyboardEvent): boolean {
    if (!active) return false;
    const k = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (k === 'q') { primary(); return true; }
    if (k === 'e') { secondary(); return true; }
    if (k === 'r' && cls === 'afo') { third(); return true; }
    if (k === 'Escape' && targeting) { setTargeting(null); return true; }
    if (k === 'Enter' && targeting?.kind === 'clones') { finishClones(); return true; }
    const d = KEY_DIRECTION[k];
    return d ? direction(d) : false;
  }

  // Board marks
  const marks = new Map<string, string>();
  if (active && me && state && targeting) {
    if (targeting.kind === 'aim') {
      (Object.keys(STEP) as Direction[]).forEach((d) => {
        for (let p = add(me, d); tileOf(state, p) !== undefined; p = add(p, d)) marks.set(key(p), 'mark-aim');
      });
    }
    if (targeting.kind === 'clones') cloneSpots.forEach((p) => marks.set(key(p), 'mark-reach'));
    if (targeting.kind === 'swap') chaos?.clones.forEach((c) => marks.set(key(c), 'mark-sel'));
    if (targeting.kind === 'dismantle') rocks.forEach((d) => marks.set(key(add(me, d)), 'mark-sel'));
  }
  const lastSmash = chaos?.events.find((e): e is Extract<ChaosEvent, { kind: 'smash' }> => e.kind === 'smash' && e.by === 'prisoner');
  const prisonerSprite: SpriteName | undefined = state?.classes?.prisoner !== 'allmight' ? undefined
    : targeting?.kind === 'aim' && !warden ? 'allmightbuff' : lastSmash ? 'allmightpunch' : undefined;
  // The prisoner in the Void plays the timing challenge over the board
  const turnMs = state?.turnDeadline != null ? state.turnDeadline - state.serverTime : 0;
  const overlay = active && !warden && chaos?.inVoid && state?.status === 'active'
    ? <VoidChallenge key={turnKey} msLeft={turnMs} introMs={state ? introLeft(state) : 0} onDone={(hits) => send({ kind: 'escape', hits })} /> : undefined;
  const board: BoardChaos = {
    marks, onTile, prisonerSprite, overlay,
    pending: targeting?.kind === 'clones' ? targeting.placed : [],
  };

  // Ability buttons and the hint line under them
  let panel: ReactNode = null;
  if (cls && chaos && role) {
    const button = (k: 'Q' | 'E' | 'R', label: string, isReady: boolean, onClick: () => void, extra?: ReactNode, on = false) =>
      <button key={k} className={`ab-btn${isReady && myTurn ? ' ready' : ''}${on ? ' on' : ''}`} disabled={!isReady || !myTurn} onClick={onClick}>
        <span className={`keycap ${k.toLowerCase()}`}>{k}</span>{label}{extra}</button>;
    const pips = (n: number, on: number) => <span className="pips">{Array.from({ length: n }, (_, i) => <s key={i} className={i < on ? 'on' : ''} />)}</span>;
    const wait = (label: string, why: string | null) => cooldown > 0 ? `${label} · WAIT ${cooldown}` : why ? `${label} · ${why}` : label;
    const buttons = cls === 'allmight' ? button('Q', 'SMASH', ready.smash, primary, pips(SMASH_CHARGE, chaos.bar), targeting?.kind === 'aim')
      : cls === 'naruto' ? <>{button('Q', `CLONE ×${chaos.charges}`, ready.clones, primary, null, targeting?.kind === 'clones')}{button('E', 'SWAP', ready.swap, secondary, null, targeting?.kind === 'swap')}</>
      : cls === 'sukuna' ? <>{button('Q', wait('DISMANTLE', null), ready.dismantle, primary, null, targeting?.kind === 'dismantle')}{button('E', 'SHRINE', ready.shrine, secondary, pips(FINGERS, chaos.collected))}</>
      : cls === 'afo' ? <>{button('Q', stolen ? 'STEAL · HOLDING' : wait('STEAL', null), ready.steal, primary)}
        {stolen ? stolen.uses.map((u) => button(stolenKey(u), STOLEN_LABEL[u], ready[u], () => fireStolen(u), null,
          (u === 'smash' && targeting?.kind === 'aim') || (u === 'clones' && targeting?.kind === 'clones') || (u === 'dismantle' && targeting?.kind === 'dismantle')))
          : button('E', 'NOTHING STOLEN', false, secondary)}</>
      : cls === 'sasuke' ? button('Q', wait('SHARINGAN', ready.sharingan ? null : 'NOT IN SIGHT'), ready.sharingan, primary)
      : button('Q', wait('INFINITE VOID', ready.void ? null : 'TOO FAR'), ready.void, primary);
    const placed = targeting?.kind === 'clones' ? targeting.placed : [];
    const rival = state?.classes ? CLASS_INFO[state.classes[warden ? 'prisoner' : 'warden']].name : 'The warden';
    const hint = !targeting ? (
      warden ? null
      : chaos.inVoid ? 'You are in the Infinite Void. Win the challenge to get out.'
      : chaos.illusion > 0 ? `You are in ${rival}'s illusion. No powers, and your keys are shuffled.`
      : chaos.locked > 0 ? `${rival} stole your power. You get it back next turn.` : null)
      : targeting.kind === 'aim' ? (warden ? 'Press a direction to throw the stolen punch. Esc to cancel.' : 'Press a direction to throw the punch. Esc backs out and keeps the charge.')
      : targeting.kind === 'clones' ? (placed.some((c) => c.direction === null) ? 'Press an arrow for the way this clone walks.'
        : `Click a lit tile to drop a clone (${placed.length}/${maxClones}). Enter to finish, Esc to cancel.`)
      : targeting.kind === 'swap' ? 'Click one of your clones to swap places with it. Esc to cancel.'
      : 'Click a lit rock (or press its direction) to break it. Esc to cancel.';
    panel = <div className="ability-row">
      <div className="ability-buttons">{buttons}</div>
      {hint && <p className="ability-hint">{hint}</p>}
      {targeting?.kind === 'clones' && placed.length > 0 && !placed.some((c) => c.direction === null) &&
        <button className="small-button" onClick={finishClones}>ENTER · PLACE {placed.length}</button>}
    </div>;
  }
  return { targeting, onKey, board, panel };
}

// One line about the last turn, from the viewer's side
export function describeEvents(state: GameState, you: Role | null): string | null {
  const c = state.chaos;
  if (!c || !c.events.length) return null;
  const who = (role: Role) => role === you ? 'You' : state.classes ? CLASS_INFO[state.classes[role]].name : role;
  const lines = c.events.map((e) => {
    switch (e.kind) {
      case 'smash': return e.hit ? `${who(e.by)} smashed and stunned the ${e.by === 'prisoner' ? 'warden' : 'prisoner'} for 2 turns!` : `${who(e.by)} smashed and missed.`;
      case 'clones': return e.by === 'warden' ? `${who('warden')} made a clone. It walks for 3 turns and catches on contact.`
        : `${you === 'prisoner' ? 'You' : 'Naruto'} made ${e.count} shadow clone${e.count > 1 ? 's' : ''}.`;
      case 'swap': return 'You swapped places with a clone. The warden saw nothing.';
      case 'dismantle': return `${who(e.by)} broke a rock.`;
      case 'shrine': return `Malevolent Shrine! ${e.by === 'warden' ? (you === 'prisoner' ? 'You were' : 'The prisoner was') : (you === 'warden' ? 'You were' : 'The warden was')} pushed away.`;
      case 'collect': return `${you === 'prisoner' ? 'You' : 'Sukuna'} picked up a finger.`;
      case 'crush': return 'The warden crushed a finger. It came back somewhere else.';
      case 'poof': return 'A clone went up in smoke.';
      case 'skip': return e.role === you ? 'You are stunned and lost your turn.' : `${who(e.role)} is stunned and lost a turn.`;
      case 'steal': return `${who('warden')} stole ${you === 'prisoner' ? 'your' : `${CLASS_INFO[e.from].name}'s`} power! ${you === 'prisoner' ? 'You' : 'They'} can't use it next turn.`;
      case 'sharingan': return `Sharingan! ${you === 'prisoner' ? 'You are' : 'The prisoner is'} trapped in an illusion for 2 turns.`;
      case 'bump': return you === 'prisoner' ? 'You walked into something.' : 'The prisoner stumbled into a wall.';
      case 'void': return `Infinite Void! ${you === 'prisoner' ? 'You were' : 'The prisoner was'} pulled in.`;
      case 'escape': return e.escaped ? `${you === 'prisoner' ? 'You' : 'The prisoner'} broke out of the Void!` : 'Lost in the Void.';
      case 'clonecatch': return `${who('warden')}'s clone caught the prisoner!`;
    }
  });
  return lines.join(' ');
}

// Small line about the rival's power, so the other side knows what is coming
export function rivalStatus(state: GameState, rival: ClassId | null): string | null {
  const c = state.chaos;
  if (!c || !rival) return null;
  if (rival === 'allmight') return c.bar >= SMASH_CHARGE ? 'All Might is charged and can smash!' : `All Might charging ${c.bar}/${SMASH_CHARGE}`;
  if (rival === 'naruto') return `Naruto has ${c.charges} clone${c.charges === 1 ? '' : 's'} banked`;
  if (rival === 'sukuna') return `Sukuna holds ${c.collected}/${FINGERS} fingers`;
  const wait = c.cooldown.warden;
  if (rival === 'afo') return c.stolen ? `All For One holds your ${c.stolen.uses.map((u) => STOLEN_LABEL[u]).join(' and ')}`
    : wait > 0 ? `All For One can steal again in ${wait} turn${wait === 1 ? '' : 's'}` : 'All For One can steal your power';
  if (rival === 'sasuke') return wait > 0 ? `Sharingan ready in ${wait} turn${wait === 1 ? '' : 's'}` : 'Sharingan ready. Stay out of his row and column';
  if (rival === 'gojo') return wait > 0 ? `Infinite Void ready in ${wait} turn${wait === 1 ? '' : 's'}` : 'Infinite Void ready. Stay more than 2 tiles away';
  return null;
}

export { ARROW };
