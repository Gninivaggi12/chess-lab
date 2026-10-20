# Progress

Each session appends 3-5 lines: what it did, what broke, what's next.

- exp-a-4-a: built `src/clock/index.ts` (createClock: press/remaining/flagged/pause/resume); tests/clock.test.ts passes 7/7 and the task is claimed. Nothing broke.
- Other tasks were out of scope for this session (only `clock`). Next for this area: ui-clock (needs ui-newgame).
- core-fen: added src/core/board.ts (Position type, parseFEN, isAttacked, findKing, square helpers; board index 0 = a8) and src/core/index.ts (INITIAL_FEN, isValidFEN). tests/fen_valid.test.ts passes (337). Claimed.
- Next: other core tasks (inCheck, moves) can reuse parseFEN/isAttacked from board.ts and re-export from index.ts.
