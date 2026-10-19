// Chaos mode abilities: the rules for each class's power and what happens
// at the end of a turn (charge bars, clones walking, fingers, stuns, the illusion).
// Pure functions like the rest of the core; engine.ts calls them.
import type { ClassId } from './classes.js';
import { legalMoves, randomIndex, sameCell, tileAt } from './map.js';
import { failure, success, type Ability, type Board, type ChaosEvent, type ChaosState,
  type Clone, type Coordinate, type Direction, type Random, type Result, type Role, type StolenKind,
  type WardenClone } from './types.js';

export const SMASH_CHARGE = 2; // All Might: own turns to fill the bar
export const STUN_TURNS = 2; // turns a smashed player loses
export const MAX_CLONES = 3; // Naruto: banked clones at most
export const CLONE_RANGE = 2; // Naruto: clones land this many steps away at most
export const FINGERS = 3; // Sukuna: fingers on the map, and needed for the Shrine
export const SHRINE_PUSH = 3; // Sukuna: tiles the Shrine pushes the warden
export const DISMANTLE_COOLDOWN = 1; // Sukuna: own turns to wait after Dismantle
export const STEAL_COOLDOWN = 2; // All For One: own turns to wait after a steal
export const LOCK_TURNS = 1; // prisoner turns without their ability after a steal
export const WARDEN_CLONE_LIFE = 3; // warden turns All For One's clone lasts
export const ILLUSION_TURNS = 2; // Sasuke: prisoner turns in the dark
export const SHARINGAN_COOLDOWN = 4; // Sasuke: own turns to wait after the illusion ends
export const VOID_RANGE = 2; // Gojo: the prisoner must be this close
export const VOID_COOLDOWN = 3; // Gojo: own turns to wait after the Void
export const VOID_ROUNDS = 3; // rounds of the Void challenge; miss one and you are caught
// What All For One gets from each prisoner class: E uses the first, R the second
export const STOLEN: Readonly<Partial<Record<ClassId, readonly StolenKind[]>>> = {
  allmight: ['smash'], naruto: ['clones'], sukuna: ['dismantle', 'shrine'],
};

export const STEPS: Readonly<Record<Direction, Coordinate>> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};
const add = (p: Coordinate, d: Direction, n = 1): Coordinate => ({ x: p.x + STEPS[d].x * n, y: p.y + STEPS[d].y * n });
const at = (p: Coordinate): Coordinate => ({ x: p.x, y: p.y });
const distance = (a: Coordinate, b: Coordinate): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const other = (role: Role): Role => role === 'warden' ? 'prisoner' : 'warden';
type Positions = Readonly<Record<Role, Coordinate>>;

// A random free tile nobody stands on (for fingers). null when the board is full.
function freeSpot(board: Board, taken: readonly Coordinate[], rng: Random): Result<Coordinate | null> {
  const spots: Coordinate[] = [];
  board.cells.forEach((tile, i) => {
    const p = { x: i % board.width, y: Math.floor(i / board.width) };
    if (tile === 'free' && !taken.some(t => sameCell(t, p))) spots.push(p);
  });
  if (!spots.length) return success(null);
  const draw = randomIndex(rng, spots.length);
  return draw.ok ? success(spots[draw.value]!) : draw;
}
function spawnFingers(board: Board, taken: readonly Coordinate[], count: number, rng: Random): Result<Coordinate[]> {
  const fingers: Coordinate[] = [];
  for (let i = 0; i < count; i++) {
    const spot = freeSpot(board, [...taken, ...fingers], rng);
    if (!spot.ok) return spot;
    if (spot.value) fingers.push(spot.value);
  }
  return success(fingers);
}

