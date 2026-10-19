import type { Color, EndReason, Result, Square, Uci } from "./types.ts";

export const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Board: 64 squares, index = rank * 8 + file (a1 = 0, h8 = 63).
// Pieces: 1..6 = p n b r q k, positive for White, negative for Black, 0 empty.
const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
const CH = " pnbrqk";
const WK = 1, WQ = 2, BK = 4, BQ = 8;

interface State {
  b: Int8Array;
  turn: 1 | -1;
  castle: number;
  ep: number; // -1 or the square behind a pawn that just double-pushed
  half: number;
  full: number;
}

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const sqName = (s: number): Square => "abcdefgh"[s & 7] + ((s >> 3) + 1);
const sqIndex = (name: string): number => {
  if (!/^[a-h][1-8]$/.test(name)) return -1;
  return (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);
};

// Parses the six fields without validating chess rules; returns null on a malformed string.
function parse(fen: string): State | null {
  if (typeof fen !== "string") return null;
  const f = fen.split(" ");
  if (f.length !== 6) return null;
  const rows = f[0].split("/");
  if (rows.length !== 8) return null;
  const b = new Int8Array(64);
  for (let i = 0; i < 8; i++) {
    const rank = 7 - i;
    let file = 0;
    for (const c of rows[i]) {
      if (c >= "1" && c <= "8") file += +c;
      else {
        const t = CH.indexOf(c.toLowerCase());
        if (t < 1 || !/[a-zA-Z]/.test(c) || file > 7) return null;
        b[rank * 8 + file] = c === c.toLowerCase() ? -t : t;
        file++;
      }
    }
    if (file !== 8) return null;
  }
  if (f[1] !== "w" && f[1] !== "b") return null;
  if (!/^(-|K?Q?k?q?)$/.test(f[2]) || f[2] === "") return null;
  let castle = 0;
  if (f[2].includes("K")) castle |= WK;
  if (f[2].includes("Q")) castle |= WQ;
  if (f[2].includes("k")) castle |= BK;
  if (f[2].includes("q")) castle |= BQ;
  let ep = -1;
  if (f[3] !== "-") {
    ep = sqIndex(f[3]);
    if (ep < 0) return null;
  }
  if (!/^\d+$/.test(f[4]) || !/^\d+$/.test(f[5])) return null;
  return { b, turn: f[1] === "w" ? 1 : -1, castle, ep, half: +f[4], full: +f[5] };
}

function placement(b: Int8Array): string {
  let out = "";
  for (let rank = 7; rank >= 0; rank--) {
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const p = b[rank * 8 + file];
      if (!p) { empty++; continue; }
      if (empty) { out += empty; empty = 0; }
      const c = CH[Math.abs(p)];
      out += p > 0 ? c.toUpperCase() : c;
    }
    if (empty) out += empty;
    if (rank) out += "/";
  }
  return out;
}

function castleStr(c: number): string {
  return (c & WK ? "K" : "") + (c & WQ ? "Q" : "") + (c & BK ? "k" : "") + (c & BQ ? "q" : "") || "-";
}

function toFEN(s: State, ep: number): string {
  return `${placement(s.b)} ${s.turn === 1 ? "w" : "b"} ${castleStr(s.castle)} ${ep < 0 ? "-" : sqName(ep)} ${s.half} ${s.full}`;
}

function attacked(b: Int8Array, sq: number, by: 1 | -1): boolean {
  const r = sq >> 3, f = sq & 7;
  // pawns: a pawn of colour `by` attacks upward if white, so it sits one rank below sq
  const pr = r - by;
  if (pr >= 0 && pr < 8) {
    if (f > 0 && b[pr * 8 + f - 1] === by * P) return true;
    if (f < 7 && b[pr * 8 + f + 1] === by * P) return true;
  }
  for (const [dr, df] of KNIGHT) {
    const rr = r + dr, ff = f + df;
    if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && b[rr * 8 + ff] === by * N) return true;
  }
  for (const [dr, df] of KING) {
    const rr = r + dr, ff = f + df;
    if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && b[rr * 8 + ff] === by * K) return true;
  }
  for (const [dr, df] of DIAG) {
    for (let rr = r + dr, ff = f + df; rr >= 0 && rr < 8 && ff >= 0 && ff < 8; rr += dr, ff += df) {
      const p = b[rr * 8 + ff];
      if (p) { if (p === by * B || p === by * Q) return true; break; }
    }
  }
  for (const [dr, df] of ORTH) {
    for (let rr = r + dr, ff = f + df; rr >= 0 && rr < 8 && ff >= 0 && ff < 8; rr += dr, ff += df) {
      const p = b[rr * 8 + ff];
      if (p) { if (p === by * R || p === by * Q) return true; break; }
    }
  }
  return false;
}

