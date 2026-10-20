import { bestMove } from "../engine/index.ts";

self.onmessage = (e: MessageEvent<{ id: number; fen: string; level: number; maxTimeMs?: number }>) => {
  const { id, fen, level, maxTimeMs } = e.data;
  (self as unknown as Worker).postMessage({ id, move: bestMove(fen, level, maxTimeMs) });
};
