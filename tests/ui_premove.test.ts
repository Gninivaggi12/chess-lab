// @vitest-environment jsdom
// Hand-written oracle tests: one premove (SPEC "Premoves"). Read-only to agents.
import { afterEach, describe, expect, test, vi } from "vitest";
import { scriptedEngine, start } from "./_ui.ts";

afterEach(() => { vi.useRealTimers(); });

async function thinking() {
  const engine = scriptedEngine();
  engine.hold = true;
  const h = await start({ engine });
  await h.move("e2", "e4");
  await h.advance(100);
  return h;
}

describe("premoves", () => {
  test("queue a premove while the engine thinks; it plays right after the reply", async () => {
    const h = await thinking();
    h.tap("g1");
    expect(h.squaresWith("data-target")).toEqual(["e2", "f3", "h3"]);
    h.tap("f3");
    expect(h.squaresWith("data-premove")).toEqual(["f3", "g1"]);
    expect(h.piece("g1")).toBe("wN");
    await h.advance(1_000);
    h.engine.release("e7e5");
    await h.advance(10);
    expect(h.plies()).toEqual(["e4", "e5", "Nf3"]);
    expect(h.piece("f3")).toBe("wN");
    expect(h.squaresWith("data-premove")).toEqual([]);
    expect(h.engine.calls).toHaveLength(2);       // the engine is thinking about its reply
  });

  test("tapping the piece again cancels the premove", async () => {
    const h = await thinking();
    h.tap("g1");
    h.tap("f3");
    h.tap("g1");
    expect(h.squaresWith("data-premove")).toEqual([]);
    h.engine.release("e7e5");
    await h.advance(1_000);
    expect(h.plies()).toEqual(["e4", "e5"]);
  });

  test("a premove that became illegal is cancelled", async () => {
    const h = await thinking();
    h.tap("f1");
    h.tap("a6");                                   // fine on the board now; b5 gets blocked
    expect(h.squaresWith("data-premove")).toEqual(["a6", "f1"]);
    h.engine.release("b7b5");
    await h.advance(1_000);
    expect(h.plies()).toEqual(["e4", "b5"]);
    expect(h.piece("f1")).toBe("wB");
    expect(h.squaresWith("data-premove")).toEqual([]);
    expect(h.status()).toBe("White to move");
  });
});
