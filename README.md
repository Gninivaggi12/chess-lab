# chess-lab

Chess against the computer, as a phone web app ("Add to Home Screen"). It's the Stage 3 practice project for [learning-long-running-agents](https://github.com/Gninivaggi12/learning-long-running-agents): several agents build it in parallel, and an automatic oracle decides whether each part is right.

`SPEC.md` is the source of truth. Play it on a phone once it's built: `npm run build`, host `dist/` (e.g. GitHub Pages), open it in Safari, Share → Add to Home Screen.

## Files

| Path | What | Who writes it |
|---|---|---|
| `SPEC.md` | What to build, including every interface between areas | Gio (agents can't edit it) |
| `src/core/types.ts` | Shared types | Framework (read-only) |
| `src/` | The app: `core`, `notation`, `engine`, `clock`, `sound`, `ui`, `app` | Agents |
| `tests/` | The oracle: fixtures generated from python-chess and published perft counts, plus hand-written clock, UI and PWA tests. About 25% of generated cases are held out privately | Framework generator (agents can't edit it) |
| `tasks.json` | Task list with dependencies | Planner, approved by Gio; `passes` flipped by the harness |
| `progress.md`, `QUESTIONS.md` | Session notes; questions for Gio | Agents |
| `ANSWERS.md`, `REVIEW.md` | Gio's answers; reviewer findings | Harness |
| `init.sh` | Installs the pinned dev tools (`npm ci`) | Framework |

Run the tests: `npm test` (all), `npx vitest run tests/perft.test.ts` (one file).
