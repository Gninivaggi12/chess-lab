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
| `isValidFEN(fen): boolean` | Six fields, 8 ranks of 8 squares, exactly one king per side, no pawns on ranks 1/8, at most 8 pawns and 16 pieces per side, the side **not** to move isn't in check, every castling right has its king and rook on their original squares, an en passant square is on rank 3/6 behind a pawn that could just have double-pushed, the halfmove clock is an integer ≥ 0 and the fullmove number an integer ≥ 1. Never throws |
| `normalizeFEN(fen): string` | Canonical form. The en passant field is kept only if an en passant capture is **legal** (otherwise `-`). Throws `Error` on invalid FEN |
| `legalMoves(fen): Uci[]` | Every legal move, any order. Castling is the king's move (`e1g1`). Includes en passant, all four promotions, and every pin and check rule |
| `applyMove(fen, uci): string` | The resulting normalized FEN (clocks, castling rights, en passant updated). Throws `Error` on an illegal move |
| `inCheck(fen): boolean` | Side to move is in check |
| `perft(fen, depth): number` | Number of leaf nodes of the legal move tree to `depth` |
| `premoveTargets(fen, square): Square[]` | Destinations for the piece on `square` (either color) by its movement on an **empty** board: sliders along their lines to the edge, knight jumps, king one square, plus castling (`e1`→`g1`/`c1`, `e8`→`g8`/`c8`) if the king is on its start square and that castling right is still in the FEN; pawns one forward, two forward from their start rank, and one diagonally forward. Any order. `[]` for an empty square |
| `positionStatus(fen)` | `{ over: boolean, result: Result, reason?: EndReason }` using the position alone: checkmate, stalemate, insufficient material, fifty-move rule (halfmove clock ≥ 100) |
| `timeoutResult(fen, flagged: Color)` | When `flagged` runs out of time in this position: `{ result: "1-0" \| "0-1", reason: "timeout" }`, or `{ result: "1/2-1/2", reason: "timeout-vs-insufficient-material" }` when the opponent couldn't mate (see Clock) |
| `gameStatus(startFen, moves: Uci[])` | Same shape, for a whole game. Adds **threefold repetition**: the same position (placement, side to move, castling rights, and en passant square **only if a capture is legal**) occurs a third time |

**Draw rules are automatic** (as on chess.com): threefold repetition and the fifty-move rule end the game; nobody has to claim them. **Insufficient material:** besides the kings there is only one knight in total, or only bishops, all on squares of one color (K vs K, K+N vs K, K+B vs K, K+B vs K+B same color). Two knights, or a knight against anything, is not insufficient: mate is possible.

**When several apply, the first wins:** checkmate, stalemate, insufficient material, threefold repetition, fifty-move rule. A move that mates on the 100th half-move is checkmate.

### Notation (`src/notation/index.ts`)

| Export | Behavior |
|---|---|
| `toSAN(fen, uci): string` | Standard algebraic notation: `Nf3`, `exd5`, `O-O`, `e8=Q`, minimal disambiguation (file, then rank, then both), `+` for check, `#` for mate. Throws on an illegal move |
| `fromSAN(fen, san): Uci \| null` | Parses SAN, tolerating a missing or extra `+`/`#`, `0-0` for castling, and annotations (`!`, `?`, `!?`). `null` if illegal or ambiguous |
| `toPGN(game)` | `game` = `{ startFen, moves: Uci[], headers: Record<string,string> }`. Header lines `[Name "value"]`: the seven-tag roster first, in order (`Event`, `Site`, `Date`, `Round`, `White`, `Black`, `Result`; missing ones default to `?`, `????.??.??` for Date, `*` for Result), then `SetUp "1"` and `FEN` when not starting from the initial position, then any other headers in the order given. A blank line, then numbered SAN move text (`1. e4 e5 2. Nf3`, or `1... e5` when Black moves first) ending with the result. Line breaks inside the move text are free (tests compare its tokens) |
| `parsePGN(pgn)` | Back to `{ startFen, moves, headers }`: `headers` holds every tag pair as written (including `FEN`/`SetUp`), `startFen` is the `FEN` header or the initial position, `moves` is the main line. Handles comments `{...}` and `;` to end of line, NAGs `$1`, variations `(...)` (skipped, may nest), move numbers with `.` or `...`, and multiple-line move text. Reads the first game only. Throws on an illegal move |

