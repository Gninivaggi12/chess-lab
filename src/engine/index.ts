// Computer opponent. Self-contained mailbox engine (make/unmake, alpha-beta) so it is fast
// enough; it only exchanges FEN strings and UCI moves with the rest of the app.
import type { Uci } from "../core/types.ts";

// ---- board: index 0 = a8 … 63 = h1; piece = color(+1 white, -1 black) * type(1 p,2 n,3 b,4 r,5 q,6 k)
const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
const MATE = 30000;
const sqName = (i: number) => "abcdefgh"[i & 7] + (8 - (i >> 3));

const KNIGHT_T: number[][] = [], KING_T: number[][] = [];
const RAYS: number[][][] = []; // [sq][dir 0-3 ortho, 4-7 diag] → squares along the ray
const PAWN_ATT: number[][][] = [[], []]; // [0 = white, 1 = black][sq]
{
  const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let s = 0; s < 64; s++) {
    const f = s & 7, r = s >> 3;
    const at = (df: number, dr: number) => { const x = f + df, y = r + dr; return x < 0 || x > 7 || y < 0 || y > 7 ? -1 : y * 8 + x; };
    KNIGHT_T[s] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]].map(([a, b]) => at(a, b)).filter((x) => x >= 0);
    KING_T[s] = [...ORTHO, ...DIAG].map(([a, b]) => at(a, b)).filter((x) => x >= 0);
    RAYS[s] = [...ORTHO, ...DIAG].map(([a, b]) => {
      const out: number[] = [];
      for (let k = 1; at(a * k, b * k) >= 0; k++) out.push(at(a * k, b * k));
      return out;
    });
    PAWN_ATT[0][s] = [at(-1, -1), at(1, -1)].filter((x) => x >= 0);
    PAWN_ATT[1][s] = [at(-1, 1), at(1, 1)].filter((x) => x >= 0);
  }
}

// ---- zobrist (seeded, so hashes and therefore results are reproducible)
let seed = 0x9e3779b9;
const rnd32 = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (t ^ (t >>> 14)) | 0;
};
const Z1 = new Int32Array(13 * 64), Z2 = new Int32Array(13 * 64);
const ZC1 = new Int32Array(16), ZC2 = new Int32Array(16), ZE1 = new Int32Array(8), ZE2 = new Int32Array(8);
for (let i = 0; i < Z1.length; i++) { Z1[i] = rnd32(); Z2[i] = rnd32(); }
for (let i = 0; i < 16; i++) { ZC1[i] = rnd32(); ZC2[i] = rnd32(); }
for (let i = 0; i < 8; i++) { ZE1[i] = rnd32(); ZE2[i] = rnd32(); }
const ZS1 = rnd32(), ZS2 = rnd32();

// ---- evaluation tables (simplified evaluation function; white's view, a8 first)
const VAL = [0, 100, 320, 330, 500, 900, 0];
const PST: number[][] = [[],
  [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
];
const KING_EG = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];
const PASSED = [0, 0, 10, 20, 35, 60, 100, 0]; // by pawns' progress (rank from own side)

// ---- position state
const board = new Int8Array(64);
let side = 1, castling = 0, ep = -1, halfmove = 0, h1 = 0, h2 = 0, kingSq = [0, 0, 0]; // kingSq[1] white, kingSq[2] black → index (side===1?1:2)
const ki = (c: number) => (c === 1 ? 1 : 2);

// undo stack
const U_CAP = new Int8Array(1024), U_CAS = new Int8Array(1024), U_EP = new Int8Array(1024), U_HM = new Int16Array(1024);
const U_H1 = new Int32Array(1024), U_H2 = new Int32Array(1024);
let sp = 0;

const CMASK = new Int8Array(64).fill(15);
CMASK[60] = 15 & ~3; CMASK[63] = 15 & ~1; CMASK[56] = 15 & ~2;
CMASK[4] = 15 & ~12; CMASK[7] = 15 & ~4; CMASK[0] = 15 & ~8;

