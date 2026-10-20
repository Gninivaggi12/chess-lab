// Hand-written oracle test: the screen's structure at six real window sizes, phone to desktop
// (SPEC "Screen layout and look"). Read-only to agents. Runs in headless Chrome, outside the
// agent sandbox (see _browser.ts).
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { MEASURE, VIEWPORTS, isWide, openApp, type Page, type ViewportName } from "./_browser.ts";

let page: Page;
const m: Record<string, any> = {};

beforeAll(async () => {
  page = await openApp();
  for (const name of Object.keys(VIEWPORTS) as ViewportName[]) {
    await page.viewport(name);
    await page.open();
    m[name] = await page.eval(MEASURE);
  }
}, 180_000);

afterAll(async () => { await page?.close(); });

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

describe.each(Object.keys(VIEWPORTS) as ViewportName[])("%s", (name) => {
  const v = VIEWPORTS[name];

  test("the board is square and entirely inside the window", () => {
    const { board, W, H } = m[name];
    expect(board, "64 squares").toBeTruthy();
    expect(near(board.w, board.h, 2), `board ${board.w}x${board.h}`).toBe(true);
    expect(board.x).toBeGreaterThanOrEqual(-0.5);
    expect(board.y).toBeGreaterThanOrEqual(-0.5);
    expect(board.r).toBeLessThanOrEqual(W + 0.5);
    expect(board.b).toBeLessThanOrEqual(H + 0.5);
  });

  test("the board is as large as the window allows", () => {
    const { board, W, H } = m[name];
    if (isWide(v)) expect(board.h, "board height vs window height").toBeGreaterThanOrEqual(0.75 * H);
    else expect(board.w, "board width vs window width").toBeGreaterThanOrEqual(0.96 * W);
  });

  test("player bars sit directly above and below the board, as wide as it, inside the window", () => {
    const { board, top, bottom, H } = m[name];
    expect(top, "[data-player-bar=top] visible").toBeTruthy();
    expect(bottom, "[data-player-bar=bottom] visible").toBeTruthy();
    expect(top.b, "top bar ends where the board starts").toBeLessThanOrEqual(board.y + 1);
    expect(board.y - top.b, "gap between top bar and board").toBeLessThanOrEqual(16);
    expect(bottom.y, "bottom bar starts where the board ends").toBeGreaterThanOrEqual(board.b - 1);
    expect(bottom.y - board.b, "gap between board and bottom bar").toBeLessThanOrEqual(16);
    for (const bar of [top, bottom]) {
      expect(near(bar.x, board.x, 8) && near(bar.r, board.r, 8), "bar spans the board's width").toBe(true);
    }
    expect(top.y).toBeGreaterThanOrEqual(-0.5);
    expect(bottom.b, "bottom bar inside the window").toBeLessThanOrEqual(H + 0.5);
  });

  test("each bar has an avatar, a name and its clock", () => {
    const [top, bottom] = m[name].bars;
    for (const bar of [top, bottom]) {
      expect(bar.avatar, "[data-avatar]").toBe(true);
      expect(bar.clock, "[data-clock] inside the bar").toBe(true);
    }
    expect(bottom.name).toBe("You");
    expect(top.name).toMatch(/^Computer · Level [1-5]$/);
  });

  test("the action buttons are together and on screen", () => {
    const { actions, actionsInside, H, W } = m[name];
    expect(actionsInside.sort()).toEqual(["flip", "mute", "new-game", "settings", "undo"]);
    expect(actions, "[data-actions] visible").toBeTruthy();
    expect(actions.b).toBeLessThanOrEqual(H + 0.5);
    expect(actions.r).toBeLessThanOrEqual(W + 0.5);
  });

  test("settings are tucked away, not loose on the game screen", () => {
    expect(m[name].settingsOpen, "[data-settings] hidden until opened").toBeFalsy();
    expect(m[name].looseSettings, "settings controls outside [data-settings]").toEqual([]);
  });

  if (isWide(v)) {
    test("wide window: a side panel right of the board holds the move list and actions; nothing scrolls", () => {
      const { board, panel, panelHolds, top, bottom, W, H, scrollW, scrollH } = m[name];
      expect(panel, "[data-panel] visible").toBeTruthy();
      expect(panel.x, "panel is right of the board").toBeGreaterThanOrEqual(board.r - 1);
      expect(panel.h, "panel no taller than board + bars").toBeLessThanOrEqual(bottom.b - top.y + 2);
      expect(panelHolds).toEqual({ moveList: true, actions: true });
      expect(scrollW).toBeLessThanOrEqual(W + 1);
      expect(scrollH).toBeLessThanOrEqual(H + 1);
    });
  } else {
    test("narrow window: actions below your bar; no sideways scrolling", () => {
      const { actions, bottom, W, scrollW } = m[name];
      expect(actions.y, "actions start below the bottom bar").toBeGreaterThanOrEqual(bottom.b - 1);
      expect(scrollW).toBeLessThanOrEqual(W + 1);
    });
  }
});
