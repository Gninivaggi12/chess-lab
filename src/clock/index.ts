import type { Color } from "../core/types.ts";

export interface Clock {
  press(color: Color): void;
  remaining(color: Color): number;
  flagged(): Color | null;
  pause(): void;
  resume(): void;
}

export function createClock(
  { initialMs, incrementMs }: { initialMs: number; incrementMs: number },
  now: () => number,
): Clock {
  const left: Record<Color, number> = { w: initialMs, b: initialMs };
  let started = false;
  let turn: Color = "w";   // the side whose time runs (or would run, when paused)
  let paused = false;
  let since = now();       // when the running side's time was last settled

  // Charge the elapsed time to the side on move.
  function settle(): void {
    const t = now();
    if (started && !paused) left[turn] = Math.max(0, left[turn] - (t - since));
    since = t;
  }

  function flagged(): Color | null {
    settle();
    if (!started) return null;
    return left[turn] <= 0 ? turn : null;
  }

  return {
    press(color) {
      if (color !== turn || flagged()) return;
      left[color] += incrementMs;
      turn = color === "w" ? "b" : "w";
      started = true;
    },
    remaining(color) {
      settle();
      return left[color];
    },
    flagged,
    pause() {
      settle();
      paused = true;
    },
    resume() {
      since = now();
      paused = false;
    },
  };
}