const zp = (p: number, s: number) => { const i = (p + 6) * 64 + s; h1 ^= Z1[i]; h2 ^= Z2[i]; };

function load(fen: string): void {
  const f = fen.trim().split(/\s+/);
  if (f.length < 4) throw new Error("bad FEN");
  board.fill(0);
  let s = 0;
  for (const ch of f[0]) {
    if (ch === "/") continue;
    if (ch >= "1" && ch <= "8") { s += Number(ch); continue; }
    const t = "pnbrqk".indexOf(ch.toLowerCase()) + 1;
    if (!t || s > 63) throw new Error("bad FEN");
    board[s] = ch === ch.toLowerCase() ? -t : t;
    if (t === K) kingSq[ki(ch === ch.toLowerCase() ? -1 : 1)] = s;
    s++;
  }
  side = f[1] === "w" ? 1 : -1;
  castling = (f[2].includes("K") ? 1 : 0) | (f[2].includes("Q") ? 2 : 0) | (f[2].includes("k") ? 4 : 0) | (f[2].includes("q") ? 8 : 0);
  ep = f[3] === "-" ? -1 : f[3].charCodeAt(0) - 97 + (8 - Number(f[3][1])) * 8;
  halfmove = Number(f[4] ?? 0) || 0;
  sp = 0; h1 = 0; h2 = 0;
  for (let i = 0; i < 64; i++) if (board[i]) zp(board[i], i);
  h1 ^= ZC1[castling]; h2 ^= ZC2[castling];
  if (ep >= 0) { h1 ^= ZE1[ep & 7]; h2 ^= ZE2[ep & 7]; }
  if (side === -1) { h1 ^= ZS1; h2 ^= ZS2; }
}

function attacked(sq: number, by: number): boolean {
  if (by === 1) { for (const s of PAWN_ATT[1][sq]) if (board[s] === P) return true; }
  else for (const s of PAWN_ATT[0][sq]) if (board[s] === -P) return true;
  for (const s of KNIGHT_T[sq]) if (board[s] === by * N) return true;
  for (const s of KING_T[sq]) if (board[s] === by * K) return true;
  const rays = RAYS[sq];
  for (let d = 0; d < 8; d++) {
    const ray = rays[d];
    for (let i = 0; i < ray.length; i++) {
      const p = board[ray[i]];
      if (p) {
        if (p * by > 0) { const t = p * by; if (t === Q || t === (d < 4 ? R : B)) return true; }
        break;
      }
    }
  }
  return false;
}

// move = from | to << 6 | promo << 12 | flag << 15   (flag 1 ep, 2 castle, 3 double push)
const mk = (f: number, t: number, promo = 0, flag = 0) => f | (t << 6) | (promo << 12) | (flag << 15);

const MOVES = new Int32Array(128 * 256), SCORES = new Int32Array(128 * 256);

