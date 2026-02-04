# Chess Board v2 — Project Context File
> Generated 2026-02-04 for continuity across sessions

## Quick Summary
Full-stack chess web app: **Flask backend + vanilla JS frontend + Stockfish engine**.
Version **v2.2**, deployed Feb 3, 2026. Branch: `dev` (main = production).

---

## Tech Stack
- **Backend:** Python Flask, `python-chess`, Stockfish UCI
- **Frontend:** chessboard.js v1.0.0, chess.js, vanilla JS/CSS
- **Audio:** HTML5 Audio API, MP3 sound effects + voice clips
- **State:** In-memory (server), localStorage (client), FEN file persistence

---

## File Structure (Key Files)
```
app/
  api.py              — Flask API blueprint (all endpoints)
  chess_core.py        — ChessGame class (board logic, move validation)
  engine_personas.py   — Bot config loader, move selection algorithm
server.py              — Flask entry point
bot_config.json        — Modular bot config (strength × style matrix)
static/
  main.js              — Frontend game logic (~1000+ lines, AppState container)
  style.css            — Theming (dark/light mode via CSS vars)
  audio_overrides.js   — Sound effect path patches
  voice_overrides.js   — MP3 voice overrides (disables browser TTS)
  sounds/              — piece/, system/, voices/default/, voices/rachel/
templates/
  index.html           — Main game page
  editor.html          — Bot config tuning editor
tools/
  test_mercy_blunder.py — Mercy/blunder logic test script
games/                 — Auto-saved PGN files (54+ test games)
stockfish/             — Engine binaries (Windows + Linux)
```

---

## Two-Axis Bot System (v2.2)

**Strength** (what the bot sees — ability):
| Profile  | Elo  | Skill | Depth | Mercy | Hints |
|----------|------|-------|-------|-------|-------|
| Casual   | 600  | 2     | 5     | Misses mate-in-4 (90%) | Unlimited |
| Moderate | 1200 | 8     | 10    | Misses mate-in-3 (60%) | 3 |
| Strong   | 1800 | 15    | 16    | Rarely misses | 1 |
| Expert   | 2200 | 20    | 22    | None | 0 |

**Style** (how the bot picks moves — personality):
| Profile   | Temperature | Blunder Cap | Behavior |
|-----------|------------|-------------|----------|
| Reckless  | 1.2        | 500 cp      | Chaotic, big swings |
| Aggressive| 1.0        | 350 cp      | Tactical, sharp |
| Cautious  | 0.5        | 150 cp      | Solid, safe |
| Perfect   | 0.0        | 10 cp       | Always top engine move |

**Pre-configured Bots:**
- Beginner = Casual + Reckless
- Intermediate = Moderate + Cautious
- Advanced = Strong + Perfect
- Aggressive = Moderate + Aggressive
- Wildcard = Strong + Reckless

---

## API Endpoints
- `GET /api/state` — Current FEN + legal moves
- `POST /api/move` — Play move (optional engine reply)
- `POST /api/engine_move` — Engine moves
- `POST /api/reset` — Reset game
- `POST /api/resign` — Resign + auto-save PGN
- `POST /api/save_pgn` — Save PGN to file
- `POST /api/set_fen` — Load arbitrary FEN
- `POST /api/analyze` — Best move + eval + continuation (hint system)
- `GET /api/editor/config` — Load bot config
- `POST /api/editor/save` — Save config field
- `POST /api/editor/undo` — Revert last change

---

## Key Features
1. **Full legal chess** — En passant, castling, promotion modal, insufficient material
2. **Move history navigation** — Arrow keys, Home/End
3. **Hint system** — Per-strength budgets, arrow overlay on board
4. **Captured pieces** — Material score badges
5. **Dark/light theme** — OS preference detection + toggle
6. **Sound effects** — Move, capture, select, reset sounds
7. **Voice announcements** — Welcome, check, checkmate, stalemate, resign (MP3 clips)
8. **Voice profiles** — Default + ElevenLabs Rachel (premium)
9. **Free board editor** — Place/remove pieces, export FEN
10. **PGN auto-save** — On checkmate/stalemate/resign
11. **Bot config editor** — `/editor` page for tuning parameters
12. **Mobile support** — Tap-to-move (two-tap)
13. **Player persistence** — Name, color, opponent saved in localStorage

---

## Game Lifecycle States
1. **SETUP** — Select name, color, style, strength → Start
2. **IN_GAME** — Live play with engine responses
3. **RESULT** — Game over → Download PGN or Reset

---

## Production Mode
- `V1_MODE = True` hides dev features (Free Board, editor, debug endpoints)
- Engine time capped at 5 seconds
- All `console.log` and `print()` debug output removed
- Unsafe endpoints removed (subprocess calls, etc.)

---

## Recent Major Changes (Jan 31 – Feb 3)
1. Split bots into Strength × Style matrix (v2.2)
2. Mercy/endgame/hints moved from Style → Strength
3. "Weak" renamed to "Casual"
4. Added ElevenLabs Rachel voice (3 clips)
5. Production hardening (removed debug, unsafe endpoints)
6. 8 critical bug fixes (startup crash, board corruption, voice scoping, FEN export)
7. Consolidated from 5 bots → 3 defaults (+ 2 extras)
8. Complete sound system overhaul

---

## Pending Uncommitted Changes
- Major refactors in: api.py, chess_core.py, engine_personas.py, main.js, index.html
- New files: BUILD_TIMELINE.md, audio_overrides.js, voice_overrides.js, editor.html, sound files
- 54 test game PGNs in games/
- Deleted: feedback.txt
