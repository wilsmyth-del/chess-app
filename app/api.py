from flask import Blueprint, jsonify, request, current_app, render_template, send_file
from app.chess_core import ChessGame, BOT_PRESETS
from app.engine_personas import PERSONA_DEFAULT_ENGINE_TIME
import os
import datetime
import csv
import chess.pgn
import traceback

api_bp = Blueprint("api", __name__)

# Single global game for scaffold; later replace with per-session or DB storage
game = ChessGame()

# Feature gate for v1: when True, hide Free Board / Study features and related endpoints
V1_MODE = False

from functools import wraps

def v1_guard(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if V1_MODE:
            return jsonify({'ok': False, 'error': 'disabled_in_v1'}), 404
        return f(*args, **kwargs)
    return wrapper


def state_payload():
    return {"fen": game.get_fen(), "legal_moves": game.legal_moves()}


@api_bp.route("/api/state", methods=["GET"])
def api_state():
    return jsonify(state_payload())


@api_bp.route("/api/move", methods=["POST"])
def api_move():
    data = request.get_json() or {}
    print("REQUEST:", request.json)
    uci = data.get("uci")
    if not uci:
        return jsonify({"ok": False, "error": "missing_uci"}), 400
    
    # Store player info if provided (for PGN generation later)
    if 'user_name' in data:
        game.user_name = data.get('user_name') or 'Player'
    if 'user_side' in data:
        game.user_side = data.get('user_side') or 'white'
    if 'opponent_name' in data:
        game.opponent_name = data.get('opponent_name') or data.get('engine_persona') or 'Opponent'
    elif 'engine_persona' in data:
        game.opponent_name = data.get('engine_persona') or 'Opponent'
    
    ok, err = game.make_move(uci)
    if not ok:
        return jsonify({"ok": False, "error": err}), 400
    # Optionally make engine reply
    reply = None
    if data.get("engine_reply"):
        # read optional engine params
        try:
            engine_time = float(data.get("engine_time", 0.1))
        except Exception:
            engine_time = 0.1
        # Parse engine parameters: separate numeric skill and persona string
        engine_persona = data.get('engine_persona')
        # If client selected an `opponent_preset`, map it to canonical engine params
        # from `BOT_PRESETS`. Preserve explicit engine_persona/engine_skill if
        # provided by the caller; otherwise use preset defaults.
        opponent_preset = data.get('opponent_preset')
        if opponent_preset:
            try:
                preset = BOT_PRESETS.get(opponent_preset.lower())
                if preset:
                    if engine_persona is None:
                        engine_persona = preset.get('engine_persona')
                    # only set engine_time/skill when not explicitly provided
                    if 'engine_time' in preset and data.get('engine_time') is None:
                        try:
                            engine_time = float(preset.get('engine_time', engine_time))
                        except Exception:
                            pass
                    if 'engine_skill' in preset and data.get('engine_skill') is None:
                        try:
                            engine_skill = int(preset.get('engine_skill')) if preset.get('engine_skill') is not None else None
                        except Exception:
                            pass
            except Exception:
                pass
        # validate persona name if provided
        try:
            from app.engine_personas import is_persona_allowed
            if engine_persona and not is_persona_allowed(engine_persona):
                return jsonify({"ok": False, "error": "unknown_persona"}), 400
        except Exception:
            pass
        try:
            engine_skill = data.get("engine_skill")
            engine_skill = int(engine_skill) if engine_skill is not None else None
        except Exception:
            engine_skill = None
        # optional RNG seed for deterministic sampling
        engine_rng_seed = data.get('rng_seed') if 'rng_seed' in data else None
        if engine_rng_seed is not None:
            try:
                engine_rng_seed = int(engine_rng_seed)
            except Exception:
                pass
        # If a persona is provided, use internal default engine time for persona-driven replies
        if engine_persona:
            try:
                engine_time = float(PERSONA_DEFAULT_ENGINE_TIME)
            except Exception:
                pass
        # Log debug to file for diagnosis
        try:
            root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
            dbg = os.path.join(root, 'engine_debug.log')
            with open(dbg, 'a', encoding='utf-8') as fh:
                fh.write(f"[MOVE] {datetime.datetime.now().isoformat()} uci={uci} fen={game.get_fen()} time={engine_time} engine_skill={engine_skill} engine_persona={engine_persona}\n")
        except Exception:
            pass
        reply = game.engine_move(limit=engine_time, engine_skill=engine_skill, engine_persona=engine_persona, rng_seed=engine_rng_seed)
        # FIX: if engine returned None but made a move (engine pushed to board), recover it
        if reply is None:
            try:
                if hasattr(game, 'board') and getattr(game.board, 'move_stack', None):
                    if len(game.board.move_stack) > 0:
                        try:
                            reply = game.board.move_stack[-1].uci()
                        except Exception:
                            pass
            except Exception:
                pass
        try:
            with open(dbg, 'a', encoding='utf-8') as fh:
                fh.write(f"[MOVE-RESULT] {datetime.datetime.now().isoformat()} reply={repr(reply)} fen={game.get_fen()} engine_skill={engine_skill} engine_persona={engine_persona} rng_seed={engine_rng_seed}\n")
        except Exception:
            pass
    # After applying player move (and optional engine reply), check game-over state
    is_over, reason, winner = game.check_game_over()
    if is_over:
        end_payload = game.end_game(reason, winner)
        # Do NOT auto-save or reset here; return final state to client for user confirmation
        return jsonify({"ok": True, "fen": game.get_fen(), "move_uci": uci, "engine_reply": reply, "game_over": True, "reason": end_payload.get('reason'), "result": end_payload.get('result'), "pgn": end_payload.get('pgn')})

    return jsonify({"ok": True, "fen": game.get_fen(), "move_uci": uci, "engine_reply": reply, "game_over": False, "reason": None, "result": None, "pgn": None})


@api_bp.route("/api/reset", methods=["POST"])
def api_reset():
    game.reset()
    # paranoia: ensure ACTIVE even if reset gets modified later
    try:
        game.status = 'ACTIVE'
    except Exception:
        pass
    return jsonify(state_payload())


@api_bp.route("/api/set_fen", methods=["POST"])
def api_set_fen():
    data = request.get_json() or {}
    fen = data.get('fen')
    if not fen:
        return jsonify({"ok": False, "error": "missing_fen"}), 400
    try:
        # Validate and set the board to provided FEN
        game.board = chess.Board(fen)
        return jsonify({"ok": True, "fen": game.get_fen()})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400


@api_bp.route("/api/analyze", methods=["POST"])
def api_analyze():
    data = request.get_json() or {}
    fen = data.get('fen')
    if not fen:
        return jsonify({'ok': False, 'error': 'missing_fen'}), 400
    try:
        try:
            time_limit = float(data.get('time_limit', 0.5))
        except Exception:
            time_limit = 0.5
        # Call the ChessGame analyze helper
        res = game.analyze_position(fen, time_limit=time_limit)
        if isinstance(res, dict) and res.get('error'):
            return jsonify({'ok': False, 'error': res.get('error')}), 500
        out = {'ok': True}
        if isinstance(res, dict):
            out.update(res)
        else:
            out['result'] = res
        return jsonify(out)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'ok': False, 'error': str(e)}), 500

