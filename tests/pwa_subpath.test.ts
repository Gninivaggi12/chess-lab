// Hand-written oracle tests: the built app works under a sub-path, as GitHub Pages serves it
// (SPEC "Phone app (PWA)"). Read-only to agents.
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const SITE = "https://example.github.io/chess-lab/";   // the page URL once deployed

// Every URL must resolve inside /chess-lab/ to a file the build produced.
function check(dist: string, url: string, base: string, what: string) {
  const u = new URL(url, base);
  expect(u.origin + u.pathname, `${what}: ${url} leaves /chess-lab/`).toMatch(/^https:\/\/example\.github\.io\/chess-lab\//);
  const file = u.pathname.replace(/^\/chess-lab\//, "") || "index.html";
  expect(existsSync(join(dist, file)), `${what}: ${url} -> ${file} is not in the build`).toBe(true);
}

describe("sub-path", () => {
  test("page, manifest, icons and service worker all resolve under /chess-lab/", async () => {
    const { build } = await import("vite");
    const dist = mkdtempSync(join(tmpdir(), "chess-sub-"));
    await build({ root: ROOT, logLevel: "silent", build: { outDir: dist, emptyOutDir: true } });

    const html = readFileSync(join(dist, "index.html"), "utf8");
    const refs = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(2);
    for (const r of refs) check(dist, r, SITE, "index.html");

    const manifestUrl = new URL(html.match(/rel="manifest"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*rel="manifest"/)!
      .slice(1).find(Boolean)!, SITE).href;
    const m = JSON.parse(readFileSync(join(dist, "manifest.webmanifest"), "utf8"));
    check(dist, m.start_url, manifestUrl, "manifest start_url");
    if (m.scope) check(dist, m.scope, manifestUrl, "manifest scope");
    for (const icon of m.icons) check(dist, icon.src, manifestUrl, "manifest icon");

    // The service worker's own cache list is relative to sw.js's URL.
    const sw = readFileSync(join(dist, "sw.js"), "utf8");
    const swUrl = new URL("sw.js", SITE).href;
    const listed = [...sw.matchAll(/["'`]([^"'`\s]*\.(?:html|webmanifest|png|js)|\.?\/)["'`]/g)].map((x) => x[1]);
    for (const l of listed) check(dist, l, swUrl, "sw.js cache list");

    // The app registers the service worker without a root-absolute path.
    const js = readdirSync(join(dist, "assets")).filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(join(dist, "assets", f), "utf8")).join("\n");
    expect(js).toMatch(/serviceWorker\s*\.\s*register\s*\(/);
    expect(js, "registers /sw.js from the site root").not.toMatch(/register\s*\(\s*["'`]\/sw\.js/);
  }, 120_000);
});