const kingSquare = (b: Int8Array, c: 1 | -1) => b.indexOf(c * K);
const inCheckS = (s: State) => {
  const k = kingSquare(s.b, s.turn);
  return k >= 0 && attacked(s.b, k, (-s.turn) as 1 | -1);
};

// A move is [from, to, promotionType (0 if none)].
type Move = [number, number, number];

function pseudoMoves(s: State): Move[] {
  const { b, turn } = s;
  const out: Move[] = [];
  const add = (from: number, to: number) => out.push([from, to, 0]);
  for (let from = 0; from < 64; from++) {
    const p = b[from] * turn;
    if (p <= 0) continue;
    const r = from >> 3, f = from & 7;
    if (p === P) {
      const lastRank = turn === 1 ? 6 : 1;
      const startRank = turn === 1 ? 1 : 6;
      const push = (to: number) => {
        if (r === lastRank) for (const pr of [Q, R, B, N]) out.push([from, to, pr]);
        else add(from, to);
      };
      const one = from + 8 * turn;
      if (!b[one]) {
        push(one);
        if (r === startRank && !b[one + 8 * turn]) add(from, one + 8 * turn);
      }
      for (const df of [-1, 1]) {
        if (f + df < 0 || f + df > 7) continue;
        const to = one + df;
        if (b[to] * turn < 0) push(to);
        else if (to === s.ep && !b[to]) add(from, to);
      }
    } else if (p === N || p === K) {
      for (const [dr, df] of p === N ? KNIGHT : KING) {
        const rr = r + dr, ff = f + df;
        if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
        if (b[rr * 8 + ff] * turn <= 0) add(from, rr * 8 + ff);
      }
      if (p === K) {
        const home = turn === 1 ? 4 : 60;
        if (from === home && !attacked(b, home, (-turn) as 1 | -1)) {
          const opp = (-turn) as 1 | -1;
          const ks = turn === 1 ? WK : BK, qs = turn === 1 ? WQ : BQ;
          if (s.castle & ks && b[home + 3] === turn * R && !b[home + 1] && !b[home + 2]
            && !attacked(b, home + 1, opp)) add(from, home + 2);
          if (s.castle & qs && b[home - 4] === turn * R && !b[home - 1] && !b[home - 2] && !b[home - 3]
            && !attacked(b, home - 1, opp)) add(from, home - 2);
        }
      }
    } else {
      const dirs = p === B ? DIAG : p === R ? ORTH : [...DIAG, ...ORTH];
      for (const [dr, df] of dirs) {
        for (let rr = r + dr, ff = f + df; rr >= 0 && rr < 8 && ff >= 0 && ff < 8; rr += dr, ff += df) {
          const t = b[rr * 8 + ff];
          if (t * turn <= 0) add(from, rr * 8 + ff);
          if (t) break;
        }
      }
    }
  }
  return out;
}

function make(s: State, m: Move): State {
  const b = Int8Array.from(s.b);
  const [from, to, promo] = m;
  const piece = b[from];
  const type = Math.abs(piece);
  const captured = b[to];
  let ep = -1;
  b[to] = promo ? s.turn * promo : piece;
  b[from] = 0;
  if (type === P && to === s.ep && !captured && (from & 7) !== (to & 7)) b[to - 8 * s.turn] = 0;
  if (type === P && Math.abs(to - from) === 16) ep = (from + to) >> 1;
  if (type === K && Math.abs(to - from) === 2) {
    if (to > from) { b[from + 1] = b[from + 3]; b[from + 3] = 0; }
    else { b[from - 1] = b[from - 4]; b[from - 4] = 0; }
  }
  let castle = s.castle;
  const strip = (sq: number) => {
    if (sq === 4) castle &= ~(WK | WQ);
    else if (sq === 0) castle &= ~WQ;
    else if (sq === 7) castle &= ~WK;
    else if (sq === 60) castle &= ~(BK | BQ);
    else if (sq === 56) castle &= ~BQ;
    else if (sq === 63) castle &= ~BK;
  };
  strip(from);
  strip(to);
  const ep2 = type === P && to === s.ep && !captured && (from & 7) !== (to & 7);
  return {
    b, turn: (-s.turn) as 1 | -1, castle, ep,
    half: type === P || captured || ep2 ? 0 : s.half + 1,
    full: s.full + (s.turn === -1 ? 1 : 0),
  };
}

