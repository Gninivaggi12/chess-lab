import { applyMove, gameStatus, inCheck, INITIAL_FEN, legalMoves, premoveTargets, timeoutResult } from "../core/index.ts";
import type { SoundKind, Uci } from "../core/types.ts";
import { createClock } from "../clock/index.ts";
import type { Clock, ClockState } from "../clock/index.ts";
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

interface TimeControl { initialMs: number; incrementMs: number; }

function pieceImg(code: string): HTMLImageElement {
  const img = document.createElement("img");
  img.src = `pieces/cburnett/${code}.svg`;
  img.alt = "";
  img.draggable = false;
  return img;
}

function coordEl(text: string, kind: "rank" | "file"): HTMLElement {
  const c = document.createElement("span");
  c.setAttribute("data-coord", kind);
  c.textContent = text;
  return c;
}

function formatClock(ms: number): string {
  if (ms < 10_000) return `0:0${(Math.floor(ms / 100) / 10).toFixed(1)}`;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function statusText(startFen: string, moves: string[], fen: string, timeout: string | null = null): { text: string; over: boolean } {
  if (timeout) {
    const t = timeoutResult(fen, timeout as "w" | "b");
    if (t.reason === "timeout-vs-insufficient-material") return { text: "Draw · timeout vs insufficient material", over: true };
    return { text: `Time out · ${t.result === "1-0" ? "White" : "Black"} wins`, over: true };
  }
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
  let clocked = false;
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
  const now = deps.now ?? (() => performance.now());
  let timeControl: TimeControl | null = null;
  let clock: Clock | null = null;
  const makeClock = (from?: ClockState) =>
    timeControl ? createClock({ ...timeControl, from }, now) : null;
  try {
    const tc = JSON.parse(storage?.getItem(GAME_KEY) ?? "null")?.clock;
    if (tc && Number.isFinite(tc.initialMs) && Number.isFinite(tc.incrementMs) && tc.state) {
      timeControl = { initialMs: tc.initialMs, incrementMs: tc.incrementMs };
      clock = makeClock(tc.state);
    }
  } catch { /* unreadable save: no clock */ }
  let flagged: string | null = null;
  let selected: string | null = null;
  let pendingPromotion: { from: string; to: string } | null = null;
  let thinking = false;
  let premove: { from: string; to: string; promo?: string } | null = null;
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
  const undoBtn = document.createElement("button");
  undoBtn.setAttribute("data-action", "undo");
  undoBtn.textContent = "Undo";
  undoBtn.addEventListener("click", () => { if (!destroyed) undo(); });
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
  const settingsBtn = document.createElement("button");
  settingsBtn.setAttribute("data-action", "settings");
  settingsBtn.textContent = "Settings";
  settingsBtn.addEventListener("click", () => { if (!destroyed) settingsEl.hidden = !settingsEl.hidden; });
  const closeBtn = document.createElement("button");
  closeBtn.setAttribute("data-action", "close-settings");
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", () => { settingsEl.hidden = true; });
  const creditsEl = document.createElement("div");
  creditsEl.setAttribute("data-credits", "");
  creditsEl.textContent = "Pieces by Cburnett (BSD license)";
  settingsEl.hidden = true;
  settingsEl.append(creditsEl, closeBtn);
  actionsEl.append(newGameBtn, undoBtn, flipBtn, settingsBtn, muteBtn);

  const makeBar = (pos: string) => {
    const bar = document.createElement("div");
    bar.setAttribute("data-player-bar", pos);
    const avatar = document.createElement("span");
    avatar.setAttribute("data-avatar", "");
    const name = document.createElement("span");
    name.setAttribute("data-player-name", "");
    bar.append(avatar, name);
    return { bar, name };
  };
  const topBar = makeBar("top");
  const bottomBar = makeBar("bottom");
  const mainEl = document.createElement("div");
  mainEl.setAttribute("data-main", "");
  mainEl.append(topBar.bar, boardEl, bottomBar.bar);
  const panelEl = document.createElement("div");
  panelEl.setAttribute("data-panel", "");
  panelEl.append(statusEl, promoEl, actionsEl, listEl);
  const gameEl = document.createElement("div");
  gameEl.setAttribute("data-game", "");
  gameEl.append(mainEl, panelEl);
  root.replaceChildren(gameEl, settingsEl);

  function save() {
    const c = timeControl && clock ? { ...timeControl, state: clock.snapshot() } : undefined;
    try { storage?.setItem(GAME_KEY, JSON.stringify({ startFen, moves, human, level, clock: c })); } catch { /* ignore */ }
  }

  const clockEls = { w: document.createElement("div"), b: document.createElement("div") };
  for (const c of ["w", "b"] as const) clockEls[c].setAttribute("data-clock", c);

  function renderBars() {
    const topColor = flipped ? "w" : "b";
    const bottomColor = flipped ? "b" : "w";
    for (const [b, c] of [[topBar, topColor], [bottomBar, bottomColor]] as const) {
      b.name.textContent = c === human ? "You" : `Computer · Level ${level}`;
      b.bar.append(clockEls[c]);
    }
  }

  function renderClocks() {
    const running = clock && moves.length > 0 && !isOver() ? turn() : null;
    for (const c of ["w", "b"] as const) {
      clockEls[c].textContent = clock ? formatClock(clock.remaining(c)) : "";
      clockEls[c].toggleAttribute("data-active", c === running);
    }
  }
  const ticker = setInterval(() => {
    if (destroyed || !clock) return;
    if (checkFlag()) { render(); return; }
    renderClocks();
    save();
  }, 100);

  const turn = () => fen.split(" ")[1];
  const isOver = () => statusText(startFen, moves, fen, flagged).over;

  // Ends the game when a running clock hits zero; true if it just did.
  function checkFlag(): boolean {
    if (!clock || flagged || statusText(startFen, moves, fen).over) return false;
    const f = clock.flagged();
    if (!f) return false;
    flagged = f;
    clock.pause();
    generation++;
    clearTimeout(timer);
    thinking = false;
    selected = null;
    pendingPromotion = null;
    premove = null;
    save();
    return true;
  }

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

  // Length the game returns to on undo (your last move and the reply), or -1 if there is none.
  function undoTarget(): number {
    if (clocked) return -1;
    const lastMover = fen.split(" ")[1] === "w" ? "b" : "w";
    const n = moves.length - (lastMover === human ? 1 : 2);
    return n >= 0 && (n % 2 === 0 ? "w" : "b") === human ? n : -1;
  }

  function undo() {
    const n = undoTarget();
    if (n < 0) return;
    generation++;
    clearTimeout(timer);
    thinking = false;
    selected = null;
    pendingPromotion = null;
    premove = null;
    moves = moves.slice(0, n);
    sans = sans.slice(0, n);
    fen = startFen;
    for (const m of moves) fen = applyMove(fen, m);
    try { storage?.setItem(GAME_KEY, JSON.stringify({ startFen, moves, human, level })); } catch { /* ignore */ }
    render();
  }

  function render() {
    undoBtn.disabled = undoTarget() < 0;
    muteBtn.toggleAttribute("data-muted", muted);
    muteBtn.textContent = muted ? "Unmute" : "Mute";
    const pieces = pieceMap();
    const last = moves.length ? moves[moves.length - 1] : null;
    const targets = selected ? (thinking ? premoveTargets(fen, selected) : targetsOf(selected)) : [];
    const checkSquare = inCheck(fen)
      ? [...pieces].find(([, p]) => p === turn() + "K")?.[0]
      : undefined;
    boardEl.replaceChildren(...squaresInOrder().map((sq) => {
      const el = document.createElement("div");
      el.setAttribute("data-square", sq);
      if (("abcdefgh".indexOf(sq[0]) + Number(sq[1])) % 2 === 1) el.setAttribute("data-dark", "");
      if (sq === selected) el.setAttribute("data-selected", "");
      if (targets.includes(sq)) el.setAttribute("data-target", "");
      if (last && (sq === last.slice(0, 2) || sq === last.slice(2, 4))) el.setAttribute("data-last-move", "");
      if (premove && (sq === premove.from || sq === premove.to)) el.setAttribute("data-premove", "");
      if (sq === checkSquare) el.setAttribute("data-check", "");
      const p = pieces.get(sq);
      if (p) {
        const pe = document.createElement("span");
        pe.setAttribute("data-piece", p);
        pe.append(pieceImg(p));
        el.append(pe);
      }
      // rank labels sit in the left column, file labels in the bottom row
      const leftFile = flipped ? "h" : "a";
      const bottomRank = flipped ? "8" : "1";
      if (sq[0] === leftFile) el.append(coordEl(sq[1], "rank"));
      if (sq[1] === bottomRank) el.append(coordEl(sq[0], "file"));
      el.addEventListener("click", () => { if (!suppressClick) onSquare(sq); });
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
          if (thinking) { premove = { from, to, promo: p }; render(); } else playMove(from + to + p);
        });
        promoEl.append(b);
      }
    }

    statusEl.textContent = statusText(startFen, moves, fen, flagged).text;
    const rows: HTMLElement[] = [];
    sans.forEach((san, i) => {
      if (i % 2 === 0) {
        const row = document.createElement("div");
        row.setAttribute("data-move-row", "");
        const num = document.createElement("span");
        num.setAttribute("data-move-number", "");
        num.textContent = `${i / 2 + 1}.`;
        row.append(num);
        rows.push(row);
      }
      const el = document.createElement("span");
      el.setAttribute("data-ply", String(i + 1));
      if (i === sans.length - 1) el.setAttribute("data-current", "");
      el.textContent = san;
      rows[rows.length - 1].append(el);
    });
    listEl.replaceChildren(...rows);
    listEl.scrollTop = listEl.scrollHeight;
    renderBars();
    renderClocks();
    if (thinking) root.setAttribute("data-thinking", ""); else root.removeAttribute("data-thinking");
  }

  // Drag-and-drop: a press on one of your pieces that moves past a few pixels follows the pointer;
  // releasing on a square is the same as tapping the piece, then that square.
  let drag: { from: string; x: number; y: number; ghost?: HTMLElement } | null = null;
  let suppressClick = false;
  const squareAt = (x: number, y: number) =>
    (document.elementFromPoint(x, y)?.closest("[data-square]") as HTMLElement | null)?.dataset.square;
  boardEl.addEventListener("pointerdown", (e) => {
    if (destroyed || !e.isPrimary || e.button !== 0) return;
    const sqEl = (e.target as HTMLElement).closest("[data-square]") as HTMLElement | null;
    const from = sqEl?.dataset.square;
    if (!from || pieceMap().get(from)?.[0] !== human) return;
    drag = { from, x: e.clientX, y: e.clientY };
  });
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
  window.addEventListener("pointercancel", onDragCancel);
  function onDragMove(e: PointerEvent) {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      const src = boardEl.querySelector(`[data-square="${drag.from}"] [data-piece]`) as HTMLElement | null;
      if (!src) { drag = null; return; }
      const size = src.getBoundingClientRect().width;
      const ghost = src.cloneNode(true) as HTMLElement;
      ghost.setAttribute("data-drag-ghost", "");
      ghost.removeAttribute("data-piece");
      Object.assign(ghost.style, { position: "fixed", width: `${size}px`, height: `${size}px`, pointerEvents: "none", zIndex: "20" });
      document.body.append(ghost);
      src.style.opacity = "0.3";
      drag.ghost = ghost;
    }
    const half = parseFloat(drag.ghost.style.width) / 2;
    drag.ghost.style.left = `${e.clientX - half}px`;
    drag.ghost.style.top = `${e.clientY - half}px`;
  }
  function onDragEnd(e: PointerEvent) {
    const d = drag;
    drag = null;
    if (!d?.ghost) return;
    d.ghost.remove();
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    if (destroyed) return;
    const to = squareAt(e.clientX, e.clientY);
    if (selected !== d.from) onSquare(d.from);
    if (to && to !== d.from && selected === d.from) onSquare(to);
    else render();
  }
  function onDragCancel() {
    drag?.ghost?.remove();
    if (drag?.ghost) render();
    drag = null;
  }

  function onSquare(sq: string) {
    if (checkFlag()) render();
    if (destroyed || isOver() || pendingPromotion) return;
    if (thinking) { onPremoveSquare(sq); return; }
    if (turn() !== human) return;
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

  function onPremoveSquare(sq: string) {
    const pieces = pieceMap();
    if (selected && premoveTargets(fen, selected).includes(sq)) {
      const from = selected;
      selected = null;
      premove = null;
      if (pieces.get(from)?.[1] === "P" && (sq[1] === "8" || sq[1] === "1")) {
        pendingPromotion = { from, to: sq };
      } else {
        premove = { from, to: sq };
      }
      render();
      return;
    }
    const own = pieces.get(sq)?.[0] === human;
    if (own && sq !== premove?.from) {
      premove = null;
      selected = sq !== selected ? sq : null;
    } else {
      premove = null;
      selected = null;
    }
    render();
  }

  function playMove(uci: string) {
    const san = toSAN(fen, uci);
    const mover = turn() as "w" | "b";
    fen = applyMove(fen, uci);
    moves.push(uci);
    sans.push(san);
    clock?.press(mover);
    selected = null;
    thinking = false;
    const over = isOver();
    if (over) clock?.pause();
    save();
    if (!muted) sound.play(soundFor(san, over));
    if (!over && turn() !== human) engineTurn();
    render();
  }

  function newGame() {
    settingsEl.hidden = true;
    generation++;
    clearTimeout(timer);
    thinking = false;
    flagged = null;
    selected = null;
    pendingPromotion = null;
    level = Number(levelSel.value) || 3;
    const c = colorSel.value;
    human = c === "w" || c === "b" ? c : (deps.random ?? Math.random)() < 0.5 ? "w" : "b";
    flipped = human === "b";
    clocked = timeSel.value !== "none";
    fen = startFen;
    moves = [];
    sans = [];
    const choice = timeSel.value;
    const m = /^(\d+)\+(\d+)$/.exec(choice);
    if (m) timeControl = { initialMs: Number(m[1]) * 60_000, incrementMs: Number(m[2]) * 1000 };
    else if (choice === "custom") {
      timeControl = {
        initialMs: Math.max(0, Number(customMin.value) || 0) * 60_000,
        incrementMs: Math.max(0, Number(customInc.value) || 0) * 1000,
      };
    } else timeControl = null;
    clock = makeClock();
    save();
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
      const pm = premove;
      premove = null;
      if (pm && !destroyed && gen === generation && !isOver() && turn() === human) {
        const uci = pm.from + pm.to + (pm.promo ?? "");
        if (legalMoves(fen).includes(uci)) playMove(uci); else render();
      } else if (pm) render();
    };
    timer = setTimeout(() => { waited = true; finish(); }, MIN_THINK_MS);
    let limit: number | undefined;
    if (clock) {
      const rem = clock.remaining(turn() as "w" | "b");
      limit = Math.max(1, Math.min(rem / 30 + timeControl!.incrementMs, rem - 100));
    }
    engine.bestMove(fen, level, limit).then((m) => { reply = m; finish(); });
  }

  checkFlag();
  render();
  if (!isOver() && turn() !== human) engineTurn();

  return {
    destroy() {
      destroyed = true;
      window.removeEventListener("pointermove", onDragMove);
      window.removeEventListener("pointerup", onDragEnd);
      window.removeEventListener("pointercancel", onDragCancel);
      drag?.ghost?.remove();
      clearInterval(ticker);
      generation++;
      clearTimeout(timer);
      root.replaceChildren();
      root.removeAttribute("data-thinking");
    },
  };
}
