# CHANGELOG — Chess (2026-01-01)

## 2026-01-13 — Cleanup, flip removal, and verification

- Removed the unused `flip-on-start` checkbox and all associated client-side wiring and console references.
- UI cleanup: centralized start/orientation logic (`startGame()`, `setBoardOrientation()`), consolidated persona selection to `engine-persona`, and enforced the SETUP → IN_GAME → RESULT state machine.
- Fixed several front-end runtime errors and added defensive guards (`engineBusy`, `moveInFlight`, `pendingPromotion`). Ensured End Game / Play button remains usable while engine requests are in-flight.
- Server lifecycle fix: `reset()` clears previous termination fields; promotion, resign, and PGN save flows were verified.
- Updated `static/main.js` and refreshed the root `main_js_dump.txt` snapshot.

Files changed (high level): `templates/index.html`, `static/main.js`, `main_js_dump.txt`, `app/chess_core.py`, `app/api.py`

Verification performed (smoke tests): `/api/state`, `/api/reset`, `/api/move` (played `e2e4` -> engine replied), promotion (`a7a8q`), and `/api/resign` — server returned expected FENs, game_over flags, and PGNs.

## 2026-01-11 — Stability, persona defaults, and UI hardening

- Normalized persona MultiPV defaults to 10 across persona profiles and server callers; MultiPV behavior is now consistent unless explicitly overridden by a persona.
- Added persona `curve` weighting helpers and sampling integration to support soft move-distributions for richer, tunable play.
- Performance: skip unnecessary MultiPV work for deterministic personas (temperature <= 0) to avoid extra engine load.
- Client stability improvements: introduced an `engineBusy` guard to prevent concurrent engine requests and to disable engine controls while work is pending.
- Free Board hardened as a pure editor: editing mode now blocks engine/move requests and offers a `Start From Position` action to begin play from the edited FEN.
- Game termination flow reworked: terminal results (mate/draw/resign) now stop play, mark the game over, and auto-save PGN once without resetting the final board position or clearing history.
- Minor UI polish: Tools launcher opens the simulator in a new tab; promotion/modal, promotion guards, and captured-trays updated for consistency.

## 2026-01-12 — Lifecycle fixes, presets, UI state machine, and dev tooling

- Fixed lifecycle leakage on reset so finished games no longer persist a previous termination state; `ChessGame.reset()` now clears `status`, `end_reason`, `result`, `pgn_final`, and `ended_at`.
- Introduced canonical opponent presets (`BOT_PRESETS`) and mapped the client-side `opponent_preset` into server-side defaults for `engine_persona`, `engine_skill`, and `engine_time` when explicit values are not provided.
- Added a light-weight dev API for tuning and inspection (dev-only endpoints for presets and game status), gated so they are disabled in V1 mode and when Flask debug is not enabled.
- Reworked client UI into a three-state flow (SETUP → IN_GAME → RESULT), moved PGN download to the canonical server-returned PGN, and updated client logic to call `/api/reset` when starting a new game.
- Added a minimal debug panel injected only in Flask debug mode and styled it to be readable in dark themes.
- Fixed several front-end runtime errors (stray syntax token and null DOM refs) and added defensive guards (`engineBusy`, `moveInFlight`) to prevent concurrent engine requests.
- Implemented an API-side fallback for engine replies: if `engine_move()` returned `None` but a move was pushed to the board, recover the last pushed UCI from `game.board.move_stack[-1].uci()` so the client receives the engine move and canonical PGN.

Files changed:
- `app/chess_core.py` — added `BOT_PRESETS`, cleared lifecycle fields in `reset()`.
- `app/api.py` — mapped `opponent_preset` to engine defaults, added dev endpoints (`/api/dev/presets`, `/api/dev/game_status`), and implemented the engine-reply fallback.
- `templates/index.html` — injected `window.DEBUG_MODE`/`window.V1_MODE`, reworked panels, added debug panel markup.
- `static/main.js` — implemented the SETUP/IN_GAME/RESULT state machine, fixed JS syntax/DOM issues, and added client-side guards and PGN download flow.
- `static/style.css` — debug panel styling (forced high-contrast light palette for readability in dark mode).
- `server.py` — pass debug flag to templates and respect `DEBUG`/`FLASK_DEBUG` env vars when running.

How to verify:
- Restart the Flask server (use debug mode if you want the dev panel), play until a mate/draw/resign and confirm the RESULT panel shows the correct `engine_reply` and canonical PGN.