function legal(s: State): Array<[Move, State]> {
  const out: Array<[Move, State]> = [];
  for (const m of pseudoMoves(s)) {
    const n = make(s, m);
    const k = kingSquare(n.b, s.turn);
    if (k >= 0 && attacked(n.b, k, n.turn)) continue;
    out.push([m, n]);
  }
  return out;
}

const uci = (m: Move) => sqName(m[0]) + sqName(m[1]) + (m[2] ? CH[m[2]] : "");

// An en passant square only counts if a legal capture onto it exists.
function epCapturable(s: State): boolean {
  if (s.ep < 0) return false;
  const k = kingSquare(s.b, s.turn);
  for (const m of pseudoMoves(s)) {
    if (m[1] !== s.ep || Math.abs(s.b[m[0]]) !== P || (m[0] & 7) === (m[1] & 7)) continue;
    const n = make(s, m);
    if (k >= 0 && !attacked(n.b, kingSquare(n.b, s.turn), n.turn)) return true;
  }
  return false;
}

function validState(s: State): boolean {
  const b = s.b;
  const count = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // index: type + (black ? 6 : 0)
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p) continue;
    if (Math.abs(p) === P && (i < 8 || i >= 56)) return false;
    count[Math.abs(p) + (p < 0 ? 6 : 0)]++;
  }
  for (const o of [0, 6]) {
    if (count[K + o] !== 1 || count[P + o] > 8) return false;
    let total = 0;
    for (let t = 1; t <= 6; t++) total += count[t + o];
    if (total > 16) return false;
  }
  const other = (-s.turn) as 1 | -1;
  if (attacked(b, kingSquare(b, other), s.turn)) return false;
  if (s.castle & WK && !(b[4] === K && b[7] === R)) return false;
  if (s.castle & WQ && !(b[4] === K && b[0] === R)) return false;
  if (s.castle & BK && !(b[60] === -K && b[63] === -R)) return false;
  if (s.castle & BQ && !(b[60] === -K && b[56] === -R)) return false;
  if (s.half < 0 || s.full < 1) return false;
  if (s.ep >= 0) {
    // White to move => Black just pushed: ep on rank 6, pawn on rank 5, origin on rank 7.
    const r = s.ep >> 3;
    if (r !== (s.turn === 1 ? 5 : 2)) return false;
    const pawn = s.ep - 8 * s.turn, origin = s.ep + 8 * s.turn;
    if (b[s.ep] || b[origin] || b[pawn] !== other * P) return false;
  }
  return true;
}

function must(fen: string): State {
  const s = parse(fen);
  if (!s || !validState(s)) throw new Error(`Invalid FEN: ${fen}`);
  return s;
}

export function isValidFEN(fen: string): boolean {
  try {
    const s = parse(fen);
    return !!s && validState(s);
  } catch {
    return false;
  }
}

export function normalizeFEN(fen: string): string {
  const s = must(fen);
  return toFEN(s, epCapturable(s) ? s.ep : -1);
}

export function legalMoves(fen: string): Uci[] {
  const s = parse(fen);
  if (!s) throw new Error(`Invalid FEN: ${fen}`);
  return legal(s).map(([m]) => uci(m));
}

export function applyMove(fen: string, move: Uci): string {
  const s = must(fen);
  for (const [m, n] of legal(s)) {
    if (uci(m) === move) return toFEN(n, epCapturable(n) ? n.ep : -1);
  }
  throw new Error(`Illegal move ${move} in ${fen}`);
}

export function inCheck(fen: string): boolean {
  const s = parse(fen);
  if (!s) throw new Error(`Invalid FEN: ${fen}`);
  return inCheckS(s);
}

function perftS(s: State, depth: number): number {
  if (depth === 0) return 1;
  const moves = legal(s);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const [, next] of moves) n += perftS(next, depth - 1);
  return n;
}

export function perft(fen: string, depth: number): number {
  const s = parse(fen);
  if (!s) throw new Error(`Invalid FEN: ${fen}`);
  return perftS(s, depth);
}

