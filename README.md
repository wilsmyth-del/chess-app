# Chess

Minimal scaffold for a chess tutor application:

- Backend: Flask + python-chess (authoritative game state, Stockfish optional)
- Frontend: single-page app served by Flask using chessboard.js + chess.js


Quick start

```powershell
python -m venv venv
venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
python server.py
```

Set the `STOCKFISH_PATH` environment variable if you want engine replies.