function gen(ply: number, capsOnly: boolean): number {
  const base = ply * 256;
  let n = base;
  const me = side;
  for (let from = 0; from < 64; from++) {
    const p = board[from] * me;
    if (p <= 0) continue;
    if (p === P) {
      const fwd = me === 1 ? -8 : 8, promoRank = me === 1 ? 1 : 6, startRank = me === 1 ? 6 : 1;
      const r = from >> 3;
      const one = from + fwd;
      if (board[one] === 0) {
        if (r === promoRank) { MOVES[n++] = mk(from, one, Q); if (!capsOnly) { MOVES[n++] = mk(from, one, R); MOVES[n++] = mk(from, one, B); MOVES[n++] = mk(from, one, N); } }
        else if (!capsOnly) {
          MOVES[n++] = mk(from, one);
          if (r === startRank && board[one + fwd] === 0) MOVES[n++] = mk(from, one + fwd, 0, 3);
        }
      }
      for (const t of PAWN_ATT[me === 1 ? 0 : 1][from]) {
        const c = board[t] * me;
        if (c < 0) {
          if (r === promoRank) { MOVES[n++] = mk(from, t, Q); MOVES[n++] = mk(from, t, R); MOVES[n++] = mk(from, t, B); MOVES[n++] = mk(from, t, N); }
          else MOVES[n++] = mk(from, t);
        } else if (t === ep && c === 0) MOVES[n++] = mk(from, t, 0, 1);
      }
    } else if (p === N || p === K) {
      for (const t of p === N ? KNIGHT_T[from] : KING_T[from]) {
        const c = board[t] * me;
        if (c > 0) continue;
        if (c < 0 || !capsOnly) MOVES[n++] = mk(from, t);
      }
      if (p === K && !capsOnly) {
        const home = me === 1 ? 60 : 4, rights = me === 1 ? castling & 3 : castling >> 2;
        if (from === home && rights && !attacked(home, -me)) {
          if ((rights & 1) && board[home + 1] === 0 && board[home + 2] === 0 && board[home + 3] === me * R
            && !attacked(home + 1, -me) && !attacked(home + 2, -me)) MOVES[n++] = mk(from, home + 2, 0, 2);
          if ((rights & 2) && board[home - 1] === 0 && board[home - 2] === 0 && board[home - 3] === 0 && board[home - 4] === me * R
            && !attacked(home - 1, -me) && !attacked(home - 2, -me)) MOVES[n++] = mk(from, home - 2, 0, 2);
        }
      }
    } else {
      const rays = RAYS[from];
      for (let d = p === R ? 0 : p === B ? 4 : 0, e = p === R ? 4 : p === B ? 8 : 8; d < e; d++) {
        const ray = rays[d];
        for (let i = 0; i < ray.length; i++) {
          const t = ray[i], c = board[t] * me;
          if (c > 0) break;
          if (c < 0) { MOVES[n++] = mk(from, t); break; }
          if (!capsOnly) MOVES[n++] = mk(from, t);
        }
      }
    }
  }
  return n;
}

function make(m: number): boolean {
  const from = m & 63, to = (m >> 6) & 63, promo = (m >> 12) & 7, flag = m >> 15;
  const piece = board[from], me = side;
  U_CAS[sp] = castling; U_EP[sp] = ep; U_HM[sp] = halfmove; U_H1[sp] = h1; U_H2[sp] = h2;
  let cap = board[to];
  h1 ^= ZC1[castling]; h2 ^= ZC2[castling];
  if (ep >= 0) { h1 ^= ZE1[ep & 7]; h2 ^= ZE2[ep & 7]; }
  if (flag === 1) { const cs = to + (me === 1 ? 8 : -8); cap = board[cs]; zp(cap, cs); board[cs] = 0; }
  else if (cap) zp(cap, to);
  U_CAP[sp++] = cap;
  zp(piece, from); board[from] = 0;
  const placed = promo ? me * promo : piece;
  board[to] = placed; zp(placed, to);
  if (flag === 2) {
    const [rf, rt] = to === 62 ? [63, 61] : to === 58 ? [56, 59] : to === 6 ? [7, 5] : [0, 3];
    const rook = board[rf]; zp(rook, rf); board[rf] = 0; board[rt] = rook; zp(rook, rt);
  }
  if (piece * me === K) kingSq[ki(me)] = to;
  castling &= CMASK[from] & CMASK[to];
  ep = flag === 3 ? (from + to) >> 1 : -1;
  halfmove = piece * me === P || cap ? 0 : halfmove + 1;
  h1 ^= ZC1[castling]; h2 ^= ZC2[castling];
  if (ep >= 0) { h1 ^= ZE1[ep & 7]; h2 ^= ZE2[ep & 7]; }
  h1 ^= ZS1; h2 ^= ZS2;
  side = -me;
  if (attacked(kingSq[ki(me)], -me)) { unmake(m); return false; }
  return true;
}

