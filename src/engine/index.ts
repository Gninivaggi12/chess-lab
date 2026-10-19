import { applyMove, inCheck, legalMoves } from "../core/index.ts";
import type { Uci } from "../core/types.ts";

const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100000;
const LEVEL5_MS = 1500;
const LEVEL5_NODES = 12000;
const MAX_DEPTH = [0, 0, 1, 2, 3, 6];

class Timeout extends Error {}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Static evaluation from the side to move's point of view: material plus a small centralization/advancement bonus.
function evaluate(fen: string): number {
  const [placement, side] = fen.split(" ");
  let score = 0;
  const ranks = placement.split("/");
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of ranks[r]) {
      if (ch >= "1" && ch <= "8") { f += +ch; continue; }
      const white = ch === ch.toUpperCase();
      const t = ch.toLowerCase();
      const cx = Math.min(f, 7 - f), cy = Math.min(r, 7 - r);
      let v = VALUE[t];
      if (t === "p") v += (white ? 6 - r : r - 1) * 6 + cx * 2;
      else if (t === "n" || t === "b") v += (cx + cy) * 5;
      else if (t === "q") v += (cx + cy) * 2;
      score += white ? v : -v;
      f++;
    }
  }
  return side === "w" ? score : -score;
}

// Captures (most valuable victim, cheapest attacker) and promotions first; stable for equal keys.
function order(fen: string, moves: Uci[]): Uci[] {
  const board = new Map<string, string>();
  fen.split(" ")[0].split("/").forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (ch >= "1" && ch <= "8") f += +ch;
      else board.set("abcdefgh"[f++] + (8 - r), ch.toLowerCase());
    }
  });
  const key = (m: Uci) => {
    const victim = board.get(m.slice(2, 4));
    const mover = board.get(m.slice(0, 2)) ?? "p";
    return (victim ? 10 * VALUE[victim] - VALUE[mover] : 0) + (m.length === 5 ? 800 : 0);
  };
  return moves.map((m) => [key(m), m] as const).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}

export function bestMove(fen: string, level: number, maxTimeMs?: number): Uci {
  const moves = legalMoves(fen);
  if (moves.length === 0) throw new Error("no legal moves");
  const rand = rng(hash(`${fen}|${level}`));
  if (level <= 1) return moves[Math.floor(rand() * moves.length)];

  // Seeded shuffle so equal-valued moves vary by position but stay repeatable.
  for (let i = moves.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [moves[i], moves[j]] = [moves[j], moves[i]];
  }
  const deadline = performance.now() + (maxTimeMs ?? (level >= 5 ? LEVEL5_MS : Infinity));
  // Without an explicit time limit, level 5 stops on a node budget so the answer is repeatable.
  const nodeBudget = maxTimeMs === undefined && level >= 5 ? LEVEL5_NODES : Infinity;
  let nodes = 0;

  const search = (pos: string, depth: number, alpha: number, beta: number, ply: number): number => {
    nodes++;
    if (nodes > nodeBudget || ((nodes & 15) === 0 && performance.now() > deadline)) throw new Timeout();
    const ms = legalMoves(pos);
    if (ms.length === 0) return inCheck(pos) ? -MATE + ply : 0;
    if (depth === 0) return evaluate(pos);
    let best = -Infinity;
    for (const m of order(pos, ms)) {
      const score = -search(applyMove(pos, m), depth - 1, -beta, -alpha, ply + 1);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  };

  const ordered = order(fen, moves);
  let chosen = ordered[0];
  try {
    for (let depth = 1; depth <= MAX_DEPTH[Math.min(level, 5)]; depth++) {
      let alpha = -Infinity;
      let bestMv = ordered[0];
      for (const m of ordered) {
        const score = -search(applyMove(fen, m), depth - 1, -Infinity, -alpha, 1);
        if (score > alpha) { alpha = score; bestMv = m; }
      }
      chosen = bestMv;
      ordered.splice(ordered.indexOf(bestMv), 1);
      ordered.unshift(bestMv);
      if (alpha > MATE / 2) break;
    }
  } catch (e) {
    if (!(e instanceof Timeout)) throw e;
  }
  return chosen;
}
