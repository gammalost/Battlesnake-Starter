import { Battlesnake, Coord } from "./types";

export const manhattenDistance = (myHead: Coord, snakeHead: Coord) =>
  Math.abs(myHead.x - snakeHead.x) + Math.abs(myHead.y - snakeHead.y);

export function getRelativePosition(
  myHead: Coord,
  targetSnake: Battlesnake
): "up" | "down" | "left" | "right" | null {
  const targetHead = targetSnake.head;
  const dx = targetHead.x - myHead.x;
  const dy = targetHead.y - myHead.y;

  if (dx === 0 && dy === 0) return null;

  if (Math.abs(dy) > Math.abs(dx)) {
    return dy > 0 ? "up" : "down";
  } else {
    return dx > 0 ? "right" : "left";
  }
}

export function getOpposite(direction?: string | null) {
  switch (direction) {
    case "up":    return "down";
    case "down":  return "up";
    case "left":  return "right";
    case "right": return "left";
    default:      return null;
  }
}

export function coordKey(c: Coord): string {
  return `${c.x},${c.y}`;
}

export function moveCoord(head: Coord, dir: string): Coord {
  switch (dir) {
    case "up":    return { x: head.x, y: head.y + 1 };
    case "down":  return { x: head.x, y: head.y - 1 };
    case "left":  return { x: head.x - 1, y: head.y };
    case "right": return { x: head.x + 1, y: head.y };
    default:      return head;
  }
}

/**
 * Decay-aware flood fill.
 *
 * decayMap maps a coord key to the earliest BFS step at which that square
 * becomes passable:
 *   - Not in map (or value 0): always passable
 *   - Value N: passable once BFS depth >= N (body segment vacates after N turns)
 *   - Value Infinity: permanently blocked (hazards)
 *
 * This lets the snake "see through" its own tail since those squares open up
 * as the body moves forward, preventing false dead-ends near walls/corners.
 */
export function floodFill(
  start: Coord,
  decayMap: Map<string, number>,
  width: number,
  height: number
): number {
  const queue: [Coord, number][] = [[start, 0]];
  const visited = new Set<string>([coordKey(start)]);
  const dirs = ["up", "down", "left", "right"];

  while (queue.length > 0) {
    const [curr, step] = queue.shift()!;
    for (const dir of dirs) {
      const next = moveCoord(curr, dir);
      const key = coordKey(next);
      const freeAt = decayMap.get(key) ?? 0;
      if (
        next.x >= 0 && next.x < width &&
        next.y >= 0 && next.y < height &&
        !visited.has(key) &&
        step + 1 >= freeAt
      ) {
        visited.add(key);
        queue.push([next, step + 1]);
      }
    }
  }

  return visited.size;
}

export function bfsDistance(
  start: Coord,
  target: Coord,
  blocked: Set<string>,
  width: number,
  height: number
): number {
  const targetKey = coordKey(target);
  if (coordKey(start) === targetKey) return 0;

  const queue: [Coord, number][] = [[start, 0]];
  const visited = new Set<string>([coordKey(start)]);
  const dirs = ["up", "down", "left", "right"];

  while (queue.length > 0) {
    const [curr, dist] = queue.shift()!;
    for (const dir of dirs) {
      const next = moveCoord(curr, dir);
      const key = coordKey(next);
      if (key === targetKey) return dist + 1;
      if (
        next.x >= 0 && next.x < width &&
        next.y >= 0 && next.y < height &&
        !blocked.has(key) &&
        !visited.has(key)
      ) {
        visited.add(key);
        queue.push([next, dist + 1]);
      }
    }
  }

  return Infinity;
}