export function premoveTargets(fen: string, square: Square): Square[] {
  const s = parse(fen);
  const from = sqIndex(square);
  if (!s || from < 0 || !s.b[from]) return [];
  const piece = s.b[from], type = Math.abs(piece), color = piece > 0 ? 1 : -1;
  const r = from >> 3, f = from & 7;
  const out: number[] = [];
  const inside = (rr: number, ff: number) => rr >= 0 && rr < 8 && ff >= 0 && ff < 8;
  if (type === P) {
    const fr = r + color;
    if (fr >= 0 && fr < 8) {
      out.push(fr * 8 + f);
      if (r === (color === 1 ? 1 : 6)) out.push((r + 2 * color) * 8 + f);
      for (const df of [-1, 1]) if (inside(fr, f + df)) out.push(fr * 8 + f + df);
    }
  } else if (type === N || type === K) {
    for (const [dr, df] of type === N ? KNIGHT : KING) if (inside(r + dr, f + df)) out.push((r + dr) * 8 + f + df);
    if (type === K) {
      const home = color === 1 ? 4 : 60;
      if (from === home) {
        if (s.castle & (color === 1 ? WK : BK)) out.push(home + 2);
        if (s.castle & (color === 1 ? WQ : BQ)) out.push(home - 2);
      }
    }
  } else {
    const dirs = type === B ? DIAG : type === R ? ORTH : [...DIAG, ...ORTH];
    for (const [dr, df] of dirs) {
      for (let rr = r + dr, ff = f + df; inside(rr, ff); rr += dr, ff += df) out.push(rr * 8 + ff);
    }
  }
  return out.map(sqName);
}

// --- Material helpers -------------------------------------------------------

const isLight = (sq: number) => ((sq >> 3) + (sq & 7)) % 2 === 1;

function insufficient(b: Int8Array): boolean {
  let knights = 0, bishops = 0, lightB = 0, darkB = 0;
  for (let i = 0; i < 64; i++) {
    const t = Math.abs(b[i]);
    if (t === P || t === R || t === Q) return false;
    if (t === N) knights++;
    if (t === B) { bishops++; if (isLight(i)) lightB++; else darkB++; }
  }
  if (knights === 0) return bishops === 0 || lightB === 0 || darkB === 0;
  return knights === 1 && bishops === 0;
}

export interface Status { over: boolean; result: Result; reason?: EndReason }

function statusOf(s: State): Status | null {
  if (!legal(s).length) {
    if (inCheckS(s)) return { over: true, result: s.turn === 1 ? "0-1" : "1-0", reason: "checkmate" };
    return { over: true, result: "1/2-1/2", reason: "stalemate" };
  }
  if (insufficient(s.b)) return { over: true, result: "1/2-1/2", reason: "insufficient-material" };
  return null;
}

export function positionStatus(fen: string): Status {
  const s = must(fen);
  const st = statusOf(s);
  if (st) return st;
  if (s.half >= 100) return { over: true, result: "1/2-1/2", reason: "fifty-move-rule" };
  return { over: false, result: "*" };
}

export function gameStatus(startFen: string, moves: Uci[]): Status {
  let fen = normalizeFEN(startFen);
  const key = (x: string) => x.split(" ").slice(0, 4).join(" ");
  const seen = new Map<string, number>([[key(fen), 1]]);
  for (const m of moves) {
    fen = applyMove(fen, m);
    seen.set(key(fen), (seen.get(key(fen)) ?? 0) + 1);
  }
  const s = must(fen);
  const st = statusOf(s);
  if (st) return st;
  if ((seen.get(key(fen)) ?? 0) >= 3) return { over: true, result: "1/2-1/2", reason: "threefold-repetition" };
  if (s.half >= 100) return { over: true, result: "1/2-1/2", reason: "fifty-move-rule" };
  return { over: false, result: "*" };
}

export function timeoutResult(fen: string, flagged: Color):
  { result: "1-0" | "0-1" | "1/2-1/2"; reason: "timeout" | "timeout-vs-insufficient-material" } {
  const b = must(fen).b;
  const opp = flagged === "w" ? -1 : 1;
  const win = { result: (opp === 1 ? "1-0" : "0-1") as "1-0" | "0-1", reason: "timeout" as const };
  const draw = { result: "1/2-1/2" as const, reason: "timeout-vs-insufficient-material" as const };
  let oppKnights = 0, oppOther = false, oppBishops = 0, flaggedHasMore = false;
  let pawnsOrKnights = false, light = 0, dark = 0;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p) continue;
    const t = Math.abs(p);
    if (t === P || t === N) pawnsOrKnights = true;
    if (t === B) { if (isLight(i)) light++; else dark++; }
    if (p * opp > 0) {
      if (t === N) oppKnights++;
      else if (t === B) oppBishops++;
      else if (t !== K) oppOther = true;
    } else if (t !== K && t !== Q) flaggedHasMore = true;
  }
  if (oppOther) return win;
  if (oppKnights === 0 && oppBishops === 0) return draw;
  if (oppKnights === 1 && oppBishops === 0) return flaggedHasMore ? win : draw;
  if (oppKnights === 0 && !pawnsOrKnights && (light === 0 || dark === 0)) return draw;
  return win;
}
