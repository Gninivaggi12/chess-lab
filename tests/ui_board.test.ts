// @vitest-environment jsdom
// Hand-written oracle tests: board, selecting and moving (SPEC "UI"). Read-only to agents.
import { afterEach, describe, expect, test, vi } from "vitest";
import { scriptedEngine, start } from "./_ui.ts";

afterEach(() => { vi.useRealTimers(); });

describe("board", () => {
  test("renders 64 squares in display order with the starting position", async () => {
    const h = await start();
    expect(h.order()).toHaveLength(64);
    expect(h.order()[0]).toBe("a8");
    expect(h.order()[63]).toBe("h1");
    expect(h.piece("e1")).toBe("wK");
    expect(h.piece("d8")).toBe("bQ");
    expect(h.piece("g2")).toBe("wP");
    expect(h.piece("e4")).toBeNull();
    expect(h.root.querySelectorAll("[data-square] [data-piece]")).toHaveLength(32);
    expect(h.status()).toBe("White to move");
  });

  test("tapping your piece selects it and marks its legal destinations", async () => {
    const h = await start();
    h.tap("e2");
    expect(h.squaresWith("data-selected")).toEqual(["e2"]);
    expect(h.squaresWith("data-target")).toEqual(["e3", "e4"]);
    h.tap("g1");
    expect(h.squaresWith("data-selected")).toEqual(["g1"]);
    expect(h.squaresWith("data-target")).toEqual(["f3", "h3"]);
  });

  test("tapping a destination plays the move", async () => {
    const h = await start({ engine: scriptedEngine(["e7e5"]) });
    await h.move("e2", "e4");
    expect(h.piece("e4")).toBe("wP");
    expect(h.piece("e2")).toBeNull();
    expect(h.squaresWith("data-last-move")).toEqual(["e2", "e4"]);
    expect(h.plies()).toEqual(["e4"]);
    expect(h.sounds).toEqual(["move"]);
    expect(h.squaresWith("data-selected")).toEqual([]);
    expect(h.squaresWith("data-target")).toEqual([]);
  });

  test("an illegal tap clears the selection without moving", async () => {
    const h = await start();
    h.tap("e2");
    h.tap("e5");
    expect(h.squaresWith("data-selected")).toEqual([]);
    expect(h.piece("e2")).toBe("wP");
    expect(h.plies()).toEqual([]);
  });

  test("the opponent's pieces can't be selected", async () => {
    const h = await start();
    h.tap("e7");
    expect(h.squaresWith("data-selected")).toEqual([]);
    expect(h.squaresWith("data-target")).toEqual([]);
  });

  test("the engine replies after at least 0.6 s, showing data-thinking meanwhile", async () => {
    const h = await start({ engine: scriptedEngine(["e7e5"]) });
    await h.move("e2", "e4");
    expect(h.thinking()).toBe(true);
    expect(h.status()).toBe("Black to move");
    await h.advance(500);
    expect(h.plies()).toEqual(["e4"]);
    await h.advance(200);
    expect(h.plies()).toEqual(["e4", "e5"]);
    expect(h.piece("e5")).toBe("bP");
    expect(h.thinking()).toBe(false);
    expect(h.status()).toBe("White to move");
    expect(h.squaresWith("data-last-move")).toEqual(["e5", "e7"]);
    expect(h.sounds).toEqual(["move", "move"]);
    expect(h.engine.calls[0].level).toBe(3);
  });
});
