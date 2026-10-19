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
- Next: engine is FEN-string based so it's slowish; if Gio finds level 5 weak, a private mailbox board in the engine would deepen search.
- Session (notation-pgn-out): added toPGN to src/notation/index.ts (seven-tag roster with defaults, SetUp/FEN for non-initial start, extra headers, move numbers from the FEN fullmove counter, `N...` when Black starts, result token from headers.Result). pgn_out + san tests pass (8131); claimed.
- Next: notation-pgn-in (parsePGN).
