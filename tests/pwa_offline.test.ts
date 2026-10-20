// Hand-written oracle tests: the service worker (SPEC "Phone app (PWA)"). Read-only to agents.
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

describe("offline", () => {
  test("a service worker caches the app and is registered", () => {
    const sw = read("public/sw.js");
    expect(sw).toMatch(/caches\.open/);
    expect(sw).toMatch(/addEventListener\(\s*["']fetch["']/);
    expect(appSources()).toMatch(/serviceWorker\.register\(/);
    expect(appSources()).toMatch(/sw\.js/);
  });
});