@api_bp.route("/api/engine_move", methods=["POST"])
def api_engine_move():
    data = request.get_json() or {}
    print("REQUEST:", request.json)
    try:
        engine_time = float(data.get("engine_time", 0.1))
    except Exception:
        engine_time = 0.1
    try:
        engine_skill = data.get("engine_skill")
        engine_skill = int(engine_skill) if engine_skill is not None else None
    except Exception:
        engine_skill = None

    engine_persona = data.get('engine_persona')
    # Map opponent preset to canonical engine params when provided
    opponent_preset = data.get('opponent_preset')
    if opponent_preset:
        try:
            preset = BOT_PRESETS.get(opponent_preset.lower())
            if preset:
                if engine_persona is None:
                    engine_persona = preset.get('engine_persona')
                if data.get('engine_time') is None and 'engine_time' in preset:
                    try:
                        engine_time = float(preset.get('engine_time', engine_time))
                    except Exception:
                        pass
                if data.get('engine_skill') is None and 'engine_skill' in preset:
                    try:
                        engine_skill = int(preset.get('engine_skill')) if preset.get('engine_skill') is not None else None
                    except Exception:
                        pass
        except Exception:
            pass
    # Map an opponent preset (if provided) to canonical engine params from BOT_PRESETS.
    # The preset will provide defaults for persona/skill/time when the caller
    # did not explicitly supply those fields.
    opponent_preset = data.get('opponent_preset')
    if opponent_preset:
        try:
            preset = BOT_PRESETS.get(opponent_preset.lower())
            if preset:
                if engine_persona is None:
                    engine_persona = preset.get('engine_persona')
                # if engine_time was not passed explicitly, take preset time
                if data.get('engine_time') is None and 'engine_time' in preset:
                    try:
                        engine_time = float(preset.get('engine_time', engine_time))
                    except Exception:
                        pass
                # if engine_skill not provided explicitly, take preset skill
                if data.get('engine_skill') is None and 'engine_skill' in preset:
                    try:
                        engine_skill = int(preset.get('engine_skill')) if preset.get('engine_skill') is not None else None
                    except Exception:
                        pass
        except Exception:
            pass
    try:
        from app.engine_personas import is_persona_allowed
        if engine_persona and not is_persona_allowed(engine_persona):
            return jsonify({"ok": False, "error": "unknown_persona"}), 400
    except Exception:
        pass
    engine_rng_seed = data.get('rng_seed') if 'rng_seed' in data else None
    if engine_rng_seed is not None:
        try:
            engine_rng_seed = int(engine_rng_seed)
        except Exception:
            pass
    # If a persona is provided, use internal default engine time for persona-driven replies
    if engine_persona:
        try:
            engine_time = float(PERSONA_DEFAULT_ENGINE_TIME)
        except Exception:
            pass
    # If a persona is provided, use an internal default engine time for persona-driven
    # move selection. This avoids exposing the previous fast/deep UI which behaved
    # inconsistently when personas used MultiPV sampling. TODO: revisit timed MultiPV
    # and provide a proper UI control later.
    if engine_persona:
        try:
            engine_time = float(PERSONA_DEFAULT_ENGINE_TIME)
        except Exception:
            engine_time = float(engine_time)

    # Log debug to file
    try:
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        dbg = os.path.join(root, 'engine_debug.log')
        with open(dbg, 'a', encoding='utf-8') as fh:
            fh.write(f"[ENGINE_MOVE] {datetime.datetime.now().isoformat()} fen={game.get_fen()} time={engine_time} engine_skill={engine_skill} engine_persona={engine_persona}\n")
    except Exception:
        pass
    reply = game.engine_move(limit=engine_time, engine_skill=engine_skill, engine_persona=engine_persona, rng_seed=engine_rng_seed)
    # FIX: if engine returned None but made a move, recover it from the board move stack
    if reply is None:
        try:
            if hasattr(game, 'board') and getattr(game.board, 'move_stack', None):
                if len(game.board.move_stack) > 0:
                    try:
                        reply = game.board.move_stack[-1].uci()
                    except Exception:
                        pass
        except Exception:
            pass
    try:
        with open(dbg, 'a', encoding='utf-8') as fh:
            fh.write(f"[ENGINE_MOVE_RESULT] {datetime.datetime.now().isoformat()} reply={repr(reply)} fen={game.get_fen()} engine_skill={engine_skill} engine_persona={engine_persona} rng_seed={engine_rng_seed}\n")
    except Exception:
        pass
    # Check for terminal state after engine move
    is_over, reason, winner = game.check_game_over()
    if is_over:
        end_payload = game.end_game(reason, winner)
        # Do NOT auto-save or reset here; return final state to client for user confirmation
        return jsonify({"ok": True, "fen": game.get_fen(), "engine_reply": reply, "game_over": True, "reason": end_payload.get('reason'), "result": end_payload.get('result'), "pgn": end_payload.get('pgn')})

    return jsonify({"ok": True, "fen": game.get_fen(), "engine_reply": reply, "game_over": False, "reason": None, "result": None, "pgn": None})


