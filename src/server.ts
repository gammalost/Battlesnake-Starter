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

    // 2. Food — if we need food, prefer moves closer to food
    if (needsFood && board.food.length > 0) {
      let minDist = Infinity;
      for (const food of board.food) {
        const dist = bfsDistance(next, food, blocked, width, height);
        if (dist < minDist) minDist = dist;
      }
      if (minDist !== Infinity) {
        score += (100 - minDist) * 5;
      }
    }

    // 3. Aggression — bonus for moving into a square where a smaller snake
    //    will also want to move (we win head-to-head)
    if (killSquares.has(nextKey)) {
      score += 30;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = dir;
    }
  }

  console.log(`MOVE ${gameState.turn}: ${bestMove} (space=${floodFill(moveCoord(myHead, bestMove), blocked, width, height)}, health=${you.health})`);
  return { move: bestMove, shout: "Take down Magnus!" };
}