function unmake(m: number): void {
  const from = m & 63, to = (m >> 6) & 63, promo = (m >> 12) & 7, flag = m >> 15;
  side = -side;
  const me = side;
  sp--;
  const cap = U_CAP[sp];
  board[from] = promo ? me * P : board[to];
  if (flag === 1) { board[to] = 0; board[to + (me === 1 ? 8 : -8)] = cap; }
  else board[to] = cap;
  if (flag === 2) {
    const [rf, rt] = to === 62 ? [63, 61] : to === 58 ? [56, 59] : to === 6 ? [7, 5] : [0, 3];
    board[rf] = board[rt]; board[rt] = 0;
  }
  if (board[from] * me === K) kingSq[ki(me)] = from;
  castling = U_CAS[sp]; ep = U_EP[sp]; halfmove = U_HM[sp]; h1 = U_H1[sp]; h2 = U_H2[sp];
}

function makeNull(): void {
  U_EP[sp] = ep; U_HM[sp] = halfmove; U_H1[sp] = h1; U_H2[sp] = h2; U_CAS[sp] = castling; U_CAP[sp++] = 0;
  if (ep >= 0) { h1 ^= ZE1[ep & 7]; h2 ^= ZE2[ep & 7]; }
  ep = -1; halfmove++; side = -side; h1 ^= ZS1; h2 ^= ZS2;
}
function unmakeNull(): void {
  sp--; side = -side; ep = U_EP[sp]; halfmove = U_HM[sp]; h1 = U_H1[sp]; h2 = U_H2[sp];
}

function evaluate(): number {
  let score = 0, npm = 0, bw = 0, bb = 0;
  const wp: number[] = [], bp: number[] = [];
  const wFile = [0, 0, 0, 0, 0, 0, 0, 0], bFile = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (!p) continue;
    const t = p > 0 ? p : -p;
    if (t === K) continue;
    if (t !== P) npm += VAL[t];
    if (p > 0) {
      score += VAL[t] + PST[t][s];
      if (t === P) { wp.push(s); wFile[s & 7]++; } else if (t === B) bw++;
    } else {
      score -= VAL[t] + PST[t][s ^ 56];
      if (t === P) { bp.push(s); bFile[s & 7]++; } else if (t === B) bb++;
    }
  }
  if (bw > 1) score += 30;
  if (bb > 1) score -= 30;
  const endgame = npm <= 2600;
  const wk = kingSq[1], bk = kingSq[2];
  if (endgame) score += KING_EG[wk] - KING_EG[bk ^ 56]; else score += PST[K][wk] - PST[K][bk ^ 56];
  for (const s of wp) {
    const f = s & 7, r = s >> 3;
    let passed = true;
    for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1) && passed; ff++) {
      for (const o of bp) if ((o & 7) === ff && (o >> 3) < r) { passed = false; break; }
    }
    if (passed) score += PASSED[7 - r];
    if (wFile[f] > 1) score -= 10;
    if ((f === 0 || !wFile[f - 1]) && (f === 7 || !wFile[f + 1])) score -= 12;
  }
  for (const s of bp) {
    const f = s & 7, r = s >> 3;
    let passed = true;
    for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1) && passed; ff++) {
      for (const o of wp) if ((o & 7) === ff && (o >> 3) > r) { passed = false; break; }
    }
    if (passed) score -= PASSED[r];
    if (bFile[f] > 1) score += 10;
    if ((f === 0 || !bFile[f - 1]) && (f === 7 || !bFile[f + 1])) score += 12;
  }
  return (side === 1 ? score : -score) + 8;
}

// ---- search
const TT_BITS = 18, TT_SIZE = 1 << TT_BITS;
const tKey = new Int32Array(TT_SIZE), tMove = new Int32Array(TT_SIZE), tScore = new Int32Array(TT_SIZE);
const tDepth = new Int8Array(TT_SIZE), tFlag = new Int8Array(TT_SIZE); // flag 0 empty, 1 exact, 2 lower, 3 upper
const killers = new Int32Array(128 * 2), history = new Int32Array(2 * 64 * 64);
const hist: number[] = []; // hashes of positions before the root, then along the search path

