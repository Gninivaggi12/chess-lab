# Progress

Each session appends 3-5 lines: what it did, what broke, what's next.

- exp-a-4-a: built `src/clock/index.ts` (createClock: press/remaining/flagged/pause/resume); tests/clock.test.ts passes 7/7 and the task is claimed. Nothing broke.
- Other tasks were out of scope for this session (only `clock`). Next for this area: ui-clock (needs ui-newgame).
- exp-a-4-a: built `src/sound/index.ts` (pure `soundFor`, synthesized Web Audio `play`, best-effort/no-op without AudioContext); tests/sound.test.ts passes 495/495, claimed `sound`. Sound quality is untested by design (Gio judges). The "unlock on first tap" and the low-time trigger belong to the UI tasks.
