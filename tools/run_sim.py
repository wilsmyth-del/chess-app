from app.chess_core import ChessGame
import chess

def run_sim(white='grasshopper', black='student', engine_time=0.05, max_moves=200, rng_seed=None):
    g = ChessGame()
    moves = []
    for i in range(max_moves):
        if g.board.is_game_over():
            break
        persona = white if g.board.turn==chess.WHITE else black
        seed = None
        if rng_seed is not None:
            try:
                seed = int(rng_seed) + i
            except Exception:
                seed = rng_seed
        mv = g.engine_move(limit=engine_time, engine_persona=persona, rng_seed=seed)
        if not mv:
            print('Engine failed or returned no move')
            break
        moves.append(mv)
    # Build PGN
    import chess.pgn
    pg = chess.pgn.Game()
    pg.headers['Event']='Persona Simulation'
    pg.headers['White']=white
    pg.headers['Black']=black
    pg.headers['Result']=g.board.result() if g.board.is_game_over() else '*'
    node=pg
    for m in g.board.move_stack:
        node = node.add_variation(m)
    exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
    print('--- PGN ---')
    print(pg.accept(exporter))
    print('--- First 10 moves ---')
    print(moves[:10])

if __name__ == '__main__':
    run_sim()