## 2026-01-10 — Persona core, Tools UI, and batch simulation

- Implemented richer engine persona core: explicit `engine_persona` and `engine_skill`, MultiPV sampling, mercy rules, blunder budgets, and phase-aware softness for endgame tuning.
- Added deterministic RNG support and per-run seeding to make persona simulations reproducible.
- Tools UI (`/test_personas`) for persona tuning, import/export/reset of persona overrides, single and batch simulation runs, and download of combined PGN/CSV results.
- Persona overrides persisted to `data/persona_overrides.json` with validation and atomic writes.
- Batch simulation: autosaves per-game PGNs into `games/tests/`, writes a combined PGN and CSV summary, and includes `WhitePersona`, `BlackPersona`, `Seed`, `GameNumber`, `EngineTime`, and `Termination` PGN headers.
- Added secure download endpoint for saved PGN/CSV files and headless CLI batch runner `tools/simulate_personas.py`.
- Stopped adding additional PGN metadata beyond `EngineTime` and `Termination` per user request.
 - Removed the public `thinking-speed` selector and hid thought-time controls; persona-driven play now uses an internal default `PERSONA_DEFAULT_ENGINE_TIME` to avoid inconsistent behavior with MultiPV sampling.

## 2026-01-09 — Free-board editor, FEN export, and server sync

- Added a Free Board editing mode that allows placing, removing and rearranging pieces without engine interference.
  - `Free Board` toggle in the Controls area enables/disables free editing.
  - Drag pieces freely, double-click a square to remove a piece, or use the piece palette to add pieces.
  - Simplified piece trays (fixed icons for P,R,N,B,Q per color) serve as a quick palette for adding pieces in free-board mode.
  - `Clear Board` button empties the board when Free Board is enabled.
  - `Export FEN` builds a FEN from the free-board and copies it to the clipboard automatically (uses Clipboard API with a textarea fallback).
  - All free-board edits (palette add, tray add, dblclick remove, drag/drop) auto-copy the new FEN to the clipboard and update the `FEN` display.
  - `Start From Position` control: choose which side is to move and start a normal game from the current free-board position.
    - Client applies the FEN locally and also POSTs `/api/set_fen` so the server-side `ChessGame` is synchronized (engine/play continue from the same position).
    - A confirmation prompt is shown before starting from the free-board.
  - Preserved captured-piece counters when starting from free-board instead of clearing them.

Files changed:
- templates/index.html — added `Free Board` controls, `Export FEN`, `Clear Board`, `Start From Position`, and `Start to move` selector; removed tray labels.
- static/main.js — implemented free-board mode, piece palette, click/dblclick handlers, auto-copy-to-clipboard, Clear Board, Start From Position logic, and client call to `/api/set_fen`.
- app/api.py — added `/api/set_fen` endpoint so the server can load an arbitrary FEN for play and engine replies.

Notes:
- Free-board editing is client-side; starting from the position pushes it into the local history and synchronizes the server state.
- The FEN copy behavior uses the Clipboard API when available and falls back to a temporary textarea + `document.execCommand('copy')` when needed.
- Persona & Engine updates:
  - Added `engine-persona` client select and server-side persona support; persona options: Grasshopper (0), Student (1), Adept (3), Ninja (5), Sensei (8).
  - (Deprecated) Previously included a `thinking-speed` (`fast` / `deep`) selector which mapped persona-specific time presets and updated the engine time slider. This selector was removed on 2026-01-10 in favor of an internal default engine time for persona-driven play (`PERSONA_DEFAULT_ENGINE_TIME`).
  - Persona selection is persisted in `localStorage` and is disabled while a game is active (Start/Stop Game), preventing mid-game persona swaps.
  - Engine behavior switched to spawning a transient engine instance per request (server-side) to avoid stale persistent-engine replies; this fixed intermittent null-engine responses.
  - Snapshot sync on unload: client attempts a final POST to `/api/sync_main_js` (beacon/fetch keepalive fallback) so the repo root `main.js.txt` is kept in sync with `static/main.js` after a session.

  - UI polish (2026-01-09 — later):
    - Consolidated Play/Resign into one `#play-engine-btn`; label toggles `Start Game` / `Resign` and uses green/red text states.
    - Normalized `.ctrl` buttons to a fixed size (`min-width`/`height`) so labels don't reflow layout.
    - Moved `Export FEN` / `Download PGN` below the board in a compact row to free up board area.
    - Added numeric badges next to captured-piece tray icons (hidden when zero) that reflect per-piece capture counts; trays display captured piece colors correctly.
    - Anchored captured-trays beneath the board on the side opposite the player's bottom color (white-bottom -> trays right; black-bottom -> trays left).
    - Adjusted board sizing to scale primarily by viewport height (`72vh` cap) and use `aspect-ratio: 1/1` so the board dominates without forcing scroll.
    - Synced root `main.js.txt` snapshot to match `static/main.js` after these edits.

    ### 2026-01-09 (update)

    - Added a dedicated `Reset` button to the **Game** tab so users can reset the live/server-backed game from the UI (`game-reset-btn`).
    - Adjusted the Free Board `Reset` behavior so it restores the standard starting position rather than leaving the board empty (`reset-btn` in the Free tab).
    - Ensured Free Board `Reset` copies the starting FEN to the clipboard and updates the `FEN` display.
    - Updated `static/main.js` to wire the new `game-reset-btn` and to make the Free-board reset restore the standard starting position.
    - Re-synced `main.js.txt` snapshot to reflect the latest `static/main.js` changes (persona fallback, reset handlers, UI tweaks).


