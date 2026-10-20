import { applyMove, gameStatus, inCheck, INITIAL_FEN, legalMoves } from "../core/index.ts";
import type { SoundKind, Uci } from "../core/types.ts";
import { toSAN } from "../notation/index.ts";
import { play, soundFor } from "../sound/index.ts";

export interface EngineLike { bestMove(fen: string, level: number, maxTimeMs?: number): Promise<Uci>; }
export interface SoundLike { play(kind: SoundKind): void; }

const MIN_THINK_MS = 600;
const GLYPHS: Record<string, string> = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };

function workerEngine(): EngineLike {
  let worker: Worker | undefined;
  let nextId = 0;
  return {
    bestMove(fen, level, maxTimeMs) {
      worker ??= new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      const w = worker;
      const id = ++nextId;
      return new Promise((resolve) => {
        const onMessage = (e: MessageEvent) => {
          if (e.data.id !== id) return;
          w.removeEventListener("message", onMessage);
          resolve(e.data.move);
        };
        w.addEventListener("message", onMessage);
        w.postMessage({ id, fen, level, maxTimeMs });
      });
    },
  };
}

function statusText(startFen: string, moves: string[], fen: string): { text: string; over: boolean } {
  const s = gameStatus(startFen, moves);
  if (!s.over) return { text: fen.split(" ")[1] === "w" ? "White to move" : "Black to move", over: false };
  const draw: Record<string, string> = {
    stalemate: "stalemate",
    "insufficient-material": "insufficient material",
    "threefold-repetition": "threefold repetition",
    "fifty-move-rule": "fifty-move rule",
  };
  if (s.reason === "checkmate") return { text: `Checkmate · ${s.result === "1-0" ? "White" : "Black"} wins`, over: true };
  return { text: `Draw · ${draw[s.reason!]}`, over: true };
}