@api_bp.route("/api/resign", methods=["POST"])
def api_resign():
    data = request.get_json() or {}
    resigned = data.get("resigned_side")
    # Normalize
    if resigned not in ("white", "black"):
        resigned = None

    # Determine winner (opposite side)
    winner = None
    if resigned == 'white':
        winner = 'black'
    elif resigned == 'black':
        winner = 'white'
    # Finalize game via centralized end_game and return final PGN/result
    try:
        user_side = data.get('user_side') or resigned
        user_name = data.get('user_name') or 'Player'
        opponent_name = data.get('opponent_name') or ('Engine' if data.get('engine', False) else 'Opponent')
        end_payload = game.end_game('resign', winner=winner, user_side=user_side, user_name=user_name, opponent_name=opponent_name)
        # Do not reset here; caller may inspect final board before reset
        resp = {"ok": True, "resign": True, "resigned_side": resigned, "winner": winner, "game_over": True, "reason": end_payload.get('reason'), "result": end_payload.get('result'), "pgn": end_payload.get('pgn')}
        return jsonify(resp)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


def save_pgn_to_file(result='*', user_side=None, user_name='Player', opponent_name='Opponent', pgn_text=None):
    """Serialize current game board to PGN and save to timestamped file under 'games/'. Returns filename.

    user_side: 'white' or 'black' or None. If provided, sets the White/Black headers accordingly.
    """
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    outdir = os.path.join(root, 'games')
    os.makedirs(outdir, exist_ok=True)
    now = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    fname = f'game_{now}.pgn'
    path = os.path.join(outdir, fname)

    # If caller supplied a PGN string, write that; otherwise build from current board
    if pgn_text is None:
        # Build PGN game
        g = chess.pgn.Game()
        g.headers['Event'] = 'Chess'
        g.headers['Date'] = datetime.datetime.now().strftime('%Y.%m.%d')
        # Prefer stored game result/termination when available (do not override)
        result_to_use = getattr(game, 'result', None) or result
        g.headers['Result'] = result_to_use
        if getattr(game, 'end_reason', None):
            g.headers['Termination'] = game.end_reason

        # Set player names if we know which side the user played
        if user_side == 'white':
            g.headers['White'] = user_name
            g.headers['Black'] = opponent_name
        elif user_side == 'black':
            g.headers['White'] = opponent_name
            g.headers['Black'] = user_name
        else:
            g.headers['White'] = 'White'
            g.headers['Black'] = 'Black'

        node = g
        try:
            # Add moves from the board's move stack sequentially
            for mv in game.board.move_stack:
                node = node.add_variation(mv)
        except Exception:
            pass

        exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
        pgn_text = g.accept(exporter)

    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(pgn_text or '')

    return fname


