import type { SoundKind } from "../core/types.ts";

export function soundFor(san: string, gameOver: boolean): SoundKind {
  if (gameOver) return "game-end";
  if (/[+#]$/.test(san)) return "check";
  if (san.startsWith("O-O")) return "castle";
  if (san.includes("=")) return "promote";
  if (san.includes("x")) return "capture";
  return "move";
}

// [frequency Hz, duration s] notes per sound, played in sequence.
const NOTES: Record<SoundKind, [number, number][]> = {
  move: [[440, 0.06]],
  capture: [[220, 0.09]],
  castle: [[440, 0.06], [330, 0.06]],
  check: [[660, 0.08], [660, 0.08]],
  promote: [[440, 0.06], [550, 0.06], [660, 0.08]],
  "game-end": [[523, 0.15], [392, 0.15], [262, 0.3]],
  "low-time": [[880, 0.1]],
};

let ctx: AudioContext | undefined;

function context(): AudioContext | undefined {
  if (!ctx) {
    const Ctor = globalThis.AudioContext ?? (globalThis as any).webkitAudioContext;
    if (!Ctor) return undefined;
    ctx = new Ctor();
  }
  return ctx;
}

export function play(kind: SoundKind): void {
  try {
    const ac = context();
    if (!ac) return;
    if (ac.state === "suspended") void ac.resume();
    let t = ac.currentTime;
    for (const [freq, dur] of NOTES[kind]) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + dur);
      t += dur;
    }
  } catch {
    // audio is best-effort
  }
}
