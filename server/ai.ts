import { legalMoves, type Board, type Coordinate, type Direction, type Role } from '../packages/game-core/src/index.js';

const key = (p: Coordinate) => `${p.x},${p.y}`;

function distances(board: Board, start: Coordinate, role: Role, blocked?: Coordinate): Map<string, number> {
  const result = new Map<string, number>([[key(start), 0]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const point = queue[i]!;
    for (const { target } of legalMoves(board, point, role)) {
      if (blocked && key(target) === key(blocked)) continue;
      const id = key(target);
      if (result.has(id)) continue;
      result.set(id, result.get(key(point))! + 1);
      queue.push(target);
    }
  }
  return result;
}

export function chooseAiMove(board: Board, positions: Readonly<Record<Role, Coordinate>>, role: Role): Direction {
  const moves = legalMoves(board, positions[role], role);
  if (!moves.length) return 'up'; // generated boards always leave each role a legal move
  const otherRole: Role = role === 'warden' ? 'prisoner' : 'warden';
  const other = positions[otherRole];
  const towardOther = distances(board, other, 'warden');

  if (role === 'warden') {
    const choices = moves.map((move) => ({
      direction: move.direction,
      distance: distances(board, move.target, 'warden').get(key(other)) ?? Infinity,
    }));
    const best = Math.min(...choices.map((choice) => choice.distance));
    return choices.find((choice) => choice.distance === best)!.direction;
  }

  const escape = moves.find(({ target }) => board.cells[target.y * board.width + target.x] === 'tunnel');
  if (escape) return escape.direction;

  const tunnel = { x: board.cells.findIndex((tile) => tile === 'tunnel') % board.width,
    y: Math.floor(board.cells.findIndex((tile) => tile === 'tunnel') / board.width) };
  const toTunnel = distances(board, tunnel, 'prisoner', other);
  const currentThreatDistance = towardOther.get(key(positions.prisoner)) ?? Infinity;
  const avoid = currentThreatDistance <= 3;
  const scored = moves.map((move) => {
    const tunnelDistance = toTunnel.get(key(move.target)) ?? Infinity;
    const threatDistance = towardOther.get(key(move.target)) ?? 0;
    return { direction: move.direction, score: tunnelDistance * (avoid ? 1.5 : 3) - (avoid ? Math.min(threatDistance, 6) * 2 : 0) };
  });
  const best = Math.min(...scored.map((choice) => choice.score));
  return scored.find((choice) => choice.score === best)!.direction;
}
