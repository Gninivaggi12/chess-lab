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
  let running: Color | null = null; // side whose time is counting down
  let paused = false;
  let started = false;
  let stamp = 0; // now() when `left[running]` was last settled

  // Move elapsed time off the running side's balance.
  const settle = () => {
    if (running === null || paused) return;
    const t = now();
    left[running] = Math.max(0, left[running] - (t - stamp));
    stamp = t;
  };

  const flaggedSide = (): Color | null => {
    settle();
    if (left.w <= 0) return "w";
    if (left.b <= 0) return "b";
    return null;
  };

  return {
    press(color) {
      if (flaggedSide() !== null) return;
      if (!started) {
        if (color !== "w") return;
        started = true;
        left.w += incrementMs;
        running = "b";
        stamp = now();
        return;
      }
      if (color !== running) return;
      left[color] += incrementMs;
      running = color === "w" ? "b" : "w";
      stamp = now();
    },
    remaining(color) {
      settle();
      return left[color];
    },
    flagged: flaggedSide,
    pause() {
      settle();
      paused = true;
    },
    resume() {
      if (!paused) return;
      paused = false;
      stamp = now();
    },
  };
}
