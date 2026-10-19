// @vitest-environment jsdom
// Hand-written oracle tests: new game settings and color (SPEC "UI"). Read-only to agents.
import { afterEach, describe, expect, test, vi } from "vitest";
import { scriptedEngine, start } from "./_ui.ts";

afterEach(() => { vi.useRealTimers(); });

describe("new game", () => {
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
});
