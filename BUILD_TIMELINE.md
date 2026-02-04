# Chess App — Build Timeline

A chronological story of how the chess application was built, from first
move to current state.

---

## Phase 1: Foundation (Jan 5–8, 2026)

### Jan 5 — Dark Mode & First UI
The project started as a minimal Flask + python-chess scaffold with a
chessboard.js / chess.js frontend. The first feature beyond the bare board
was a toggleable dark mode with OS-preference detection and localStorage
persistence.

### Jan 7 — Stockfish Integration
The app got its brain. Stockfish was wired in through python-chess's UCI
interface with automatic path detection (`STOCKFISH_PATH`, PATH lookup,
`vendor/stockfish.exe`). Backend `engine_move()` was added to
`chess_core.py`, and the UI gained Time and Skill sliders so players could
tune the engine on the fly. A "Play Engine" toggle started fresh games with
engine replies.

### Jan 8 — Player Names & Auto-Save
Player and opponent name fields were added and persisted to localStorage.
Names flow into PGN headers so saved games record who played which side.
Automatic PGN saving was introduced — the client fires a POST to
`/api/save_pgn` on checkmate, stalemate, draw, and resignation, with
duplicate-save prevention.

---

## Phase 2: Editing & Personas (Jan 9–11, 2026)

### Jan 9 — Free-Board Editor & FEN Export
A full board editor arrived: drag pieces freely, double-click to remove,
use a piece palette to add. "Clear Board" empties everything, "Export FEN"
copies the position to the clipboard, and "Start From Position" begins a
real game from any arrangement (synced to the server via `/api/set_fen`).
The UI was reorganized — Play/Resign consolidated into one button, Export
FEN and Download PGN moved below the board, captured-piece trays gained
numeric badges, and the board scaled to 72vh with a 1:1 aspect ratio.

### Jan 10 — Persona System & Batch Simulation
Five bot personalities were introduced: Grasshopper, Student, Adept, Ninja,
and Sensei — each with distinct Elo, skill, and time settings. A batch
simulation system was added for testing personas against each other, writing
per-game PGNs, combined PGN files, and CSV summaries. A headless CLI
runner (`tools/simulate_personas.py`) made automated testing possible. The
public "thinking speed" selector was removed in favor of an internal
default engine time.

### Jan 11 — MultiPV & Curve Weighting
The engine was upgraded to analyse multiple candidate moves per position
(MultiPV 10). Curve weighting and temperature-based sampling were added so
each persona could have a distinct "move personality" — some prefer the top
engine choice, others gamble on lower-ranked moves. Deterministic personas
(temperature 0) skip MultiPV entirely to save engine load.

---

## Phase 3: UX Polish & Lifecycle (Jan 12–15, 2026)

### Jan 12 — State Machine & Dev Tooling
The client UI was restructured into a clean three-state flow: **SETUP →
IN_GAME → RESULT**. Canonical bot presets (`BOT_PRESETS`) mapped
client-side persona picks to server-side engine defaults. Dev-only
inspection endpoints were added behind a debug gate. An engine-reply
fallback was implemented — if `engine_move()` returned None but a move was
actually pushed, the server recovers it from the move stack.

### Jan 13 — Cleanup & Flip Removal
The unused "flip on start" checkbox was removed. Start and orientation
logic was centralized. Defensive guards (`engineBusy`, `moveInFlight`,
`pendingPromotion`) were added throughout to prevent concurrent engine
requests and race conditions. Server lifecycle was hardened so `reset()`
clears all termination fields.

### Jan 14 — Study Mode, Hints & Lobby
A server-side analysis API (`/api/analyze`) was added, returning the best
move, evaluation, and a short continuation line. The frontend gained a Hint
button that draws arrow overlays on the board. Hint budgets were
per-persona and persisted to localStorage (unlimited for Grasshopper, zero
for Sensei). The start flow was reworked into a lobby with pill-style
selectors. Move history navigation was added (arrow keys, Home/End). A
material-advantage scoring system was introduced, showing +N badges on the
leading side's captured tray.

### Jan 15 — Shutdown Prep
Final polish and a shutdown checklist were created for clean archival of
the v1.1 release.

---

## Phase 4: Cross-Platform & Stability (Jan 16–21, 2026)

### Jan 16 — Tap-to-Move, Linux Support & AppState
Tap-to-move was implemented and iterated on (three commits to get it
right). The folder structure was flattened, a Linux Stockfish binary was
added, and smart path-switching was built so the app works on both Windows
and Linux without config changes. Dead code and debug console statements
were swept out. Player names in PGN output were corrected. A centralized
`AppState` container replaced scattered global variables.

### Jan 19 — Tap-to-Move Fix & Drag Visibility
A double-triggering bug in tap-to-move was fixed (tapping a piece was
immediately selecting then deselecting it). Dragged pieces got high z-index
and full opacity. Board animation speeds were tuned. Background dimming was
added when a game is active.

### Jan 20 — Production Cleanup
Major production-readiness sweep: removed all debug `print()` statements
and `console.log` calls (~50 removed from main.js alone). Removed unsafe
endpoints (`/api/open_pgn_notepad`, debug endpoints). Set `V1_MODE = True`
to gate dev endpoints. Fixed duplicate code, unreachable code, and a
missing Ninja preset.

### Jan 21 — v2 Branch & Feedback Widget
The project was committed as "chess board v2" on a new branch. A feedback
widget was added with server-side storage.

---

## Phase 5: Sound & Voice (Jan 24 – Feb 1, 2026)

### Jan 24 — UI Updates
Feedback button refinements and general UI updates.

### Jan 30 — Sound System
Sound effects were fully wired — move sounds, capture sounds, check bells,
and a reset sound. File paths were corrected to match the actual folder
structure. A voice override system (`voice_overrides.js`) was created to
replace browser TTS with prerecorded MP3 files. Button styling was
refined and the old `index.css` was removed in favor of `style.css`.

