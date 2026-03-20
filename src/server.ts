import { Coord, GameState, InfoResponse, MoveResponse } from "./types";
import { coordKey, moveCoord, floodFill, bfsDistance } from "./utils";

const DIRECTIONS = ["up", "down", "left", "right"] as const;
type Direction = (typeof DIRECTIONS)[number];

export function info(): InfoResponse {
  console.log("INFO");
  return {
    apiversion: "1",
    author: "Bubblun",
    color: "#d2dadb",
    head: "scarf",
    tail: "fat-rattle",
  };
}

export function start(gameState: GameState): void {
  console.log(`${gameState.game.id} START`);
}

export function end(gameState: GameState): void {
  console.log(`${gameState.game.id} END\n`);
}

export function move(gameState: GameState): MoveResponse {
  const { board, you } = gameState;
  const { width, height } = board;
  const myHead = you.head;
  const myLength = you.length;

  // --- Build blocked set (for BFS pathfinding: food, hunting) ---
  // Excludes tails that will move away this turn.
  const blocked = new Set<string>();
  for (const snake of board.snakes) {
    const lastIdx = snake.body.length - 1;
    const tailStays =
      lastIdx >= 1 &&
      snake.body[lastIdx].x === snake.body[lastIdx - 1].x &&
      snake.body[lastIdx].y === snake.body[lastIdx - 1].y;

    for (let i = 0; i < snake.body.length; i++) {
      if (!tailStays && i === lastIdx) continue;
      blocked.add(coordKey(snake.body[i]));
    }
  }
  for (const hz of board.hazards) {
    blocked.add(coordKey(hz));
  }

  // --- Build decayMap (for flood fill) ---
  // Maps coord key -> earliest BFS step at which that square is passable.
  // body[i] in a snake of length n vacates after (n - i) turns, so the square
  // is accessible once BFS depth >= (n - i). Hazards are permanently blocked.
  const decayMap = new Map<string, number>();
  for (const snake of board.snakes) {
    const n = snake.body.length;
    const lastIdx = n - 1;
    const tailStays =
      lastIdx >= 1 &&
      snake.body[lastIdx].x === snake.body[lastIdx - 1].x &&
      snake.body[lastIdx].y === snake.body[lastIdx - 1].y;

    for (let i = 0; i < n; i++) {
      if (!tailStays && i === lastIdx) continue; // tail moves; leave square passable
      const freeAt = n - i + (tailStays ? 1 : 0);
      const key = coordKey(snake.body[i]);
      const existing = decayMap.get(key) ?? 0;
      // Multiple snakes overlapping: take the most conservative (longest block)
      if (existing !== Infinity) decayMap.set(key, Math.max(existing, freeAt));
    }
  }
  for (const hz of board.hazards) {
    decayMap.set(coordKey(hz), Infinity);
  }

  // --- Classify opponent head next squares ---
  // dangerSquares: squares a same-size-or-larger snake head can reach next turn
  // killSquares:   squares a smaller snake head can reach next turn
  const dangerSquares = new Set<string>();
  const killSquares = new Set<string>();

  for (const snake of board.snakes) {
    if (snake.id === you.id) continue;
    for (const dir of DIRECTIONS) {
      const next = moveCoord(snake.head, dir);
      if (next.x < 0 || next.x >= width || next.y < 0 || next.y >= height) continue;
      if (snake.length >= myLength) {
        dangerSquares.add(coordKey(next));
      } else {
        killSquares.add(coordKey(next));
      }
    }
  }

  // --- Filter to safe moves ---
  const safeMoves: Direction[] = [];
  for (const dir of DIRECTIONS) {
    const next = moveCoord(myHead, dir);
    if (next.x < 0 || next.x >= width || next.y < 0 || next.y >= height) continue;
    if (blocked.has(coordKey(next))) continue;
    if (dangerSquares.has(coordKey(next))) continue;
    safeMoves.push(dir);
  }

  // Desperate fallback: ignore head-to-head danger, just avoid walls and bodies
  if (safeMoves.length === 0) {
    for (const dir of DIRECTIONS) {
      const next = moveCoord(myHead, dir);
      if (next.x < 0 || next.x >= width || next.y < 0 || next.y >= height) continue;
      if (blocked.has(coordKey(next))) continue;
      safeMoves.push(dir);
    }
  }

  if (safeMoves.length === 0) {
    console.log(`MOVE ${gameState.turn}: down (no safe moves)`);
    return { move: "down", shout: "I'm trapped!" };
  }

  // --- Decide if we need food ---
  // Eat when: health is low OR we are shorter than or equal to any opponent
  const needsFood =
    you.health < 40 ||
    board.snakes.some((s) => s.id !== you.id && s.length >= myLength);

  // --- Score each safe move ---
  let bestMove = safeMoves[0];
  let bestScore = -Infinity;

  for (const dir of safeMoves) {
    const next = moveCoord(myHead, dir);
    const nextKey = coordKey(next);
    let score = 0;

    // 1. Flood fill — space awareness (reduced weight to let aggression compete)
    const space = floodFill(next, decayMap, width, height);
    score += space * 7;

    // Penalty: if available space is less than our length we risk getting trapped
    if (space < myLength) {
      score -= (myLength - space) * 25;
    }

    // 2. Food — our need + denial value per food item
    for (const food of board.food) {
      const ourDist = bfsDistance(next, food, blocked, width, height);
      if (ourDist === Infinity) continue;

      // Our own need: low health or outmatched in size
      if (needsFood) {
        score += (100 - ourDist) * 5;
      }

      // Denial: intercept food that a low-health opponent needs to survive
      for (const opponent of board.snakes) {
        if (opponent.id === you.id) continue;
        if (opponent.health >= 40) continue;
        const theirDist = bfsDistance(opponent.head, food, blocked, width, height);
        if (ourDist <= theirDist) {
          score += (40 - opponent.health) * 4;
        }
      }
    }

    // 3. Head hunting — aggressively chase smaller snakes for a guaranteed kill
    for (const opponent of board.snakes) {
      if (opponent.id === you.id) continue;
      if (opponent.length >= myLength) continue;
      const distToHead = bfsDistance(next, opponent.head, blocked, width, height);
      if (distToHead !== Infinity) {
        score += Math.max(0, (40 - distToHead)) * 12;
      }
    }

    // 4. Same-size hunting — risky coin-flip, but we take it
    for (const opponent of board.snakes) {
      if (opponent.id === you.id) continue;
      if (opponent.length !== myLength) continue;
      const distToHead = bfsDistance(next, opponent.head, blocked, width, height);
      if (distToHead !== Infinity) {
        score += Math.max(0, (20 - distToHead)) * 5;
      }
    }

    // 5. Low-health hunting — pursue any hungry opponent, not just starving ones
    for (const opponent of board.snakes) {
      if (opponent.id === you.id) continue;
      if (opponent.health >= 50) continue;
      const distToHead = bfsDistance(next, opponent.head, blocked, width, height);
      if (distToHead !== Infinity) {
        score += (50 - opponent.health) * 6 + Math.max(0, (20 - distToHead)) * 5;
      }
    }

    // 6. Kill square bonus — reward landing where a smaller snake's head could go
    if (killSquares.has(nextKey)) {
      score += 100;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = dir;
    }
  }

  console.log(`MOVE ${gameState.turn}: ${bestMove} (space=${floodFill(moveCoord(myHead, bestMove), decayMap, width, height)}, health=${you.health})`);
  return { move: bestMove, shout: "Take down Magnus!" };
}
