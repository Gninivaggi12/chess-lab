import type { Color, SoundKind, Square, Uci } from "../core/types.ts";
import { INITIAL_FEN, applyMove, gameStatus, inCheck, legalMoves } from "../core/index.ts";
import { toSAN } from "../notation/index.ts";
import { soundFor, play } from "../sound/index.ts";

export interface EngineLike { bestMove(fen: string, level: number, maxTimeMs?: number): Promise<Uci>; }
export interface SoundLike { play(kind: SoundKind): void; }

const MIN_THINK_MS = 600;
const FILES = "abcdefgh";

// Runs the engine in a Web Worker (src/app/engine-worker.ts).
function workerEngine(): EngineLike {
  let worker: Worker | null = null;
  let nextId = 0;
  return {
    bestMove(fen, level, maxTimeMs) {
      worker ??= new Worker(new URL("../app/engine-worker.ts", import.meta.url), { type: "module" });
      const w = worker;
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const onMsg = (e: MessageEvent) => {
          if (e.data.id !== id) return;
          w.removeEventListener("message", onMsg);
          if (e.data.error) reject(new Error(e.data.error)); else resolve(e.data.move);
        };
        w.addEventListener("message", onMsg);
        w.postMessage({ id, fen, level, maxTimeMs });
      });
    },
  };
}

