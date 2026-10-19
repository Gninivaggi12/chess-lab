# SPEC: chess you can play against the computer, as a phone web app

Status: decisions approved by Gio (2026-10-19): automatic draws, engine levels, feature list, plus clocks, sounds and one premove. Read-only to worker agents.

## Goal

A chess game that runs in a phone's browser and can be installed with "Add to Home Screen": full rules, a computer opponent with several strength levels, works offline. Agents build all of it. An automatic oracle (generated from a reference library and published results, never written by the agents) decides whether each part is right.

This is the Stage 3 practice project for [learning-long-running-agents](https://github.com/Gninivaggi12/learning-long-running-agents): 3 agents working in parallel. The code is split into areas with a fixed interface between them so that agents can work on different areas at once.

## Tech

- **TypeScript**, built with **Vite**, tested with **Vitest** (`jsdom` for the UI). Plain DOM + CSS, no UI framework. **Why:** fewer dependencies, and the oracle drives the UI through `data-*` attributes, so no framework is needed to test it.
- **No runtime dependencies.** In particular no chess library (`chess.js` etc.): writing the chess logic is the work. `package.json` and the lockfile are fixed by the harness; agents can't add packages.
- Everything runs in a Linux container (`node` image), so nothing may depend on macOS.

## Layout and interfaces

Each area lives in its own folder and exposes only what's listed here. Code in one area may use another area only through these exports. **Why:** it keeps parallel work from colliding, and the oracle tests each area through its interface.

```
src/core/      board, FEN, move generation, game state, rules     (pure, no DOM)
src/notation/  SAN, PGN                                            (pure, no DOM)
src/engine/    computer opponent                                   (pure, no DOM)
src/clock/     chess clock                                         (pure, no DOM)
src/sound/     move sounds                                         (Web Audio)
src/ui/        board view, input, game screen                      (DOM)
src/app/       entry point, Web Worker for the engine, PWA files
```

### Shared types (`src/core/types.ts`, provided by the harness, read-only)

```ts
export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type Square = string;            // "a1" … "h8"
export type Uci = string;               // "e2e4", "e7e8q" (promotion piece lowercase)
export type Result = "1-0" | "0-1" | "1/2-1/2" | "*";
export type EndReason = "checkmate" | "stalemate" | "insufficient-material"
                      | "threefold-repetition" | "fifty-move-rule"
                      | "timeout" | "timeout-vs-insufficient-material";
export type SoundKind = "move" | "capture" | "castle" | "check" | "promote" | "game-end" | "low-time";
```

### Core (`src/core/index.ts`)

Positions go in and out as FEN strings, so every function is testable with nothing but strings.

| Export | Behavior |
|---|---|
| `INITIAL_FEN` | `"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"` |
| `isValidFEN(fen): boolean` | Six fields, 8 ranks of 8 squares, exactly one king per side, no pawns on ranks 1/8, at most 8 pawns and 16 pieces per side, the side **not** to move isn't in check, every castling right has its king and rook on their original squares, an en passant square is on rank 3/6 behind a pawn that could just have double-pushed. Never throws |
| `normalizeFEN(fen): string` | Canonical form. The en passant field is kept only if an en passant capture is **legal** (otherwise `-`). Throws `Error` on invalid FEN |
| `legalMoves(fen): Uci[]` | Every legal move, any order. Castling is the king's move (`e1g1`). Includes en passant, all four promotions, and every pin and check rule |
| `applyMove(fen, uci): string` | The resulting normalized FEN (clocks, castling rights, en passant updated). Throws `Error` on an illegal move |
| `inCheck(fen): boolean` | Side to move is in check |
| `perft(fen, depth): number` | Number of leaf nodes of the legal move tree to `depth` |
| `positionStatus(fen)` | `{ over: boolean, result: Result, reason?: EndReason }` using the position alone: checkmate, stalemate, insufficient material, fifty-move rule (halfmove clock ≥ 100) |
| `gameStatus(startFen, moves: Uci[])` | Same shape, for a whole game. Adds **threefold repetition**: the same position (placement, side to move, castling rights, and en passant square **only if a capture is legal**) occurs a third time |

**Draw rules are automatic** (as on chess.com): threefold repetition and the fifty-move rule end the game; nobody has to claim them. **Insufficient material:** besides the kings there is only one knight in total, or only bishops, all on squares of one color (K vs K, K+N vs K, K+B vs K, K+B vs K+B same color). Two knights, or a knight against anything, is not insufficient: mate is possible.

**When several apply, the first wins:** checkmate, stalemate, insufficient material, threefold repetition, fifty-move rule. A move that mates on the 100th half-move is checkmate.

### Notation (`src/notation/index.ts`)

| Export | Behavior |
|---|---|
| `toSAN(fen, uci): string` | Standard algebraic notation: `Nf3`, `exd5`, `O-O`, `e8=Q`, minimal disambiguation (file, then rank, then both), `+` for check, `#` for mate. Throws on an illegal move |
| `fromSAN(fen, san): Uci \| null` | Parses SAN, tolerating a missing or extra `+`/`#`, `0-0` for castling, and annotations (`!`, `?`, `!?`). `null` if illegal or ambiguous |
| `toPGN(game)` | `game` = `{ startFen, moves: Uci[], headers: Record<string,string> }`. Seven-tag roster first, `[FEN]` + `[SetUp "1"]` when not starting from the initial position, numbered SAN move text, result at the end |
| `parsePGN(pgn)` | Back to `{ startFen, moves, headers }`. Handles comments `{...}`, NAGs `$1`, variations `(...)` (skipped), and multiple-line move text. Throws on an illegal move |

### Engine (`src/engine/index.ts`)

| Export | Behavior |
|---|---|
| `bestMove(fen, level: 1-5, maxTimeMs?: number): Uci` | A legal move. Throws if there are none. With `maxTimeMs`, returns within that time (plus 50 ms) at any level |
| | Level 1: a mostly random legal move (for beginners). Higher levels search deeper. Level 5 must answer within 2 s on the test machine |
| | Every level ≥ 2 plays mate in 1 when available. Level ≥ 4 finds mate in 2 |
| | Deterministic for a given position and level (seeded, so tests are repeatable) |

The level-5 target is a solid casual opponent (roughly the strength of a 1300–1600 online player), judged by Gio playing it, not by tests.

**Think time in the app:** the engine never replies sooner than **0.6 s** after your move (a natural pace that leaves time to premove). In a clocked game it spends its own clock: about `remaining / 30 + increment` per move, never more than the level allows, and never so much that it flags with time left to move.

### UI (`src/ui/`, `src/app/`)

The oracle drives the UI through these attributes, so they're part of the interface:

| Element | Contract |
|---|---|
| Board | 64 elements with `data-square="e4"`; a piece inside has `data-piece="wN"` (color + uppercase type) |
| Moving | Tap a piece, then a destination; or drag. The selected square gets `data-selected`, legal destinations get `data-target`. An illegal tap clears the selection |
| Promotion | A picker (`data-promotion-choice="q"` etc.) appears; the move happens after the choice |
| Last move, check | `data-last-move` on both squares; `data-check` on the king's square when in check |
| Controls | `data-action="new-game" \| "undo" \| "flip"`; level picker `data-level` (1–5); color picker (white / black / random) |
| Status | `data-status` text: whose turn, "Checkmate · White wins", "Draw · threefold repetition", etc. |
| Move list | `data-move-list` showing SAN in numbered pairs |
| Engine | Runs in a Web Worker so the board never freezes; `data-thinking` while it searches |
| Persistence | The game in progress survives closing the app (`localStorage`), including clocks (paused while the app is closed) |
| Clock | `data-clock="w"` / `"b"` showing the time; `data-time-control` picker |

### Clock (`src/clock/index.ts`)

Pure logic with an injected time source, so tests control time exactly.

| Export | Behavior |
|---|---|
| `createClock({ initialMs, incrementMs }, now: () => number)` | Both sides start with `initialMs`. Nobody's time runs until White's first move is made |
| `clock.press(color)` | Ends `color`'s turn: stops its time, **adds the increment to it**, starts the other side's. Pressing for the side whose time isn't running is ignored |
| `clock.remaining(color)` | Milliseconds left, never below 0 |
| `clock.flagged()` | The color whose time hit 0, or `null` |
| `clock.pause()` / `clock.resume()` | For undo, app backgrounding and game end |

**Time controls:** none (default), 1+0, 3+0, 3+2, 5+0, 10+0, 15+10, 30+0, and custom (minutes + increment seconds).

**Running out of time** loses, **unless the opponent couldn't mate by any series of moves**, in which case it's a draw (FIDE rule). The opponent (the side that didn't run out) can't mate when it has:
- only its king; or
- king + exactly one knight, and the side that ran out has nothing but its king and queens; or
- king + bishops only, there are no pawns or knights on the board, and every bishop on the board stands on squares of one color.

Anything else is a loss on time, e.g. K+N against K+pawn (the pawn can block its own king in). The status adds the `EndReason` `"timeout"` (loss) or `"timeout-vs-insufficient-material"` (draw). These rules match `python-chess`'s `has_insufficient_material` (checked 2026-10-19).

In the app, the clock shows `m:ss`, switching to tenths (`0:09.4`) under 10 s, and highlights the side to move. Undo isn't available in clocked games.

### Sound (`src/sound/index.ts`)

| Export | Behavior |
|---|---|
| `soundFor(san: string, gameOver: boolean): SoundKind` | Pure. `"game-end"` if `gameOver`, else `"check"` if the SAN ends in `+` or `#`, else `"castle"`, `"promote"`, `"capture"`, `"move"`, checked in that order |
| `play(kind: SoundKind)` | Plays a short synthesized sound with the Web Audio API (no audio files to license). Also `"low-time"` once when your clock drops below 10 s |

A mute toggle (`data-action="mute"`) is remembered between sessions. iPhones only allow audio after a user tap, so the first tap on the board unlocks it.

### Premoves

While the engine is thinking, you can queue **one** move in advance.

- A premove is allowed if the square holds your piece and the destination fits that piece's movement on an **empty** board: sliding pieces along their lines, knight jumps, king one square or castling, pawns one or two forward or one diagonally. Whether it's legal is checked only when it's played.
- Both squares get `data-premove`. Tapping your piece again, or tapping an empty square that isn't a premove destination, cancels it. A pawn premove to the last rank asks for the promotion piece right away.
- When the engine moves: if the premove is now legal, it plays immediately (your clock still gets pressed, so the increment applies); otherwise it's cancelled.

### Phone app (PWA)

- `manifest.webmanifest` with name, short name, `display: standalone`, theme colors, and 192 px + 512 px icons; iOS `apple-touch-icon` and `apple-mobile-web-app-capable` meta tags.
- A service worker that caches the built app so it works offline after the first visit.
- Layout fits a phone screen in portrait without scrolling; the board is as wide as the screen; touch targets are at least 44 px.

## Out of scope

Online play, accounts, chess variants, opening books, endgame tablebases, analysis boards, more than one premove, music or recorded sound files, animations beyond a simple move transition, an App Store build.

## The oracle (how correctness is decided)

Generated by a script in the framework repo, never by an agent, from:

- **Published perft results** (the chessprogramming.org positions: initial, "Kiwipete" and positions 3–6), the standard test of move generation, where any bug changes the count.
- **`python-chess` as the reference** for thousands of generated cases: legal move lists, FEN after each move, check, game status, repetitions, SAN, and PGN round-trips, from random games and edge-case positions (pins, en passant discoveries, castling through check, underpromotion).
- **Generated puzzles**: positions with a unique mate in 1 / mate in 2, checked by the reference.
- **Hand-written tests** for the clock (with a fake time source), sounds (`soundFor`), premoves and the UI, against the `data-*` contract above, plus manifest and service-worker checks. Sound quality, feel and engine strength are judged by Gio playing.

About 20–25% of the generated cases are held out where agents can't read them. After a run, an independent fuzz compares the agents' core and notation against `python-chess` on random games.
