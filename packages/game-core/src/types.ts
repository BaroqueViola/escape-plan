export type PlayerId = string;
export type Role = 'warder' | 'prisoner';
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
}
export interface ActiveMatch extends MatchBase {
  readonly status: 'active';
  readonly turn: Turn;
}
export interface FinishedMatch extends MatchBase {
  readonly status: 'finished';
  readonly outcome: Outcome;
  readonly rematchVotes: Readonly<Record<PlayerId, boolean>>;
}
export interface Session {
  readonly players: readonly [PlayerId, PlayerId];
  readonly scores: Readonly<Record<PlayerId, number>>;
  readonly match: ActiveMatch | FinishedMatch | null;
}
export type ErrorCode = 'INVALID_PLAYERS' | 'INVALID_DIMENSIONS' | 'INVALID_RANDOM'
  | 'GENERATION_FAILED' | 'INVALID_TIME' | 'MATCH_EXISTS' | 'NO_ACTIVE_MATCH'
  | 'UNKNOWN_PLAYER' | 'OUT_OF_TURN' | 'INVALID_DIRECTION' | 'ILLEGAL_MOVE'
  | 'TURN_EXPIRED' | 'TIMEOUT_NOT_DUE' | 'NO_LEGAL_MOVE' | 'NO_FINISHED_MATCH'
  | 'INVALID_VOTE';
export type Result<T> = { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: ErrorCode } };
export const success = <T>(value: T): Result<T> => ({ ok: true, value });
export const failure = (code: ErrorCode): Result<never> => ({ ok: false, error: { code } });
