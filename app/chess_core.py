import os
import shutil
import chess
import chess.engine
from app.engine_personas import configure_persona, pick_move_with_multipv, set_rng_seed


class ChessGame:
    def __init__(self):
        self.board = chess.Board()
        self.engine_path = os.environ.get("STOCKFISH_PATH")
        # If env var not provided, try to find stockfish on PATH (stockfish or stockfish.exe)
        if not self.engine_path:
            found = shutil.which('stockfish') or shutil.which('stockfish.exe')
            self.engine_path = found
        # Also check for a vendor/stockfish binary inside the project (Windows and unix names)
        if not self.engine_path:
            try:
                root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
                cand_win = os.path.join(root, 'vendor', 'stockfish.exe')
                cand_unix = os.path.join(root, 'vendor', 'stockfish')
                if os.path.exists(cand_win):
                    self.engine_path = cand_win
                elif os.path.exists(cand_unix):
                    self.engine_path = cand_unix
                else:
                    # look for stockfish*.exe in project root (common paste/rename)
                    import glob
                    matches = glob.glob(os.path.join(root, 'stockfish*.exe'))
                    if matches:
                        self.engine_path = matches[0]
            except Exception:
                pass
        # normalize path strings (strip whitespace/newlines) if present
        try:
            if self.engine_path and isinstance(self.engine_path, str):
                self.engine_path = self.engine_path.strip()
        except Exception:
            pass

        self._engine = None
        # Track per-game blunder budget for personas: mapping persona->remaining allowed blunders
        self._blunder_budget = {}

    def get_fen(self):
        return self.board.fen()

    def legal_moves(self):
        return [m.uci() for m in self.board.legal_moves]

    def make_move(self, uci):
        try:
            move = chess.Move.from_uci(uci)
        except Exception:
            return False, "invalid_uci"
        if move in self.board.legal_moves:
            self.board.push(move)
            return True, None
        return False, "illegal"

    def reset(self):
        self.board.reset()
        # reset per-game blunder budgets
        try:
            self._blunder_budget = {}
        except Exception:
            self._blunder_budget = {}

    def _allowed_blunders_for_persona(self, persona: str):
        # defaults per persona
        try:
            if not persona:
                return 0
            p = persona.lower()
            if p == 'grasshopper':
                return 3
            if p == 'student':
                return 2
            if p == 'adept':
                return 1
            if p == 'ninja':
                return 1
            if p == 'sensei':
                return 0
        except Exception:
            pass
        return 0

    def _ensure_blunder_budget(self, persona: str):
        if persona not in self._blunder_budget:
            self._blunder_budget[persona] = self._allowed_blunders_for_persona(persona)
        return self._blunder_budget[persona]

    def _decrement_blunder(self, persona: str):
        try:
            if persona not in self._blunder_budget:
                self._ensure_blunder_budget(persona)
            if self._blunder_budget.get(persona, 0) > 0:
                self._blunder_budget[persona] -= 1
        except Exception:
            pass

    def engine_move(self, limit=0.1, engine_skill=None, engine_persona=None, rng_seed=None):
        """Ask the engine for a move.

        limit: time in seconds for the search (float)
        engine_skill: optional integer skill level (0-20) to configure the engine if supported
        engine_persona: optional persona name string to apply persona-specific configuration
        """
        if not self.engine_path:
            return None
        # Use a fresh engine instance per request to avoid stale engine state.
        try:
            print('ENGINE: launching transient engine for move')
            eng = chess.engine.SimpleEngine.popen_uci(self.engine_path)
        except Exception as e:
            print('ENGINE: transient engine launch failed', e)
            import traceback
            traceback.print_exc()
            return None

        try:
            # Apply numeric skill configuration if provided
            if engine_skill is not None:
                try:
                    eng.configure({"Skill Level": int(engine_skill)})
                except Exception:
                    try:
                        eng.configure({"UCI_LimitStrength": True, "UCI_Elo": 1200 + int(engine_skill) * 50})
                    except Exception:
                        pass

            # If persona provided, configure engine via persona helper and use its search params
            if engine_persona:
                try:
                    # set RNG seed for deterministic/stochastic sampling
                    try:
                        set_rng_seed(rng_seed)
                    except Exception:
                        pass
                    cfg = configure_persona(eng, engine_persona)
                    # initialize blunder budget for this persona for the current game
                    remaining = self._ensure_blunder_budget(engine_persona)
                    enforce_no_blunder = (remaining <= 0)
                    blunder_thr = cfg.get('mercy', {}).get('eval_gap_threshold', 150) if cfg.get('mercy') else 150
                    mv_res = pick_move_with_multipv(
                        eng,
                        self.board,
                        depth=cfg.get('depth'),
                        temperature=cfg.get('pick_temperature', 0.0),
                        multipv=cfg.get('multipv', 10),
                        mercy=cfg.get('mercy'),
                        enforce_no_blunder=enforce_no_blunder,
                        blunder_threshold=blunder_thr,
                        persona=engine_persona,
                    )
                    if mv_res:
                        mv, sel_cp, best_cp, is_blunder = mv_res
                        if mv:
                            # If this move is a blunder, decrement the remaining budget
                            if is_blunder:
                                self._decrement_blunder(engine_persona)
                            self.board.push(mv)
                            return mv.uci()
                except Exception:
                    pass

            # Fallback: timed play on transient engine
            r = eng.play(self.board, chess.engine.Limit(time=float(limit)))
            if r and getattr(r, 'move', None):
                self.board.push(r.move)
                return r.move.uci()
        finally:
            try:
                eng.quit()
            except Exception:
                pass

    def close_engine(self):
        try:
            if self._engine:
                self._engine.quit()
                self._engine = None
        except Exception:
            pass

    def __del__(self):
        self.close_engine()