### Engine (`src/engine/index.ts`)

| Export | Behavior |
|---|---|
| `bestMove(fen, level: 1-5, maxTimeMs?: number): Uci` | A legal move. Throws if there are none. With `maxTimeMs`, returns within that time (plus 150 ms) at any level |
| | Level 1: a mostly random legal move (for beginners). Higher levels search deeper. Level 5 must answer within 2 s on the test machine (tests allow 2.5 s, since several agents may share it) |
| | Every level ≥ 2 plays mate in 1 when available. Level ≥ 4 finds mate in 2 |
| | Deterministic for a given position and level when `maxTimeMs` isn't given (seeded randomness), so tests are repeatable. A time limit may cut the search short, so results under one can vary |

The level-5 target is a solid casual opponent (roughly the strength of a 1300–1600 online player), judged by Gio playing it, not by tests.

**Think time in the app:** the engine never replies sooner than **0.6 s** after your move (a natural pace that leaves time to premove). In a clocked game it spends its own clock: about `remaining / 30 + increment` per move, never more than the level allows, and never so much that it flags with time left to move.

### UI (`src/ui/`, `src/app/`)

Tests start the app with fakes for everything outside the page:

```ts
// src/ui/index.ts
export interface EngineLike { bestMove(fen: string, level: number, maxTimeMs?: number): Promise<Uci>; }
export interface SoundLike { play(kind: SoundKind): void; }
export function mountApp(root: HTMLElement, deps?: {
  engine?: EngineLike;      // default: the engine in a Web Worker
  sound?: SoundLike;        // default: Web Audio
  storage?: Storage;        // default: localStorage
  now?: () => number;       // default: performance.now (clock time)
  random?: () => number;    // default: Math.random (random color)
}): { destroy(): void };
```

Timing uses `setTimeout`/`setInterval`, so tests drive it with fake timers. Moving is by tapping: a `click` on the piece's square element, then on the destination's. Dragging also works, but only Gio's play tests it. On first launch (nothing saved), a game starts with the default settings.


The oracle drives the UI through these attributes, so they're part of the interface:

