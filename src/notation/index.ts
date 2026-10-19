import { INITIAL_FEN, applyMove, inCheck, legalMoves, positionStatus } from "../core/index.ts";
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

export function fromSAN(fen: string, san: string): Uci | null {
  const s = san.trim().replace(/[+#!?]+$/, "").replace(/0/g, "O");
  const moves = legalMoves(fen);
  let found: Uci[];
  if (s === "O-O" || s === "O-O-O") {
    const side = fen.split(" ")[1];
    const to = (s === "O-O" ? "g" : "c") + (side === "w" ? "1" : "8");
    found = moves.filter(m => m.slice(2, 4) === to && pieceAt(fen, m.slice(0, 2)).toLowerCase() === "k"
      && Math.abs(m.charCodeAt(0) - m.charCodeAt(2)) === 2);
  } else {
    const m = /^([NBRQK])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=?([NBRQ]))?$/.exec(s);
    if (!m) return null;
    const [, p, df, dr, x, to, promo] = m;
    const piece = (p ?? "P").toLowerCase();
    found = moves.filter(u => {
      const from = u.slice(0, 2);
      if (u.slice(2, 4) !== to || pieceAt(fen, from).toLowerCase() !== piece) return false;
      if (df && from[0] !== df) return false;
      if (dr && from[1] !== dr) return false;
      if ((u[4] ?? "") !== (promo ? promo.toLowerCase() : "")) return false;
      const capture = pieceAt(fen, to) !== "" || (piece === "p" && from[0] !== to[0]);
      if (!!x !== capture) return false;
      if (piece === "p" && !x && df) return false;
      return true;
    });
  }
  return found.length === 1 ? found[0] : null;
}

export interface PgnGame { startFen: string; moves: Uci[]; headers: Record<string, string> }

const ROSTER: [string, string][] = [["Event", "?"], ["Site", "?"], ["Date", "????.??.??"],
  ["Round", "?"], ["White", "?"], ["Black", "?"], ["Result", "*"]];

export function toPGN(game: PgnGame): string {
  const h = game.headers ?? {};
  const lines: string[] = [];
  const tag = (k: string, v: string) => lines.push(`[${k} "${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`);
  for (const [k, d] of ROSTER) tag(k, h[k] ?? d);
  const custom = game.startFen !== INITIAL_FEN;
  if (custom) { tag("SetUp", "1"); tag("FEN", game.startFen); }
  const roster = new Set(ROSTER.map(r => r[0]));
  for (const k of Object.keys(h)) {
    if (roster.has(k) || (custom && (k === "SetUp" || k === "FEN"))) continue;
    tag(k, h[k]);
  }
  const tokens: string[] = [];
  let fen = game.startFen;
  let white = fen.split(" ")[1] === "w";
  let num = Number(fen.split(" ")[5]) || 1;
  game.moves.forEach((m, i) => {
    if (white) tokens.push(`${num}.`);
    else if (i === 0) tokens.push(`${num}...`);
    tokens.push(toSAN(fen, m));
    fen = applyMove(fen, m);
    if (!white) num++;
    white = !white;
  });
  tokens.push(h.Result ?? "*");
  return lines.join("\n") + "\n\n" + tokens.join(" ") + "\n";
}

export function parsePGN(pgn: string): PgnGame {
  const headers: Record<string, string> = {};
  const tag = /^\s*\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]/;
  let rest = pgn.replace(/^\uFEFF/, "");
  for (;;) {
    const m = tag.exec(rest);
    if (!m) break;
    headers[m[1]] = m[2].replace(/\\(["\\])/g, "$1");
    rest = rest.slice(m[0].length);
  }
  const startFen = headers.FEN ?? INITIAL_FEN;
  const moves: Uci[] = [];
  let fen = startFen;
  let depth = 0;
  let i = 0;
  while (i < rest.length) {
    const c = rest[i];
    if (c === "{") {
      const end = rest.indexOf("}", i);
      i = end < 0 ? rest.length : end + 1;
    } else if (c === ";") {
      const end = rest.indexOf("\n", i);
      i = end < 0 ? rest.length : end + 1;
    } else if (c === "(") {
      depth++;
      i++;
    } else if (c === ")") {
      if (depth > 0) depth--;
      i++;
    } else if (/\s/.test(c)) {
      i++;
    } else {
      let j = i;
      while (j < rest.length && !/[\s{};()]/.test(rest[j])) j++;
      const tok = rest.slice(i, j);
      i = j;
      if (depth > 0) continue;
      if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) break;
      if (tok.startsWith("$")) continue;
      const san = tok.replace(/^\d+\.*/, "");
      if (!san) continue;
      const uci = fromSAN(fen, san);
      if (!uci) throw new Error(`Illegal or unreadable move in PGN: ${tok}`);
      moves.push(uci);
      fen = applyMove(fen, uci);
    }
  }
  return { startFen, moves, headers };
}
