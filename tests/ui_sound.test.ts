// @vitest-environment jsdom
// Hand-written oracle tests: sound calls and muting (SPEC "Sound", "UI"). Read-only to agents.
import { afterEach, describe, expect, test, vi } from "vitest";
import { memoryStorage, scriptedEngine, start } from "./_ui.ts";

afterEach(() => { vi.useRealTimers(); });

describe("sounds in the app", () => {
  test("mute silences moves and is remembered", async () => {
    const storage = memoryStorage();
    const h = await start({ engine: scriptedEngine(["e7e5"]), storage });
    h.action("mute");
    await h.advance(0);
    expect(h.control("mute").hasAttribute("data-muted")).toBe(true);
    await h.move("e2", "e4");
    await h.advance(700);
    expect(h.sounds).toEqual([]);
    h.app.destroy();
    const again = await start({ storage });
    expect(again.control("mute").hasAttribute("data-muted")).toBe(true);
  });

  test("captures and checks pick their sounds", async () => {
    const h = await start({ engine: scriptedEngine(["d7d5", "e8d7"]) });
    await h.move("e2", "e4");
    await h.advance(700);
    await h.move("e4", "d5");                      // capture
    await h.advance(700);
    expect(h.sounds).toEqual(["move", "move", "capture", "move"]);
  });
});