@api_bp.route("/api/sync_main_js", methods=["POST"])
def api_sync_main_js():
    """Copy `static/main.js` to project root `main.js.txt` atomically and return status."""
    try:
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        static_path = os.path.join(root, 'static', 'main.js')
        out_path = os.path.join(root, 'main.js.txt')
        tmp_path = out_path + '.tmp'

        # Read and write in binary to preserve exact file contents
        with open(static_path, 'rb') as fh:
            data = fh.read()

        # Write to a temp file then replace to ensure atomicity
        with open(tmp_path, 'wb') as fh:
            fh.write(data)
        os.replace(tmp_path, out_path)
        return jsonify({"ok": True, "path": 'main.js.txt'})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@api_bp.route("/api/save_pgn", methods=["POST"])
def api_save_pgn():
    data = request.get_json() or {}
    result = data.get('result') or '*'
    user_side = data.get('user_side')
    user_name = data.get('user_name') or 'Player'
    opponent_name = data.get('opponent_name') or ('Engine' if data.get('engine') else 'Opponent')
    pgn_text = data.get('pgn_text')
    try:
        fname = save_pgn_to_file(result=result, user_side=user_side, user_name=user_name, opponent_name=opponent_name, pgn_text=pgn_text)
        return jsonify({"ok": True, "pgn_file": fname})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# NOTE: `/api/ack_game_over` intentionally removed per v1 decision -
# client uses resp.pgn for download and calls `/api/reset` for New Game.


@api_bp.route("/api/engine_move_debug", methods=["POST"])
def api_engine_move_debug():
    """Diagnostic endpoint: call engine_move and return detailed debug info in the JSON response."""
    data = request.get_json() or {}
    try:
        engine_time = float(data.get("engine_time", 0.1))
    except Exception:
        engine_time = 0.1
    engine_persona = data.get('engine_persona')
    try:
        from app.engine_personas import is_persona_allowed
        if engine_persona and not is_persona_allowed(engine_persona):
            return jsonify({"ok": False, "error": "unknown_persona"}), 400
    except Exception:
        pass
    try:
        engine_skill = data.get("engine_skill")
        engine_skill = int(engine_skill) if engine_skill is not None else None
    except Exception:
        engine_skill = None
    engine_rng_seed = data.get('rng_seed') if 'rng_seed' in data else None
    if engine_rng_seed is not None:
        try:
            engine_rng_seed = int(engine_rng_seed)
        except Exception:
            pass

    pre_fen = game.get_fen()
    dbg = None
    err = None
    reply = None
    try:
        reply = game.engine_move(limit=engine_time, engine_skill=engine_skill, engine_persona=engine_persona, rng_seed=engine_rng_seed)
    except Exception as e:
        err = str(e)
        err_tb = traceback.format_exc()
        # include traceback in response where reasonable
        return jsonify({"ok": False, "error": err, "traceback": err_tb, "pre_fen": pre_fen}), 500

    # FIX: if engine returned None but made a move, recover it from the board move stack
    if reply is None:
        try:
            if hasattr(game, 'board') and getattr(game.board, 'move_stack', None):
                if len(game.board.move_stack) > 0:
                    try:
                        reply = game.board.move_stack[-1].uci()
                    except Exception:
                        pass
        except Exception:
            pass

    post_fen = game.get_fen()
    out = {"ok": True, "pre_fen": pre_fen, "post_fen": post_fen, "reply": reply, "engine_skill": engine_skill, "engine_persona": engine_persona}
    # If engine returned no move, try a one-off engine invocation to compare behavior
    if reply is None:
        try:
            one_off = None
            tmp_msg = None
            try:
                eng = chess.engine.SimpleEngine.popen_uci(game.engine_path)
                # try persona configure
                try:
                    from app.engine_personas import configure_persona, pick_move_with_multipv, set_rng_seed
                    cfg = configure_persona(eng, engine_persona)
                    # apply rng seed for the one-off sampling if provided
                    try:
                        set_rng_seed(engine_rng_seed)
                    except Exception:
                        pass
                    mv_res = pick_move_with_multipv(
                        eng,
                        game.board,
                        depth=cfg.get('depth'),
                        temperature=cfg.get('pick_temperature', 0.0),
                        multipv=cfg.get('multipv', 10),
                        mercy=cfg.get('mercy'),
                        persona=engine_persona,
                    )
                    if mv_res:
                        mv, sel_cp, best_cp, is_blunder = mv_res
                    else:
                        mv = None
                    one_off = mv.uci() if mv is not None else None
                except Exception:
                    # fallback to timed play
                    r = eng.play(game.board, chess.engine.Limit(time=engine_time))
                    one_off = r.move.uci() if r and getattr(r,'move',None) else None
                eng.quit()
                tmp_msg = 'one-off engine call succeeded'
            except Exception as e:
                tmp_msg = f'one-off engine call failed: {e}'
            out['one_off'] = one_off
            out['one_off_msg'] = tmp_msg
        except Exception:
            out['one_off_msg'] = 'one-off investigation failed'

    return jsonify(out)