| Element | Contract |
|---|---|
| Board | 64 elements with `data-square="e4"`; a piece inside has `data-piece="wN"` (color + uppercase type) |
| Moving | Tap a piece, then a destination; or drag. The selected square gets `data-selected`, legal destinations get `data-target`. Tapping another of your pieces selects it instead; any other tap that isn't a legal destination clears the selection. The opponent's pieces can't be selected |
| Promotion | A picker (`data-promotion-choice="q"` etc.) appears; the move happens after the choice |
| Last move, check | `data-last-move` on both squares; `data-check` on the king's square when in check |
| Controls | `data-action="new-game" \| "undo" \| "flip"`; level picker `data-level` (1–5); color picker (white / black / random) |
| Status | `data-status` text, exactly one of: `White to move`, `Black to move`, `Checkmate · White wins`, `Checkmate · Black wins`, `Time out · White wins`, `Time out · Black wins`, `Draw · stalemate`, `Draw · insufficient material`, `Draw · threefold repetition`, `Draw · fifty-move rule`, `Draw · timeout vs insufficient material`. After the game ends, the board accepts no moves and the clocks stop |
| Move list | `data-move-list` showing SAN in numbered pairs |
| Engine | Runs in a Web Worker so the board never freezes. The root element has `data-thinking` from your move until the engine's move appears, or the game ends (e.g. your opponent's flag falls while it thinks). The app calls `engine.bestMove(fen, level, maxTimeMs)` with `maxTimeMs` only in clocked games |
| New game | Settings are `<select>` elements: `select[data-level]` (`1`–`5`, default `3`), `select[data-color]` (`w`, `b`, `random`; default `w`), `select[data-time-control]` (`none`, `1+0`, `3+0`, `3+2`, `5+0`, `10+0`, `15+10`, `30+0`, `custom`; default `none`), with `input[data-custom-minutes]` and `input[data-custom-increment]` for custom. They take effect when `data-action="new-game"` is tapped. `random` is White when `random() < 0.5`. If you're Black, the engine moves first |
| Orientation | Squares are in display order in the DOM: `a8` first with White at the bottom, `h1` first when flipped. Your color starts at the bottom; `flip` toggles it |
| Undo | Takes back your last move and the engine's reply (or just your move, cancelling the search, if the engine is still thinking). The undo control is `disabled` in clocked games and when there's nothing to undo |
| Move list | `[data-move-list]` holds one element per half-move with `data-ply="1"`, `"2"`, …, text = its SAN |
| Sounds | After every move (yours and the engine's) the app calls `sound.play(soundFor(san, gameOver))`, unless muted. `data-action="mute"` toggles muting; it has `data-muted` when muted, remembered in storage |
| Persistence | The game in progress survives closing the app (`localStorage`), including clocks (paused while the app is closed) |
| Clock | `data-clock="w"` / `"b"` text `m:ss` (`5:00`, `12:03`), or `0:09.4` under 10 s; the running one has `data-active`. Hidden (empty) when the time control is `none` |

### Clock (`src/clock/index.ts`)

Pure logic with an injected time source, so tests control time exactly.

| Export | Behavior |
|---|---|
| `createClock({ initialMs, incrementMs }, now: () => number)` | Both sides start with `initialMs`. Nobody's time runs until White's first move is made |
| `clock.press(color)` | Ends `color`'s turn: stops its time, **adds the increment to it**, starts the other side's. Before the first move only `press("w")` counts; after that, pressing for the side whose time isn't running is ignored |
| `clock.remaining(color)` | Milliseconds left, never below 0 |
| `clock.flagged()` | The color whose time hit 0, or `null` |
| `clock.pause()` / `clock.resume()` | For undo, app backgrounding and game end |

**Time controls:** none (default), 1+0, 3+0, 3+2, 5+0, 10+0, 15+10, 30+0, and custom (minutes + increment seconds).

**Running out of time** loses, **unless the opponent couldn't mate by any series of moves**, in which case it's a draw (FIDE rule). The opponent (the side that didn't run out) can't mate when it has:
- only its king; or
- king + exactly one knight, and the side that ran out has nothing but its king and queens; or
- king + bishops only, there are no pawns or knights on the board, and every bishop on the board stands on squares of one color.

`timeoutResult(fen, flagged: Color)` in core returns `{ result, reason }` for this rule. Anything else is a loss on time, e.g. K+N against K+pawn (the pawn can block its own king in). The status adds the `EndReason` `"timeout"` (loss) or `"timeout-vs-insufficient-material"` (draw). These rules match `python-chess`'s `has_insufficient_material` (checked 2026-10-19).

In the app, the clock shows `m:ss`, switching to tenths (`0:09.4`) under 10 s, always **rounded down**, updated at least every 100 ms, and highlights the side to move. Undo isn't available in clocked games.

### Sound (`src/sound/index.ts`)

| Export | Behavior |
|---|---|
| `soundFor(san: string, gameOver: boolean): SoundKind` | Pure. `"game-end"` if `gameOver`, else `"check"` if the SAN ends in `+` or `#`, else `"castle"`, `"promote"`, `"capture"`, `"move"`, checked in that order |
| `play(kind: SoundKind)` | Plays a short synthesized sound with the Web Audio API (no audio files to license). Also `"low-time"` once when your clock drops below 10 s |

A mute toggle (`data-action="mute"`) is remembered between sessions. iPhones only allow audio after a user tap, so the first tap on the board unlocks it.

### Premoves

While the engine is thinking, you can queue **one** move in advance.

- A premove is allowed if the square holds your piece and the destination fits that piece's movement on an **empty** board: sliding pieces along their lines, knight jumps, king one square or castling, pawns one or two forward or one diagonally. Whether it's legal is checked only when it's played.
- While the engine thinks, tapping your piece shows its `premoveTargets` as `data-target`; tapping one queues the premove and gives both squares `data-premove`. Tapping your piece again, or tapping an empty square that isn't a premove destination, cancels it. A pawn premove to the last rank asks for the promotion piece right away.
- When the engine moves: if the premove is now legal, it plays immediately (your clock still gets pressed, so the increment applies); otherwise it's cancelled.

### Phone app (PWA)

- `index.html` at the repo root (Vite's entry) with a viewport meta tag, `<link rel="manifest" href="./manifest.webmanifest">`, `<link rel="apple-touch-icon" href="./apple-touch-icon.png">` and `<meta name="apple-mobile-web-app-capable" content="yes">`.
- `public/manifest.webmanifest` with `name`, `short_name`, `display: "standalone"`, `start_url`, `theme_color`, `background_color`, and icons `public/icon-192.png` (192×192) and `public/icon-512.png` (512×512); `public/apple-touch-icon.png` is 180×180. Icons are real PNGs drawn by a script or by hand (no downloaded artwork).
- `public/sw.js`, a service worker registered by the app, that caches the built app so it works offline after the first visit.
- `npm run build` succeeds.
- **The built app works from any folder, not just the site root.** GitHub Pages serves it at `https://<user>.github.io/chess-lab/`, so every URL in the page, the manifest (`start_url`, `scope`, icons), the service worker's cache list and the service-worker registration must be relative (e.g. Vite `base: "./"`, `./sw.js`, `start_url: "./"`). Root paths like `/sw.js` point outside the app there. (Gio, 2026-10-19: hosted on GitHub Pages so friends can install it.)
- **What the screen shows** (checked in a real browser, headless Chrome at phone width, because the jsdom UI tests can't see layout; Gio, 2026-10-19: the first build showed no board):
  - Layout fits a phone screen in portrait without scrolling; the board is as wide as the screen (at least 90% of it); touch targets (buttons, selects, inputs) are at least 44 px tall.
  - The board is an 8×8 grid of equal square squares, light and dark alternating (a1 dark, as on a real board), so neighbouring squares never share a colour.
  - Every piece is drawn (Unicode chess symbols, inline SVG or CSS drawings; no downloaded images) and fills at least half its square.
  - Tapping a square in the real page selects/moves exactly as the UI rules say; the engine's reply arrives from its Web Worker; New game resets the board.
  - No script errors.

## Out of scope

Online play, accounts, chess variants, opening books, endgame tablebases, analysis boards, more than one premove, music or recorded sound files, animations beyond a simple move transition, an App Store build.

## The oracle (how correctness is decided)

Generated by a script in the framework repo, never by an agent, from:

- **Published perft results** (the chessprogramming.org positions: initial, "Kiwipete" and positions 3–6), the standard test of move generation, where any bug changes the count.
- **`python-chess` as the reference** for thousands of generated cases: legal move lists, FEN after each move, check, game status, repetitions, SAN, and PGN round-trips, from random games and edge-case positions (pins, en passant discoveries, castling through check, underpromotion).
- **Generated puzzles**: positions with a unique mate in 1 / mate in 2, checked by the reference.
- **Hand-written tests** for the clock (with a fake time source), sounds (`soundFor`), premoves and the UI, against the `data-*` contract above, plus manifest and service-worker checks. Sound quality, feel and engine strength are judged by Gio playing.

About 20–25% of the generated cases are held out where agents can't read them. After a run, an independent fuzz compares the agents' core and notation against `python-chess` on random games.
