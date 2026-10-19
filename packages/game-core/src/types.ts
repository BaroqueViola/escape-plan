import type { ClassId } from './classes.js';
export type PlayerId = string;
export type Role = 'warden' | 'prisoner';
export type Tile = 'free' | 'obstacle' | 'tunnel';
export type Direction = 'up' | 'down' | 'left' | 'right';
export interface Coordinate { readonly x: number; readonly y: number }
export interface BoardOptions { readonly width: number; readonly height: number }
export interface Board extends BoardOptions { readonly cells: readonly Tile[] }
export interface GeneratedMap {
  readonly board: Board;
  readonly starts: Readonly<Record<Role, Coordinate>>;
}
export type Random = () => number;
export interface Turn {
  readonly playerId: PlayerId;
  readonly startedAt: number;
  readonly deadline: number;
}
export interface Outcome { readonly winner: PlayerId; readonly reason: 'capture' | 'escape' }
interface MatchBase {
  readonly board: Board;
  readonly roles: Readonly<Record<Role, PlayerId>>;
  readonly positions: Readonly<Record<Role, Coordinate>>;
  readonly chaos?: ChaosState; // Chaos mode only: classes and ability state
}
// Naruto's clone: walks 1 tile in its direction after each prisoner turn.
// fresh = placed this turn, starts walking next turn.
export interface Clone extends Coordinate { readonly direction: Direction; readonly fresh: boolean }
// All For One's clone (stolen from Naruto): walks after his turns, catches the prisoner
// by walking into them, and vanishes after `life` more warden turns.
export interface WardenClone extends Clone { readonly life: number }
// The ability kinds All For One can hold after a steal
export type StolenKind = 'smash' | 'clones' | 'dismantle' | 'shrine';
// What happened during the last turn, for effects on screen and the admin feed
export type ChaosEvent =
  | { readonly kind: 'smash'; readonly by: Role; readonly from: Coordinate; readonly direction: Direction; readonly hit: boolean }
  | { readonly kind: 'clones'; readonly by: Role; readonly count: number }
  | { readonly kind: 'swap' } // only Naruto's side is told
  | { readonly kind: 'dismantle'; readonly by: Role; readonly at: Coordinate }
  | { readonly kind: 'shrine'; readonly by: Role; readonly from: Coordinate; readonly to: Coordinate }
  | { readonly kind: 'collect'; readonly at: Coordinate }
  | { readonly kind: 'crush'; readonly at: Coordinate; readonly respawn: Coordinate | null }
  | { readonly kind: 'poof'; readonly at: Coordinate } // a clone was caught
  | { readonly kind: 'skip'; readonly role: Role } // a stunned player lost a turn
  | { readonly kind: 'steal'; readonly from: ClassId }
  | { readonly kind: 'sharingan' }
  | { readonly kind: 'bump' } // a move in the illusion walked into a wall
  | { readonly kind: 'void' } // the prisoner was pulled into the Infinite Void
  | { readonly kind: 'escape'; readonly escaped: boolean } // how the Void challenge went
  | { readonly kind: 'clonecatch'; readonly at: Coordinate }; // All For One's clone caught the prisoner
// Ability state of a Chaos match. Counters only matter for the class that uses them.
export interface ChaosState {
  readonly classes: Readonly<Record<Role, ClassId>>;
  readonly stunned: Readonly<Record<Role, number>>; // own turns still to skip
  readonly cooldown: Readonly<Record<Role, number>>; // own turns until the ability is ready again
  readonly cracks: readonly Coordinate[]; // smashed ground, only drawn
  readonly bar: number; // All Might's charge, 0..SMASH_CHARGE
  readonly charges: number; // Naruto's banked clones, 0..MAX_CLONES
  readonly clones: readonly Clone[];
  readonly fingers: readonly Coordinate[]; // Sukuna's fingers lying on the map
  readonly collected: number; // fingers Sukuna holds, 0..FINGERS
  readonly stolen: { readonly from: ClassId; readonly uses: readonly StolenKind[] } | null; // All For One
  readonly locked: number; // prisoner turns left without their ability (after a steal)
  readonly wardenClones: readonly WardenClone[];
  readonly illusion: number; // Sasuke: prisoner turns left in the dark
  readonly scramble: Readonly<Record<Direction, Direction>> | null; // pressed key -> real direction during the illusion
  readonly inVoid: boolean; // Gojo: the prisoner is in the Void challenge
  readonly events: readonly ChaosEvent[];
}
export type Ability =
  | { readonly kind: 'smash'; readonly direction: Direction }
  | { readonly kind: 'clones'; readonly clones: readonly { readonly x: number; readonly y: number; readonly direction: Direction }[] }
  | { readonly kind: 'swap'; readonly x: number; readonly y: number }
  | { readonly kind: 'dismantle'; readonly direction: Direction }
  | { readonly kind: 'shrine' }
  | { readonly kind: 'steal' }
  | { readonly kind: 'sharingan' }
  | { readonly kind: 'void' }
  | { readonly kind: 'escape'; readonly hits: readonly boolean[] }; // the prisoner's Void challenge, one per round
export interface ActiveMatch extends MatchBase {
  readonly status: 'active';
  readonly turn: Turn;
  // Stays each role has left before it must move (refilled by a move)
  readonly staysLeft: Readonly<Record<Role, number>>;
}
export interface FinishedMatch extends MatchBase {
  readonly status: 'finished';
  readonly outcome: Outcome;
  readonly rematchVotes: Readonly<Record<PlayerId, boolean>>;
}
export type Match = ActiveMatch | FinishedMatch;
export interface Session {
  readonly players: readonly [PlayerId, PlayerId];
  readonly scores: Readonly<Record<PlayerId, number>>;
  readonly match: ActiveMatch | FinishedMatch | null;
}
export type ErrorCode = 'INVALID_PLAYERS' | 'INVALID_DIMENSIONS' | 'INVALID_RANDOM'
  | 'GENERATION_FAILED' | 'INVALID_TIME' | 'MATCH_EXISTS' | 'NO_ACTIVE_MATCH'
  | 'UNKNOWN_PLAYER' | 'OUT_OF_TURN' | 'INVALID_DIRECTION' | 'ILLEGAL_MOVE'
  | 'TURN_EXPIRED' | 'TIMEOUT_NOT_DUE' | 'NO_LEGAL_MOVE' | 'NO_FINISHED_MATCH'
  | 'INVALID_VOTE' | 'NO_STAYS_LEFT' | 'NO_ABILITY' | 'ABILITY_NOT_READY' | 'ILLEGAL_TARGET' | 'IN_VOID';
export type Result<T> = { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: ErrorCode } };
export const success = <T>(value: T): Result<T> => ({ ok: true, value });
export const failure = (code: ErrorCode): Result<never> => ({ ok: false, error: { code } });