export function mountApp(root: HTMLElement, deps: {
  engine?: EngineLike; sound?: SoundLike; storage?: Storage; now?: () => number; random?: () => number;
} = {}): { destroy(): void } {
  const engine = deps.engine ?? workerEngine();
  const sound = deps.sound ?? { play };
  const now = deps.now ?? (() => performance.now());

  let fen = INITIAL_FEN;
  const sans: string[] = [];
  const ucis: Uci[] = [];
  let promoting: { from: Square; to: Square } | null = null;
  let lastMove: Uci | null = null;
  let selected: Square | null = null;
  let human: Color = "w";
  let flipped = human === "b";
  let level = 3;
  // Pending settings, applied when new-game is tapped. Time control is stored for the clock task.
  const settings = { level: "3", color: "w", timeControl: "none", customMinutes: "10", customIncrement: "0" };
  let over = false;
  let thinking = false;
  let gameId = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const turn = (): Color => (fen.split(" ")[1] === "b" ? "b" : "w");

  function pieces(): Map<Square, string> {
    const m = new Map<Square, string>();
    fen.split(" ")[0].split("/").forEach((row, i) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) f += Number(ch);
        else m.set(FILES[f++] + (8 - i), (ch === ch.toUpperCase() ? "w" : "b") + ch.toUpperCase());
      }
    });
    return m;
  }

  function statusText(): string {
    const s = gameStatus(INITIAL_FEN, ucis);
    if (!s.over) return turn() === "w" ? "White to move" : "Black to move";
    if (s.reason === "checkmate") return `Checkmate · ${s.result === "1-0" ? "White" : "Black"} wins`;
    const why: Record<string, string> = {
      stalemate: "stalemate", "insufficient-material": "insufficient material",
      "threefold-repetition": "threefold repetition", "fifty-move-rule": "fifty-move rule",
    };
    return `Draw · ${why[s.reason ?? ""] ?? s.reason}`;
  }

  function render() {
    const board = pieces();
    const targets = selected ? legalMoves(fen).filter((m) => m.startsWith(selected!)).map((m) => m.slice(2, 4)) : [];
    const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
    const rows = flipped ? [...ranks].reverse() : ranks;
    const cols = flipped ? [...FILES].reverse() : [...FILES];
    root.toggleAttribute("data-thinking", thinking);
    const boardEl = document.createElement("div");
    boardEl.setAttribute("data-board", "");
    for (const r of rows) {
      for (const f of cols) {
        const sq = f + r;
        const el = document.createElement("div");
        el.setAttribute("data-square", sq);
        if (selected === sq) el.setAttribute("data-selected", "");
        if (targets.includes(sq)) el.setAttribute("data-target", "");
        if (lastMove && (sq === lastMove.slice(0, 2) || sq === lastMove.slice(2, 4))) el.setAttribute("data-last-move", "");
        const p = board.get(sq);
        if (p) {
          const pe = document.createElement("span");
          pe.setAttribute("data-piece", p);
          el.append(pe);
        }
        el.addEventListener("click", () => tap(sq));
        boardEl.append(el);
      }
    }
    if (inCheck(fen)) {
      const k = turn() === "w" ? "wK" : "bK";
      for (const [sq, p] of board) if (p === k) boardEl.querySelector(`[data-square="${sq}"]`)?.setAttribute("data-check", "");
    }
    const status = document.createElement("div");
    status.setAttribute("data-status", "");
    status.textContent = statusText();
    const list = document.createElement("div");
    list.setAttribute("data-move-list", "");
    sans.forEach((san, i) => {
      const e = document.createElement("span");
      e.setAttribute("data-ply", String(i + 1));
      e.textContent = san;
      list.append(e);
    });
    const picker = document.createElement("div");
    picker.setAttribute("data-promotion", "");
    if (promoting) {
      for (const t of ["q", "r", "b", "n"]) {
        const b = document.createElement("button");
        b.setAttribute("data-promotion-choice", t);
        b.textContent = t.toUpperCase();
        b.addEventListener("click", () => choosePromotion(t));
        picker.append(b);
      }
    }
    const controls = document.createElement("div");
    const flip = document.createElement("button");
    flip.setAttribute("data-action", "flip");
    flip.textContent = "Flip";
    flip.addEventListener("click", () => { flipped = !flipped; render(); });
    const newGame = document.createElement("button");
    newGame.setAttribute("data-action", "new-game");
    newGame.textContent = "New game";
    newGame.addEventListener("click", startNewGame);
    const select = (attr: string, key: "level" | "color" | "timeControl", options: string[][]) => {
      const el = document.createElement("select");
      el.setAttribute(attr, "");
      for (const [value, label] of options) el.append(new Option(label, value));
      el.value = settings[key];
      el.addEventListener("change", () => { settings[key] = el.value; });
      return el;
    };
    const number = (attr: string, key: "customMinutes" | "customIncrement") => {
      const el = document.createElement("input");
      el.setAttribute(attr, "");
      el.type = "number";
      el.value = settings[key];
      const update = () => { settings[key] = el.value; };
      el.addEventListener("input", update);
      el.addEventListener("change", update);
      return el;
    };
    controls.append(
      select("data-level", "level", [1, 2, 3, 4, 5].map((n) => [String(n), `Level ${n}`])),
      select("data-color", "color", [["w", "White"], ["b", "Black"], ["random", "Random"]]),
      select("data-time-control", "timeControl", [
        ["none", "No clock"], ...["1+0", "3+0", "3+2", "5+0", "10+0", "15+10", "30+0"].map((t) => [t, t]), ["custom", "Custom"],
      ]),
      number("data-custom-minutes", "customMinutes"),
      number("data-custom-increment", "customIncrement"),
      newGame,
    );
    controls.append(flip);
    root.replaceChildren(boardEl, picker, status, list, controls);
  }

  function playMove(uci: Uci) {
    const san = toSAN(fen, uci);
    fen = applyMove(fen, uci);
    sans.push(san);
    ucis.push(uci);
    lastMove = uci;
    selected = null;
    over = gameStatus(INITIAL_FEN, ucis).over;
    sound.play(soundFor(san, over));
  }

  function choosePromotion(piece: string) {
    if (!promoting || over) return;
    const uci = promoting.from + promoting.to + piece;
    promoting = null;
    playMove(uci);
    engineTurn();
    render();
  }

  function tap(sq: Square) {
    if (over || thinking || turn() !== human) return;
    if (promoting) { promoting = null; selected = null; render(); return; }
    const moves = legalMoves(fen);
    const move = selected && moves.find((m) => m.startsWith(selected + sq));
    if (move && move.length === 5) {
      promoting = { from: selected!, to: sq };
    } else if (move) {
      playMove(move);
      engineTurn();
    } else {
      selected = pieces().get(sq)?.[0] === human && sq !== selected ? sq : null;
    }
    render();
  }

  function startNewGame() {
    gameId++;
    if (timer) { clearTimeout(timer); timer = null; }
    fen = INITIAL_FEN;
    sans.length = 0;
    ucis.length = 0;
    promoting = null;
    lastMove = null;
    selected = null;
    over = false;
    thinking = false;
    level = Number(settings.level);
    human = settings.color === "random" ? ((deps.random ?? Math.random)() < 0.5 ? "w" : "b") : settings.color === "b" ? "b" : "w";
    flipped = human === "b";
    if (human === "b") engineTurn();
    render();
  }

  function engineTurn() {
    if (over) return;
    thinking = true;
    const id = gameId;
    const started = now();
    engine.bestMove(fen, level).then((uci) => {
      if (id !== gameId) return;
      timer = setTimeout(() => {
        timer = null;
        thinking = false;
        playMove(uci);
        render();
      }, Math.max(0, MIN_THINK_MS - (now() - started)));
    }, () => {
      if (id !== gameId) return;
      thinking = false;
      render();
    });
  }

  render();
  return {
    destroy() {
      gameId++;
      if (timer) clearTimeout(timer);
      root.replaceChildren();
    },
  };
}
