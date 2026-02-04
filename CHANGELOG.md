# CHANGELOG — Chess

## 2026-02-03 — v2.2: Casual rename, hint tiers, and final polish

### Naming & UX
- **Renamed:** "Weak" strength profile renamed to **Casual** across the entire codebase — config, backend, frontend, UI pills, and documentation. Legacy `"weak"` key accepted as alias in the backend for backwards compatibility.
- **Moved hints to Strength:** Hint budgets are now a Strength concern (ability), not Style. Casual gets unlimited hints, Moderate gets 3, Strong gets 1, Expert gets 0. Perfect style forces 0 hints regardless of strength.
- **UI pill updated:** Strength selector shows "Casual" instead of "Weak".

### Code Cleanup
- **Removed duplicate folders:** Cleaned up accidental "- Copy" folders (including hidden `.venv - Copy`, `.claude - Copy`, `.pytest_cache - Copy`, `.vscode - Copy`).
- **Dead code sweep:** Removed orphan files, unused functions, stale references.

### Documentation
- **Added:** `BUILD_TIMELINE.md` — full chronological story of the project from first commit to live deployment.
- **Updated:** `bot_settings_reference.txt` — v2.2 with Casual naming and hint tiers in strength table.

### Files Changed
- `bot_config.json`, `app/engine_personas.py`, `app/chess_core.py`
- `static/main.js`, `templates/index.html`
- `bot_settings_reference.txt`, `BUILD_TIMELINE.md`

---

## 2026-02-03 — Voice system expansion

- **Added:** New ElevenLabs Rachel voice files for premium audio experience
  - `static/sounds/voices/rachel/ElevenLabs_2026-01-30T19_39_39_Rachel_pre_sp100_s50_sb75_se0_b_m2.mp3`
  - `static/sounds/voices/rachel/ElevenLabs_2026-01-30T19_39_53_Rachel_pre_sp100_s50_sb75_se0_b_m2.mp3` 
  - `static/sounds/voices/rachel/ElevenLabs_2026-01-30T19_40_39_Rachel_pre_sp100_s50_sb75_se0_b_m2.mp3`
- **Expanded:** Voice system now supports multiple voice profiles with folder-based organization
- **Enhanced:** Voice override system ready for dynamic voice selection (Rachel vs default)

Files changed: New voice files in `static/sounds/voices/rachel/`

## 2026-02-01 — Bug fixes, production cleanup, and UI polish

### Bug Fixes
- **Fixed startup crash:** Removed duplicated file content in `engine_personas.py` that caused a SyntaxError on import.
- **Fixed insufficient material detection:** Added early `check_game_over()` call after the player's move in `/api/move` and `/api/engine_move` so stalemate and insufficient material are detected immediately, not only after the engine replies.
- **Fixed board state corruption on game end:** Removed `_load_state()` from `end_game()` which was reloading stale state from disk and corrupting the in-memory board.
- **Fixed Download PGN button:** Added missing click handler for the board-bottom Download PGN button (`download-pgn-btn-game`).
- **Fixed move scoresheet not resetting:** `startGame()` now resets `historyFens`, `historyMoves`, `historyIndex`, `gameOver`, `lastFinalPgn`, and re-renders the scoresheet.
- **Fixed Export FEN:** Export FEN button was always rebuilding a new Chess instance from the visual board, losing castling rights, en passant, and side to move. Now uses `game.fen()` during normal play, only rebuilds in free-board mode.
- **Fixed voice overrides not loading:** `ChessVoice` and `ChessSounds` were declared with `const` (not `var`), so they weren't on `window`. `voice_overrides.js` couldn't find them and silently exited. Added explicit `window.ChessVoice` and `window.ChessSounds` assignments.
- **Fixed wrong stylesheet:** `index.html` referenced `/static/index.css` (old file) instead of `/static/style.css`.
- **Fixed duplicate HTML ID:** Renamed duplicate `download-pgn-btn-game` to `download-pgn-btn-ingame` on the in-game panel button.
- **Fixed stale persona names:** Updated `_allowed_blunders_for_persona()` from old names (grasshopper, student, etc.) to current names (reckless, cautious, aggressive, etc.).
- **Fixed style personas overwriting engine skill:** Removed dummy `uci`/`depth` from style-only personas in `_load_modular_config()` so they don't overwrite the frontend's `engine_skill`.

