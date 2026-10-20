import type { Color, PieceType } from "./types.ts";

export interface Piece { color: Color; type: PieceType }
export interface Position {
  board: (Piece | null)[];   // index 0 = a8 … 63 = h1 (rank 8 first, as in FEN)
  turn: Color;
  castling: string;          // subset of "KQkq", in that order, "" if none
  ep: string | null;         // en passant target square as written in the FEN
  halfmove: number;
  fullmove: number;
}

export const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const sqName = (i: number): string => "abcdefgh"[i % 8] + (8 - (i >> 3));
export const sqIndex = (s: string): number => s.charCodeAt(0) - 97 + (8 - Number(s[1])) * 8;

/** Parses a FEN into a Position, or returns null if it is malformed (syntax only). */
export function parseFEN(fen: unknown): Position | null {
  if (typeof fen !== "string") return null;
  const f = fen.split(" ");
  if (f.length !== 6) return null;
  const ranks = f[0].split("/");
  if (ranks.length !== 8) return null;
  const board: (Piece | null)[] = [];
  for (const r of ranks) {
    let n = 0;
    for (const ch of r) {
      if (/[1-8]/.test(ch)) {
        for (let k = 0; k < Number(ch); k++) board.push(null);
        n += Number(ch);
      } else if (/[pnbrqkPNBRQK]/.test(ch)) {
        board.push({ color: ch === ch.toUpperCase() ? "w" : "b", type: ch.toLowerCase() as PieceType });
        n++;
      } else return null;
      if (n > 8) return null;
    }
    if (n !== 8) return null;
  }
  if (f[1] !== "w" && f[1] !== "b") return null;
  if (f[2] !== "-" && !/^(?=.)K?Q?k?q?$/.test(f[2])) return null;
  if (f[3] !== "-" && !/^[a-h][36]$/.test(f[3])) return null;
  if (!/^(0|[1-9]\d*)$/.test(f[4]) || !/^[1-9]\d*$/.test(f[5])) return null;
  return {
    board, turn: f[1], castling: f[2] === "-" ? "" : f[2],
    ep: f[3] === "-" ? null : f[3], halfmove: Number(f[4]), fullmove: Number(f[5]),
  };
}

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Is square `sq` attacked by any piece of color `by`? */
export function isAttacked(board: (Piece | null)[], sq: number, by: Color): boolean {
  const file = sq % 8, rank = sq >> 3;      // rank 0 = rank 8
  const at = (df: number, dr: number): Piece | null | undefined => {
    const x = file + df, y = rank + dr;
    return x < 0 || x > 7 || y < 0 || y > 7 ? undefined : board[y * 8 + x];
  };
  const is = (p: Piece | null | undefined, ...t: PieceType[]) => !!p && p.color === by && t.includes(p.type);
  // a white pawn attacks toward lower rank index, so it sits one row below (dr = +1)
  const pr = by === "w" ? 1 : -1;
  if (is(at(-1, pr), "p") || is(at(1, pr), "p")) return true;
  for (const [a, b] of KNIGHT) if (is(at(a, b), "n")) return true;
  for (const [a, b] of KING) if (is(at(a, b), "k")) return true;
  const ray = (dirs: number[][], ...t: PieceType[]) => {
    for (const [a, b] of dirs) {
      for (let k = 1; ; k++) {
        const p = at(a * k, b * k);
        if (p === undefined) break;
        if (p) { if (is(p, ...t)) return true; break; }
      }
    }
    return false;
  };
  return ray(DIAG, "b", "q") || ray(ORTHO, "r", "q");
}

export const findKing = (board: (Piece | null)[], c: Color): number =>
  board.findIndex((p) => !!p && p.color === c && p.type === "k");
