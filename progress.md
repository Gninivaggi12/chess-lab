# Progress

Each session appends 3-5 lines: what it did, what broke, what's next.

- exp-a-4-a: built `src/clock/index.ts` (createClock: press/remaining/flagged/pause/resume); tests/clock.test.ts passes 7/7 and the task is claimed. Nothing broke.
- Other tasks were out of scope for this session (only `clock`). Next for this area: ui-clock (needs ui-newgame).
- core-fen: added src/core/board.ts (Position type, parseFEN, isAttacked, findKing, square helpers; board index 0 = a8) and src/core/index.ts (INITIAL_FEN, isValidFEN). tests/fen_valid.test.ts passes (337). Claimed.
- core-in-check (exp-a-4-b): added `inCheck(fen)` to src/core/index.ts (parseFEN + isAttacked on the side to move's king; throws on malformed FEN). tests/in_check.test.ts passes; fen_valid and clock still pass. Claimed.
- Next: core-moves-basic (reuse parseFEN/isAttacked from board.ts).
- Earlier note: other core tasks (inCheck, moves) can reuse parseFEN/isAttacked from board.ts and re-export from index.ts.
- exp-a-4-a: built `src/sound/index.ts` (pure `soundFor`, synthesized Web Audio `play`, best-effort/no-op without AudioContext); tests/sound.test.ts passes 495/495, claimed `sound`. Sound quality is untested by design (Gio judges). The "unlock on first tap" and the low-time trigger belong to the UI tasks.
- exp-a-4-a: added `timeoutResult(fen, flagged)` to src/core/index.ts (draw if the opponent has only a king, K+single N vs only K/Q, or bishops-only on one color with no pawns/knights on board; else loss on time). tests/timeout.test.ts passes along with fen_valid and in_check; claimed `core-timeout`. Nothing broke.
