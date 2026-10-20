import { failure, success, type Board, type BoardOptions, type Coordinate, type Direction,
  type GeneratedMap, type Random, type Result, type Role, type Tile } from './types.js';

export const DEFAULT_BOARD: BoardOptions = Object.freeze({ width: 5, height: 5 });
// Dense custom maps can fail the reachability, escape-route, and race-distance
// checks many times before a valid random layout appears.
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
function shortestDistance(board: Board, start: Coordinate, goals: readonly Coordinate[], role: Role): number | null {
  const goalIndices = new Set(goals.map(({ x, y }) => y * board.width + x));
  const startIndex = start.y * board.width + start.x;
  if (goalIndices.has(startIndex)) return 0;
  const seen = new Set<number>([startIndex]);
  const queue: { point: Coordinate; distance: number }[] = [{ point: start, distance: 0 }];
  for (let i = 0; i < queue.length; i++) {
    const { point, distance } = queue[i]!;
    for (const { target } of legalMoves(board, point, role)) {
      const index = target.y * board.width + target.x;
      if (goalIndices.has(index)) return distance + 1;
      if (!seen.has(index)) {
        seen.add(index);
        queue.push({ point: target, distance: distance + 1 });
      }
    }
  }
  return null;
}
function distanceToTunnel(board: Board, start: Coordinate, role: Role, tunnel: Coordinate): number | null {
  if (role === 'prisoner') return shortestDistance(board, start, [tunnel], role);
  // The warden cannot enter the tunnel; count the final step to its nearest
  // reachable free neighbor so its distance still measures closeness to the exit.
  const neighbors = Object.values(steps).map((step) => ({ x: tunnel.x + step.x, y: tunnel.y + step.y }))
    .filter((point) => tileAt(board, point) === 'free');
  const distance = shortestDistance(board, start, neighbors, role);
  return distance === null ? null : distance + 1;
}
function minimumTunnelDistance(board: Board): number {
  // Scale by the board's linear size: 5×5 requires 3 moves, while 20×20
  // requires 10. Area scaling also accounts for long rectangular maps.
  return Math.ceil(Math.sqrt(board.width * board.height) / 2);
}
function manhattanDistance(a: Coordinate, b: Coordinate): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Return true when the prisoner can reach the tunnel along two routes that
// share no cells other than the prisoner's start and the tunnel. This avoids
// a single warden position being enough to seal every escape route.
function hasTwoIndependentEscapeRoutes(board: Board, start: Coordinate, tunnel: Coordinate): boolean {
  const count = board.cells.length;
  const source = count * 2;
  const sink = source + 1;
  const graph: { to: number; reverse: number; capacity: number }[][] =
    Array.from({ length: sink + 1 }, () => []);
  const addEdge = (from: number, to: number, capacity: number): void => {
    const forward = { to, reverse: graph[to]!.length, capacity };
    const reverse = { to: from, reverse: graph[from]!.length, capacity: 0 };
    graph[from]!.push(forward);
    graph[to]!.push(reverse);
  };
  const indexOf = (p: Coordinate): number => p.y * board.width + p.x;
  const startIndex = indexOf(start);
  const tunnelIndex = indexOf(tunnel);
  for (let i = 0; i < count; i++) {
    if (board.cells[i] !== 'free' && board.cells[i] !== 'tunnel') continue;
    const capacity = i === startIndex || i === tunnelIndex ? 2 : 1;
    addEdge(i * 2, i * 2 + 1, capacity);
    if (i === tunnelIndex) continue;
    const point = { x: i % board.width, y: Math.floor(i / board.width) };
    for (const step of Object.values(steps)) {
      const next = { x: point.x + step.x, y: point.y + step.y };
      const tile = tileAt(board, next);
      if (tile === 'free' || tile === 'tunnel') addEdge(i * 2 + 1, indexOf(next) * 2, 2);
    }
  }
  addEdge(source, startIndex * 2, 2);
  addEdge(tunnelIndex * 2 + 1, sink, 2);

  let flow = 0;
  while (flow < 2) {
    const previous: { from: number; edge: number }[] = Array(sink + 1).fill(null);
    const queue = [source];
    previous[source] = { from: source, edge: -1 };
    for (let i = 0; i < queue.length && previous[sink] === null; i++) {
      const node = queue[i]!;
      for (let edge = 0; edge < graph[node]!.length; edge++) {
        const candidate = graph[node]![edge]!;
        if (candidate.capacity > 0 && previous[candidate.to] === null) {
          previous[candidate.to] = { from: node, edge };
          queue.push(candidate.to);
        }
      }
    }
    if (previous[sink] === null) return false;
    for (let node = sink; node !== source;) {
      const step = previous[node]!;
      const edge = graph[step.from]![step.edge]!;
      edge.capacity--;
      graph[node]![edge.reverse]!.capacity++;
      node = step.from;
    }
    flow++;
  }
  return true;
}
export function validDimensions({ width, height }: BoardOptions): boolean {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height)
    && width >= 5 && height >= 5 && width <= 20 && height <= 20 && Number.isSafeInteger(width * height);
}
export function validateMap({ board, starts }: GeneratedMap, obstacleDensity = 20): boolean {
  if (!Number.isInteger(obstacleDensity) || obstacleDensity < 5 || obstacleDensity > 30) return false;
  if (!validDimensions(board) || board.cells.length !== board.width * board.height) return false;
  const obstacles = board.cells.filter(t => t === 'obstacle').length;
  const tunnels = board.cells.filter(t => t === 'tunnel').length;
  const free = board.cells.filter(t => t === 'free').length;
  if (obstacles !== Math.floor(board.cells.length * obstacleDensity / 100) || tunnels !== 1
    || free + obstacles + tunnels !== board.cells.length) return false;
  if (sameCell(starts.warden, starts.prisoner)
    || tileAt(board, starts.warden) !== 'free' || tileAt(board, starts.prisoner) !== 'free') return false;
  const tunnelIndex = board.cells.indexOf('tunnel');
  const tunnel = { x: tunnelIndex % board.width, y: Math.floor(tunnelIndex / board.width) };
  const minimumDistance = minimumTunnelDistance(board);
  const wardenDistance = distanceToTunnel(board, starts.warden, 'warden', tunnel);
  const prisonerDistance = distanceToTunnel(board, starts.prisoner, 'prisoner', tunnel);
  if (wardenDistance === null || prisonerDistance === null
    || wardenDistance < minimumDistance || prisonerDistance < minimumDistance
    // Warden acts first, so it must be able to contest the race to the tunnel.
    || wardenDistance > prisonerDistance
    || manhattanDistance(starts.warden, starts.prisoner) < minimumDistance
    || !hasTwoIndependentEscapeRoutes(board, starts.prisoner, tunnel)) return false;
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
  const density = options.obstacleDensity ?? 20;
  if (!validDimensions(options) || !Number.isInteger(density) || density < 5 || density > 30) return failure('INVALID_DIMENSIONS');
  const { width, height } = options;
  const count = width * height;
  const obstacleCount = Math.floor(count * density / 100);
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
    if (validateMap(map, density)) return success(map);
  }

  return failure('GENERATION_FAILED');
}