export function newChaos(classes: Readonly<Record<Role, ClassId>>, board: Board,
  starts: Positions, rng: Random): Result<ChaosState> {
  const fingers = classes.prisoner === 'sukuna'
    ? spawnFingers(board, [starts.warden, starts.prisoner], FINGERS, rng) : success([]);
  if (!fingers.ok) return fingers;
  return success({ classes: { ...classes }, stunned: { warden: 0, prisoner: 0 }, cooldown: { warden: 0, prisoner: 0 },
    cracks: [], bar: 0, charges: 0, clones: [], fingers: fingers.value, collected: 0,
    stolen: null, locked: 0, wardenClones: [], illusion: 0, scramble: null, inVoid: false, events: [] });
}

// Legal moves with clones in the way: the prisoner can't step onto any clone
export function chaosMoves(board: Board, positions: Positions, role: Role, chaos: ChaosState | undefined) {
  const moves = legalMoves(board, positions[role], role);
  return role === 'prisoner' && chaos
    ? moves.filter(m => ![...chaos.clones, ...chaos.wardenClones].some(c => sameCell(c, m.target))) : moves;
}

// Sasuke's row or column check: same line, no rock in between
export function inSight(board: Board, a: Coordinate, b: Coordinate): boolean {
  if (a.x !== b.x && a.y !== b.y) return false;
  const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
  for (let p = { x: a.x + dx, y: a.y + dy }; !sameCell(p, b); p = { x: p.x + dx, y: p.y + dy }) {
    if (tileAt(board, p) === 'obstacle') return false;
  }
  return !sameCell(a, b);
}

// A shuffle of the four directions where no key keeps its own direction
function derangement(rng: Random): Result<Record<Direction, Direction>> {
  const keys: Direction[] = ['up', 'down', 'left', 'right'];
  for (let tries = 0; tries < 100; tries++) {
    const values = [...keys];
    for (let i = values.length - 1; i > 0; i--) {
      const draw = randomIndex(rng, i + 1);
      if (!draw.ok) return draw;
      [values[i], values[draw.value]] = [values[draw.value]!, values[i]!];
    }
    if (values.every((v, i) => v !== keys[i])) {
      return success({ up: values[0]!, down: values[1]!, left: values[2]!, right: values[3]! });
    }
  }
  return success({ up: 'down', down: 'up', left: 'right', right: 'left' });
}

// The new board, positions and state after an ability, before the end of the turn
export interface AbilityResult { board: Board; positions: Positions; chaos: ChaosState }