---

## 2026-01-08 — Player names, PGN auto-save, UI & backend improvements

- Added `Player name` and `Opponent name` input fields to the main UI and persisted them to localStorage so the human player's name and opponent label are preserved across sessions.
- Displayed a concise `White / Black` mapping near the controls so users always know which side each name refers to.
- Persisted and included those names in PGN saves and in the `resign` flow so saved PGN headers correctly record which side the human played.
- Implemented automatic PGN saving on terminal positions (checkmate, stalemate, draw, threefold repetition, insufficient material). Auto-save runs once per finished game and is suppressed if the user manually saved or resigned to avoid duplicates.
- Added a small `players-display` UI element and wired dynamic updates when names or the `Player color` selector change.
- Client-side: updated `static/main.js` to load/persist names, update the players display, trigger auto-save on terminal positions, and prevent duplicate auto-saves.
- Backend: `app/api.py` already supported PGN saving; ensured `resign` and `save_pgn` endpoints accept `user_name` and `opponent_name` so saved PGNs include proper White/Black headers.

Files changed:
- templates/index.html — added `player-name` / `opponent-name` inputs and `players-display` element.
- static/main.js — load/persist names, players display, auto-save logic, include names in save/resign payloads.
- app/api.py — ensure `save_pgn`/`resign` read `user_name`/`opponent_name` (already present); PGN writer maps user side to White/Black.

Notes:
- Auto-save is a client-side, fire-and-forget POST to `/api/save_pgn` and will surface the saved filename in the status bar when successful.
- The opponent label defaults to `Engine` when engine-play is active, otherwise `Opponent`.

---

This changelog summarizes the client- and server-side changes made during the development session on 2026-01-01.

## Summary
- Improved client-side move safety and UX for promotions.
- Added deterministic cache-busting for `main.js` on the server.
- Introduced helpers for consistent status and FEN handling, plus history navigation.
- Hardened client/server synchronization to prevent visual desync and illegal moves.

## Client (frontend)
- Promotion UI
  - Added a small modal to choose promotion piece (Queen/Rook/Bishop/Knight) instead of a prompt.
  - Modal supports keyboard shortcuts (q/r/b/n) and cancel.
  - Promotion flow is non-blocking: UI returns `snapback` immediately while the modal resolves, preventing renderer inconsistencies.
  - Files: `templates/index.html`, `static/style.css`, `static/main.js`, `main.js.txt` (root editable copy)

- Move safety and sync
  - Introduced `moveInFlight` and `pendingPromotion` flags to prevent concurrent/overlapping moves while awaiting server responses.
  - Added a hard, non-destructive legality check in `onDrop` to prevent illegal moves before opening the promotion modal or sending to server.
  - Added `onDragStart` to block dragging when not side-to-move, or while a move/promotion is pending.
  - Centralized move commit logic into `submitUci(uci, prevFen)` which sends `/api/move` and applies server-confirmed FENs or reverts on error.
  - Replaced stray `document.getElementById('status')` writes with `setStatus(msg)` (timestamped) for consistent status updates.
  - Replaced visual snapback logic with `rejectMove(msg)` that forces the board to the displayed FEN and returns `'snapback'`.
  - Files: `static/main.js`, `main.js.txt`

- History and UX helpers
  - Added `setFen(fen, pushHistory)` to update board + game and maintain `historyFens`.
  - Added left/right arrow key handlers to step backward/forward through confirmed positions.
  - `setStatus` now prefixes messages with a timestamp and logs to console.
  - Files: `static/main.js`, `main.js.txt`

