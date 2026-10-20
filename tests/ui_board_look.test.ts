// Hand-written oracle test: how the board looks and is used, in a real browser with real
// mouse input (SPEC "Screen layout and look"). Read-only to agents. Runs in headless Chrome,
// outside the agent sandbox (see _browser.ts).
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { openApp, type Page } from "./_browser.ts";

let page: Page;
beforeAll(async () => { page = await openApp(); }, 120_000);
afterAll(async () => { await page?.close(); });

const LIGHT = [0xeb, 0xec, 0xd0], DARK = [0x77, 0x95, 0x56];
const rgb = (css: string) => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const dist = (a: number[], b: number[]) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));

// In-page helpers, injected once per load.
const HELPERS = `window.__t = {
  sq: (s) => document.querySelector('[data-square="' + s + '"]'),
  bg: (e) => getComputedStyle(e).backgroundColor,
  center: (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; },
  // Something drawn on a square beyond its plain color: a tint, an overlay, a marker.
  marked: (e, base) => {
    const cs = getComputedStyle(e);
    const pseudo = ["::before", "::after"].some((p) => { const s = getComputedStyle(e, p);
      return s.content !== "none" && s.content !== "normal" && (s.backgroundColor !== "rgba(0, 0, 0, 0)" ||
        s.backgroundImage !== "none" || parseFloat(s.borderTopWidth) > 0 || s.boxShadow !== "none"); });
    const child = [...e.querySelectorAll("*")].some((c) => !c.closest("[data-piece]") && !c.closest("[data-coord]") &&
      !c.hasAttribute("data-piece") && !c.hasAttribute("data-coord") && c.getClientRects().length &&
      (getComputedStyle(c).backgroundColor !== "rgba(0, 0, 0, 0)" || getComputedStyle(c).backgroundImage !== "none" ||
       parseFloat(getComputedStyle(c).borderTopWidth) > 0 || c.tagName === "svg"));
    return { bg: cs.backgroundColor, shadow: cs.boxShadow !== "none", bgImage: cs.backgroundImage !== "none", pseudo, child };
  },
};`;

async function load(viewport: "phone" | "laptop") {
  await page.viewport(viewport);
  await page.open();
  await page.eval(HELPERS);
}

const squareCenter = (s: string) => page.eval<any>(`__t.center(__t.sq("${s}"))`);

