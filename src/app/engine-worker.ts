import { bestMove } from "../engine/index.ts";

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent) => {
  const { id, fen, level, maxTimeMs } = e.data;
  try {
    ctx.postMessage({ id, move: bestMove(fen, level, maxTimeMs) });
  } catch (err) {
    ctx.postMessage({ id, error: String(err) });
  }
};
