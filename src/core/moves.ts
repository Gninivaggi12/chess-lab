import { findKing, isAttacked, parseFEN, sqName } from "./board.ts";
import type { Piece } from "./board.ts";
import type { Color, PieceType, Uci } from "./types.ts";

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Legal ordinary moves (no en passant or promotion yet). Throws on a malformed FEN. */
export function legalMoves(fen: string): Uci[] {
  const pos = parseFEN(fen);
  if (!pos) throw new Error(`invalid FEN: ${fen}`);
  const { board, turn } = pos;
  const other: Color = turn === "w" ? "b" : "w";
  const out: Uci[] = [];

  const tryMove = (from: number, to: number) => {
    const next = board.slice();
    next[to] = next[from];
    next[from] = null;
    if (!isAttacked(next, findKing(next, turn), other)) out.push(sqName(from) + sqName(to));
  };

  const castle = (from: number) => {
    const home = turn === "w" ? 60 : 4;
    if (from !== home || isAttacked(board, home, other)) return;
    const base = turn === "w" ? 56 : 0;
    const rook = (i: number) => board[i]?.type === "r" && board[i]!.color === turn;
    const right = (c: string) => pos.castling.includes(turn === "w" ? c.toUpperCase() : c);
    if (right("k") && rook(base + 7) && !board[home + 1] && !board[home + 2]
      && !isAttacked(board, home + 1, other) && !isAttacked(board, home + 2, other)) tryMove(home, home + 2);
    if (right("q") && rook(base) && !board[home - 1] && !board[home - 2] && !board[home - 3]
      && !isAttacked(board, home - 1, other) && !isAttacked(board, home - 2, other)) tryMove(home, home - 2);
  };

  for (let from = 0; from < 64; from++) {
    const p: Piece | null = board[from];
    if (!p || p.color !== turn) continue;
    const file = from % 8, rank = from >> 3;
    const target = (df: number, dr: number): number => {
      const x = file + df, y = rank + dr;
      return x < 0 || x > 7 || y < 0 || y > 7 ? -1 : y * 8 + x;
    };
    const step = (dirs: number[][]) => {
      for (const [a, b] of dirs) {
        const t = target(a, b);
        if (t >= 0 && board[t]?.color !== turn) tryMove(from, t);
      }
    };
    const slide = (dirs: number[][]) => {
      for (const [a, b] of dirs) {
        for (let k = 1; ; k++) {
          const t = target(a * k, b * k);
          if (t < 0 || board[t]?.color === turn) break;
          tryMove(from, t);
          if (board[t]) break;
        }
      }
    };
    const kind: PieceType = p.type;
    if (kind === "n") step(KNIGHT);
    else if (kind === "k") {
      step(KING);
      castle(from);
    }
    else if (kind === "b") slide(DIAG);
    else if (kind === "r") slide(ORTHO);
    else if (kind === "q") slide([...DIAG, ...ORTHO]);
    else {
      const dr = turn === "w" ? -1 : 1;
      const startRank = turn === "w" ? 6 : 1;
      const lastRank = turn === "w" ? 0 : 7;
      const one = target(0, dr);
      if (one >= 0 && !board[one] && one >> 3 !== lastRank) {
        tryMove(from, one);
        const two = target(0, 2 * dr);
        if (rank === startRank && !board[two]) tryMove(from, two);
      }
      for (const df of [-1, 1]) {
        const t = target(df, dr);
        if (t >= 0 && board[t] && board[t]!.color === other && t >> 3 !== lastRank) tryMove(from, t);
      }
    }
  }
  return out;
}