### Production Cleanup
- **Set `V1_MODE = True`** to gate dev/test endpoints in production.
- **Removed debug logging:** Removed all `engine_debug.log` writes from `/api/move` and `/api/engine_move`. Deleted stale `engine_debug.log` file.
- **Removed unsafe endpoints:** `/api/open_pgn_notepad` (subprocess.Popen), `/api/engine_move_debug`, `/api/open_engine_debug`, `/api/sync_main_js`, `/test_personas`.
- **Removed dev endpoints:** `/api/dev/presets` and `/api/dev/game_status`.
- **Removed debug output:** `print()` and `traceback.print_exc()` from `engine_personas.py` and `api.py`.
- **Cleaned unused imports:** Removed `traceback`, `current_app`, `render_template` from `api.py`.

### UI Changes
- **Reset button returns to default state:** Now stops the engine, clears all game state, resets board orientation to white, and returns to the SETUP screen.
- **Reset sound:** Plays `reset.mp3` when the reset button is clicked.
- **Resign button color:** Changed `--danger` CSS variable to deep red (`#8b1a1a` light / `#a02020` dark) so the Resign button stands out appropriately.
- **Elo values updated:** Weak 450→350, Moderate 1175→1100, Strong stays at 1700.
- **Removed Elo numbers from UI:** Strength pill buttons now show "Weak", "Moderate", "Strong" without parenthesised Elo ratings.

### Files Changed
- `app/api.py`, `app/engine_personas.py`, `app/chess_core.py`
- `static/main.js`, `static/style.css`
- `templates/index.html`
- `bot_config.json`

---

## 2026-02-01 — Sound system fixes and voice overrides

- **Fixed:** Sound system completely restored — corrected file paths in `static/main.js` to match actual folder structure (`/static/sounds/piece/move.mp3`, `/static/sounds/system/select.mp3`).
- **Added:** Reset sound support with `playReset()` method and `/static/sounds/piece/reset.mp3` loading.
- **Removed:** Redundant `audio_overrides.js` script tag and duplicate `main.js` includes from `templates/index.html` after fixing root cause.
- **Cleaned:** Simplified sound loading by fixing paths directly rather than using override workarounds.
- **Implemented:** Voice override system — created `static/voice_overrides.js` to replace browser TTS with prerecorded MP3 files from `/static/sounds/voices/default/`.
- **Added:** MP3 voice mapping for all game events (welcome, check, checkmate, stalemate, resign) while preserving existing `ChessVoice` API calls.
- **Disabled:** Browser `speechSynthesis` to prevent conflicts with new MP3 voice system.

Files changed: `static/main.js`, `templates/index.html`, `static/voice_overrides.js` (new)

## 2026-01-21 — Feedback widget and server storage


Files changed: `templates/index.html`, `static/style.css`, `server.py`, `app/api.py`, `.gitignore`


## 2026-01-20 — Code cleanup and production readiness
## v2.0.1 — 2026-01-31

- **Added:** Centralized configuration via a new single source of truth: `bot_config.json`.
- **Added:** Consolidated bot lineup to three personas: Beginner, Intermediate, Advanced.

- **Changed:** Reduced bot count from five (Grasshopper, Student, Adept, Ninja, Sensei) to three (Beginner, Intermediate, Advanced).
- **Changed:** `app/engine_personas.py` now loads bot settings from JSON instead of hardcoded dicts.
- **Changed:** `app/chess_core.py` updated `BOT_PRESETS` to reference the three new bot names.
- **Changed:** `static/main.js` updated `BOT_PROFILES` to match the 3-bot system.
- **Changed:** `templates/index.html` UI buttons updated to show only the three bot options.
- **Changed:** Default bot changed from "Student" to "Intermediate".

- **Fixed:** Resolved four fallback reference bugs in `static/main.js` that were causing null profile errors.
- **Fixed:** Corrected HTML button mismatch where `data-value` and display text were inconsistent.

**Technical details**
- **New bots & ratings:** Beginner (450 Elo), Intermediate (1175 Elo), Advanced (1700 Elo).
- **Config:** The JSON-based config system allows tuning bot settings without code changes.
- **Compatibility:** Maintains backward compatibility with existing saved games.
- **Deployment:** All changes tested and deployed to the v2 development environment.

**Files**
- **New:** `bot_config.json`
- **Modified:** `app/engine_personas.py` — added config loader
- **Modified:** `app/chess_core.py` — updated `BOT_PRESETS`
- **Modified:** `static/main.js` — updated `BOT_PROFILES` and fallbacks fixed
- **Modified:** `templates/index.html` — UI updated for 3 bots

