// Hand-written oracle tests: the production build (SPEC "Phone app (PWA)"). Read-only to agents.
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function pngSize(path: string): [number, number] {
  const b = readFileSync(join(ROOT, path));
  expect(b.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");     // PNG signature
  expect(b.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

function appSources(): string {
  const dir = join(ROOT, "src", "app");
  const files = existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String) : [];
  return [read("index.html"), ...files.filter((f) => /\.(ts|js)$/.test(f)).map((f) => read(join("src", "app", f)))].join("\n");
}

describe("build", () => {
  test("npm run build succeeds and ships the PWA files", async () => {
    const { build } = await import("vite");
    const outDir = mkdtempSync(join(tmpdir(), "chess-build-"));
    await build({ root: ROOT, logLevel: "silent", build: { outDir, emptyOutDir: true } });
    for (const f of ["index.html", "manifest.webmanifest", "sw.js", "icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
      expect(existsSync(join(outDir, f)), f).toBe(true);
    }

    // The build is the whole app, not just the shell: the entry script mounts the board,
    // the engine is bundled as a separate Web Worker, and the service worker is registered.
    const html = readFileSync(join(outDir, "index.html"), "utf8");
    const entry = [...html.matchAll(/<script[^>]+src="\/?([^"]+\.js)"/g)].map((m) => m[1]);
    expect(entry.length, "index.html loads a bundled script").toBeGreaterThan(0);
    const assets = readdirSync(join(outDir, "assets")).filter((f) => f.endsWith(".js"));
    const js = assets.map((f) => readFileSync(join(outDir, "assets", f), "utf8"));
    const all = js.join("\n");
    expect(all, "the board is rendered (data-square)").toContain("data-square");
    expect(all, "the status line is rendered (data-status)").toContain("data-status");
    expect(all, "the app registers the service worker").toMatch(/serviceWorker\s*\.\s*register/);
    expect(all, "the engine runs in a Web Worker").toMatch(/new\s+Worker\s*\(/);
    expect(assets.length, "the worker is its own bundle").toBeGreaterThan(1);
    const worker = js.filter((src) => !/new\s+Worker\s*\(/.test(src) && !src.includes("data-square"));
    expect(worker.some((src) => /onmessage|addEventListener\(\s*["']message/.test(src)),
      "a bundle that answers messages (the engine worker)").toBe(true);
  }, 120_000);
});
