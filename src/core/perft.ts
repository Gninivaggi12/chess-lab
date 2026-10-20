import { parseFEN, sqIndex, sqName } from "./board.ts";
import type { Piece } from "./board.ts";
import { legalMoves } from "./moves.ts";

const fenChar = (p: Piece): string => (p.color === "w" ? p.type.toUpperCase() : p.type);

/** The FEN after playing `uci`, which must be legal in `fen`. */
export function makeMove(fen: string, uci: string): string {
  const pos = parseFEN(fen)!;
  const { board, turn } = pos;
  const from = sqIndex(uci.slice(0, 2)), to = sqIndex(uci.slice(2, 4));
  const piece = board[from]!;
  const capture = board[to] !== null;
  let ep = "-";
  if (piece.type === "p") {
    if (pos.ep === sqName(to)) board[(from >> 3) * 8 + (to % 8)] = null;
    if (Math.abs(to - from) === 16) ep = sqName((to + from) / 2);
  }
  board[to] = uci[4] ? { color: turn, type: uci[4] as Piece["type"] } : piece;
  board[from] = null;
  if (piece.type === "k" && Math.abs(to - from) === 2) {
    const base = to - (to % 8);
    const [rf, rt] = to > from ? [base + 7, to - 1] : [base, to + 1];
    board[rt] = board[rf];
    board[rf] = null;
  }
  let castling = pos.castling;
  const drop = (sq: number) => {
    const c = ({ 60: "KQ", 4: "kq", 63: "K", 56: "Q", 7: "k", 0: "q" } as Record<number, string>)[sq];
    if (c) for (const ch of c) castling = castling.replace(ch, "");
  };
  drop(from);
  drop(to);
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let s = "", empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[r * 8 + f];
      if (!p) empty++;
      else { s += (empty || "") + fenChar(p); empty = 0; }
    }
    rows.push(s + (empty || ""));
  }
  const half = piece.type === "p" || capture ? 0 : pos.halfmove + 1;
  return `${rows.join("/")} ${turn === "w" ? "b" : "w"} ${castling || "-"} ${ep} ${half} ${pos.fullmove + (turn === "b" ? 1 : 0)}`;
}

/** Number of leaf nodes of the legal-move tree to `depth` plies. */
export function perft(fen: string, depth: number): number {
  if (depth <= 0) return 1;
  const moves = legalMoves(fen);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(makeMove(fen, m), depth - 1);
  return n;
}
