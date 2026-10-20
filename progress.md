# Progress

Each session appends 3-5 lines: what it did, what broke, what's next.

- core-fen: added src/core/board.ts (Position type, parseFEN, isAttacked, findKing, square helpers; board index 0 = a8) and src/core/index.ts (INITIAL_FEN, isValidFEN). tests/fen_valid.test.ts passes (337). Claimed.
- Next: other core tasks (inCheck, moves) can reuse parseFEN/isAttacked from board.ts and re-export from index.ts.
