# Test mercy and blunder-budget behavior by simulating engine.analyse outputs
import os, sys
proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)

import chess
import chess.engine
from app.engine_personas import set_rng_seed, pick_move_with_multipv, configure_persona
from app.chess_core import ChessGame

# Fake score object to mimic python-chess Score behavior used by pick_move_with_multipv
class FakeScore:
    def __init__(self, cp=None, mate_dist=None):
        self._cp = cp
        self._mate = mate_dist
    def pov(self, turn):
        return self
    def is_mate(self):
        return self._mate is not None
    def mate(self):
        return self._mate
    def score(self, mate_score=100000):
        if self._mate is not None:
            return mate_score
        return self._cp

# Fake engine that returns crafted analyse results
class FakeEngine:
    def __init__(self, infos):
        self._infos = infos
    def configure(self, cfg):
        pass
    def quit(self):
        pass
    def analyse(self, board, limit, multipv=10):
        # Return the prebuilt infos list (list of dict with 'pv' and 'score')
        return self._infos
    def play(self, board, limit):
        class R:
            def __init__(self, move):
                self.move = move
        for m in board.legal_moves:
            return R(m)
        return R(None)


def simulate_position(best_move_uci, second_move_uci, best_cp, second_cp, mate_dist=None, mercy=None, rng_seed=None, enforce_no_blunder=False, blunder_threshold=150):
    board = chess.Board()
    # build fake info list: best first, then second
    best_move = chess.Move.from_uci(best_move_uci)
    second_move = chess.Move.from_uci(second_move_uci)
    info = [
        {'pv': [best_move], 'score': FakeScore(cp=best_cp, mate_dist=mate_dist)},
        {'pv': [second_move], 'score': FakeScore(cp=second_cp, mate_dist=None)},
    ]
    eng = FakeEngine(info)
    set_rng_seed(rng_seed)
    mv, sel_cp, best_cp_out, is_blunder = pick_move_with_multipv(eng, board, depth=6, temperature=1.0, multipv=2, mercy=mercy, enforce_no_blunder=enforce_no_blunder, blunder_threshold=blunder_threshold)
    return mv, sel_cp, best_cp_out, is_blunder


def run_tests():
    print('Test 1: mercy reduces mate selection')
    mercy = {'mate_in': 3, 'mate_keep_prob': 0.1, 'eval_gap_threshold': 400, 'eval_keep_prob': 0.2}
    # best is mate in 2, second is much worse
    mv, sel_cp, best_cp_out, is_blunder = simulate_position('e2e4','g1f3', best_cp=1000, second_cp=100, mate_dist=2, mercy=mercy, rng_seed=123)
    print('Selected:', mv, 'is_blunder:', is_blunder)

    print('\nTest 2: eval gap reduces best selection')
    mercy = {'mate_in': None, 'mate_keep_prob': 1.0, 'eval_gap_threshold': 400, 'eval_keep_prob': 0.1}
    # best much stronger than second
    counts = { 'best':0, 'second':0 }
    for i in range(20):
        mv, sel_cp, best_cp_out, is_blunder = simulate_position('e2e4','g1f3', best_cp=1000, second_cp=200, mate_dist=None, mercy=mercy, rng_seed=None)
        if mv == chess.Move.from_uci('e2e4'):
            counts['best'] += 1
        else:
            counts['second'] += 1
    print('Selection counts (stochastic):', counts)

    print('\nTest 3: deterministic with seed')
    counts = { 'best':0, 'second':0 }
    for i in range(5):
        mv, sel_cp, best_cp_out, is_blunder = simulate_position('e2e4','g1f3', best_cp=1000, second_cp=200, mate_dist=None, mercy=mercy, rng_seed=42)
        if mv == chess.Move.from_uci('e2e4'):
            counts['best'] += 1
        else:
            counts['second'] += 1
    print('Deterministic selection counts (seed=42):', counts)

    print('\nTest 4: integrate with ChessGame to verify blunder budget decrement')
    # Monkeypatch chess.engine.SimpleEngine.popen_uci inside ChessGame by setting a fake that returns our FakeEngine
    orig_popen = chess.engine.SimpleEngine.popen_uci
    try:
        # create engine that will return a blunder selection repeatedly
        info = [
            {'pv':[chess.Move.from_uci('e2e4')], 'score': FakeScore(cp=1000, mate_dist=None)},
            {'pv':[chess.Move.from_uci('g1f3')], 'score': FakeScore(cp=0, mate_dist=None)},
        ]
        fake_eng = FakeEngine(info)
        chess.engine.SimpleEngine.popen_uci = lambda path: fake_eng
        game = ChessGame()
        game.reset()
        # paranoia: ensure ACTIVE even if reset gets modified later
        try:
            game.status = 'ACTIVE'
        except Exception:
            pass
        persona = 'student'
        print('Initial budget for', persona, '=>', game._allowed_blunders_for_persona(persona))
        # call engine_move multiple times and observe budget change
        for i in range(4):
            mv = game.engine_move(limit=0.1, engine_persona=persona, rng_seed=None)
            print('move', i+1, '->', mv, 'budget now:', game._blunder_budget.get(persona))
    finally:
        chess.engine.SimpleEngine.popen_uci = orig_popen

if __name__ == '__main__':
    run_tests()
