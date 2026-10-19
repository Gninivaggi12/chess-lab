// @vitest-environment jsdom
// Hand-written oracle tests: losing on time (SPEC "Clock", "UI"). Read-only to agents.
import { afterEach, describe, expect, test, vi } from "vitest";
import { scriptedEngine, start } from "./_ui.ts";

afterEach(() => { vi.useRealTimers(); });

describe("running out of time", () => {
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
