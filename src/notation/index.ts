import { applyMove, inCheck, legalMoves } from "../core/index.ts";
import { parseFEN, sqIndex } from "../core/board.ts";

/** Standard algebraic notation for a legal move. Throws on an illegal move. */
export function toSAN(fen: string, uci: string): string {
  const pos = parseFEN(fen);
  const moves = pos ? legalMoves(fen) : [];
  if (!pos || !moves.includes(uci)) throw new Error(`illegal move ${uci} in ${fen}`);
  const from = uci.slice(0, 2), to = uci.slice(2, 4), promo = uci[4];
  const piece = pos.board[sqIndex(from)]!;
  const capture = pos.board[sqIndex(to)] !== null || (piece.type === "p" && from[0] !== to[0]);

  let san: string;
  if (piece.type === "k" && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2) {
    san = to[0] === "g" ? "O-O" : "O-O-O";
  } else if (piece.type === "p") {
    san = (capture ? from[0] + "x" : "") + to + (promo ? "=" + promo.toUpperCase() : "");
  } else {
    const others = moves.filter((m) => {
      const f = m.slice(0, 2);
      return f !== from && m.slice(2, 4) === to && pos.board[sqIndex(f)]!.type === piece.type;
    }).map((m) => m.slice(0, 2));
    let dis = "";
    if (others.length) {
      if (others.every((o) => o[0] !== from[0])) dis = from[0];
      else if (others.every((o) => o[1] !== from[1])) dis = from[1];
      else dis = from;
    }
    san = piece.type.toUpperCase() + dis + (capture ? "x" : "") + to;
  }

  const next = applyMove(fen, uci);
  if (inCheck(next)) san += legalMoves(next).length === 0 ? "#" : "+";
  return san;
}
