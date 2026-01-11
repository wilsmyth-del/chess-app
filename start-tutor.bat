@echo off
cd /d "%~dp0"
:: If a bundled stockfish binary exists in vendor, set STOCKFISH_PATH automatically
if exist "%~dp0vendor\stockfish.exe" (
	set "STOCKFISH_PATH=%~dp0vendor\stockfish.exe"
)
echo Starting Chess (server.py) using venv Python...
venv\Scripts\python.exe server.py
