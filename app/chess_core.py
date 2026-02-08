import os
import platform
import chess
import chess.engine
import chess.pgn
import datetime
from app.engine_personas import pick_move_with_multipv, set_rng_seed, assemble_persona_config


def _validate_engine_path(path):
    """Validate that the engine path is safe to execute.

    Returns True if the path:
    - Is not empty
    - Exists on disk
    - Is a file (not a directory)
    - Is within an allowed directory (project stockfish/ or common system paths)
    """
    if not path:
        return False

    # Normalize and resolve the path
    try:
        resolved = os.path.realpath(path)
    except Exception:
        return False

    # Must exist and be a file
    if not os.path.isfile(resolved):
        return False

    # Allowed directories (project stockfish folder + common system locations)
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    allowed_dirs = [
        os.path.join(project_root, 'stockfish'),
        os.path.join(project_root, 'vendor'),
        '/usr/bin',
        '/usr/local/bin',
        '/usr/games',
    ]

    # Check if resolved path is within an allowed directory
    for allowed in allowed_dirs:
        try:
            allowed_resolved = os.path.realpath(allowed)
            if resolved.startswith(allowed_resolved + os.sep) or resolved == allowed_resolved:
                return True
        except Exception:
            continue

    # On Windows, also allow paths within Program Files
    if platform.system() == "Windows":
        windows_allowed = [
            os.environ.get('ProgramFiles', 'C:\\Program Files'),
            os.environ.get('ProgramFiles(x86)', 'C:\\Program Files (x86)'),
        ]
        for allowed in windows_allowed:
            try:
                if resolved.startswith(os.path.realpath(allowed) + os.sep):
                    return True
            except Exception:
                continue

    return False


def derive_end_state(board: chess.Board):
    """Return (result_str, termination_str) derived from the given board outcome.

    Uses python-chess board.outcome(claim_draw=True) as the source of truth.
    Returns (result, termination) where result is one of '1-0','0-1','1/2-1/2'
    and termination is a short string like 'checkmate','stalemate','insufficient_material','threefold_repetition','fifty_moves', or None.
    """
    try:
        outcome = board.outcome(claim_draw=True)
        if outcome is None:
            return None, None
        # result
        if outcome.winner is True:
            res = '1-0'
        elif outcome.winner is False:
            res = '0-1'
        else:
            res = '1/2-1/2'

        term = None
        t = outcome.termination
        # Map common terminations to friendly names
        if t == chess.Termination.CHECKMATE:
            term = 'checkmate'
        elif t == chess.Termination.STALEMATE:
            term = 'stalemate'
        elif t == chess.Termination.INSUFFICIENT_MATERIAL:
            term = 'insufficient_material'
        elif t == chess.Termination.THREEFOLD_REPETITION:
            term = 'threefold_repetition'
        elif t == chess.Termination.FIVEFOLD_REPETITION:
            term = 'fivefold_repetition'
        elif t == chess.Termination.FIFTY_MOVES:
            term = 'fifty_moves'
        elif t == chess.Termination.SEVENTY_FIVE_MOVES:
            term = 'seventyfive_moves'
        else:
            # fallback to enum name lowercased when unknown
            try:
                term = t.name.lower()
            except Exception:
                term = None

        return res, term
    except Exception:
        return None, None


