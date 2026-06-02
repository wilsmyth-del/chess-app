# Chess-Live — The Story So Far

## The Project
A Flask + Stockfish chess web app with personality. Players face bots built from
mix-and-match **strength profiles** (casual/moderate/strong/expert) and **style
profiles** (reckless/aggressive/cautious/perfect). Voice announcements call out
check, checkmate, and game start using prerecorded MP3s. There's a Build-A-Bot
editor for tuning configs locally. The whole thing runs on a NUC.

## The Launch Weekend (Feb 2026)
Wil wanted to push the project live by end of weekend. We sat down for a full
review of ~500 additions and ~1000 deletions across 12 files. The kind of session
where you roll up your sleeves and go through everything line by line.

### The Big Bug
The scariest find: a refactor to `AppState.setPlayEngine()` had silently killed
the standalone `setPlayEngine()` function, which contained critical game-start
logic — board reset, engine-first-move-for-black, play button updates. Games
would have launched broken. We caught it before anyone played a single game.

Wil chose "Option B" — add the missing logic back into the callers (`startGame()`
and the custom position handler) rather than stuffing it all into the AppState
setter. Clean separation of concerns.

### Security Hardening
- Engine path validation with directory whitelisting (no arbitrary binary execution)
- FEN string length validation (no oversized payloads)
- Editor API only available in dev mode

### The Persona System
Ripped out the old monolithic `bots` section and `configure_persona()`. Now
`assemble_persona_config()` merges strength + style at runtime. Blunder cap
moved from post-selection veto to soft pre-filter (zero out bad candidates
before sampling). Much cleaner.

### The Cleanup
Found the `.gitignore` had corrupted entries — spaces between every character on
some lines. Rewrote it completely. Ran `git rm --cached` to untrack 283 game
PGNs, test data, and local config files that had leaked into the repo.

### Small Touches
- Removed a dead `checking.mp3` reference that was throwing 404s in the console
- Favicon: chess knight ♞ via inline SVG data URI (works in all modern browsers)
- The "listener indicated async response" console errors are browser extensions, not us

## Key Architecture Notes
- `bot_config.json` — single source of truth for strength + style profiles
- `engine_personas.py` — `assemble_persona_config()` is the authority for merging
- `main.js` — `AppState` pattern with getters/setters/events; `setUIState()` manages
  all panel visibility, controls, and play button sync
- `chess_core.py` — Stockfish interface with validated engine path
- Dead standalone `setPlayEngine()` function removed (was ~line 2745, superseded by AppState.setPlayEngine())

## Commits Pushed
- `085ca51` — Modular persona system, security hardening, game start fix, repo cleanup
- `ce04652` — Remove dead checking.mp3 reference and suppress favicon 404

## Working With Wil
Wil thinks through his decisions carefully and wants to understand *why*, not just
*what*. He chose to keep the editor off live and deploy bot configs manually. He
asks good questions and isn't afraid to say "explain that to me." He calls you
"big boss" when things are going well. Good energy to work with.
