// Hand-written oracle tests for src/engine (SPEC "Engine"). Read-only to agents.
import { describe, expect, test } from "vitest";
import { engine } from "./_lib.ts";

const MIDDLEGAMES = [
  "r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R2QKB1R w KQ - 0 8",
  "r2qr1k1/1b1nbppp/p2p1n2/1pp1p3/4P3/2PP1N1P/PPBN1PP1/R1BQR1K1 w - - 0 12",
  "2rq1rk1/pp1bppbp/2np1np1/8/3NP3/1BN1BP2/PPPQ2PP/2KR3R b - - 4 11",
];

describe("bestMove behavior", () => {
  test("throws when there's no legal move (checkmate and stalemate)", async () => {
    const { bestMove } = await engine();
    expect(() => bestMove("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3", 3)).toThrow();
    expect(() => bestMove("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", 3)).toThrow();
  });

  test.each([1, 2, 3, 4, 5])("is deterministic without a time limit (level %i)", async (level) => {
    const { bestMove } = await engine();
    for (const fen of MIDDLEGAMES) expect(bestMove(fen, level)).toBe(bestMove(fen, level));
  });

  test("level 5 answers within 2 s (2.5 s allowed)", async () => {
    const { bestMove } = await engine();
    for (const fen of MIDDLEGAMES) {
      const t0 = performance.now();
      bestMove(fen, 5);
      expect(performance.now() - t0).toBeLessThan(2_500);
    }
  });

  test.each([1, 3, 5])("respects maxTimeMs (level %i)", async (level) => {
    const { bestMove } = await engine();
    for (const fen of MIDDLEGAMES) {
      const t0 = performance.now();
      bestMove(fen, level, 300);
      expect(performance.now() - t0).toBeLessThan(450);
    }
  });
});
