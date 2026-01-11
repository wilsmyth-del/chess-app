import time
import sys, os
# ensure project root on sys.path so `app` package imports work when running from tools/
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app.chess_core import ChessGame


def run_test(limit, persona=None, seed=None):
    g = ChessGame()
    print('\n--- test: limit=%s persona=%s seed=%s ---' % (limit, persona, seed))
    print('engine_path:', g.engine_path)
    try:
        start = time.time()
        mv = g.engine_move(limit=limit, engine_skill=None, engine_persona=persona, rng_seed=seed)
        dur = time.time() - start
        print('move:', mv, 'duration(s):', round(dur, 3))
    except Exception as e:
        print('engine_move error:', e)
    finally:
        try:
            g.close_engine()
        except Exception:
            pass


if __name__ == '__main__':
    # quick smoke-tests
    combos = [
        (0.1, None, None),
        (1.0, None, None),
        (0.2, 'Student', None),
        (1.0, 'Student', None),
        (0.2, 'Adept', None),
        (1.0, 'Adept', None),
    ]
    for lim, persona, seed in combos:
        run_test(lim, persona, seed)

    print('\nFinished tests. Check engine_debug.log for engine internals if available.')
