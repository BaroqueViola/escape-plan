import { failure, success, type Board, type BoardOptions, type Coordinate, type Direction,
  type GeneratedMap, type Random, type Result, type Role, type Tile } from './types.js';

export const DEFAULT_BOARD: BoardOptions = Object.freeze({ width: 5, height: 5 });
export const MAX_GENERATION_ATTEMPTS = 1_000;
const steps: Readonly<Record<Direction, Coordinate>> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};
export const sameCell = (a: Coordinate, b: Coordinate): boolean => a.x === b.x && a.y === b.y;
export function tileAt(board: Board, p: Coordinate): Tile | undefined {
  if (!Number.isInteger(p.x) || !Number.isInteger(p.y)
    || p.x < 0 || p.y < 0 || p.x >= board.width || p.y >= board.height) return undefined;
  return board.cells[p.y * board.width + p.x];
}
export function legalMoves(board: Board, position: Coordinate, role: Role):
  readonly { readonly direction: Direction; readonly target: Coordinate }[] {
  return (Object.keys(steps) as Direction[]).flatMap(direction => {
    const step = steps[direction];
    const target = { x: position.x + step.x, y: position.y + step.y };
    const tile = tileAt(board, target);
    return tile === 'free' || (tile === 'tunnel' && role === 'prisoner')
      ? [{ direction, target }] : [];
  });
}
function reachable(board: Board, start: Coordinate, role: Role): Set<number> {
  const seen = new Set<number>([start.y * board.width + start.x]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    for (const { target } of legalMoves(board, queue[i]!, role)) {
      const index = target.y * board.width + target.x;
      if (!seen.has(index)) { seen.add(index); queue.push(target); }
    }
  }
  return seen;
}
export function validDimensions({ width, height }: BoardOptions): boolean {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height)
    && width >= 5 && height >= 5 && Number.isSafeInteger(width * height);
}
export function validateMap({ board, starts }: GeneratedMap): boolean {
  if (!validDimensions(board) || board.cells.length !== board.width * board.height) return false;
  const obstacles = board.cells.filter(t => t === 'obstacle').length;
  const tunnels = board.cells.filter(t => t === 'tunnel').length;
  const free = board.cells.filter(t => t === 'free').length;
  if (obstacles !== Math.floor(board.cells.length * 0.20) || tunnels !== 1
    || free + obstacles + tunnels !== board.cells.length) return false;
  if (sameCell(starts.warden, starts.prisoner)
    || tileAt(board, starts.warden) !== 'free' || tileAt(board, starts.prisoner) !== 'free') return false;
  return reachable(board, starts.warden, 'warden').size === free
    && reachable(board, starts.prisoner, 'prisoner').has(board.cells.indexOf('tunnel'))
    && legalMoves(board, starts.warden, 'warden').length > 0
    && legalMoves(board, starts.prisoner, 'prisoner').length > 0;
}
export function randomIndex(rng: Random, length: number): Result<number> {
  const value = rng();
  return Number.isFinite(value) && value >= 0 && value < 1
    ? success(Math.floor(value * length)) : failure('INVALID_RANDOM');
}
export function generateMap(rng: Random, options: BoardOptions = DEFAULT_BOARD): Result<GeneratedMap> {
  if (!validDimensions(options)) return failure('INVALID_DIMENSIONS');
  const { width, height } = options;
  const count = width * height;
  const obstacleCount = Math.floor(count * 0.20);
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const coordinates = Array.from({ length: count }, (_, i) => ({ x: i % width, y: Math.floor(i / width) }));
    for (let i = count - 1; i > 0; i--) {
      const draw = randomIndex(rng, i + 1);
      if (!draw.ok) return draw;
      const temp = coordinates[i]!;
      coordinates[i] = coordinates[draw.value]!;
      coordinates[draw.value] = temp;
    }
    const cells: Tile[] = Array<Tile>(count).fill('free');
    coordinates.slice(0, obstacleCount).forEach(p => { cells[p.y * width + p.x] = 'obstacle'; });
    const tunnel = coordinates[obstacleCount]!;
    cells[tunnel.y * width + tunnel.x] = 'tunnel';
    const map: GeneratedMap = {
      board: { width, height, cells },
      starts: { warden: coordinates[obstacleCount + 1]!, prisoner: coordinates[obstacleCount + 2]! },
    };
    if (validateMap(map)) return success(map);
  }
  return failure('GENERATION_FAILED');
}
