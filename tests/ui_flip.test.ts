// @vitest-environment jsdom
// Hand-written oracle tests: board orientation (SPEC "UI"). Read-only to agents.
import { afterEach, describe, expect, test, vi } from "vitest";
import { scriptedEngine, start } from "./_ui.ts";

afterEach(() => { vi.useRealTimers(); });

describe("flip", () => {
  test("flip toggles the orientation", async () => {
    const h = await start();
    h.action("flip");
    await h.advance(0);
    expect(h.order()[0]).toBe("h1");
    h.action("flip");
    await h.advance(0);
    expect(h.order()[0]).toBe("a8");
  });
});
