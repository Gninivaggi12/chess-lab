// Helpers for the UI oracle tests: the app mounted with a scripted engine, fake time and
// in-memory storage. Hand-written by the framework; read-only to agents.
import { vi } from "vitest";
import { ui } from "./_lib.ts";

export function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

// Replies with the next scripted move. With hold = true, the reply waits for release().
export function scriptedEngine(script: string[] = []) {
  const calls: { fen: string; level: number; maxTimeMs?: number }[] = [];
  let waiting: ((m: string) => void) | null = null;
  return {
    calls,
    hold: false,
    bestMove(fen: string, level: number, maxTimeMs?: number): Promise<string> {
      calls.push({ fen, level, maxTimeMs });
      if (this.hold) return new Promise((resolve) => { waiting = resolve; });
      const next = script.shift();
      return next ? Promise.resolve(next) : new Promise(() => {});
    },
    release(move: string) {
      const w = waiting;
      waiting = null;
      w?.(move);
    },
  };
}

export async function start(opts: { engine?: ReturnType<typeof scriptedEngine>; storage?: Storage; random?: number } = {}) {
  vi.useFakeTimers();
  const { mountApp } = await ui();
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  let t = 0;
  const sounds: string[] = [];
  const engine = opts.engine ?? scriptedEngine();
  const storage = opts.storage ?? memoryStorage();
  const app = mountApp(root, {
    engine, storage, now: () => t, random: () => opts.random ?? 0.3,
    sound: { play: (k: string) => { sounds.push(k); } },
  });
  const q = (sel: string) => root.querySelector(sel) as HTMLElement | null;
  const h = {
    root, app, engine, storage, sounds,
    sq: (s: string) => q(`[data-square="${s}"]`)!,
    piece: (s: string) => q(`[data-square="${s}"] [data-piece]`)?.getAttribute("data-piece") ?? null,
    squaresWith: (attr: string) => [...root.querySelectorAll(`[data-square][${attr}]`)].map((e) => e.getAttribute("data-square")).sort(),
    order: () => [...root.querySelectorAll("[data-square]")].map((e) => e.getAttribute("data-square")),
    tap: (s: string) => { q(`[data-square="${s}"]`)!.dispatchEvent(new MouseEvent("click", { bubbles: true })); },
    action: (a: string) => { q(`[data-action="${a}"]`)!.dispatchEvent(new MouseEvent("click", { bubbles: true })); },
    control: (a: string) => q(`[data-action="${a}"]`)!,
    choose: (p: string) => { q(`[data-promotion-choice="${p}"]`)!.dispatchEvent(new MouseEvent("click", { bubbles: true })); },
    set(name: string, value: string) {
      const el = q(`[data-${name}]`) as HTMLInputElement | HTMLSelectElement;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    status: () => q("[data-status]")!.textContent!.trim(),
    plies: () => [...root.querySelectorAll("[data-move-list] [data-ply]")]
      .sort((a, b) => Number(a.getAttribute("data-ply")) - Number(b.getAttribute("data-ply")))
      .map((e) => e.textContent!.trim()),
    clock: (c: string) => q(`[data-clock="${c}"]`)!.textContent!.trim(),
    thinking: () => root.hasAttribute("data-thinking"),
    async advance(ms: number) {
      // Small steps, so a timer firing mid-way sees the time it fired at.
      for (let left = ms; left > 0; left -= 10) {
        const step = Math.min(10, left);
        t += step;
        await vi.advanceTimersByTimeAsync(step);
      }
      await vi.advanceTimersByTimeAsync(0);
    },
    async move(from: string, to: string) {
      h.tap(from);
      h.tap(to);
      await vi.advanceTimersByTimeAsync(0);
    },
  };
  await h.advance(0);
  return h;
}