- Debugging aids
  - Added console stamps: `main.js loaded: v1.1 - turn lock + promo modal` and `ON DROP HANDLER ACTIVE` to help detect stale/cached script loading.
  - Created and synchronized `main.js.txt` as a root-editable copy.

## Server (backend)
- Cache busting for client JS
  - `server.py` now computes an MD5 hash of `static/main.js` and passes it as `main_js_version` into the template.
  - `templates/index.html` script tag updated to load `/static/main.js?v={{ main_js_version }}` to force browsers to fetch the new file when content changes.
  - Files: `server.py`, `templates/index.html`

## Tests and validation
- Built and ran server-side move tests during development (using a test harness and the Flask test client) to validate:
  - Legal move acceptance and FEN updates
  - Illegal move rejection
  - Promotion handling in a corrected legal board setup
- Created `tools/test_moves.py` as a simple POST-based test harness (used during development).

## Notable files changed
- `static/main.js` — Main client logic (promotion modal flow, guards, setStatus/setFen/rejectMove, history navigation).
- `main.js.txt` — Root copy of `static/main.js`, kept in sync for independent edits.
- `templates/index.html` — Added modal HTML and cache-busted script tag.
- `static/style.css` — Promotion modal styles.
- `server.py` — MD5-based cache-busting for `main.js`.
- `tools/test_moves.py` — Simple test harness (created earlier in session).

## How to test (quick)
1. Restart the Flask server:

```bash
python server.py
```

2. Hard-refresh the web page (Ctrl+F5) to ensure the updated `main.js` is loaded.
3. Open DevTools → Console and confirm you see the `main.js loaded` stamp and `ON DROP HANDLER ACTIVE` logs when dropping pieces.
4. Try the following interactions:
   - Normal legal moves should be confirmed by the server and pushed into history.
   - Illegal moves, wrong-side moves, or no-piece drops should trigger `rejectMove(...)` and visually snap back to the displayed FEN.
   - Promote a pawn to verify modal selection and server-confirmed promotion (UCI `e7e8q` style).
   - Use Left/Right arrow keys to iterate through `historyFens`.

## Next recommended steps
- Commit changes to Git (if you want I can prepare the commands or commit locally if `git` is available).
- Optional: switch server cache versioning to a short hash (first 8 chars) for tidier URLs.
- Optional: improve modal styling and accessibility (focus management, ARIA attributes).

---

## 2026-01-07 — Stockfish integration and engine UI

- Integrated Stockfish engine support (python-chess UCI) with automatic detection of `STOCKFISH_PATH`, PATH lookup, and `vendor/stockfish.exe` support.
- Added backend engine move support in `app/chess_core.py` (`engine_move(limit, skill)`) and exposed engine replies through the existing `/api/move` endpoint via the `engine_reply` flag.
- Added engine controls to the UI: Time slider (`engine_time`) and Skill slider (`engine_skill`), sent with move requests. Files: `templates/index.html`, `static/main.js`, `app/api.py`, `app/chess_core.py`.
- Added `Play Engine` mode: a toggle button that starts a fresh game (POST `/api/reset`) and forces engine replies; sliders are hidden when engine play is stopped.
- `start-tutor.bat` updated to set `STOCKFISH_PATH` if `vendor\\stockfish.exe` exists.

Testing performed:
- Verified server can run and respond to `/api/state` and `/api/move`.
- Sent test move `e2e4` with `engine_reply=true` and engine parameters; engine replied (example `e7e5`).

If you'd like this summarized entry moved to the top of the file or saved as a separate dated file, tell me and I will adjust.
If you'd like this changelog added as a commit message or want the file named with a date (e.g. `CHANGELOG-2026-01-01.md`), tell me and I will create/rename accordingly.

## 2026-01-05 — Small UI improvements: Dark mode

- Added a user-toggleable dark mode with persistence and prefers-color-scheme fallback.
  - Files: `static/style.css`, `templates/index.html`, `static/main.js`, `main.js.txt`
  - The toggle is a small button near the header (`#theme-toggle`) and saves `theme` in `localStorage`.
  - Dark theme uses CSS variables under `[data-theme="dark"]` for easy theming and future tweaks.

Notes:
- The client now initializes the theme on load, falls back to the user's OS preference, and persists manual toggles.
- If you prefer a different default (light/dark) or want an icon instead of button text, tell me and I will adjust.