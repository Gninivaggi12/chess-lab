import { legalMoves } from "./moves.ts";
import { INITIAL_FEN, findKing, isAttacked, parseFEN, sqIndex } from "./board.ts";
import type { Color, EndReason, Result } from "./types.ts";

export { INITIAL_FEN };
export { legalMoves } from "./moves.ts";
export { perft } from "./perft.ts";

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

export function normalizeFEN(fen: string): string {
  const pos = isValidFEN(fen) ? parseFEN(fen) : null;
  if (!pos) throw new Error(`invalid FEN: ${fen}`);
  const f = fen.split(" ");
  if (pos.ep) {
    const ep = pos.ep;
    const capture = legalMoves(fen).some((m) =>
      m.slice(2, 4) === ep && m[0] !== ep[0] && pos.board[sqIndex(m.slice(0, 2))]?.type === "p");
    if (!capture) f[3] = "-";
  }
  return f.join(" ");
}

export function timeoutResult(fen: string, flagged: Color): { result: "1-0" | "0-1" | "1/2-1/2"; reason: "timeout" | "timeout-vs-insufficient-material" } {
  const pos = parseFEN(fen);
  if (!pos) throw new Error(`invalid FEN: ${fen}`);
  const winner: Color = flagged === "w" ? "b" : "w";
  const squares = pos.board.map((p, i) => ({ p: p!, i })).filter((s) => s.p);
  const mine = squares.filter((s) => s.p.color === winner && s.p.type !== "k");
  const onlyKing = mine.length === 0;
  const oneKnight = mine.length === 1 && mine[0].p.type === "n" &&
    squares.every((s) => s.p.color === winner || s.p.type === "k" || s.p.type === "q");
  const bishopsOnly = mine.every((s) => s.p.type === "b") &&
    squares.every((s) => s.p.type !== "p" && s.p.type !== "n") &&
    new Set(squares.filter((s) => s.p.type === "b").map((s) => ((s.i >> 3) + (s.i & 7)) & 1)).size <= 1;
  if (onlyKing || oneKnight || bishopsOnly) return { result: "1/2-1/2", reason: "timeout-vs-insufficient-material" };
  return { result: winner === "w" ? "1-0" : "0-1", reason: "timeout" };
}

export function inCheck(fen: string): boolean {
  const pos = parseFEN(fen);
  if (!pos) throw new Error(`invalid FEN: ${fen}`);
  const other: Color = pos.turn === "w" ? "b" : "w";
  return isAttacked(pos.board, findKing(pos.board, pos.turn), other);
}

function insufficientMaterial(fen: string): boolean {
  const pos = parseFEN(fen);
  if (!pos) return false;
  const rest = pos.board.map((p, i) => ({ p, i })).filter((s) => s.p && s.p.type !== "k");
  if (rest.length === 0) return true;
  if (rest.length === 1 && rest[0].p!.type === "n") return true;
  return rest.every((s) => s.p!.type === "b") &&
    new Set(rest.map((s) => ((s.i >> 3) + (s.i & 7)) & 1)).size === 1;
}

export function positionStatus(fen: string): { over: boolean; result: Result; reason?: EndReason } {
  const pos = parseFEN(fen);
  if (!pos) throw new Error(`invalid FEN: ${fen}`);
  if (legalMoves(fen).length === 0) {
    if (inCheck(fen)) return { over: true, result: pos.turn === "w" ? "0-1" : "1-0", reason: "checkmate" };
    return { over: true, result: "1/2-1/2", reason: "stalemate" };
  }
  if (insufficientMaterial(fen)) return { over: true, result: "1/2-1/2", reason: "insufficient-material" };
  if (pos.halfmove >= 100) return { over: true, result: "1/2-1/2", reason: "fifty-move-rule" };
  return { over: false, result: "*" };
}

export function premoveTargets(fen: string, square: string): string[] {
  const pos = parseFEN(fen);
  if (!pos) return [];
  const piece = pos.board[sqIndex(square)];
  if (!piece) return [];
  const f = square.charCodeAt(0) - 97;
  const r = Number(square[1]) - 1;
  const out: string[] = [];
  const add = (x: number, y: number) => {
    if (x < 0 || x > 7 || y < 0 || y > 7) return false;
    out.push("abcdefgh"[x] + (y + 1));
    return true;
  };
  const ray = (dirs: number[][], once: boolean) => {
    for (const [dx, dy] of dirs) {
      for (let k = 1; k < 8; k++) {
        if (!add(f + dx * k, r + dy * k) || once) break;
      }
    }
  };
  const ortho = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const diag = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  switch (piece.type) {
    case "r": ray(ortho, false); break;
    case "b": ray(diag, false); break;
    case "q": ray([...ortho, ...diag], false); break;
    case "n":
      for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) add(f + dx, r + dy);
      break;
    case "k": {
      ray([...ortho, ...diag], true);
      const white = piece.color === "w";
      if (square === (white ? "e1" : "e8")) {
        if (pos.castling.includes(white ? "K" : "k")) add(6, r);
        if (pos.castling.includes(white ? "Q" : "q")) add(2, r);
      }
      break;
    }
    case "p": {
      const d = piece.color === "w" ? 1 : -1;
      add(f, r + d);
      if (r === (piece.color === "w" ? 1 : 6)) add(f, r + 2 * d);
      add(f - 1, r + d);
      add(f + 1, r + d);
      break;
    }
  }
  return out;
}
