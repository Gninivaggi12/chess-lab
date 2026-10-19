// Hand-written oracle tests for the phone app files (SPEC "Phone app (PWA)"). Read-only to agents.
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

describe("phone app", () => {
  test("index.html has the viewport, manifest and iOS tags", () => {
    const html = read("index.html");
    expect(html).toMatch(/<meta[^>]+name=["']viewport["']/);
    expect(html).toMatch(/<link[^>]+rel=["']manifest["'][^>]+href=["']\/manifest\.webmanifest["']/);
    expect(html).toMatch(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']\/apple-touch-icon\.png["']/);
    expect(html).toMatch(/<meta[^>]+name=["']apple-mobile-web-app-capable["'][^>]+content=["']yes["']/);
  });

  test("the manifest makes it installable", () => {
    const m = JSON.parse(read("public/manifest.webmanifest"));
    for (const key of ["name", "short_name", "start_url", "theme_color", "background_color"]) {
      expect(typeof m[key], key).toBe("string");
    }
    expect(m.display).toBe("standalone");
    const sizes = m.icons.map((i: any) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    for (const icon of m.icons) expect(existsSync(join(ROOT, "public", icon.src.replace(/^\//, ""))), icon.src).toBe(true);
  });

  test("icons are real PNGs of the right size", () => {
    expect(pngSize("public/icon-192.png")).toEqual([192, 192]);
    expect(pngSize("public/icon-512.png")).toEqual([512, 512]);
    expect(pngSize("public/apple-touch-icon.png")).toEqual([180, 180]);
  });

  test("a service worker caches the app and is registered", () => {
    const sw = read("public/sw.js");
    expect(sw).toMatch(/caches\.open/);
    expect(sw).toMatch(/addEventListener\(\s*["']fetch["']/);
    expect(appSources()).toMatch(/serviceWorker\.register\(\s*["'`]\/sw\.js["'`]/);
  });

  test("npm run build succeeds and ships the PWA files", async () => {
    const { build } = await import("vite");
    const outDir = mkdtempSync(join(tmpdir(), "chess-build-"));
    await build({ root: ROOT, logLevel: "silent", build: { outDir, emptyOutDir: true } });
    for (const f of ["index.html", "manifest.webmanifest", "sw.js", "icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
      expect(existsSync(join(outDir, f)), f).toBe(true);
    }
  }, 120_000);
});
