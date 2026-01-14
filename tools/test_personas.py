# Small test for persona mercy and blunder budget behavior
import os
import sys
proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)

import chess
import chess.engine
import app.chess_core as chess_core
import app.engine_personas as personas
import importlib

print('Starting persona tests')

# Monkeypatch SimpleEngine.popen_uci to return a fake engine object
class FakeEngine:
    def configure(self, cfg):
        # accept any configuration
        self.cfg = cfg
    def quit(self):
        pass
    def play(self, board, limit):
        # Return a dummy object with .move
        class R:
            def __init__(self, move):
                self.move = move
        # choose a legal move if possible
        for m in board.legal_moves:
            return R(m)
        return R(None)

orig_popen = None
try:
    orig_popen = chess.engine.SimpleEngine.popen_uci
    chess.engine.SimpleEngine.popen_uci = lambda path: FakeEngine()
except Exception as e:
    print('Failed to monkeypatch SimpleEngine:', e)

# Monkeypatch pick_move_with_multipv to simulate returns and handle enforce_no_blunder
orig_pick = personas.pick_move_with_multipv

def fake_pick(engine, board, depth, temperature, multipv=10, mercy=None, enforce_no_blunder=False, blunder_threshold=150):
    # best move
    best = chess.Move.from_uci('e2e4') if chess.Move.from_uci('e2e4') in board.legal_moves else next(iter(board.legal_moves))
    bad = chess.Move.from_uci('g1f3') if chess.Move.from_uci('g1f3') in board.legal_moves else best
    best_cp = 500
    bad_cp = 0
    if enforce_no_blunder:
        return (best, best_cp, best_cp, False)
    # otherwise return a blunder (bad move)
    return (bad, bad_cp, best_cp, True)

personas.pick_move_with_multipv = fake_pick

# Test function
def run_test(persona_name, repeats=4, rng_seed=None):
    game = chess_core.ChessGame()
    game.reset()
    # paranoia: ensure ACTIVE even if reset gets modified later
    try:
        game.status = 'ACTIVE'
    except Exception:
        pass
    print('\nTesting persona:', persona_name)
    print('Initial blunder budget:', game._allowed_blunders_for_persona(persona_name))
    for i in range(repeats):
        print(f'--- move {i+1} ---')
        mv = game.engine_move(limit=0.1, engine_persona=persona_name, rng_seed=rng_seed)
        print('engine_move returned:', mv)
        print('remaining budget (internal):', game._blunder_budget.get(persona_name))
        print('FEN after move:', game.get_fen())

# Run tests for grasshopper, student, ninja
run_test('grasshopper', repeats=4, rng_seed=42)
run_test('student', repeats=4, rng_seed=42)
run_test('ninja', repeats=4, rng_seed=42)

# restore
personas.pick_move_with_multipv = orig_pick
if orig_popen:
    chess.engine.SimpleEngine.popen_uci = orig_popen

print('\nTests complete')