@api_bp.route('/test_personas', methods=['GET'])
@v1_guard
def test_personas_page():
    return render_template('test_personas.html')


@api_bp.route('/api/simulate', methods=['POST'])
@v1_guard
def api_simulate():
    """Run a headless simulation between two personas and return PGN + move list."""
    data = request.get_json() or {}
    white_persona = data.get('white_persona')
    black_persona = data.get('black_persona')
    try:
        engine_time = float(data.get('engine_time', 0.1))
    except Exception:
        engine_time = 0.1
    try:
        max_moves = int(data.get('max_moves', 200))
    except Exception:
        max_moves = 200
    rng_seed = data.get('rng_seed') if 'rng_seed' in data else None

    # Validate personas if helper available
    try:
        from app.engine_personas import is_persona_allowed
        if white_persona and not is_persona_allowed(white_persona):
            return jsonify({'ok': False, 'error': 'unknown_persona_white'}), 400
        if black_persona and not is_persona_allowed(black_persona):
            return jsonify({'ok': False, 'error': 'unknown_persona_black'}), 400
    except Exception:
        pass

    # Run simulation on a fresh game instance
    try:
        from app.chess_core import ChessGame
        sim = ChessGame()
    except Exception as e:
        return jsonify({'ok': False, 'error': f'failed_to_create_game: {e}'}), 500

    move_list = []
    reason = 'max_moves_reached'
    for i in range(max_moves):
        if sim.board.is_game_over():
            reason = 'game_over'
            break
        persona = white_persona if sim.board.turn == chess.WHITE else black_persona
        seed = None
        if rng_seed is not None:
            try:
                seed = int(rng_seed) + i
            except Exception:
                seed = rng_seed
        # Use internal persona default engine time when a persona is provided
        mv_time = engine_time
        if persona:
            try:
                mv_time = float(PERSONA_DEFAULT_ENGINE_TIME)
            except Exception:
                pass
        mv = sim.engine_move(limit=mv_time, engine_persona=persona, rng_seed=seed)
        if not mv:
            reason = 'engine_failed'
            break
        move_list.append(mv)

    # Build PGN
    try:
        g = chess.pgn.Game()
        g.headers['Event'] = 'Persona Simulation'
        # Record selected personas as the player names in the PGN
        g.headers['White'] = white_persona or 'White'
        g.headers['Black'] = black_persona or 'Black'
        g.headers['Result'] = sim.board.result() if sim.board.is_game_over() else '*'
        node = g
        for mv in sim.board.move_stack:
            node = node.add_variation(mv)
        exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
        pgn_text = g.accept(exporter)
    except Exception:
        pgn_text = None

    # Auto-save PGN to games/tests/ with a timestamped filename
    saved_fname = None
    try:
        if pgn_text:
            root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
            outdir = os.path.join(root, 'games', 'tests')
            os.makedirs(outdir, exist_ok=True)
            now = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
            wp = (white_persona or 'white')
            bp = (black_persona or 'black')
            safe_wp = str(wp).replace(' ', '_')
            safe_bp = str(bp).replace(' ', '_')
            fname = f'sim_{safe_wp}_vs_{safe_bp}_{now}.pgn'
            path = os.path.join(outdir, fname)
            with open(path, 'w', encoding='utf-8') as fh:
                fh.write(pgn_text)
            saved_fname = fname
    except Exception:
        saved_fname = None

    return jsonify({'ok': True, 'moves': move_list, 'pgn': pgn_text, 'result': g.headers.get('Result'), 'reason': reason, 'saved_file': saved_fname})