export function mountApp(root: HTMLElement, deps: {
  engine?: EngineLike;
  sound?: SoundLike;
  storage?: Storage;
  now?: () => number;
  random?: () => number;
} = {}): { destroy(): void } {
  const engine = deps.engine ?? workerEngine();
  const sound = deps.sound ?? { play };

  const storage = deps.storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
  const MUTE_KEY = "chess-lab:muted";
  let muted = false;
  try { muted = storage?.getItem(MUTE_KEY) === "1"; } catch { /* storage unavailable */ }

  const startFen = INITIAL_FEN;
  let human = "w";
  let level = 3;
  let flipped = false;
  let moves: string[] = [];
  let sans: string[] = [];
  let fen = startFen;
  const GAME_KEY = "chess-lab:game";
  try {
    const saved = JSON.parse(storage?.getItem(GAME_KEY) ?? "null");
    if (saved && saved.startFen === startFen && Array.isArray(saved.moves)) {
      if (saved.human === "b") { human = "b"; flipped = true; }
      if (Number.isInteger(saved.level) && saved.level >= 1 && saved.level <= 5) level = saved.level;
      for (const m of saved.moves) {
        const san = toSAN(fen, m);
        fen = applyMove(fen, m);
        moves.push(m);
        sans.push(san);
      }
    }
  } catch { /* unreadable save: start fresh */ }
  let selected: string | null = null;
  let pendingPromotion: { from: string; to: string } | null = null;
  let thinking = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;

  const boardEl = document.createElement("div");
  boardEl.setAttribute("data-board", "");
  const statusEl = document.createElement("div");
  statusEl.setAttribute("data-status", "");
  const listEl = document.createElement("div");
  listEl.setAttribute("data-move-list", "");
  const promoEl = document.createElement("div");
  promoEl.setAttribute("data-promotion", "");
  const actionsEl = document.createElement("div");
  actionsEl.setAttribute("data-actions", "");
  const flipBtn = document.createElement("button");
  flipBtn.setAttribute("data-action", "flip");
  flipBtn.textContent = "Flip";
  flipBtn.addEventListener("click", () => { if (destroyed) return; flipped = !flipped; render(); });
  const muteBtn = document.createElement("button");
  muteBtn.setAttribute("data-action", "mute");
  muteBtn.addEventListener("click", () => {
    if (destroyed) return;
    muted = !muted;
    try { storage?.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* ignore */ }
    render();
  });
  const newGameBtn = document.createElement("button");
  newGameBtn.setAttribute("data-action", "new-game");
  newGameBtn.textContent = "New game";
  newGameBtn.addEventListener("click", () => { if (!destroyed) newGame(); });
  const settingsEl = document.createElement("div");
  settingsEl.setAttribute("data-settings", "");
  const makeSelect = (attr: string, options: [string, string][], def: string) => {
    const el = document.createElement("select");
    el.setAttribute(attr, "");
    for (const [value, label] of options) {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = label;
      el.append(o);
    }
    el.value = def;
    return el;
  };
  const levelSel = makeSelect("data-level", [1, 2, 3, 4, 5].map((n) => [String(n), `Level ${n}`]), "3");
  const colorSel = makeSelect("data-color", [["w", "White"], ["b", "Black"], ["random", "Random"]], "w");
  const timeSel = makeSelect("data-time-control",
    ["none", "1+0", "3+0", "3+2", "5+0", "10+0", "15+10", "30+0", "custom"].map((v) => [v, v === "none" ? "No clock" : v]), "none");
  const customMin = document.createElement("input");
  customMin.setAttribute("data-custom-minutes", "");
  customMin.type = "number";
  customMin.value = "10";
  const customInc = document.createElement("input");
  customInc.setAttribute("data-custom-increment", "");
  customInc.type = "number";
  customInc.value = "0";
  settingsEl.append(levelSel, colorSel, timeSel, customMin, customInc);
  levelSel.value = String(level);
  colorSel.value = human;
  actionsEl.append(newGameBtn, flipBtn, muteBtn);
  root.replaceChildren(boardEl, promoEl, statusEl, listEl, actionsEl, settingsEl);

  const turn = () => fen.split(" ")[1];
  const isOver = () => statusText(startFen, moves, fen).over;

  function squaresInOrder(): string[] {
    const out: string[] = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const file = flipped ? 7 - f : f;
        const rank = flipped ? r + 1 : 8 - r;
        out.push("abcdefgh"[file] + rank);
      }
    }
    return out;
  }

  function pieceMap(): Map<string, string> {
    const map = new Map<string, string>();
    fen.split(" ")[0].split("/").forEach((row, i) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) { f += Number(ch); continue; }
        const color = ch === ch.toUpperCase() ? "w" : "b";
        map.set("abcdefgh"[f] + (8 - i), color + ch.toUpperCase());
        f++;
      }
    });
    return map;
  }

  function targetsOf(from: string): string[] {
    return [...new Set(legalMoves(fen).filter((m) => m.startsWith(from)).map((m) => m.slice(2, 4)))];
  }

  function render() {
    muteBtn.toggleAttribute("data-muted", muted);
    muteBtn.textContent = muted ? "Unmute" : "Mute";
    const pieces = pieceMap();
    const last = moves.length ? moves[moves.length - 1] : null;
    const targets = selected ? targetsOf(selected) : [];
    const checkSquare = inCheck(fen)
      ? [...pieces].find(([, p]) => p === turn() + "K")?.[0]
      : undefined;
    boardEl.replaceChildren(...squaresInOrder().map((sq) => {
      const el = document.createElement("div");
      el.setAttribute("data-square", sq);
      if (sq === selected) el.setAttribute("data-selected", "");
      if (targets.includes(sq)) el.setAttribute("data-target", "");
      if (last && (sq === last.slice(0, 2) || sq === last.slice(2, 4))) el.setAttribute("data-last-move", "");
      if (sq === checkSquare) el.setAttribute("data-check", "");
      const p = pieces.get(sq);
      if (p) {
        const pe = document.createElement("span");
        pe.setAttribute("data-piece", p);
        pe.textContent = GLYPHS[p[1]];
        el.append(pe);
      }
      el.addEventListener("click", () => onSquare(sq));
      return el;
    }));

    promoEl.replaceChildren();
    if (pendingPromotion) {
      for (const p of ["q", "r", "b", "n"]) {
        const b = document.createElement("button");
        b.setAttribute("data-promotion-choice", p);
        b.textContent = GLYPHS[p.toUpperCase()];
        b.addEventListener("click", () => {
          const { from, to } = pendingPromotion!;
          pendingPromotion = null;
          playMove(from + to + p);
        });
        promoEl.append(b);
      }
    }

    statusEl.textContent = statusText(startFen, moves, fen).text;
    listEl.replaceChildren(...sans.map((san, i) => {
      const el = document.createElement("span");
      el.setAttribute("data-ply", String(i + 1));
      el.textContent = san;
      return el;
    }));
    if (thinking) root.setAttribute("data-thinking", ""); else root.removeAttribute("data-thinking");
  }

  function onSquare(sq: string) {
    if (destroyed || thinking || isOver() || turn() !== human || pendingPromotion) return;
    if (selected && targetsOf(selected).includes(sq)) {
      const from = selected;
      selected = null;
      if (legalMoves(fen).some((m) => m.startsWith(from + sq) && m.length === 5)) {
        pendingPromotion = { from, to: sq };
        render();
      } else {
        playMove(from + sq);
      }
      return;
    }
    const own = pieceMap().get(sq)?.[0] === human;
    selected = own && sq !== selected ? sq : null;
    render();
  }

  function playMove(uci: string) {
    const san = toSAN(fen, uci);
    fen = applyMove(fen, uci);
    moves.push(uci);
    sans.push(san);
    try { storage?.setItem(GAME_KEY, JSON.stringify({ startFen, moves, human, level })); } catch { /* ignore */ }
    selected = null;
    thinking = false;
    const over = isOver();
    if (!muted) sound.play(soundFor(san, over));
    if (!over && turn() !== human) engineTurn();
    render();
  }

  function newGame() {
    generation++;
    clearTimeout(timer);
    thinking = false;
    selected = null;
    pendingPromotion = null;
    level = Number(levelSel.value) || 3;
    const c = colorSel.value;
    human = c === "w" || c === "b" ? c : (deps.random ?? Math.random)() < 0.5 ? "w" : "b";
    flipped = human === "b";
    fen = startFen;
    moves = [];
    sans = [];
    try { storage?.setItem(GAME_KEY, JSON.stringify({ startFen, moves, human, level })); } catch { /* ignore */ }
    if (turn() !== human) engineTurn();
    render();
  }

  function engineTurn() {
    thinking = true;
    const gen = ++generation;
    let reply: Uci | undefined;
    let waited = false;
    const finish = () => {
      if (destroyed || gen !== generation || !waited || reply === undefined) return;
      playMove(reply);
    };
    timer = setTimeout(() => { waited = true; finish(); }, MIN_THINK_MS);
    engine.bestMove(fen, level).then((m) => { reply = m; finish(); });
  }

  render();
  if (turn() !== human) engineTurn();

  return {
    destroy() {
      destroyed = true;
      generation++;
      clearTimeout(timer);
      root.replaceChildren();
      root.removeAttribute("data-thinking");
    },
  };
}
