# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JavaScript Tetris (HTML5 Canvas + CSS, no frameworks, no build step, no dependencies, no `package.json`). The whole app is three files: `index.html`, `style.css`, `game.js`.

## Running

Open `index.html` directly in a browser, or serve it locally (needed for some browsers' module/security policies):

```bash
python3 -m http.server 8000   # then open http://localhost:8000
# or
npx serve .
```

There is no build, lint, or test command — there is no toolchain at all. Verify changes by loading the page in a browser and playing.

## Architecture (`game.js`)

Single-file, global-state game with no modules or classes. Everything lives in module-level `let`/`const` bindings and runs top-to-bottom via `init()` at the bottom of the file.

- **Board model**: `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or a piece color index `1–7`.
- **Pieces**: `PIECES` are square matrices of color indices. `current` and `next` are `{ type, shape, x, y }`. Rotation is done via matrix transpose+reverse (`rotateCW`), not precomputed rotation states.
- **Collision** (`collide`): bounds + board-overlap check, reused for movement, rotation, and ghost-piece projection.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` until one doesn't collide.
- **Game loop** (`loop`): driven by `requestAnimationFrame`; accumulates `dt` in `dropAccum` and advances the piece one row once `dropInterval` is exceeded, otherwise calls `lockPiece()`.
- **Locking** (`lockPiece`): merges the piece into `board`, clears full lines (`clearLines`, bottom-up with row re-check via `r++` after splice/unshift), then `spawn()`s the next piece.
- **Scoring/leveling**: `LINE_SCORES = [0, 100, 300, 500, 800]` × `level`; hard drop = 2 pts/row, soft drop = 1 pt/row. Level = `floor(lines / 10) + 1`; `dropInterval = max(100, 1000 - (level-1)*90)`.
- **Rendering** (`draw`/`drawBlock`/`drawGrid`/`drawNext`): full redraw every frame on two canvases (`#board` and `#next-canvas`); ghost piece is the same draw call with `alpha = 0.2` at the projected landing row (`ghostY`).
- **Input**: a single `keydown` listener switches on `e.code` (arrows, `KeyX` rotate, `Space` hard drop, `KeyP` pause); ignored while `paused` or `gameOver`.

When changing board dimensions or block size (`COLS`, `ROWS`, `BLOCK`), also update the `<canvas id="board">` `width`/`height` attributes in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`).