@api_bp.route('/api/personas', methods=['GET'])
@v1_guard
def api_personas_list():
    try:
        from app.engine_personas import list_personas, get_persona_config
        data = {}
        for p in list_personas():
            data[p] = get_persona_config(p)
        return jsonify({'ok': True, 'personas': data})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@api_bp.route('/api/persona/<name>', methods=['GET', 'POST'])
@v1_guard
def api_persona(name):
    try:
        from app.engine_personas import get_persona_config, set_persona_override, validate_persona_override
        if request.method == 'GET':
            cfg = get_persona_config(name)
            if cfg is None:
                return jsonify({'ok': False, 'error': 'unknown_persona'}), 400
            return jsonify({'ok': True, 'persona': name, 'config': cfg})
        else:
            data = request.get_json() or {}
            # accept partial overrides but validate first
            okv, err = validate_persona_override(name, data)
            if not okv:
                return jsonify({'ok': False, 'error': 'invalid_override', 'message': err}), 400
            ok = set_persona_override(name, data)
            if not ok:
                return jsonify({'ok': False, 'error': 'failed_to_set'}), 400
            return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@api_bp.route('/api/persona/<name>/reset', methods=['POST'])
@v1_guard
def api_persona_reset(name):
    try:
        from app.engine_personas import reset_persona
        ok = reset_persona(name)
        if not ok:
            return jsonify({'ok': False, 'error': 'unknown_persona'}), 400
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@api_bp.route('/api/personas/reset_all', methods=['POST'])
@v1_guard
def api_personas_reset_all():
    try:
        from app.engine_personas import reset_all_persona_overrides
        ok = reset_all_persona_overrides()
        if not ok:
            return jsonify({'ok': False, 'error': 'failed_to_reset'}), 500
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@api_bp.route('/api/personas/export', methods=['GET'])
@v1_guard
def api_personas_export():
    try:
        from app.engine_personas import export_persona_overrides
        data = export_persona_overrides()
        return jsonify({'ok': True, 'overrides': data})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@api_bp.route('/api/personas/import', methods=['POST'])
@v1_guard
def api_personas_import():
    data = request.get_json() or {}
    # Accept either {'overrides': {...}} or the raw dict
    payload = data.get('overrides') if isinstance(data.get('overrides'), dict) else data
    try:
        from app.engine_personas import import_persona_overrides, validate_persona_override
        # validate incoming payload before attempting to import
        if not isinstance(payload, dict):
            return jsonify({'ok': False, 'error': 'invalid_payload'}), 400
        for k, v in payload.items():
            if not isinstance(v, dict):
                return jsonify({'ok': False, 'error': 'invalid_entry', 'which': k}), 400
            okv, err = validate_persona_override(k, v)
            if not okv:
                return jsonify({'ok': False, 'error': 'invalid_entry_schema', 'which': k, 'message': err}), 400
        ok = import_persona_overrides(payload)
        if not ok:
            return jsonify({'ok': False, 'error': 'save_failed'}), 500
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@api_bp.route('/api/engine_info', methods=['GET'])
def api_engine_info():
    try:
        # Provide detected engine path and some defaults
        from app.chess_core import ChessGame
        cg = ChessGame()
        engine_ok = bool(cg.engine_path)
        data = {'engine_path': cg.engine_path or None, 'engine_detected': engine_ok, 'default_engine_time': 0.05, 'multipv_cap': 16}
        return jsonify({'ok': True, 'engine': data})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@api_bp.route('/api/simulate_batch', methods=['POST'])
