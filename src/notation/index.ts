import { applyMove, inCheck, legalMoves, positionStatus } from "../core/index.ts";
import type { Uci } from "../core/types.ts";

function pieceAt(fen: string, sq: string): string {
  const rows = fen.split(" ")[0].split("/");
  const row = rows[8 - Number(sq[1])];
  let file = 0;
  for (const c of row) {
    if (/\d/.test(c)) file += Number(c);
    else {
      if (file === sq.charCodeAt(0) - 97) return c;
      file++;
    }
  }
  return "";
}

export function toSAN(fen: string, uci: Uci): string {
  const moves = legalMoves(fen);
  if (!moves.includes(uci)) throw new Error(`illegal move ${uci} in ${fen}`);
  const from = uci.slice(0, 2), to = uci.slice(2, 4), promo = uci[4];
  const piece = pieceAt(fen, from).toLowerCase();
  const target = pieceAt(fen, to);
  let san: string;
  if (piece === "k" && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2) {
    san = to[0] === "g" ? "O-O" : "O-O-O";
  } else {
    const capture = target !== "" || (piece === "p" && from[0] !== to[0]);
    if (piece === "p") {
      san = (capture ? from[0] + "x" : "") + to;
      if (promo) san += "=" + promo.toUpperCase();
    } else {
      const rivals = moves.filter(m => m !== uci && m.slice(2, 4) === to
        && pieceAt(fen, m.slice(0, 2)).toLowerCase() === piece);
      let dis = "";
      if (rivals.length) {
        if (rivals.every(m => m[0] !== from[0])) dis = from[0];
        else if (rivals.every(m => m[1] !== from[1])) dis = from[1];
        else dis = from;
      }
      san = piece.toUpperCase() + dis + (capture ? "x" : "") + to;
    }
  }
  const next = applyMove(fen, uci);
  if (inCheck(next)) san += positionStatus(next).reason === "checkmate" ? "#" : "+";
  return san;
}