describe.each(["phone", "laptop"] as const)("%s", (viewport) => {
  test("squares are chess.com green and cream, a1 dark", async () => {
    await load(viewport);
    const [a1, a2, b1, b2] = await page.eval<string[]>(`["a1","a2","b1","b2"].map((s) => __t.bg(__t.sq(s)))`);
    expect(dist(rgb(a1), DARK), `a1 ${a1}`).toBeLessThanOrEqual(10);
    expect(dist(rgb(b2), DARK), `b2 ${b2}`).toBeLessThanOrEqual(10);
    expect(dist(rgb(a2), LIGHT), `a2 ${a2}`).toBeLessThanOrEqual(10);
    expect(dist(rgb(b1), LIGHT), `b1 ${b1}`).toBeLessThanOrEqual(10);
  });

  test("coordinates sit inside the edge squares in the contrasting color, and follow a flip", async () => {
    await load(viewport);
    const read = () => page.eval<any[]>(`[...document.querySelectorAll("[data-coord]")].map((c) => {
      const sq = c.closest("[data-square]"); const r = c.getBoundingClientRect(), s = sq && sq.getBoundingClientRect();
      return { text: c.textContent.trim(), square: sq && sq.dataset.square, inside: !!s && r.left >= s.left - 0.5 &&
        r.right <= s.right + 0.5 && r.top >= s.top - 0.5 && r.bottom <= s.bottom + 0.5 && r.width > 0,
        color: getComputedStyle(c).color, squareBg: sq && getComputedStyle(sq).backgroundColor }; })`);
    const check = (coords: any[], rankFile: string, fileRank: string) => {
      const ranks = coords.filter((c) => /^[1-8]$/.test(c.text)), files = coords.filter((c) => /^[a-h]$/.test(c.text));
      expect(ranks.map((c) => c.text).sort(), "8 rank labels").toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
      expect(files.map((c) => c.text).sort(), "8 file labels").toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
      for (const c of ranks) expect(c.square, `rank ${c.text}`).toBe(rankFile + c.text);
      for (const c of files) expect(c.square, `file ${c.text}`).toBe(c.text + fileRank);
      for (const c of coords) {
        expect(c.inside, `${c.text} inside its square`).toBe(true);
        expect(dist(rgb(c.color), rgb(c.squareBg)), `${c.text} contrasts with its square`).toBeGreaterThan(40);
      }
    };
    check(await read(), "a", "1");
    const flip = await page.center('[data-action="flip"]');
    await page.click(flip!.x, flip!.y);
    check(await read(), "h", "8");
  });

  test("pieces are the cburnett images, centered, at least 80% of the square", async () => {
    await load(viewport);
    const pieces = await page.eval<any[]>(`[...document.querySelectorAll("[data-piece]")].map((p) => {
      const sq = p.closest("[data-square]"), r = p.getBoundingClientRect(), s = sq.getBoundingClientRect();
      const img = p.tagName === "IMG" ? p : p.querySelector("img");
      const src = (img && img.currentSrc) || getComputedStyle(p).backgroundImage;
      const shown = img ? img.complete && img.naturalWidth > 0 : getComputedStyle(p).backgroundImage !== "none";
      return { code: p.dataset.piece, src, shown, size: Math.min(r.width, r.height) / s.width,
        off: Math.max(Math.abs(r.left + r.width / 2 - (s.left + s.width / 2)), Math.abs(r.top + r.height / 2 - (s.top + s.height / 2))) / s.width };
    })`);
    expect(pieces).toHaveLength(32);
    for (const p of pieces) {
      expect(p.src, `${p.code} uses its cburnett file`).toContain(`pieces/cburnett/${p.code}.svg`);
      expect(p.shown, `${p.code} image loaded`).toBe(true);
      expect(p.size, `${p.code} size`).toBeGreaterThanOrEqual(0.8);
      expect(p.off, `${p.code} centered`).toBeLessThanOrEqual(0.1);
    }
  });

  test("tapping a piece marks its legal destinations", async () => {
    await load(viewport);
    const before = await page.eval<any>(`__t.marked(__t.sq("e4"))`);
    const e2 = await squareCenter("e2");
    await page.click(e2.x, e2.y);
    const targets = await page.eval<string[]>(`[...document.querySelectorAll("[data-target]")].map((e) => e.dataset.square).sort()`);
    expect(targets).toEqual(["e3", "e4"]);
    for (const s of targets) {
      const after = await page.eval<any>(`__t.marked(__t.sq("${s}"))`);
      const visible = after.pseudo || after.child || after.shadow || after.bgImage || after.bg !== before.bg;
      expect(visible, `${s} shows a marker`).toBe(true);
    }
  });

  test("dragging e2 to e4 plays the move; the engine replies; the last move is highlighted", async () => {
    await load(viewport);
    const [e2, e4] = [await squareCenter("e2"), await squareCenter("e4")];
    await page.drag(e2, e4);
    expect(await page.eval(`__t.sq("e4").querySelector("[data-piece]")?.dataset.piece ?? null`), "piece on e4 after the drag").toBe("wP");
    for (let i = 0; i < 80; i++) {
      if (await page.eval(`document.querySelectorAll("[data-move-list] [data-ply]").length >= 2`)) break;
      await page.wait(100);
    }
    const last = await page.eval<any[]>(`[...document.querySelectorAll("[data-last-move]")].map((e) => ({ s: e.dataset.square, ...__t.marked(e) }))`);
    expect(last, "the engine's move: two squares with data-last-move").toHaveLength(2);
    for (const l of last) {
      const tinted = l.pseudo || l.child || l.shadow || l.bgImage ||
        (dist(rgb(l.bg), LIGHT) > 20 && dist(rgb(l.bg), DARK) > 20);
      expect(tinted, `${l.s} is tinted, unlike a plain square`).toBe(true);
    }
  });

  test("the move list shows numbered rows and marks the latest move", async () => {
    // Continues from the previous test's game: 1. e4 and the engine's reply.
    const rows = await page.eval<any[]>(`[...document.querySelectorAll("[data-move-list] [data-move-row]")].map((r) => ({
      number: r.querySelector("[data-move-number]")?.textContent.trim(),
      plies: [...r.querySelectorAll("[data-ply]")].map((p) => p.textContent.trim()) }))`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].number).toBe("1.");
    expect(rows[0].plies[0]).toBe("e4");
    expect(rows[0].plies).toHaveLength(2);
    const current = await page.eval<string[]>(`[...document.querySelectorAll("[data-ply][data-current]")].map((p) => p.dataset.ply)`);
    expect(current).toEqual(["2"]);
  });

  test("settings open from the action bar and credit the piece artist", async () => {
    await load(viewport);
    const s = await page.center('[data-actions] [data-action="settings"]');
    await page.click(s!.x, s!.y);
    const open = await page.eval<any>(`(() => { const d = document.querySelector("[data-settings]");
      const vis = (e) => e && e.getClientRects().length && getComputedStyle(e).visibility !== "hidden";
      return { open: vis(d), controls: ["[data-level]", "[data-color]", "[data-time-control]"].every((q) => vis(d?.querySelector(q))),
               credits: d?.querySelector("[data-credits]")?.textContent.trim() ?? "" }; })()`);
    expect(open.open, "[data-settings] visible after tapping settings").toBe(true);
    expect(open.controls, "level, color and time control inside it").toBe(true);
    expect(open.credits).toContain("Pieces by Cburnett (BSD license)");
  });

  test("the page around the board is dark", async () => {
    await load(viewport);
    const bg = await page.eval<string>(`(() => { for (const e of [document.body, document.documentElement]) {
      const c = getComputedStyle(e).backgroundColor; if (c !== "rgba(0, 0, 0, 0)") return c; } return "rgb(255, 255, 255)"; })()`);
    const [r, g, b] = rgb(bg);
    expect(0.2126 * r + 0.7152 * g + 0.0722 * b, `page background ${bg}`).toBeLessThan(70);
  });
});