@v1_guard
def api_simulate_batch():
    """Run multiple persona-vs-persona games server-side and save PGNs + CSV summary."""
    data = request.get_json() or {}
    white_persona = data.get('white_persona')
    black_persona = data.get('black_persona')
    try:
        engine_time = float(data.get('engine_time', 0.05))
    except Exception:
        engine_time = 0.05
    try:
        count = int(data.get('count', 1))
    except Exception:
        count = 1
    try:
        max_moves = int(data.get('max_moves', 400))
    except Exception:
        max_moves = 400
    seed = data.get('seed') if 'seed' in data else None

    # Validation
    try:
        from app.engine_personas import is_persona_allowed
        if white_persona and not is_persona_allowed(white_persona):
            return jsonify({'ok': False, 'error': 'unknown_persona_white'}), 400
        if black_persona and not is_persona_allowed(black_persona):
            return jsonify({'ok': False, 'error': 'unknown_persona_black'}), 400
    except Exception:
        pass

    # Prepare output dir
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    outdir = os.path.join(root, 'games', 'tests')
    os.makedirs(outdir, exist_ok=True)

    rows = []
    saved = []
    pgn_texts = []
    for i in range(count):
        try:
            from app.chess_core import ChessGame
            sim = ChessGame()
        except Exception as e:
            return jsonify({'ok': False, 'error': f'failed_to_create_game: {e}'}), 500

        reason = 'max_moves_reached'
        seed_used = None
        for mv_i in range(max_moves):
            if sim.board.is_game_over():
                reason = 'game_over'
                break
            persona = white_persona if sim.board.turn == chess.WHITE else black_persona
            mv_seed = None
            if seed is not None:
                try:
                    mv_seed = int(seed) + mv_i
                except Exception:
                    mv_seed = seed
            if seed_used is None:
                seed_used = mv_seed
            mv_time = engine_time
            if persona:
                try:
                    mv_time = float(PERSONA_DEFAULT_ENGINE_TIME)
                except Exception:
                    pass
            mv = sim.engine_move(limit=mv_time, engine_persona=persona, rng_seed=mv_seed)
            if not mv:
                reason = 'engine_failed'
                break
        result = sim.board.result() if sim.board.is_game_over() else '*'
        # save PGN
        try:
            g = chess.pgn.Game()
            g.headers['Event'] = 'Persona Simulation'
            g.headers['White'] = white_persona or 'White'
            g.headers['Black'] = black_persona or 'Black'
            # Add useful metadata headers for batch analysis
            g.headers['WhitePersona'] = white_persona or ''
            g.headers['BlackPersona'] = black_persona or ''
            g.headers['Seed'] = str(seed_used) if seed_used is not None else ''
            g.headers['GameNumber'] = str(i+1)
            g.headers['EngineTime'] = str(engine_time)
            g.headers['Termination'] = reason or ''
            g.headers['Result'] = result
            node = g
            for mv in sim.board.move_stack:
                node = node.add_variation(mv)
            exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
            pgn_text = g.accept(exporter)
            now = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
            safe_wp = str(white_persona or 'white').replace(' ', '_')
            safe_bp = str(black_persona or 'black').replace(' ', '_')
            fname = f'sim_{safe_wp}_vs_{safe_bp}_{now}_{i+1}.pgn'
            path = os.path.join(outdir, fname)
            with open(path, 'w', encoding='utf-8') as fh:
                fh.write(pgn_text)
            saved.append(fname)
            pgn_texts.append(pgn_text)
            rows.append({'file': fname, 'white': white_persona, 'black': black_persona, 'result': result, 'moves': len(sim.board.move_stack), 'seed': seed_used, 'reason': reason})
        except Exception:
            pass

    # Write CSV
    csv_path = os.path.join(outdir, f'summary_{datetime.datetime.now().strftime("%Y%m%d_%H%M%S")}.csv')
    try:
        with open(csv_path, 'w', newline='', encoding='utf-8') as cf:
            w = csv.DictWriter(cf, fieldnames=['file', 'white', 'black', 'result', 'moves', 'seed', 'reason'])
            w.writeheader()
            for r in rows:
                w.writerow(r)
    except Exception:
        csv_path = None

    return jsonify({'ok': True, 'count': len(saved), 'files': saved, 'csv': os.path.basename(csv_path) if csv_path else None})

    # If we have multiple PGNs, write a combined PGN file
    combined_name = None
    try:
        if pgn_texts:
            now2 = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
            safe_wp = str(white_persona).replace(' ', '_')
            safe_bp = str(black_persona).replace(' ', '_')
            combined_name = f'batch_{safe_wp}_vs_{safe_bp}_{now2}.pgn'
            combined_path = os.path.join(outdir, combined_name)
            # join pgns with blank lines
            with open(combined_path, 'w', encoding='utf-8') as cf:
                for idx, pt in enumerate(pgn_texts):
                    cf.write(pt)
                    cf.write('\n\n')
    except Exception:
        combined_name = None

    return jsonify({'ok': True, 'count': len(saved), 'files': saved, 'csv': os.path.basename(csv_path) if csv_path else None, 'batch_pgn': combined_name})


