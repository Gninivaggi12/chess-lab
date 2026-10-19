// @vitest-environment jsdom
// Hand-written oracle tests: undo (SPEC "UI"). Read-only to agents.
import { afterEach, describe, expect, test, vi } from "vitest";
import { scriptedEngine, start } from "./_ui.ts";

afterEach(() => { vi.useRealTimers(); });

describe("undo", () => {
  test("undo takes back your move and the engine's reply", async () => {
    const h = await start({ engine: scriptedEngine(["e7e5"]) });
    expect((h.control("undo") as HTMLButtonElement).disabled).toBe(true);
    await h.move("e2", "e4");
    await h.advance(700);
    expect((h.control("undo") as HTMLButtonElement).disabled).toBe(false);
    h.action("undo");
    await h.advance(0);
    expect(h.plies()).toEqual([]);
    expect(h.piece("e2")).toBe("wP");
    expect(h.piece("e7")).toBe("bP");
    expect(h.status()).toBe("White to move");
  });

  test("undo while the engine thinks takes back your move and drops the reply", async () => {
    const h = await start({ engine: scriptedEngine(["e7e5"]) });
    await h.move("e2", "e4");
    await h.advance(100);
    h.action("undo");
    await h.advance(1_000);
    expect(h.plies()).toEqual([]);
    expect(h.piece("e2")).toBe("wP");
    expect(h.thinking()).toBe(false);
  });

  test("undo is disabled in clocked games", async () => {
    const h = await start({ engine: scriptedEngine(["e7e5"]) });
    h.set("time-control", "3+2");
    h.action("new-game");
    await h.move("e2", "e4");
    await h.advance(700);
    expect(h.plies()).toHaveLength(2);
    expect((h.control("undo") as HTMLButtonElement).disabled).toBe(true);
  });
});
