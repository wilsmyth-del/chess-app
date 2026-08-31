# Chess Tutor

A browser-based chess opponent and practice board with configurable computer personalities.

## Features

- Complete games against a computer opponent
- Multiple opponent personalities
- Server-side legal-move validation with `python-chess`
- Optional Stockfish engine play
- Move sounds and spoken feedback

## Quick start

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python server.py
```

On Windows PowerShell, activate with `venv\\Scripts\\Activate.ps1`. Set `STOCKFISH_PATH` to a Stockfish executable to enable engine-backed play.

## Project layout

```text
app/          Chess rules, API routes, and opponent personalities
static/       Browser code, styles, pieces, and sounds
templates/    Flask templates
server.py     Application entry point
test_bots.py  Opponent tests
```

Run tests with `pytest test_bots.py`. See [CHANGELOG.md](CHANGELOG.md) and [DEVLOG.md](DEVLOG.md) for project history.
