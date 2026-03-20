import { Coord, GameState, InfoResponse, MoveResponse } from "./types";
import { coordKey, moveCoord, floodFill, bfsDistance } from "./utils";

const DIRECTIONS = ["up", "down", "left", "right"] as const;
type Direction = (typeof DIRECTIONS)[number];

export function info(): InfoResponse {
  console.log("INFO");
  return {
    apiversion: "1",
    author: "Bubblun",
    color: "#af8a76",
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

  // --- Build blocked cells (all snake bodies, excluding tails that will move) ---
  const blocked = new Set<string>();
  for (const snake of board.snakes) {
    const lastIdx = snake.body.length - 1;
    // Tail stays if the last two segments share coordinates (snake just ate)
    const tailStays =
      lastIdx >= 1 &&
      snake.body[lastIdx].x === snake.body[lastIdx - 1].x &&
      snake.body[lastIdx].y === snake.body[lastIdx - 1].y;

    for (let i = 0; i < snake.body.length; i++) {
      if (!tailStays && i === lastIdx) continue; // tail moves away
      blocked.add(coordKey(snake.body[i]));
    }
  }

  // Block hazards too
  for (const hz of board.hazards) {
    blocked.add(coordKey(hz));
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

    // 1. Flood fill — maximize reachable space (primary driver)
    const space = floodFill(next, blocked, width, height);
    score += space * 10;

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
        if (opponent.health >= 40) continue; // only deny opponents at risk of starving
        const theirDist = bfsDistance(opponent.head, food, blocked, width, height);
        if (ourDist <= theirDist) {
          // We reach it first (or tie) — score by how desperate they are
          score += (40 - opponent.health) * 4;
        }
      }
    }

    // 3. Head hunting — actively chase smaller snakes for a head-to-head kill
    for (const opponent of board.snakes) {
      if (opponent.id === you.id) continue;
      if (opponent.length >= myLength) continue; // only hunt smaller snakes
      const distToHead = bfsDistance(next, opponent.head, blocked, width, height);
      if (distToHead !== Infinity) {
        // Closer to their head = higher score; scale down for distant targets
        score += Math.max(0, (20 - distToHead)) * 6;
      }
    }

    // 4. Low-health hunting — close in on desperate opponents who are predictable
    for (const opponent of board.snakes) {
      if (opponent.id === you.id) continue;
      if (opponent.health >= 25) continue; // only hunt near-starving opponents
      const distToHead = bfsDistance(next, opponent.head, blocked, width, height);
      if (distToHead !== Infinity) {
        // Extra urgency bonus: the lower their health, the more we want to intercept
        score += (25 - opponent.health) * 5 + Math.max(0, (15 - distToHead)) * 4;
      }
    }

    // 5. Kill square bonus — reward landing where a smaller snake's head could go
    if (killSquares.has(nextKey)) {
      score += 50;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = dir;
    }
  }

  console.log(`MOVE ${gameState.turn}: ${bestMove} (space=${floodFill(moveCoord(myHead, bestMove), blocked, width, height)}, health=${you.health})`);
  return { move: bestMove, shout: "Take down Magnus!" };
}