class ChessGame:
    def __init__(self):
        self.board = chess.Board()

        # =======================================================
        # 1. SMART SWITCH: Detect OS and set Engine Path
        # =======================================================
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        system = platform.system()  # Returns "Windows" or "Linux"

        if system == "Windows":
            # --- WINDOWS CONFIG (local machine) ---
            # Use project-relative path to the bundled Windows Stockfish binary
            self.engine_path = os.path.join(root, 'stockfish', 'stockfish-windows-x86-64-avx2.exe')

            # Windows uses a local file for the game state
            self.state_file_path = "game_state.fen"
        else:
            # --- LINUX CONFIG (server) ---
            self.engine_path = os.path.join(root, 'stockfish', 'stockfish-ubuntu-x86-64')

            # Linux uses the RAM Disk (fast!) for game state
            self.state_file_path = "/dev/shm/game_state.fen"

        # =======================================================
        # 2. MASTER OVERRIDE (Optional)
        # =======================================================
        # If the server has a specific environment variable set, strictly use that.
        if os.environ.get("STOCKFISH_PATH"):
            self.engine_path = os.environ.get("STOCKFISH_PATH")

        # Last best evaluation (centipawns) seen from engine analyses — used to detect
        # when the bot is in a winning/losing trend (for 'shark' behavior triggers).
        self.last_best_eval = 0
        # Track per-game blunder budget for personas: mapping persona->remaining allowed blunders
        self._blunder_budget = {}
        # Track game lifecycle state for finalization
        self.status = 'ACTIVE'  # or 'ENDED'
        self.end_reason = None
        self.result = None
        self.pgn_final = None
        self.ended_at = None
        # Player info for PGN generation
        self.user_name = 'Player'
        self.opponent_name = 'Opponent'
        self.user_side = 'white'  # 'white' or 'black'

    def check_game_over(self):
        """Return (is_over, reason, winner)

        reason: 'checkmate'|'draw'|None
        winner: 'white'|'black'|None
        """
        # Prefer python-chess outcome() as the source of truth
        try:
            res, term = derive_end_state(self.board)
            if res is None:
                return False, None, None
            # store result/termination for later PGN saving
            try:
                self.result = res
                self.end_reason = term
            except Exception:
                pass
            # map winner
            if res == '1-0':
                return True, term or 'checkmate', 'white'
            if res == '0-1':
                return True, term or 'checkmate', 'black'
            # draw
            return True, term or 'draw', None
        except Exception:
            return False, None, None

    def end_game(self, reason, winner=None, user_side=None, user_name=None, opponent_name=None):
        """Finalize the game exactly once and return payload with final PGN."""
        if getattr(self, 'status', None) == 'ENDED':
            return {'game_over': True, 'reason': self.end_reason, 'result': self.result, 'pgn': self.pgn_final}

        self.status = 'ENDED'
        
        # 1. Normalize Inputs (Use stored info with parameter override)
        u_side = str(user_side).lower() if user_side else getattr(self, 'user_side', 'white')
        p_name = user_name if user_name else getattr(self, 'user_name', 'Player')
        o_name = opponent_name if opponent_name else getattr(self, 'opponent_name', 'Opponent')

        # 2. Determine Result
        if reason == 'resign':
            self.end_reason = 'resign'
            if winner:
                w_lower = str(winner).lower()
                if w_lower == 'white': self.result = '1-0'
                elif w_lower == 'black': self.result = '0-1'
                else: self.result = '*'
            else:
                self.result = '*'
        else:
            try:
                res, term = derive_end_state(self.board)
                if res is not None:
                    self.result = res
                    self.end_reason = term
                else:
                    self.end_reason = reason
                    self.result = self.board.result() if self.board.is_game_over() else '*'
            except Exception:
                self.end_reason = reason
                self.result = '*'

        # 3. Build Clean PGN with Correct Names
        try:
            g = chess.pgn.Game()
            
            # Metadata
            g.headers['Event'] = 'Casual Game'
            g.headers['Site'] = "Wil's Chess"
            g.headers['Date'] = datetime.datetime.now().strftime('%Y.%m.%d')
            g.headers['Round'] = '1'
            g.headers['Result'] = self.result or '*'
            
            if self.end_reason:
                g.headers['Termination'] = self.end_reason

            # --- NAME LOGIC ---
            # If user played White, they go in the White header.
            if u_side == 'white':
                g.headers['White'] = p_name
                g.headers['Black'] = o_name
            # If user played Black, they go in the Black header.
            elif u_side == 'black':
                g.headers['White'] = o_name
                g.headers['Black'] = p_name
            # Fallback: If side is unknown, we guess based on names or default
            else:
                g.headers['White'] = p_name if p_name != 'Player' else 'White'
                g.headers['Black'] = o_name if o_name != 'Opponent' else 'Black'

            # Add Moves
            node = g
            for mv in self.board.move_stack:
                node = node.add_variation(mv)
            
            exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
            self.pgn_final = g.accept(exporter)
            
        except Exception:
            self.pgn_final = None

        try:
            self.ended_at = datetime.datetime.now().isoformat()
        except Exception:
            self.ended_at = None

        return {'game_over': True, 'reason': self.end_reason, 'result': self.result, 'pgn': self.pgn_final}

    def _load_state(self):
        """Read the game state (Move List) from the shared file."""
        try:
            if os.path.exists(self.state_file_path):
                with open(self.state_file_path, "r") as f:
                    content = f.read().strip()

                # DETECT: Is this a custom setup (FEN) or a Move List?
                if "/" in content:
                    # It contains slashes, so it must be a FEN string (Custom Board)
                    self.board.set_fen(content)
                else:
                    # It is a list of moves (Standard Game) - Replay them!
                    self.board.reset()
                    if content:
                        for uci in content.split():
                            if uci:
                                self.board.push(chess.Move.from_uci(uci))
        except Exception:
            pass

    def _save_state(self):
        """Write the game state (Move List) to the shared file."""
        try:
            # Smart Save: 
            # 1. If we have moves, save the Move List (Preserves History/PGN).
            # 2. If no moves but board is custom, save FEN (Preserves Custom Setup).
            if not self.board.move_stack and self.board.fen() != chess.STARTING_FEN:
                 data = self.board.fen()
            else:
                 # Join all moves into a string like "e2e4 e7e5 g1f3"
                 data = " ".join([m.uci() for m in self.board.move_stack])
            
            with open(self.state_file_path, "w") as f:
                f.write(data)
        except Exception:
            pass


    def get_fen(self):
        return self.board.fen()

    def legal_moves(self):
        return [m.uci() for m in self.board.legal_moves]

    def make_move(self, uci):
        # 1. Sync Start: Read the shared whiteboard so we know the current board state
        try:
            self._load_state()
        except Exception:
            pass

        try:
            move = chess.Move.from_uci(uci)
        except Exception:
            return False, "invalid_uci"
        if move in self.board.legal_moves:
            self.board.push(move)
            # After pushing a move, derive and persist end-state (if any)
            try:
                res, term = derive_end_state(self.board)
                if res is not None:
                    self.result = res
                    self.end_reason = term
            except Exception:
                pass

            # 2. Sync End: Update the whiteboard so the other workers see the move
            try:
                self._save_state()
            except Exception:
                pass

            return True, None
        return False, "illegal"

    def reset(self):
        # Reset board position
        self.board.reset()

        # Reset per-game budgets/ephemeral state
        self._blunder_budget = {}

        # Reset lifecycle/finalization state so previous END data cannot leak
        self.status = "ACTIVE"
        self.end_reason = None
        self.result = None
        self.pgn_final = None
        self.ended_at = None
        
        # Reset player info to defaults
        self.user_name = 'Player'
        self.opponent_name = 'Opponent'
        self.user_side = 'white'
        
        self._save_state()  # <--- FORCE SAVE (Wipe the whiteboard)

    def _allowed_blunders_for_persona(self, persona: str):
        # defaults per persona (style name → allowed blunders per game)
        try:
            if not persona:
                return 0
            p = persona.lower()
            if p == 'reckless':
                return 3
            if p == 'aggressive':
                return 2
            if p == 'cautious':
                return 1
            if p == 'perfect':
                return 0
            # pre-configured bot names
            if p == 'beginner':
                return 3
            if p in ('intermediate', 'aggressive_intermediate', 'wildcard'):
                return 2
            if p == 'advanced':
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

    def engine_move(self, limit=0.1, engine_skill=None, engine_persona=None,
                    engine_strength=None, rng_seed=None):
        """Ask the engine for a move.

        limit: time in seconds for the search (float)
        engine_skill: integer skill level fallback (0-20)
        engine_persona: style persona name (e.g. "cautious")
        engine_strength: strength profile name (e.g. "casual")
        """
        # Ensure we sync state from the shared whiteboard before deciding
        try:
            self._load_state()
        except Exception:
            pass

        if not self.engine_path or not _validate_engine_path(self.engine_path):
            return None
        # Use a fresh engine instance per request to avoid stale engine state.
        try:
            eng = chess.engine.SimpleEngine.popen_uci(self.engine_path)
        except Exception:
            return None

        try:
            if engine_persona:
                try:
                    try:
                        set_rng_seed(rng_seed)
                    except Exception:
                        pass

                    # Assemble a complete config from strength + style
                    cfg = assemble_persona_config(
                        engine_persona,
                        strength_name=engine_strength,
                        engine_skill=engine_skill,
                    )

                    # Apply UCI options from the assembled config
                    uci_opts = cfg.get('uci') or {}
                    if uci_opts:
                        try:
                            eng.configure(uci_opts)
                        except Exception:
                            pass
                    else:
                        try:
                            eng.configure({"MultiPV": cfg.get('multipv', 10)})
                        except Exception:
                            pass

                    # Blunder budget
                    remaining = self._ensure_blunder_budget(engine_persona)
                    enforce_no_blunder = (remaining <= 0)
                    blunder_thr = cfg.get('mercy', {}).get('eval_gap_threshold', 150) if cfg.get('mercy') else 150

                    # Opening speed adjustment
                    effective_limit = float(cfg.get('engine_time', limit))
                    try:
                        if getattr(self.board, 'fullmove_number', 0) and self.board.fullmove_number < 10:
                            effective_limit = effective_limit * 0.6
                    except Exception:
                        pass

                    # Temperature with shark/tilt adjustments
                    pick_temp = float(cfg.get('pick_temperature', 0.0))
                    try:
                        if getattr(self, 'last_best_eval', 0) is not None and self.last_best_eval > 200 and pick_temp > 0.5:
                            pick_temp = max(0.0, pick_temp - 0.5)
                        if getattr(self, 'last_best_eval', 0) is not None and self.last_best_eval < -300:
                            pick_temp = pick_temp + 0.5
                    except Exception:
                        pass

                    mv_res = pick_move_with_multipv(
                        eng,
                        self.board,
                        depth=cfg['depth'],
                        temperature=pick_temp,
                        multipv=cfg.get('multipv', 10),
                        mercy=cfg.get('mercy'),
                        enforce_no_blunder=enforce_no_blunder,
                        blunder_threshold=blunder_thr,
                        blunder_cap=cfg.get('blunder_cap'),
                        curve=cfg.get('curve'),
                        endgame_depth_delta=cfg.get('endgame_depth_delta'),
                        endgame_temp_delta=cfg.get('endgame_temp_delta'),
                        pieces_threshold=cfg.get('pieces_threshold'),
                    )
                    if mv_res:
                        mv, sel_cp, best_cp, is_blunder = mv_res
                        try:
                            if best_cp is not None:
                                self.last_best_eval = int(best_cp)
                        except Exception:
                            pass
                        if mv:
                            if is_blunder:
                                self._decrement_blunder(engine_persona)
                            self.board.push(mv)
                            try:
                                self._save_state()
                            except Exception:
                                pass
                            return mv.uci()
                except Exception:
                    pass
            elif engine_skill is not None:
                # No persona — apply raw skill level for plain engine play
                try:
                    eng.configure({"Skill Level": int(engine_skill)})
                except Exception:
                    pass

            # Fallback: timed play on transient engine
            r = eng.play(self.board, chess.engine.Limit(time=float(limit)))
            if r and getattr(r, 'move', None):
                self.board.push(r.move)
                try:
                    self._save_state()
                except Exception:
                    pass
                return r.move.uci()
        finally:
            try:
                eng.quit()
            except Exception:
                pass

    def analyze_position(self, fen, time_limit=0.5):
        """Analyse a FEN position without making a move.

        Returns a dict with keys:
          - score: centipawn integer (positive = white advantage) or string like 'M3'/'M-3' for mates
          - best_move: UCI string of the best move (or None)
          - continuation: list of up to first 3 UCI moves from the PV
        """
        # Basic defaults
        result = {'score': None, 'best_move': None, 'continuation': []}
        if not self.engine_path or not _validate_engine_path(self.engine_path):
            return result

        try:
            board = chess.Board(fen)
        except Exception:
            return result

        try:
            eng = chess.engine.SimpleEngine.popen_uci(self.engine_path)
        except Exception:
            return result

        try:
            info = eng.analyse(board, chess.engine.Limit(time=float(time_limit)))
            # Extract PV moves if present
            pv = info.get('pv') if isinstance(info, dict) else None
            if pv:
                try:
                    result['best_move'] = pv[0].uci()
                    result['continuation'] = [m.uci() for m in pv[:3]]
                except Exception:
                    pass

            # Extract score and normalize to white-perspective centipawns
            score_obj = info.get('score') if isinstance(info, dict) else None
            if score_obj is not None:
                try:
                    s = score_obj.pov(chess.WHITE)
                    # Mate handling
                    if hasattr(s, 'is_mate') and s.is_mate():
                        try:
                            m = s.mate()
                            if m is None:
                                result['score'] = None
                            else:
                                # Positive means mate for White, negative means mate for Black
                                if m > 0:
                                    result['score'] = f"M{int(m)}"
                                else:
                                    result['score'] = f"M-{int(abs(m))}"
                        except Exception:
                            result['score'] = None
                    else:
                        # centipawn value (int). Use large mate substitute if needed.
                        try:
                            cp = s.score(mate_score=100000)
                            if cp is None:
                                result['score'] = None
                            else:
                                result['score'] = int(cp)
                        except Exception:
                            result['score'] = None
                except Exception:
                    result['score'] = None
        except Exception:
            # analysis failed; return defaults
            pass
        finally:
            try:
                eng.quit()
            except Exception:
                pass

        return result

