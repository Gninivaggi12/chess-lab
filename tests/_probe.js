// Injected into the built page by the visual test. Plays e2-e4 with real clicks at the
// squares' centers, waits for the engine, presses New game, and writes what it measured.
(async () => {
  const out = { errors: [] };
  addEventListener("error", (e) => out.errors.push(String(e.message)));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const sq = (s) => document.querySelector(`[data-square="${s}"]`);
  const clickAt = (el) => {
    const r = el.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    (t || el).dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  };
  const plies = () => document.querySelectorAll("[data-move-list] [data-ply]").length;
  const piece = (s) => sq(s)?.querySelector("[data-piece]")?.getAttribute("data-piece") ?? null;
  await wait(500);
  const squares = [...document.querySelectorAll("[data-square]")];
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  out.viewport = { w: innerWidth, h: innerHeight };
  out.scroll = { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight };
  out.squares = squares.length;
  out.squareBoxes = Object.fromEntries(squares.map((s) => [s.dataset.square, box(s)]));
  out.colors = Object.fromEntries(["a1", "a2", "b1", "b2", "h8"].map((s) => [s, sq(s) && getComputedStyle(sq(s)).backgroundColor]));
  out.pieces = [...document.querySelectorAll("[data-piece]")].map((p) => {
    const cs = getComputedStyle(p), b = box(p);
    const visible = (p.textContent.trim() !== "" && cs.color !== "rgba(0, 0, 0, 0)") ||
      cs.backgroundImage !== "none" || !!p.querySelector("svg,img") ||
      getComputedStyle(p, "::before").content.replace(/["']/g, "") !== "none" && getComputedStyle(p, "::before").content !== "normal";
    return { piece: p.dataset.piece, w: b.w, h: b.h, visible, hidden: cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0 };
  });
  out.controls = [...document.querySelectorAll("button, select, input")].filter((c) => c.getClientRects().length && getComputedStyle(c).visibility !== "hidden").map((c) => ({ tag: c.tagName, text: (c.textContent || c.value || "").trim().slice(0, 20), ...box(c) }));
  // Play e2-e4 with real hit-testing, then wait up to 8 s for the engine's reply.
  clickAt(sq("e2")); await wait(100); clickAt(sq("e4"));
  out.afterMove = { e4: piece("e4"), e2: piece("e2") };
  for (let i = 0; i < 80 && plies() < 2; i++) await wait(100);
  out.engineReplied = plies() >= 2;
  const ng = document.querySelector('[data-action="new-game"]');
  if (ng) { clickAt(ng); await wait(300); }
  out.afterNewGame = { e2: piece("e2"), e4: piece("e4"), plies: plies() };
  const pre = document.createElement("pre"); pre.id = "probe-result";
  pre.textContent = JSON.stringify(out); document.body.append(pre);
})();