let nodes = 0, nodeLimit = Infinity, deadline = Infinity, stopped = false, canStop = false;

function tick(): void {
  nodes++;
  if (!canStop) return;
  if (nodes > nodeLimit) stopped = true;
  else if ((nodes & 1023) === 0 && deadline !== Infinity && performance.now() > deadline) stopped = true;
}

function isRepeat(): boolean {
  if (halfmove >= 100) return true;
  const end = hist.length - 1;
  for (let i = end - 2, k = 2; i >= 0 && k <= halfmove; i -= 2, k += 2) if (hist[i] === h1) return true;
  return false;
}

function orderScore(ply: number, n0: number, n: number, ttMove: number): void {
  for (let i = n0; i < n; i++) {
    const m = MOVES[i], from = m & 63, to = (m >> 6) & 63;
    let s: number;
    if (m === ttMove) s = 1_000_000;
    else {
      const cap = board[to] * -side, promo = (m >> 12) & 7;
      const att = Math.abs(board[from]);
      if (cap > 0 || (m >> 15) === 1) s = 100_000 + 10 * (cap > 0 ? VAL[cap] : 100) - att;
      else if (promo) s = 90_000 + promo;
      else if (m === killers[ply * 2]) s = 80_000;
      else if (m === killers[ply * 2 + 1]) s = 79_000;
      else s = history[(side === 1 ? 0 : 4096) + from * 64 + to];
    }
    SCORES[i] = s;
  }
}

function pick(i: number, n: number): void {
  let best = i;
  for (let j = i + 1; j < n; j++) if (SCORES[j] > SCORES[best]) best = j;
  if (best !== i) {
    const m = MOVES[i], s = SCORES[i];
    MOVES[i] = MOVES[best]; SCORES[i] = SCORES[best]; MOVES[best] = m; SCORES[best] = s;
  }
}

