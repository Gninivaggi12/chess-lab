// @vitest-environment jsdom
// Hand-written oracle tests: clocks in the app (SPEC "Clock", "UI"). Read-only to agents.
import { afterEach, describe, expect, test, vi } from "vitest";
import { scriptedEngine, start } from "./_ui.ts";

afterEach(() => { vi.useRealTimers(); });

describe("clocks", () => {
  test("untimed games show no clock and give the engine no time limit", async () => {
    const h = await start({ engine: scriptedEngine(["e7e5"]) });
    expect(h.clock("w")).toBe("");
    await h.move("e2", "e4");
    expect(h.engine.calls[0].maxTimeMs).toBeUndefined();
  });

  test("3+2: increment after each move, the running clock is active", async () => {
    const h = await start({ engine: scriptedEngine(["e7e5"]) });
    h.set("time-control", "3+2");
    h.action("new-game");
    await h.advance(0);
    expect(h.clock("w")).toBe("3:00");
    expect(h.clock("b")).toBe("3:00");
    expect(h.root.querySelectorAll("[data-clock][data-active]")).toHaveLength(0);
    await h.move("e2", "e4");
    expect(h.clock("w")).toBe("3:02");
    expect(h.root.querySelector("[data-clock='b']")!.hasAttribute("data-active")).toBe(true);
    const limit = h.engine.calls[0].maxTimeMs!;
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBeLessThan(180_000);
    await h.advance(700);                          // the engine moved at 0.6 s: 180 - 0.6 + 2
    expect(h.clock("b")).toBe("3:01");
    expect(h.root.querySelector("[data-clock='w']")!.hasAttribute("data-active")).toBe(true);
    await h.advance(1_000);
    expect(h.clock("w")).toBe("3:00");             // 182 - 1.1 s, rounded down
  });

  test("custom time control", async () => {
    const h = await start();
    h.set("time-control", "custom");
    h.set("custom-minutes", "2");
    h.set("custom-increment", "1");
    h.action("new-game");
    await h.advance(0);
    expect(h.clock("w")).toBe("2:00");
    expect(h.clock("b")).toBe("2:00");
  });

  test("running out of time loses, shows tenths, and stops the game", async () => {
    const engine = scriptedEngine();
    engine.hold = true;                            // the engine never answers
    const h = await start({ engine });
    h.set("time-control", "1+0");
    h.action("new-game");
    await h.move("e2", "e4");
    await h.advance(50_500);
    expect(h.clock("b")).toBe("0:09.5");
    await h.advance(10_000);
    expect(h.status()).toBe("Time out · White wins");
    expect(h.clock("b")).toBe("0:00.0");
    expect(h.thinking()).toBe(false);
  }, 60_000);
});
