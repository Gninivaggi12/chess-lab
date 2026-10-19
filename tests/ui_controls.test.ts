// @vitest-environment jsdom
// Hand-written oracle tests: new game, color, flip, undo (SPEC "UI"). Read-only to agents.
import { afterEach, describe, expect, test, vi } from "vitest";
import { scriptedEngine, start } from "./_ui.ts";

afterEach(() => { vi.useRealTimers(); });

describe("controls", () => {
  test("new game as Black at level 5: board flipped, engine moves first", async () => {
    const h = await start({ engine: scriptedEngine(["e2e4"]) });
    h.set("color", "b");
    h.set("level", "5");
    h.action("new-game");
    await h.advance(0);
    expect(h.order()[0]).toBe("h1");
    expect(h.engine.calls[0].level).toBe(5);
    await h.advance(700);
    expect(h.plies()).toEqual(["e4"]);
    expect(h.status()).toBe("Black to move");
  });

  test.each([[0.3, "w"], [0.7, "b"]])("random color with random() = %s plays %s", async (r, color) => {
    const h = await start({ engine: scriptedEngine(["e2e4"]), random: r as number });
    h.set("color", "random");
    h.action("new-game");
    await h.advance(700);
    if (color === "w") {
      expect(h.engine.calls).toHaveLength(0);
      expect(h.order()[0]).toBe("a8");
    } else {
      expect(h.engine.calls).toHaveLength(1);
      expect(h.order()[0]).toBe("h1");
    }
  });

  test("flip toggles the orientation", async () => {
    const h = await start();
    h.action("flip");
    await h.advance(0);
    expect(h.order()[0]).toBe("h1");
    h.action("flip");
    await h.advance(0);
    expect(h.order()[0]).toBe("a8");
  });

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
