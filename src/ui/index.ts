import type { Color, SoundKind, Square, Uci } from "../core/types.ts";
import { INITIAL_FEN, applyMove, legalMoves, positionStatus } from "../core/index.ts";
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
  let lastMove: Uci | null = null;
  let selected: Square | null = null;
  const human: Color = "w";
  const level = 3;
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
    const s = positionStatus(fen);
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
    const flipped = human === "b";
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
    root.replaceChildren(boardEl, status, list);
  }

  function playMove(uci: Uci) {
    const san = toSAN(fen, uci);
    fen = applyMove(fen, uci);
    sans.push(san);
    lastMove = uci;
    selected = null;
    over = positionStatus(fen).over;
    sound.play(soundFor(san, over));
  }

  function tap(sq: Square) {
    if (over || thinking || turn() !== human) return;
    const moves = legalMoves(fen);
    const move = selected && moves.find((m) => m.startsWith(selected + sq));
    if (move) {
      // The promotion picker comes with ui-rules; until then promote to a queen.
      playMove(move.length === 5 ? move.slice(0, 4) + "q" : move);
      engineTurn();
    } else {
      selected = pieces().get(sq)?.[0] === human && sq !== selected ? sq : null;
    }
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