@api_bp.route('/api/open_engine_debug', methods=['GET'])
def api_open_engine_debug():
    try:
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        dbg = os.path.join(root, 'engine_debug.log')
        if not os.path.exists(dbg):
            return jsonify({'ok': True, 'output': []})
        with open(dbg, 'r', encoding='utf-8', errors='ignore') as fh:
            lines = fh.read().splitlines()
        tail = lines[-50:]
        return jsonify({'ok': True, 'output': tail})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@api_bp.route('/api/open_pgn_notepad', methods=['POST'])
@v1_guard
def api_open_pgn_notepad():
    data = request.get_json() or {}
    fname = data.get('filename')
    if not fname:
        return jsonify({'ok': False, 'error': 'missing_filename'}), 400
    try:
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        path = os.path.join(root, 'games', 'tests', fname)
        if not os.path.exists(path):
            return jsonify({'ok': False, 'error': 'file_not_found'}), 404
        # Only attempt to open on Windows using notepad
        if os.name == 'nt':
            try:
                import subprocess
                subprocess.Popen(['notepad.exe', path])
                return jsonify({'ok': True})
            except Exception as e:
                return jsonify({'ok': False, 'error': str(e)}), 500
        else:
            return jsonify({'ok': False, 'error': 'not_supported_on_os'}), 400
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# Dev-only helper: inspect and tweak in-memory bot presets during development.
# Enabled unless running in v1-mode with DEBUG disabled.
@api_bp.route('/api/dev/presets', methods=['GET', 'POST'])
def api_dev_presets():
    # Disable when v1 mode is active and not in debug
    try:
        if V1_MODE and not current_app.debug:
            return jsonify({'ok': False, 'error': 'disabled_in_v1'}), 404
    except Exception:
        pass

    # GET: return current presets
    if request.method == 'GET':
        try:
            # shallow copy to avoid accidental mutation
            data = {k: dict(v) for k, v in BOT_PRESETS.items()}
            return jsonify({'ok': True, 'presets': data})
        except Exception as e:
            return jsonify({'ok': False, 'error': str(e)}), 500

    # POST: update an existing preset in-memory for this dev session
    data = request.get_json() or {}
    name = data.get('name')
    preset = data.get('preset')
    if not name or not isinstance(preset, dict):
        return jsonify({'ok': False, 'error': 'missing_name_or_preset'}), 400
    key = str(name).lower()
    if key not in BOT_PRESETS:
        return jsonify({'ok': False, 'error': 'unknown_preset'}), 400
    try:
        # Validate fields we accept: display_name, engine_persona, engine_skill, engine_time
        upd = {}
        if 'display_name' in preset:
            upd['display_name'] = str(preset.get('display_name') or '')
        if 'engine_persona' in preset:
            val = preset.get('engine_persona')
            upd['engine_persona'] = None if val is None else str(val)
        if 'engine_skill' in preset:
            v = preset.get('engine_skill')
            upd['engine_skill'] = None if v is None else int(v)
        if 'engine_time' in preset:
            try:
                upd['engine_time'] = float(preset.get('engine_time'))
            except Exception:
                upd['engine_time'] = BOT_PRESETS[key].get('engine_time')

        BOT_PRESETS[key].update(upd)
        return jsonify({'ok': True, 'preset': BOT_PRESETS[key]})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@api_bp.route('/api/dev/game_status', methods=['GET'])
def api_dev_game_status():
    # Dev-only: expose simple lifecycle fields. Disabled when v1 mode active and not debug.
    try:
        if V1_MODE and not current_app.debug:
            return jsonify({'ok': False, 'error': 'disabled_in_v1'}), 404
    except Exception:
        pass
    try:
        return jsonify({'ok': True, 'status': getattr(game, 'status', None), 'end_reason': getattr(game, 'end_reason', None), 'result': getattr(game, 'result', None)})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@api_bp.route('/api/download_pgn', methods=['GET'])
def api_download_pgn():
    """Download a file from games/tests by filename (safe, no path traversal)."""
    fname = request.args.get('filename')
    if not fname:
        return jsonify({'ok': False, 'error': 'missing_filename'}), 400
    safe = os.path.basename(fname)
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    # allow files from games/tests and games
    candidates = [os.path.join(root, 'games', 'tests', safe), os.path.join(root, 'games', safe)]
    found = None
    for p in candidates:
        if os.path.exists(p):
            found = p
            break
    if not found:
        return jsonify({'ok': False, 'error': 'file_not_found'}), 404
    try:
        return send_file(found, as_attachment=True, download_name=safe)
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