- **Fixed unreachable code in batch simulation**: The combined PGN file logic in `api_simulate_batch()` was placed after a `return` statement and never executed. Moved it before the return so batch simulations now properly generate combined PGN files.
- **Removed duplicate code in api.py**: Deleted duplicate `opponent_preset` handling block and duplicate `if engine_persona` block in `api_engine_move()` that were processing the same data twice.
- **Added missing Ninja preset**: Added the `ninja` bot preset to `BOT_PRESETS` in `chess_core.py` to match the frontend persona options (was causing backend/frontend mismatch).
- **Fixed shadowed variable in main.js**: Changed duplicate `let lastFinalPgn` declaration inside window.load to a simple assignment, preventing variable shadowing of the global.
- **Removed misplaced hint listener**: Removed hint button event listener that was incorrectly embedded inside `flashTrays()` function. The listener is properly defined in the main initialization block.
- **Removed debug output for production**: Removed all debug `print()` statements from backend, removed `_syncMainJsSnapshot()` dev-only function, and removed ~50 `console.log` debug statements from tap-to-move and handleGameDrop code. Reduces main.js by ~100 lines.

Files changed: `app/api.py`, `app/chess_core.py`, `static/main.js`

## 2026-01-19 — Tap-to-move fix and drag visibility

- **Fixed tap-to-move functionality**: Resolved double-triggering issue where tapping a piece would immediately select then deselect it. Removed duplicate `handleSquareClick()` call from `handleGameDrop` when source equals target.
- **Fixed `getLocalGameStatus` not defined error**: Moved function from inside the window load handler to the top level so it's accessible during game moves. This was causing pieces to disappear during drag-and-drop.
- **Improved piece visibility during drag**: Added CSS for dragged pieces with high z-index and full opacity. Added board configuration options (`dropOffBoard`, `moveSpeed`, `snapbackSpeed`, `snapSpeed`) for smoother animations.
- **Enhanced click detection for tap-to-move**: Improved DOM traversal to find square elements from click targets, supporting proper square identification from piece images.

Files changed: `static/main.js`, `static/style.css`

## 2026-01-14 — Study / Hint features, Lobby, and UI polish

- Added server-side analysis API `/api/analyze` and `ChessGame.analyze_position()` to return best move, score (centipawns / mate), and a short continuation. Requires a working Stockfish binary (see `STOCKFISH_PATH` or `vendor/stockfish.exe`).
- Frontend Study & Hint system: `#analysis-controls` and a Hint button that requests analysis, draws arrow overlays on the board, and displays short hint text.
- Hint budgets per persona persisted to `localStorage`: Grasshopper (unlimited), Student (3), Adept (2), Ninja (1), Sensei (0). Hints decrement and disable when exhausted.
- Lobby / Start flow reworked: moved start controls into a `#setup-panel`, converted selects to pill-style selectors, and wired `#main-start-btn` to `startGame()` so New Game returns to Lobby.
- Move History: added `#move-history-container` with `#move-list` and navigation buttons; ArrowLeft/ArrowRight/Home/End keys step plies and jump to start/end. History now saves intermediate plies immediately after local user moves for half-move navigation.
- Material advantage scoring: captured-tray rendering computes piece values (P=1,N=3,B=3,R=5,Q=9) and displays a `+N` score badge beside the leading side's tray.
- Captured trays moved into a fixed right sidebar and floating/anchoring logic removed for layout stability.
- Theme: smart Theme Toggle (button reflects the next action) and default to dark mode on first load.
- Removed developer `Tools` anchor and `Laboratory` checkbox from public UI for the v1.1 release.

- 2026-01-14 (verification): confirmed server-side auto-save flow. A Flask test client call to `/api/resign`
  returned a canonical PGN and a subsequent POST to `/api/save_pgn` returned a saved filename
  (e.g. `game_20260114_172205.pgn`) written to the `games/` directory. Client helpers
  `autoSaveGameToServer()` and `markAutoPgnSaved()` were added to `static/main.js`.
Files changed in this session (high level): `templates/index.html`, `static/main.js`, `static/style.css`, `app/chess_core.py`, `app/api.py`

Notes:
- End-to-end verification of `/api/analyze` requires starting the Flask server and an available engine binary; if you see connection errors, ensure `python server.py` is running and `STOCKFISH_PATH` is set.
- Suggested next step: start the server locally and test Hint flow in the browser — I can help debug any server logs you share.

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

## 2026-01-15 — Shutdown prep and final fixes


Files changed in this session: `static/style.css`, `static/main.js`, `app/chess_core.py`, `CHANGELOG.md`, `SHUTDOWN.txt`

How to verify:

## 2026-01-10 — Persona core, Tools UI, and batch simulation
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