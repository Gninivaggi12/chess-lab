// @vitest-environment jsdom
// Hand-written oracle tests: the saved game (SPEC "UI"). Read-only to agents.
import { afterEach, describe, expect, test, vi } from "vitest";
import { memoryStorage, scriptedEngine, start } from "./_ui.ts";

afterEach(() => { vi.useRealTimers(); });

describe("persistence", () => {
  test("the game in progress survives closing the app", async () => {
    const storage = memoryStorage();
    const h = await start({ engine: scriptedEngine(["e7e5"]), storage });
    await h.move("e2", "e4");
    await h.advance(700);
    h.app.destroy();
    const again = await start({ storage });
    expect(again.piece("e4")).toBe("wP");
    expect(again.piece("e5")).toBe("bP");
    expect(again.plies()).toEqual(["e4", "e5"]);
    expect(again.status()).toBe("White to move");
  });
});
