// @vitest-environment jsdom
// Hand-written oracle tests: promotion, check, game end (SPEC "UI"). Read-only to agents.
import { afterEach, describe, expect, test, vi } from "vitest";
import { scriptedEngine, start } from "./_ui.ts";

afterEach(() => { vi.useRealTimers(); });

describe("rules in the app", () => {
  test("promotion asks for the piece, then plays it", async () => {
    const h = await start({ engine: scriptedEngine(["d7d5", "c7c6", "g8f6", "b8d7"]) });
    for (const [from, to] of [["e2", "e4"], ["e4", "d5"], ["d5", "c6"], ["c6", "b7"]]) {
      await h.move(from, to);
      await h.advance(700);
    }
    h.tap("b7");
    h.tap("a8");
    await h.advance(0);
    expect(h.root.querySelectorAll("[data-promotion-choice]").length).toBe(4);
    expect(h.plies()).toHaveLength(8);                 // nothing played until the choice
    h.choose("n");
    await h.advance(0);
    expect(h.piece("a8")).toBe("wN");
    expect(h.plies()[8]).toBe("bxa8=N");
    expect(h.sounds[h.sounds.length - 1]).toBe("promote");
  });

  test("checkmate: marks the king, ends the game, accepts no more moves", async () => {
    const h = await start({ engine: scriptedEngine(["e7e5", "d8h4"]) });
    await h.move("f2", "f3");
    await h.advance(700);
    await h.move("g2", "g4");
    await h.advance(700);
    expect(h.plies()).toEqual(["f3", "e5", "g4", "Qh4#"]);
    expect(h.status()).toBe("Checkmate · Black wins");
    expect(h.squaresWith("data-check")).toEqual(["e1"]);
    expect(h.sounds[h.sounds.length - 1]).toBe("game-end");
    await h.move("d2", "d4");
    expect(h.piece("d2")).toBe("wP");
    expect(h.plies()).toHaveLength(4);
  });

  test("threefold repetition ends the game in a draw", async () => {
    const h = await start({ engine: scriptedEngine(["g8f6", "f6g8", "g8f6", "f6g8"]) });
    for (const [from, to] of [["g1", "f3"], ["f3", "g1"], ["g1", "f3"], ["f3", "g1"]]) {
      await h.move(from, to);
      await h.advance(700);
    }
    expect(h.plies()).toHaveLength(8);
    expect(h.status()).toBe("Draw · threefold repetition");
  });
});
