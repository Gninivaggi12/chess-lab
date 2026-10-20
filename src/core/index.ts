import { INITIAL_FEN, findKing, isAttacked, parseFEN, sqIndex } from "./board.ts";
import type { Color } from "./types.ts";

export { INITIAL_FEN };

export function isValidFEN(fen: string): boolean {
  try {
    const pos = parseFEN(fen);
    if (!pos) return false;
    const { board } = pos;
    for (const c of ["w", "b"] as Color[]) {
      const mine = board.filter((p) => p && p.color === c);
      if (mine.length > 16) return false;
      if (mine.filter((p) => p!.type === "k").length !== 1) return false;
      if (mine.filter((p) => p!.type === "p").length > 8) return false;
    }
    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (p && p.type === "p" && (i < 8 || i >= 56)) return false;
    }
    const other: Color = pos.turn === "w" ? "b" : "w";
    if (isAttacked(board, findKing(board, other), pos.turn)) return false;
    const has = (sq: string, color: Color, type: string) => {
      const p = board[sqIndex(sq)];
      return !!p && p.color === color && p.type === type;
    };
    const rights: [string, string, Color, string][] = [
      ["K", "e1", "w", "h1"], ["Q", "e1", "w", "a1"], ["k", "e8", "b", "h8"], ["q", "e8", "b", "a8"],
    ];
    for (const [r, k, c, rook] of rights) {
      if (pos.castling.includes(r) && !(has(k, c, "k") && has(rook, c, "r"))) return false;
    }
    if (pos.ep) {
      const file = pos.ep[0];
      // the side to move captures; the pawn that just moved belongs to the other side
      const [epRank, from, to] = pos.turn === "w" ? ["6", "7", "5"] : ["3", "2", "4"];
      if (pos.ep[1] !== epRank) return false;
      if (board[sqIndex(pos.ep)] || board[sqIndex(file + from)]) return false;
      if (!has(file + to, other, "p")) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function inCheck(fen: string): boolean {
  const pos = parseFEN(fen);
  if (!pos) throw new Error(`invalid FEN: ${fen}`);
  const other: Color = pos.turn === "w" ? "b" : "w";
  return isAttacked(pos.board, findKing(pos.board, pos.turn), other);
}
