// Helpers for the real-browser oracle tests (ui_layout, ui_board_look). Hand-written by the
// framework; read-only to agents. Builds the app, serves it on localhost and drives headless
// Chrome over the DevTools protocol: window size, measuring, real mouse clicks and drags.
// These tests need things the agent sandbox doesn't allow (a local server, Chrome), so the
// harness runs them outside it and reports failures in VERIFY.md.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
export const CHROME = process.env.CHROME_PATH ??
  ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"]
    .find((p) => existsSync(p));

// The area a page actually gets (screen minus browser bars), from small phone to desktop.
export const VIEWPORTS = {
  "phone-small": { width: 375, height: 553, mobile: true },
  "phone": { width: 393, height: 659, mobile: true },
  "phone-android": { width: 412, height: 839, mobile: true },
  "laptop-small": { width: 1280, height: 632, mobile: false },
  "laptop": { width: 1440, height: 789, mobile: false },
  "desktop": { width: 1920, height: 969, mobile: false },
} as const;
export type ViewportName = keyof typeof VIEWPORTS;
export const isWide = (v: { width: number; height: number }) => v.width >= 900 && v.width > v.height;

export interface Page {
  url: string;
  eval<T = any>(expression: string): Promise<T>;
  viewport(name: ViewportName): Promise<void>;
  open(): Promise<void>;                       // (re)load the app and wait for the board
  click(x: number, y: number): Promise<void>;
  drag(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void>;
  center(selector: string): Promise<{ x: number; y: number } | null>;
  wait(ms: number): Promise<void>;
  close(): Promise<void>;
}

export async function openApp(): Promise<Page> {
  if (!CHROME) throw new Error("headless Chrome is needed for this test (set CHROME_PATH)");
  const { build, preview } = await import("vite");
  const dist = mkdtempSync(join(tmpdir(), "chess-ui-"));
  await build({ root: ROOT, logLevel: "silent", build: { outDir: dist, emptyOutDir: true } });
  const server = await preview({ root: ROOT, logLevel: "silent", build: { outDir: dist },
                                 preview: { port: 0, host: "127.0.0.1" } });
  const url = server.resolvedUrls!.local[0];
  const chrome: ChildProcess = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run",
    "--hide-scrollbars", "--remote-debugging-port=0",
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "chess-chrome-"))}`, "about:blank"]);
  const port = await new Promise<string>((resolve, reject) => {
    let err = "";
    chrome.stderr!.on("data", (d) => {
      err += d;
      const m = err.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
      if (m) resolve(m[1]);
    });
    chrome.on("exit", () => reject(new Error("Chrome exited: " + err.slice(-500))));
  });
  let target: any;
  for (let i = 0; i < 50 && !target; i++) {
    target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t: any) => t.type === "page");
    if (!target) await new Promise((r) => setTimeout(r, 100));
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const send = (method: string, params: object = {}) => new Promise<any>((resolve, reject) => {
    const my = ++id;
    const on = (e: MessageEvent) => {
      const msg = JSON.parse(String(e.data));
      if (msg.id !== my) return;
      ws.removeEventListener("message", on);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    };
    ws.addEventListener("message", on);
    ws.send(JSON.stringify({ id: my, method, params }));
  });
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const page: Page = {
    url,
    async eval(expression) {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error("page error: " + JSON.stringify(r.exceptionDetails).slice(0, 300));
      return r.result.value;
    },
    async viewport(name) {
      const v = VIEWPORTS[name];
      await send("Emulation.setDeviceMetricsOverride", { width: v.width, height: v.height, deviceScaleFactor: 1, mobile: v.mobile });
      await send("Emulation.setTouchEmulationEnabled", { enabled: v.mobile });
    },
    async open() {
      await send("Page.navigate", { url });
      for (let i = 0; i < 50; i++) {
        await wait(100);
        if (await page.eval("document.querySelectorAll('[data-square]').length === 64").catch(() => false)) break;
      }
      await wait(300);
    },
    async click(x, y) {
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"])
        await send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
      await wait(150);
    },
    async drag(from, to) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 8; i++) {
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x + ((to.x - from.x) * i) / 8,
                                                 y: from.y + ((to.y - from.y) * i) / 8, button: "left", buttons: 1 });
        await wait(16);
      }
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: to.x, y: to.y, button: "left", buttons: 0, clickCount: 1 });
      await wait(200);
    },
    async center(selector) {
      return page.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null;
        const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    },
    wait,
    async close() {
      ws.close();
      chrome.kill();
      await server.close();
    },
  };
  return page;
}

// Measured in the page: rectangles of the screen's parts (null when missing or hidden).
export const MEASURE = `(() => {
  const vis = (e) => e && e.getClientRects().length && getComputedStyle(e).visibility !== "hidden";
  const rect = (sel) => { const e = document.querySelector(sel); if (!vis(e)) return null;
    const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
  const sq = [...document.querySelectorAll("[data-square]")].map((e) => e.getBoundingClientRect());
  const board = sq.length ? { x: Math.min(...sq.map((s) => s.left)), y: Math.min(...sq.map((s) => s.top)),
    r: Math.max(...sq.map((s) => s.right)), b: Math.max(...sq.map((s) => s.bottom)) } : null;
  if (board) { board.w = board.r - board.x; board.h = board.b - board.y; }
  return {
    W: innerWidth, H: innerHeight,
    scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight,
    board,
    top: rect('[data-player-bar="top"]'), bottom: rect('[data-player-bar="bottom"]'),
    actions: rect("[data-actions]"), panel: rect("[data-panel]"), moveList: rect("[data-move-list]"),
    settingsOpen: vis(document.querySelector("[data-settings]")),
    looseSettings: ["[data-level]", "[data-color]", "[data-time-control]"].filter((s) => {
      const e = document.querySelector(s); return vis(e) && !e.closest("[data-settings]"); }),
    actionsInside: ["new-game", "undo", "flip", "settings", "mute"].filter((a) =>
      document.querySelector('[data-actions] [data-action="' + a + '"]')),
    panelHolds: { moveList: !!document.querySelector("[data-panel] [data-move-list]"),
                  actions: !!document.querySelector("[data-panel] [data-actions]") },
    bars: ["top", "bottom"].map((b) => { const e = document.querySelector('[data-player-bar="' + b + '"]');
      return e && { avatar: !!e.querySelector("[data-avatar]"),
                    name: e.querySelector("[data-player-name]")?.textContent.trim() ?? null,
                    clock: !!e.querySelector("[data-clock]") }; }),
  };
})()`;
