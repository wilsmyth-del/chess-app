#!/usr/bin/env python3
"""Batch-run persona vs persona simulations.

Saves PGNs to `games/tests/` and prints a small summary.
"""
import os
import sys
import argparse
import datetime
import csv
import chess.pgn

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, ROOT)

from app.chess_core import ChessGame
try:
    from app.engine_personas import is_persona_allowed
except Exception:
    def is_persona_allowed(x):
        return True


def save_pgn(sim, white_persona, black_persona, outdir, idx=None):
    g = chess.pgn.Game()
    g.headers['Event'] = 'Persona Simulation'
    g.headers['White'] = white_persona or 'White'
    g.headers['Black'] = black_persona or 'Black'
    g.headers['Result'] = sim.board.result() if sim.board.is_game_over() else '*'
    node = g
    try:
        for mv in sim.board.move_stack:
            node = node.add_variation(mv)
    except Exception:
        pass
    exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
    pgn_text = g.accept(exporter)
    now = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    safe_w = str(white_persona or 'white').replace(' ', '_')
    safe_b = str(black_persona or 'black').replace(' ', '_')
    if idx is None:
        fname = f'sim_{safe_w}_vs_{safe_b}_{now}.pgn'
    else:
        fname = f'sim_{safe_w}_vs_{safe_b}_{now}_{idx}.pgn'
    path = os.path.join(outdir, fname)
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(pgn_text)
    return fname


def run_one(white_persona, black_persona, engine_time, max_moves, base_seed):
    sim = ChessGame()
    reason = 'max_moves_reached'
    moves = []
    seed_used = None
    for i in range(max_moves):
        if sim.board.is_game_over():
            reason = 'game_over'
            break
        persona = white_persona if sim.board.turn == chess.WHITE else black_persona
        seed = None
        if base_seed is not None:
            try:
                seed = int(base_seed) + i
            except Exception:
                seed = base_seed
        if seed_used is None:
            seed_used = seed
        mv = sim.engine_move(limit=engine_time, engine_persona=persona, rng_seed=seed)
        if not mv:
            reason = 'engine_failed'
            break
        moves.append(mv)
    if seed_used is None:
        seed_used = base_seed
    return sim, moves, reason, seed_used


def main():
    p = argparse.ArgumentParser(description='Batch-run persona simulations')
    p.add_argument('--white', required=True, help='White persona name')
    p.add_argument('--black', required=True, help='Black persona name')
    p.add_argument('--count', type=int, default=1, help='Number of games to run')
    p.add_argument('--engine-time', type=float, default=0.05, help='Engine time per move (seconds)')
    p.add_argument('--max-moves', type=int, default=400, help='Max moves per game')
    p.add_argument('--seed', help='Base RNG seed (optional, integer)')
    p.add_argument('--csv', help='Path to CSV summary file (optional)')
    p.add_argument('--outdir', default=os.path.join(ROOT, 'games', 'tests'), help='Output directory for PGNs')
    args = p.parse_args()

    if args.white and not is_persona_allowed(args.white):
        print('Unknown white persona:', args.white); sys.exit(2)
    if args.black and not is_persona_allowed(args.black):
        print('Unknown black persona:', args.black); sys.exit(2)

    os.makedirs(args.outdir, exist_ok=True)

    stats = {'white': 0, 'black': 0, 'draw': 0, 'errors': 0}
    saved = []
    rows = []
    for i in range(args.count):
        print(f'Running game {i+1}/{args.count} — {args.white} vs {args.black} (seed={args.seed})')
        sim, moves, reason, seed_used = run_one(args.white, args.black, args.engine_time, args.max_moves, args.seed)
        res = sim.board.result() if sim.board.is_game_over() else '*'
        if res == '1-0':
            stats['white'] += 1
        elif res == '0-1':
            stats['black'] += 1
        elif res == '1/2-1/2':
            stats['draw'] += 1
        else:
            if reason == 'engine_failed':
                stats['errors'] += 1
        fname = save_pgn(sim, args.white, args.black, args.outdir, idx=i+1)
        saved.append((fname, res, reason))
        move_count = len(sim.board.move_stack)
        rows.append({'file': fname, 'white': args.white, 'black': args.black, 'result': res, 'moves': move_count, 'seed': seed_used, 'reason': reason})
        print(f' Game {i+1} finished: result={res} reason={reason} saved={fname}')

    print('\nSummary:')
    print(f" White wins: {stats['white']}")
    print(f" Black wins: {stats['black']}")
    print(f" Draws: {stats['draw']}")
    print(f" Errors: {stats['errors']}")
    print('\nSaved files:')
    for fn, res, reason in saved:
        print(' ', fn, res, reason)

    # Write CSV summary
    try:
        csv_path = args.csv if getattr(args, 'csv', None) else os.path.join(args.outdir, 'summary.csv')
        write_header = not os.path.exists(csv_path)
        with open(csv_path, 'a', newline='', encoding='utf-8') as cf:
            w = csv.DictWriter(cf, fieldnames=['file', 'white', 'black', 'result', 'moves', 'seed', 'reason'])
            if write_header:
                w.writeheader()
            for r in rows:
                w.writerow(r)
        print('\nWrote CSV summary to', csv_path)
    except Exception as e:
        print('Failed to write CSV summary:', e)


if __name__ == '__main__':
    main()
