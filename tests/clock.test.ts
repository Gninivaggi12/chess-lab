// Hand-written oracle tests for src/clock (SPEC "Clock"). Read-only to agents.
import { describe, expect, test } from "vitest";
import { clock } from "./_lib.ts";

function setup(initialMs = 60_000, incrementMs = 0) {
  let t = 1_000_000;
  return {
    advance: (ms: number) => { t += ms; },
    now: () => t,
    async make() {
      const { createClock } = await clock();
      return createClock({ initialMs, incrementMs }, () => t);
    },
  };
}

describe("clock", () => {
  test("nobody's time runs before White's first move", async () => {
    const s = setup();
    const c = await s.make();
    s.advance(5_000);
    expect(c.remaining("w")).toBe(60_000);
    expect(c.remaining("b")).toBe(60_000);
  });

  test("before the first move, only White's press counts", async () => {
    const s = setup();
    const c = await s.make();
    c.press("b");
    s.advance(5_000);
    expect(c.remaining("w")).toBe(60_000);
    expect(c.remaining("b")).toBe(60_000);
  });

  test("White's first press starts Black's time", async () => {
    const s = setup();
    const c = await s.make();
    c.press("w");
    s.advance(1_500);
    expect(c.remaining("w")).toBe(60_000);
    expect(c.remaining("b")).toBe(58_500);
  });

  test("pressing adds the increment and switches sides", async () => {
    const s = setup(60_000, 2_000);
    const c = await s.make();
    c.press("w");                       // White's first move: +2 s
    expect(c.remaining("w")).toBe(62_000);
    s.advance(3_000);
    c.press("b");                       // Black used 3 s, gets 2 s
    expect(c.remaining("b")).toBe(59_000);
    s.advance(4_000);
    expect(c.remaining("w")).toBe(58_000);
    expect(c.remaining("b")).toBe(59_000);
  });

  test("pressing for the side whose time isn't running is ignored", async () => {
    const s = setup(60_000, 2_000);
    const c = await s.make();
    c.press("w");
    s.advance(1_000);
    c.press("w");                       // Black's time is running, not White's
    expect(c.remaining("w")).toBe(62_000);
    s.advance(1_000);
    expect(c.remaining("b")).toBe(58_000);
  });

  test("time never goes below 0 and the flag falls", async () => {
    const s = setup(10_000);
    const c = await s.make();
    expect(c.flagged()).toBeNull();
    c.press("w");
    s.advance(9_999);
    expect(c.flagged()).toBeNull();
    s.advance(10_000);
    expect(c.remaining("b")).toBe(0);
    expect(c.flagged()).toBe("b");
    expect(c.remaining("w")).toBe(10_000);
  });

  test("pause stops time and resume continues it", async () => {
    const s = setup();
    const c = await s.make();
    c.press("w");
    s.advance(1_000);
    c.pause();
    s.advance(30_000);
    expect(c.remaining("b")).toBe(59_000);
    c.resume();
    s.advance(1_000);
    expect(c.remaining("b")).toBe(58_000);
  });
});
