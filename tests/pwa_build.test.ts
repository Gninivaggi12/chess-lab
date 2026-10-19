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
  }, 120_000);
});
