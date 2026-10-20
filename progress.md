# Progress

Each session appends 3-5 lines: what it did, what broke, what's next.

- exp-a-4-a: built `src/clock/index.ts` (createClock: press/remaining/flagged/pause/resume); tests/clock.test.ts passes 7/7 and the task is claimed. Nothing broke.
- Other tasks were out of scope for this session (only `clock`). Next for this area: ui-clock (needs ui-newgame).
- core-fen: added src/core/board.ts (Position type, parseFEN, isAttacked, findKing, square helpers; board index 0 = a8) and src/core/index.ts (INITIAL_FEN, isValidFEN). tests/fen_valid.test.ts passes (337). Claimed.
- core-in-check (exp-a-4-b): added `inCheck(fen)` to src/core/index.ts (parseFEN + isAttacked on the side to move's king; throws on malformed FEN). tests/in_check.test.ts passes; fen_valid and clock still pass. Claimed.
- Next: core-moves-basic (reuse parseFEN/isAttacked from board.ts).
- core-moves-basic (exp-a-4-b): added src/core/moves.ts `legalMoves(fen)` (pseudo-legal per piece, filtered by "own king not attacked"), re-exported from index.ts. Pawn moves/captures onto the last rank are skipped on purpose (promotion not built). moves_basic, fen_valid, in_check, clock pass. Claimed.
- Next for core: castling, en passant, promotion extend legalMoves in moves.ts.
- Earlier note: other core tasks (inCheck, moves) can reuse parseFEN/isAttacked from board.ts and re-export from index.ts.
