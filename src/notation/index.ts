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

/**
 * Parses SAN into a UCI move. Tolerates a missing or extra +/#, `0-0`, and !/? annotations.
 * Returns null if the move is illegal or ambiguous.
 */
export function fromSAN(fen: string, san: string): string | null {
  const pos = parseFEN(fen);
  if (!pos) return null;
  const text = san.trim().replace(/[!?]+$/, "").replace(/[+#]+$/, "").replace(/0/g, "O");
  const moves = legalMoves(fen);
  const castle = /^O-O(-O)?$/.exec(text);
  if (castle) {
    const found = moves.filter((u) => {
      const p = pos.board[sqIndex(u.slice(0, 2))]!;
      return p.type === "k" && u[2] === (castle[1] ? "c" : "g") &&
        Math.abs(u.charCodeAt(0) - u.charCodeAt(2)) === 2;
    });
    return found.length === 1 ? found[0] : null;
  }
  const m = /^([NBRQK])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=?([NBRQ]))?$/.exec(text);
  if (!m) return null;
  const [, pc, file, rank, x, to, promo] = m;
  const type = (pc ?? "P").toLowerCase();
  const found = moves.filter((u) => {
    const from = u.slice(0, 2);
    const piece = pos.board[sqIndex(from)]!;
    if (piece.type !== type || u.slice(2, 4) !== to) return false;
    if (file && from[0] !== file) return false;
    if (rank && from[1] !== rank) return false;
    const capture = pos.board[sqIndex(to)] !== null || (type === "p" && from[0] !== to[0]);
    if (!!x !== capture) return false;
    return (u[4] ?? "") === (promo ?? "").toLowerCase();
  });
  return found.length === 1 ? found[0] : null;
}

const INITIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const ROSTER = ["Event", "Site", "Date", "Round", "White", "Black", "Result"];
const ROSTER_DEFAULT: Record<string, string> = { Date: "????.??.??", Result: "*" };

export function toPGN(game: { startFen: string; moves: string[]; headers: Record<string, string> }): string {
  const h = game.headers ?? {};
  const tag = (k: string, v: string) => `[${k} "${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
  const lines = ROSTER.map((k) => tag(k, h[k] ?? ROSTER_DEFAULT[k] ?? "?"));
  if (game.startFen !== INITIAL) {
    lines.push(tag("SetUp", "1"), tag("FEN", game.startFen));
  }
  for (const k of Object.keys(h)) {
    if (!ROSTER.includes(k) && k !== "SetUp" && k !== "FEN") lines.push(tag(k, h[k]));
  }
  const fields = game.startFen.split(" ");
  let black = fields[1] === "b";
  let num = Number(fields[5]) || 1;
  const tokens: string[] = [];
  let fen = game.startFen;
  game.moves.forEach((uci, i) => {
    if (!black) tokens.push(`${num}.`);
    else if (i === 0) tokens.push(`${num}...`);
    tokens.push(toSAN(fen, uci));
    fen = applyMove(fen, uci);
    if (black) num++;
    black = !black;
  });
  tokens.push(h.Result ?? "*");
  return `${lines.join("\n")}\n\n${tokens.join(" ")}\n`;
}