export function applyAbility(board: Board, positions: Positions, chaos: ChaosState, role: Role,
  ability: Ability, rng: Random): Result<AbilityResult> {
  const cls = chaos.classes[role];
  const me = positions[role];
  const target = other(role);
  const done = (next: Partial<ChaosState>, event: ChaosEvent, nextPositions = positions, nextBoard = board) =>
    success({ board: nextBoard, positions: nextPositions, chaos: { ...chaos, ...next, events: [event] } });
  // All For One may use a stolen ability once; the prisoner uses their own
  const stolen = role === 'warden' && cls === 'afo' && chaos.stolen?.uses.includes(ability.kind as StolenKind);
  const spend = (): Partial<ChaosState> => {
    if (!stolen || !chaos.stolen) return {};
    const uses = chaos.stolen.uses.filter(u => u !== ability.kind);
    return { stolen: uses.length ? { ...chaos.stolen, uses } : null };
  };
  if (role === 'prisoner' && ability.kind !== 'escape') {
    if (chaos.locked > 0 || chaos.illusion > 0) return failure('ABILITY_NOT_READY'); // stolen, or in the dark
  }
  switch (ability.kind) {
    case 'smash': {
      if (!stolen && cls !== 'allmight') return failure('NO_ABILITY');
      if (!stolen && chaos.bar < SMASH_CHARGE) return failure('ABILITY_NOT_READY');
      // The punch flies to the map edge, through rocks, cracking the ground on the way
      const line: Coordinate[] = [];
      for (let p = add(me, ability.direction); tileAt(board, p) !== undefined; p = add(p, ability.direction)) line.push(p);
      if (!line.length) return failure('ILLEGAL_TARGET');
      const hit = line.some(p => sameCell(p, positions[target]));
      const cracks = [...chaos.cracks, ...line.filter(p => tileAt(board, p) !== 'tunnel'
        && !chaos.cracks.some(c => sameCell(c, p)))];
      return done({ ...spend(), ...(stolen ? {} : { bar: 0 }), cracks,
        stunned: hit ? { ...chaos.stunned, [target]: STUN_TURNS } : chaos.stunned },
        { kind: 'smash', by: role, from: at(me), direction: ability.direction, hit });
    }
    case 'clones': {
      if (!stolen && cls !== 'naruto') return failure('NO_ABILITY');
      const wanted = ability.clones;
      const most = stolen ? 1 : chaos.charges;
      if (most < 1) return failure('ABILITY_NOT_READY');
      if (wanted.length < 1 || wanted.length > most) return failure('ILLEGAL_TARGET');
      const placed: Clone[] = [];
      for (const c of wanted) {
        const p = { x: c.x, y: c.y };
        const blocked = [positions.warden, positions.prisoner, ...chaos.clones, ...chaos.wardenClones, ...placed].some(o => sameCell(o, p));
        if (tileAt(board, p) !== 'free' || blocked || distance(p, me) > CLONE_RANGE || !(c.direction in STEPS)) {
          return failure('ILLEGAL_TARGET');
        }
        placed.push({ ...p, direction: c.direction, fresh: true });
      }
      if (stolen) {
        return done({ ...spend(), wardenClones: [...chaos.wardenClones, ...placed.map(c => ({ ...c, life: WARDEN_CLONE_LIFE }))] },
          { kind: 'clones', by: role, count: placed.length });
      }
      return done({ charges: chaos.charges - placed.length, clones: [...chaos.clones, ...placed] },
        { kind: 'clones', by: role, count: placed.length });
    }
    case 'swap': {
      if (cls !== 'naruto') return failure('NO_ABILITY');
      const index = chaos.clones.findIndex(c => c.x === ability.x && c.y === ability.y);
      if (index < 0) return failure('ILLEGAL_TARGET');
      const clone = chaos.clones[index]!;
      const clones = chaos.clones.map((c, i) => i === index ? { ...c, x: me.x, y: me.y } : c);
      return done({ clones }, { kind: 'swap' }, { ...positions, [role]: at(clone) });
    }
    case 'dismantle': {
      if (!stolen && cls !== 'sukuna') return failure('NO_ABILITY');
      if (!stolen && chaos.cooldown[role] > 0) return failure('ABILITY_NOT_READY');
      const rock = add(me, ability.direction);
      if (tileAt(board, rock) !== 'obstacle') return failure('ILLEGAL_TARGET');
      const cells = board.cells.map((t, i) => i === rock.y * board.width + rock.x ? 'free' as const : t);
      // +1: the turn it is used on counts down too
      return done(stolen ? spend() : { cooldown: { ...chaos.cooldown, [role]: DISMANTLE_COOLDOWN + 1 } },
        { kind: 'dismantle', by: role, at: rock }, { ...positions, [role]: rock }, { ...board, cells });
    }
    case 'shrine': {
      if (!stolen && cls !== 'sukuna') return failure('NO_ABILITY');
      if (!stolen && chaos.collected < FINGERS) return failure('ABILITY_NOT_READY');
      const to = pushAway(board, positions, role, [...chaos.clones, ...chaos.wardenClones]);
      const event: ChaosEvent = { kind: 'shrine', by: role, from: at(positions[target]), to };
      if (stolen) return done(spend(), event, { ...positions, [target]: to });
      const fingers = spawnFingers(board, [positions.warden, me, to, ...chaos.clones], FINGERS, rng);
      if (!fingers.ok) return fingers;
      const landed = { ...chaos, collected: 0, fingers: fingers.value };
      const after = landOn(landed, board, to, rng);
      if (!after.ok) return after;
      return success({ board, positions: { ...positions, [target]: to },
        chaos: { ...after.value.chaos, events: [event, ...after.value.events] } });
    }
    case 'steal': {
      if (cls !== 'afo') return failure('NO_ABILITY');
      if (chaos.cooldown[role] > 0 || chaos.stolen) return failure('ABILITY_NOT_READY');
      const from = chaos.classes.prisoner;
      const uses = STOLEN[from];
      if (!uses) return failure('ILLEGAL_TARGET');
      return done({ stolen: { from, uses }, locked: LOCK_TURNS, cooldown: { ...chaos.cooldown, [role]: STEAL_COOLDOWN + 1 } },
        { kind: 'steal', from });
    }
    case 'sharingan': {
      if (cls !== 'sasuke') return failure('NO_ABILITY');
      if (chaos.cooldown[role] > 0) return failure('ABILITY_NOT_READY');
      if (!inSight(board, me, positions[target])) return failure('ILLEGAL_TARGET');
      const scramble = derangement(rng);
      if (!scramble.ok) return scramble;
      // The cooldown starts counting when the illusion ends
      return done({ illusion: ILLUSION_TURNS, scramble: scramble.value,
        cooldown: { ...chaos.cooldown, [role]: ILLUSION_TURNS + SHARINGAN_COOLDOWN } }, { kind: 'sharingan' });
    }
    case 'void': {
      if (cls !== 'gojo') return failure('NO_ABILITY');
      if (chaos.cooldown[role] > 0) return failure('ABILITY_NOT_READY');
      if (distance(me, positions[target]) > VOID_RANGE) return failure('ILLEGAL_TARGET');
      return done({ inVoid: true, cooldown: { ...chaos.cooldown, [role]: VOID_COOLDOWN + 1 } }, { kind: 'void' });
    }
    case 'escape':
      return failure('ILLEGAL_TARGET'); // handled by the engine (it is not a turn)
  }
}

