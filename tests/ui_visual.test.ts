// Hand-written oracle test: the app as a phone actually shows it (SPEC "Phone app (PWA)"
// layout line, and the board rules). Read-only to agents.
//
// The other UI tests run in jsdom, which has no layout: they can't see that a board has
// zero height or that pieces have nothing to draw. This one builds the app, serves it, and
// loads it in headless Chrome with _probe.js, which measures the page and plays e2-e4 with
// real clicks at the squares' centers (hit-testing included).
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const CHROME = process.env.CHROME_PATH ??
  ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"]
    .find((p) => existsSync(p));

let r: any;

// Open the page in headless Chrome and poll it over the DevTools protocol until the probe
// writes its result (real time: the engine thinks in a real Web Worker).
async function probe(url: string): Promise<any> {
  const chrome = spawn(CHROME!, ["--headless=new", "--disable-gpu", "--no-first-run",
    "--window-size=390,844", "--remote-debugging-port=0",
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "chess-chrome-"))}`, url]);
  try {
    const port = await new Promise<string>((resolve, reject) => {
      let err = "";
      chrome.stderr.on("data", (d) => {
        err += d;
        const m = err.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
        if (m) resolve(m[1]);
      });
      chrome.on("exit", () => reject(new Error("Chrome exited: " + err.slice(-500))));
    });
    let page: any;
    for (let i = 0; i < 50 && !page; i++) {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      page = list.find((t: any) => t.type === "page" && t.url.startsWith(url));
      if (!page) await new Promise((res) => setTimeout(res, 100));
    }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res) => ws.addEventListener("open", res, { once: true }));
    let id = 0;
    const send = (method: string, params: object = {}) => new Promise<any>((resolve) => {
      const my = ++id;
      const on = (e: MessageEvent) => {
        const msg = JSON.parse(String(e.data));
        if (msg.id === my) { ws.removeEventListener("message", on); resolve(msg.result); }
      };
      ws.addEventListener("message", on);
      ws.send(JSON.stringify({ id: my, method, params }));
    });
    const evaluate = async (expression: string) =>
      (await send("Runtime.evaluate", { expression, returnByValue: true }))?.result?.value;
    // An iPhone-sized screen (headless Chrome's window can't go below 500 px), then reload
    // so the page lays out and the probe measures at that size.
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await send("Emulation.setTouchEmulationEnabled", { enabled: true });
    await send("Page.reload", { ignoreCache: true });
    await new Promise((res) => setTimeout(res, 300));
    for (let i = 0; i < 100; i++) {                     // up to 20 s
      const text = await evaluate("document.getElementById('probe-result')?.textContent ?? null");
      if (text) {
        // A picture for humans: the screen as the probe left it (after New game).
        const shot = await send("Page.captureScreenshot", { format: "png" });
        if (shot?.data) writeFileSync(join(tmpdir(), "chess-visual.png"), Buffer.from(shot.data, "base64"));
        ws.close();
        return JSON.parse(text);
      }
      await new Promise((res) => setTimeout(res, 200));
    }
    ws.close();
    throw new Error("the probe never finished (did the page crash?)");
  } finally {
    chrome.kill();
  }
}

beforeAll(async () => {
  expect(CHROME, "headless Chrome is needed for this test (set CHROME_PATH)").toBeTruthy();
  const { build, preview } = await import("vite");
  const dist = mkdtempSync(join(tmpdir(), "chess-visual-"));
  await build({ root: ROOT, logLevel: "silent", build: { outDir: dist, emptyOutDir: true } });
  copyFileSync(join(import.meta.dirname, "_probe.js"), join(dist, "_probe.js"));
  const html = readFileSync(join(dist, "index.html"), "utf8");
  writeFileSync(join(dist, "index.html"), html.replace("</body>", '<script src="./_probe.js"></script></body>'));
  const server = await preview({ root: ROOT, logLevel: "silent", build: { outDir: dist },
                                 preview: { port: 0, host: "127.0.0.1" } });
  const url = server.resolvedUrls!.local[0];
  try {
    r = await probe(url);
  } finally {
    await server.close();
  }
}, 120_000);

describe("the app in a real browser", () => {
  test("no script errors", () => {
    expect(r.errors).toEqual([]);
  });

  test("the board is an 8x8 grid of square squares as wide as the screen", () => {
    expect(r.squares).toBe(64);
    const b = r.squareBoxes;
    for (const [s, x] of Object.entries<any>(b)) {
      expect(x.w, `${s} width`).toBeGreaterThan(30);
      expect(Math.abs(x.w - x.h), `${s} is square`).toBeLessThanOrEqual(1);
    }
    const left = Math.min(...Object.values<any>(b).map((x) => x.x));
    const right = Math.max(...Object.values<any>(b).map((x) => x.x + x.w));
    expect(right - left, "board width vs screen").toBeGreaterThanOrEqual(0.9 * r.viewport.w);
    expect(right, "board fits the screen").toBeLessThanOrEqual(r.viewport.w + 0.5);
    // Neighbours sit side by side, not stacked or overlapping.
    expect(Math.abs(b.b1.x - b.a1.x - b.a1.w)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.b1.y - b.a1.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.abs(b.a2.y - b.a1.y) - b.a1.h)).toBeLessThanOrEqual(1);
  });

  test("squares alternate light and dark", () => {
    const c = r.colors;
    expect(c.a1).not.toBe("rgba(0, 0, 0, 0)");
    expect(c.a1).not.toBe(c.a2);
    expect(c.a1).toBe(c.b2);
    expect(c.a2).toBe(c.b1);
  });

  test("all 32 pieces are drawn and fill most of their square", () => {
    expect(r.pieces).toHaveLength(32);
    const side = r.squareBoxes.a1.w;
    for (const p of r.pieces) {
      expect(p.visible && !p.hidden, `${p.piece} has something to draw`).toBe(true);
      expect(Math.min(p.w, p.h), `${p.piece} size`).toBeGreaterThanOrEqual(0.5 * side);
    }
  });

  test("no sideways scrolling, and 44 px touch targets (visible controls)", () => {
    // Vertical fit per screen size is ui_layout.test.ts's job (phones may scroll to the move list).
    expect(r.scroll.w).toBeLessThanOrEqual(r.viewport.w);
    for (const c of r.controls) expect(c.h, `${c.tag} "${c.text}" height`).toBeGreaterThanOrEqual(44);
  });

  test("tapping e2 then e4 plays the move, the engine replies, and New game resets", () => {
    expect(r.afterMove).toEqual({ e4: "wP", e2: null });
    expect(r.engineReplied, "the engine (in its Web Worker) answered within 8 s").toBe(true);
    expect(r.afterNewGame).toEqual({ e2: "wP", e4: null, plies: 0 });
  });
});
