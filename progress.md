# Progress

Each session appends 3-5 lines: what it did, what broke, what's next.

- Session (core agent): wrote all of src/core/index.ts (mailbox board, pseudo-legal gen + legality by king-attack test, FEN, apply, status, timeout, premove). All 14 core tasks' test files pass (16 files, 10511 tests); all claimed.
- Nothing broke. Next: other areas (notation, engine, clock, sound, ui, app) belong to the other agent / later sessions.
- Session (clock/sound/pwa agent): built src/clock, src/sound (soundFor + Web Audio play), index.html, public/manifest.webmanifest, public/sw.js, src/app/register-sw.ts, and scripts/make-icons.mjs (generates the PNG icons in public/; rerun with `node scripts/make-icons.mjs`). Tests for clock, sound, pwa-install, pwa-offline and pwa-build pass.
- index.html loads only /src/app/register-sw.ts for now; the UI agent must add the app entry (e.g. src/app/main.ts) as a script there. `tsc --noEmit` already errors on tests/ (tsconfig lacks node types / allowImportingTsExtensions), not touched.
- Not wired yet: the "low-time" sound trigger and the mute toggle belong to the UI tasks.
- Session (notation agent): added src/notation/index.ts with toSAN, built only on the core public API (legalMoves/applyMove/inCheck/positionStatus). tests/san_out.test.ts passes (2313); claimed notation-san-out.
- Next in notation: fromSAN and toPGN (src/notation/index.ts to extend).
- Session (notation-san-in): added fromSAN to src/notation/index.ts (strips trailing +#!?, 0-0 -> O-O, regex parse, filters legalMoves; null unless exactly one match; "x" must agree with whether the move captures). san_in + san_out tests pass (8041); claimed notation-san-in.
- Next: notation-pgn-out, then notation-pgn-in.
- Session (engine agent): wrote src/engine/index.ts: bestMove via core's FEN API, level 1 seeded random, levels 2-5 iterative-deepening alpha-beta (depth caps 1/2/3/6) with material + small positional eval. Level 5 without maxTimeMs stops on a node budget (repeatable) with a 1.5 s backstop; maxTimeMs is a hard deadline. engine_legal/behavior pass; engine_mate1/mate2 also pass already.
- Session (engine-mate1, agent b): no code change needed; tests/engine_mate1 (plus engine_legal/behavior) pass with the existing search, so claimed engine-mate1. Next: engine-mate2 is likewise already passing in practice.
- Next: engine is FEN-string based so it's slowish; if Gio finds level 5 weak, a private mailbox board in the engine would deepen search.
- Session (notation-pgn-out): added toPGN to src/notation/index.ts (seven-tag roster with defaults, SetUp/FEN for non-initial start, extra headers, move numbers from the FEN fullmove counter, `N...` when Black starts, result token from headers.Result). pgn_out + san tests pass (8131); claimed.
- Next: notation-pgn-in (parsePGN).
- Session (notation-pgn-in): added parsePGN to src/notation/index.ts (tag-pair regex with escaped quotes, single-pass movetext scanner skipping {} and ; comments, NAGs, nested variations; stops at the result token; throws on illegal SAN). pgn_in, pgn_out, san_in tests pass (5908); claimed.
- Nothing broke. Notation area is now complete.
- Session (ui-board): added src/ui/index.ts (mountApp: board, tap-to-move, targets, last move, status, SAN move list, engine reply with 0.6 s minimum + data-thinking, sound calls), src/app/engine-worker.ts (default engine in a Worker), src/app/main.ts (wired into index.html). ui_board + pwa tests pass.
- Stubs for later tasks: promotion always becomes a queen (ui-rules adds the picker); level/color fixed at 3/White (ui-newgame); no controls, clocks, persistence yet. render() rebuilds the DOM each time, so extend it rather than caching nodes.
- Next: ui-rules, ui-flip, ui-newgame.