// The Shrine pushes the other player up to SHRINE_PUSH tiles straight away from
// the user, stopping at rocks, the tunnel, clones and the map edge. Of the two
// "away" directions the one that pushes farther wins (the longer axis on a tie).
function pushAway(board: Board, positions: Positions, role: Role, clones: readonly Coordinate[]): Coordinate {
  const me = positions[role], them = positions[other(role)];
  const dx = them.x - me.x, dy = them.y - me.y;
  const options: Direction[] = [];
  const horizontal: Direction | null = dx > 0 ? 'right' : dx < 0 ? 'left' : null;
  const vertical: Direction | null = dy > 0 ? 'down' : dy < 0 ? 'up' : null;
  if (Math.abs(dx) >= Math.abs(dy)) options.push(...[horizontal, vertical].filter((d): d is Direction => d !== null));
  else options.push(...[vertical, horizontal].filter((d): d is Direction => d !== null));
  let best = at(them), bestSteps = 0;
  for (const d of options) {
    let steps = 0;
    while (steps < SHRINE_PUSH) {
      const next = add(them, d, steps + 1);
      if (tileAt(board, next) !== 'free' || sameCell(next, me) || clones.some(c => sameCell(c, next))) break;
      steps++;
    }
    if (steps > bestSteps) { best = add(them, d, steps); bestSteps = steps; }
  }
  return best;
}

// The warden lands on a tile: a clone there vanishes, a finger there is crushed
// and comes back somewhere else.
function landOn(chaos: ChaosState, board: Board, p: Coordinate, rng: Random, others: readonly Coordinate[] = []):
  Result<{ chaos: ChaosState; events: ChaosEvent[] }> {
  const events: ChaosEvent[] = [];
  let next = chaos;
  if (next.clones.some(c => sameCell(c, p))) {
    next = { ...next, clones: next.clones.filter(c => !sameCell(c, p)) };
    events.push({ kind: 'poof', at: at(p) });
  }
  if (next.fingers.some(f => sameCell(f, p))) {
    const rest = next.fingers.filter(f => !sameCell(f, p));
    const spot = freeSpot(board, [p, ...others, ...rest, ...next.clones], rng);
    if (!spot.ok) return spot;
    next = { ...next, fingers: spot.value ? [...rest, spot.value] : rest };
    events.push({ kind: 'crush', at: at(p), respawn: spot.value });
  }
  return success({ chaos: next, events });
}