function qsearch(alpha: number, beta: number, ply: number): number {
  tick();
  if (stopped) return 0;
  const stand = evaluate();
  if (stand >= beta || ply >= 100) return stand;
  if (stand > alpha) alpha = stand;
  const n0 = ply * 256, n = gen(ply, true);
  orderScore(ply, n0, n, 0);
  for (let i = n0; i < n; i++) {
    pick(i, n);
    const m = MOVES[i];
    const cap = Math.abs(board[(m >> 6) & 63]);
    if (stand + VAL[cap] + 200 < alpha && !((m >> 12) & 7)) continue; // delta pruning
    if (!make(m)) continue;
    const sc = -qsearch(-beta, -alpha, ply + 1);
    unmake(m);
    if (stopped) return 0;
    if (sc >= beta) return sc;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}

function search(depth: number, alpha: number, beta: number, ply: number, nullOk: boolean): number {
  tick();
  if (stopped) return 0;
  if (ply > 0 && isRepeat()) return 0;
  const inChk = attacked(kingSq[ki(side)], -side);
  if (inChk) depth++;
  if (depth <= 0 || ply >= 100) return qsearch(alpha, beta, ply);

  const idx = h1 & (TT_SIZE - 1);
  let ttMove = 0;
  if (tFlag[idx] && tKey[idx] === h2) {
    ttMove = tMove[idx];
    if (tDepth[idx] >= depth && ply > 0) {
      let sc = tScore[idx];
      if (sc > MATE - 200) sc -= ply; else if (sc < -MATE + 200) sc += ply;
      const fl = tFlag[idx];
      if (fl === 1 || (fl === 2 && sc >= beta) || (fl === 3 && sc <= alpha)) return sc;
    }
  }

  const pv = beta - alpha > 1;
  if (!pv && !inChk && nullOk && depth >= 3 && ply > 0) {
    let hasPieces = false;
    for (let s = 0; s < 64; s++) { const t = board[s] * side; if (t >= N && t <= Q) { hasPieces = true; break; } }
    if (hasPieces && evaluate() >= beta) {
      makeNull(); hist.push(h1);
      const sc = -search(depth - 3, -beta, -beta + 1, ply + 1, false);
      hist.pop(); unmakeNull();
      if (stopped) return 0;
      if (sc >= beta) return sc >= MATE - 200 ? beta : sc;
    }
  }

  const n0 = ply * 256, n = gen(ply, false);
  orderScore(ply, n0, n, ttMove);
  const origAlpha = alpha;
  let best = -MATE - 1, bestMove = 0, legal = 0;
  for (let i = n0; i < n; i++) {
    pick(i, n);
    const m = MOVES[i];
    const quiet = board[(m >> 6) & 63] === 0 && !((m >> 12) & 7) && (m >> 15) !== 1;
    if (!make(m)) continue;
    legal++;
    hist.push(h1);
    let sc: number;
    if (legal === 1) sc = -search(depth - 1, -beta, -alpha, ply + 1, true);
    else {
      const red = depth >= 3 && legal > 4 && quiet && !inChk ? 1 : 0;
      sc = -search(depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
      if (sc > alpha && (red || sc < beta)) sc = -search(depth - 1, -beta, -alpha, ply + 1, true);
    }
    hist.pop();
    unmake(m);
    if (stopped) return 0;
    if (sc > best) { best = sc; bestMove = m; }
    if (sc > alpha) {
      alpha = sc;
      if (alpha >= beta) {
        if (quiet) {
          if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; }
          history[(side === 1 ? 0 : 4096) + (m & 63) * 64 + ((m >> 6) & 63)] += depth * depth;
        }
        break;
      }
    }
  }
  if (!legal) return inChk ? -MATE + ply : 0;
  const fl = best >= beta ? 2 : best > origAlpha ? 1 : 3;
  tKey[idx] = h2; tMove[idx] = bestMove; tDepth[idx] = Math.min(depth, 100); tFlag[idx] = fl;
  tScore[idx] = best > MATE - 200 ? best + ply : best < -MATE + 200 ? best - ply : best;
  return best;
}

function rootMoves(): number[] {
  const n = gen(0, false), out: number[] = [];
  for (let i = 0; i < n; i++) { const m = MOVES[i]; if (make(m)) { unmake(m); out.push(m); } }
  return out;
}

const toUci = (m: number): Uci => sqName(m & 63) + sqName((m >> 6) & 63) + ("  nbrq"[(m >> 12) & 7]).trim();

/** Score of every root move at a fixed depth (exact window per move). */
function scoreRoot(moves: number[], depth: number): number[] {
  return moves.map((m) => {
    make(m); hist.push(h1);
    const sc = -search(depth - 1, -MATE - 1, MATE + 1, 1, true);
    hist.pop(); unmake(m);
    return sc;
  });
}

/** Does the side to move have a forced mate within `plies` plies (1 or 3)? Plain search, no extensions. */
function mateIn(plies: number, ply: number): boolean {
  const n0 = ply * 256, n = gen(ply, false);
  const inChk = attacked(kingSq[ki(side)], -side);
  const list: number[] = [];
  for (let i = n0; i < n; i++) list.push(MOVES[i]);
  for (const m of list) {
    if (!make(m)) continue;
    let mated: boolean;
    if (plies === 1) mated = noReply(ply + 1);
    else mated = allRepliesLose(ply + 1);
    unmake(m);
    if (mated) return true;
  }
  void inChk;
  return false;
}
/** After our move: the opponent has no legal move and is in check. */
function noReply(ply: number): boolean {
  if (!attacked(kingSq[ki(side)], -side)) return false;
  const n0 = ply * 256, n = gen(ply, false);
  for (let i = n0; i < n; i++) { const m = MOVES[i]; if (make(m)) { unmake(m); return false; } }
  return true;
}
/** After our move: every opponent reply allows mate in 1 (and there is at least one reply). */
function allRepliesLose(ply: number): boolean {
  const n0 = ply * 256, n = gen(ply, false);
  const list: number[] = [];
  for (let i = n0; i < n; i++) list.push(MOVES[i]);
  let any = false;
  for (const m of list) {
    if (!make(m)) continue;
    any = true;
    const ok = mateIn(1, ply + 1);
    unmake(m);
    if (!ok) return false;
  }
  return any;
}

function rng(s: number): () => number {
  let a = s | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NODES = [0, 0, 0, 0, 120_000, 200_000];
const DEPTH = [0, 1, 2, 3, 6, 64];
const NOISE = [0, 0, 80, 25, 0, 0];

export function bestMove(fen: string, level: number, maxTimeMs?: number): Uci {
  const start = performance.now();
  level = Math.max(1, Math.min(5, Math.round(level) || 1));
  load(fen);
  const moves = rootMoves();
  if (!moves.length) throw new Error("no legal moves");
  if (moves.length === 1) return toUci(moves[0]);
  const rand = rng(h1 ^ Math.imul(level, 0x2545f491));
  const timed = maxTimeMs !== undefined;
  const budget = timed ? Math.max(0, maxTimeMs as number) : Infinity;
  deadline = timed ? start + Math.max(0, budget - 20) : Infinity;
  const out = (m: number) => toUci(m);

  if (level === 1) {
    if (rand() < 0.75) return out(moves[Math.floor(rand() * moves.length)]);
    nodeLimit = Infinity; canStop = false; stopped = false;
    const sc = scoreRoot(moves, 1);
    return out(moves[sc.indexOf(Math.max(...sc))]);
  }

  hist.length = 0; hist.push(h1);
  tFlag.fill(0); killers.fill(0); history.fill(0);
  stopped = false; nodes = 0;

  if (level >= 2) {
    for (const m of moves) { make(m); const mated = noReply(1); unmake(m); if (mated) return out(m); }
  }
  if (level >= 4 && (!timed || budget > 60)) {
    for (const m of moves) {
      make(m); const win = allRepliesLose(1); unmake(m);
      if (win) return out(m);
    }
  }

  if (level <= 3) {
    canStop = false; nodeLimit = Infinity;
    const sc = scoreRoot(moves, DEPTH[level]);
    let bi = 0, bs = -Infinity;
    sc.forEach((v, i) => { const w = v + (rand() * 2 - 1) * NOISE[level]; if (w > bs) { bs = w; bi = i; } });
    return out(moves[bi]);
  }

  // levels 4-5: iterative deepening on the root, limited by nodes (untimed) or by the clock
  let best = moves[0], order = moves.slice();
  if (timed) { nodeLimit = Infinity; deadline = Math.min(deadline, start + 2000); } else nodeLimit = NODES[level];
  canStop = false;
  for (let d = 1; d <= DEPTH[level]; d++) {
    canStop = d > 1;
    let alpha = -MATE - 1, iterBest = 0, iterScore = -MATE - 1;
    for (let i = 0; i < order.length; i++) {
      const m = order[i];
      make(m); hist.push(h1);
      let sc: number;
      if (i === 0) sc = -search(d - 1, -MATE - 1, -alpha, 1, true);
      else {
        sc = -search(d - 1, -alpha - 1, -alpha, 1, true);
        if (sc > alpha && !stopped) sc = -search(d - 1, -MATE - 1, -alpha, 1, true);
      }
      hist.pop(); unmake(m);
      if (stopped) break;
      if (sc > iterScore) { iterScore = sc; iterBest = m; }
      if (sc > alpha) alpha = sc;
    }
    if (stopped) break;
    best = iterBest;
    order = [iterBest, ...order.filter((m) => m !== iterBest)];
    if (iterScore > MATE - 100) break;
    if (timed && performance.now() > deadline) break;
  }
  return out(best);
}
