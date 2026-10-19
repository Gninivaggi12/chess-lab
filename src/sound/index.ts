import type { SoundKind } from "../core/types.ts";

export function soundFor(san: string, gameOver: boolean): SoundKind {
  if (gameOver) return "game-end";
  if (/[+#]$/.test(san)) return "check";
  if (/^(O-O|0-0)/.test(san)) return "castle";
  if (san.includes("=")) return "promote";
  if (san.includes("x")) return "capture";
  return "move";
}

// Each sound is a list of beeps: [frequency Hz, start s, length s, waveform].
const TUNES: Record<SoundKind, [number, number, number, OscillatorType][]> = {
  move: [[440, 0, 0.06, "triangle"]],
  capture: [[220, 0, 0.09, "square"], [165, 0.05, 0.09, "square"]],
  castle: [[392, 0, 0.06, "triangle"], [523, 0.07, 0.07, "triangle"]],
  check: [[660, 0, 0.08, "sawtooth"], [660, 0.1, 0.08, "sawtooth"]],
  promote: [[392, 0, 0.07, "sine"], [523, 0.07, 0.07, "sine"], [784, 0.14, 0.1, "sine"]],
  "game-end": [[523, 0, 0.15, "sine"], [392, 0.17, 0.15, "sine"], [262, 0.34, 0.3, "sine"]],
  "low-time": [[880, 0, 0.05, "square"], [880, 0.1, 0.05, "square"]],
};

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (!ctx) {
    const Ctor = globalThis.AudioContext ?? (globalThis as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  // iOS starts the context suspended until a user tap; play() runs after one.
  if (ctx!.state === "suspended") void ctx!.resume();
  return ctx;
}

export function play(kind: SoundKind): void {
  try {
    const ac = context();
    if (!ac) return;
    for (const [freq, start, length, wave] of TUNES[kind]) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const t0 = ac.currentTime + start;
      osc.type = wave;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + length);
    }
  } catch {
    // Sound is optional; never break the game over it.
  }
}