// End of `role`'s turn (a move, a stay, an ability, a timeout or a skipped stunned
// turn). used = the ability used this turn, if any. Ticks bars and cooldowns,
// walks clones, picks up or crushes fingers.
export function endTurn(chaos: ChaosState, board: Board, positions: Positions, role: Role,
  used: Ability['kind'] | null, rng: Random): Result<ChaosState> {
  const events = [...chaos.events];
  let next: ChaosState = { ...chaos, cooldown: { ...chaos.cooldown, [role]: Math.max(0, chaos.cooldown[role] - 1) } };
  const me = positions[role];
  if (role === 'warden') {
    const landed = landOn(next, board, me, rng, [positions.prisoner]);
    if (!landed.ok) return landed;
    next = landed.value.chaos;
    events.push(...landed.value.events);
    // All For One's clones walk; walking into the prisoner catches them
    const clones: WardenClone[] = [];
    for (const [i, c] of next.wardenClones.entries()) {
      if (c.fresh) { clones.push({ ...c, fresh: false }); continue; }
      if (c.life <= 1) { events.push({ kind: 'poof', at: at(c) }); continue; }
      const step = add(c, c.direction);
      if (sameCell(step, positions.prisoner)) { events.push({ kind: 'clonecatch', at: step }); clones.push({ ...c, ...step, life: c.life - 1 }); continue; }
      const blocked = tileAt(board, step) !== 'free' || sameCell(step, me) || next.clones.some(o => sameCell(o, step))
        || clones.some(o => sameCell(o, step)) || next.wardenClones.slice(i + 1).some(o => sameCell(o, step));
      clones.push({ ...(blocked ? c : { ...c, ...step }), life: c.life - 1 });
    }
    return success({ ...next, wardenClones: clones, events });
  }
  // Prisoner: a steal or the illusion wears off
  next = { ...next, locked: Math.max(0, next.locked - 1), illusion: Math.max(0, next.illusion - 1) };
  if (next.illusion === 0) next = { ...next, scramble: null };
  const cls = chaos.classes.prisoner;
  if (cls === 'allmight' && used !== 'smash') next = { ...next, bar: Math.min(SMASH_CHARGE, next.bar + 1) };
  if (cls === 'naruto') {
    if (used !== 'clones') next = { ...next, charges: Math.min(MAX_CLONES, next.charges + 1) };
    // Clones walk one tile; a wall, the tunnel, the edge, Naruto or another clone stops them.
    // Walking into the warden gets them caught.
    const clones: Clone[] = [];
    for (const [i, c] of next.clones.entries()) {
      if (c.fresh) { clones.push({ ...c, fresh: false }); continue; }
      const step = add(c, c.direction);
      if (sameCell(step, positions.warden)) { events.push({ kind: 'poof', at: step }); continue; }
      const blocked = tileAt(board, step) !== 'free' || sameCell(step, me) || next.wardenClones.some(o => sameCell(o, step))
        || clones.some(o => sameCell(o, step)) || next.clones.slice(i + 1).some(o => sameCell(o, step));
      clones.push(blocked ? c : { ...c, ...step });
    }
    next = { ...next, clones };
  }
  if (cls === 'sukuna' && next.fingers.some(f => sameCell(f, me))) {
    next = { ...next, fingers: next.fingers.filter(f => !sameCell(f, me)), collected: Math.min(FINGERS, next.collected + 1) };
    events.push({ kind: 'collect', at: at(me) });
  }
  return success({ ...next, events });
}