### Jan 31 — Bot System v2.0.1
The five original personas (Grasshopper through Sensei) were consolidated
into three clear bots: **Beginner, Intermediate, Advanced**. A centralized
`bot_config.json` became the single source of truth — engine_personas.py
now loads settings from JSON instead of hardcoded dicts. Four fallback bugs
in main.js were fixed.

### Feb 1 — Bug Fix Sweep
A major bug-fix session addressed eight distinct issues:
- Startup crash from duplicated file content
- Insufficient material detection timing
- Board state corruption on game end
- Missing Download PGN click handler
- Scoresheet not resetting on new game
- Export FEN losing castling rights and en passant
- Voice overrides not loading (const vs var scoping)
- Wrong stylesheet reference

Production cleanup continued: debug logging removed, unsafe endpoints
deleted, stale persona names updated.

---

## Phase 6: Modular Strength + Style System (Feb 2–3, 2026)

### Feb 2 — Two-Axis Bot Architecture
The bot system was redesigned into two independent axes:

- **Strength** (what the bot sees): Elo cap, skill level, search depth,
  thinking time
- **Style** (how the bot picks moves): temperature, blunder cap, curve
  weights, endgame behavior

Any combination works — a "Strong + Reckless" bot can find mate but might
not play it; a "Casual + Cautious" bot will miss mates because it can't
calculate that far, regardless of style.

**Strength profiles:** Casual (600 Elo), Moderate (1200), Strong (1800),
Expert (2200)

**Style profiles:** Reckless (wild, high temperature), Aggressive
(risk-taker), Cautious (solid, low randomness), Perfect (always plays the
engine's top choice)

Five pre-configured bots combine these: Beginner (Casual + Reckless),
Intermediate (Moderate + Cautious), Advanced (Strong + Perfect), Aggressive
(Moderate + Aggressive), Wildcard (Strong + Reckless).

### Feb 2 — Perfect ↔ Expert Lock
A UI constraint was added: selecting "Perfect" style automatically selects
Expert strength and greys out the other strength options. Expert is hidden
for all other styles. The setup screen was reordered to put Style first
(personality) and Strength second (difficulty), with a how-to-play note
explaining the flow.

### Feb 2 — Export FEN Fix & UI Polish
The Export FEN clipboard logic was fixed (was failing silently on
non-HTTPS). A `window.prompt()` fallback was added as a last resort.
Button outlines were removed for a cleaner look.

### Feb 3 — Mercy & Endgame Refactor (v2.1)
A logic flaw was identified and fixed: **mercy** (intentionally missing
mates) and **endgame weakness** (reduced depth in endgames) are ability
concerns, not style choices. Both were moved from Style profiles to
Strength profiles.

New mercy tuning by strength:
- **Casual**: Misses mates up to 4 moves away 90% of the time, only 20%
  chance of playing a crushing move
- **Moderate**: Misses mates up to 3 moves away 60% of the time, 50%
  chance of playing a dominant move
- **Strong**: Rarely misses short mates (85%), almost always plays the
  winning move (90%)
- **Expert**: No mercy — always plays to win

### Feb 3 — Voice System Expansion
ElevenLabs Rachel voice files were added for a premium audio experience,
with folder-based voice profile organization ready for dynamic voice
selection.

### Feb 3 — Casual Rename & Hint Tiers (v2.2)
The "Weak" strength profile was renamed to **Casual** — a friendlier name
that describes the experience rather than judging the player. Updated
across every file: config, backend, frontend, UI, and documentation. A
backend alias ensures any saved "weak" references still resolve correctly.

Hint budgets were moved from Style to Strength, following the same logic as
the mercy refactor — hints are an ability concern, not a personality trait.
Harder opponents give you fewer lifelines:

| Strength | Hints |
|----------|-------|
| Casual   | Unlimited |
| Moderate | 3 |
| Strong   | 1 |
| Expert   | 0 |

Perfect style forces 0 hints regardless, since the bot is already playing
the engine's top choice — if you're choosing that fight, you're on your
own.

### Feb 3 — Live Deployment
The application was deployed to production. From idea to live in just
under a month.

---

## Current State (Feb 3, 2026) — Live

The application is a fully functional chess platform, live and playable.

What started as a bare Flask scaffold with a chessboard on January 5th
grew into a complete chess experience in 30 days:

- **Flask + python-chess** backend with Stockfish engine integration
- **chessboard.js + chess.js** interactive frontend
- **Modular bot system** (v2.2) with independent Strength and Style axes
- **4 strength levels** (Casual, Moderate, Strong, Expert) and **4 playing
  styles** (Reckless, Cautious, Aggressive, Perfect)
- **5 pre-configured bots** from Beginner to Wildcard
- **Strength-based hint system** — more help against easier opponents
- **Free-board editor** with FEN import/export
- **Study mode** with engine-powered hints and arrow overlays
- **Move history** with keyboard navigation and scoresheet
- **Sound effects** and **voice announcements** (browser TTS + ElevenLabs
  MP3 overrides)
- **Dark/light theme** with OS preference detection
- **Auto-save PGN** on game completion with download support
- **Material advantage** scoring and captured-piece display
- **Batch simulation** tools for bot testing
- **Production-hardened** with debug gates, defensive guards, and clean
  error handling

**Tech stack:** Python (Flask, python-chess), JavaScript (chessboard.js,
chess.js), Stockfish UCI engine, HTML/CSS, ElevenLabs voice files.

**Config:** `bot_config.json` v2.2 — single source of truth for all bot
parameters.

---

*Built from scratch in 30 days. January 5 – February 3, 2026.*
