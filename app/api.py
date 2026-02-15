from flask import Blueprint, jsonify, request, send_file
from app.chess_core import ChessGame
import os
import datetime
import chess.pgn

api_bp = Blueprint("api", __name__)

# Single global game for scaffold; later replace with per-session or DB storage
game = ChessGame()

# --- Security caps ---
MAX_ENGINE_TIME = 5.0       # max seconds per engine think

def _recover_last_move(game_obj):
    """If engine_move returned None but pushed a move, recover it from move_stack."""
    try:
        if hasattr(game_obj, 'board') and game_obj.board.move_stack:
            return game_obj.board.move_stack[-1].uci()
    except Exception:
        pass
    return None




def state_payload():
    return {"fen": game.get_fen(), "legal_moves": game.legal_moves()}


@api_bp.route("/api/state", methods=["GET"])
def api_state():
    return jsonify(state_payload())


@api_bp.route("/api/move", methods=["POST"])
def api_move():
    data = request.get_json() or {}
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
    # Early game-over check: if the player's move ended the game (checkmate,
    # stalemate, insufficient material, etc.), return immediately instead of
    # asking the engine to play in a terminal position.
    is_over, reason, winner = game.check_game_over()
    if is_over:
        end_payload = game.end_game(reason, winner)
        return jsonify({"ok": True, "fen": game.get_fen(), "move_uci": uci, "engine_reply": None, "game_over": True, "reason": end_payload.get('reason'), "result": end_payload.get('result'), "pgn": end_payload.get('pgn')})
    # Optionally make engine reply
    reply = None
    if data.get("engine_reply"):
        # read optional engine params
        try:
            engine_time = min(float(data.get("engine_time", 0.1)), MAX_ENGINE_TIME)
        except Exception:
            engine_time = 0.1
        engine_persona = data.get('engine_persona')
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
        engine_strength = data.get('engine_strength')
        # optional RNG seed for deterministic sampling
        engine_rng_seed = data.get('rng_seed') if 'rng_seed' in data else None
        if engine_rng_seed is not None:
            try:
                engine_rng_seed = int(engine_rng_seed)
            except Exception:
                pass
        reply = game.engine_move(limit=engine_time, engine_skill=engine_skill, engine_persona=engine_persona, engine_strength=engine_strength, rng_seed=engine_rng_seed)
        if reply is None:
            reply = _recover_last_move(game)
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



@api_bp.route("/api/analyze", methods=["POST"])
def api_analyze():
    data = request.get_json() or {}
    fen = data.get('fen')
    if not fen:
        return jsonify({'ok': False, 'error': 'missing_fen'}), 400
    try:
        try:
            time_limit = min(float(data.get('time_limit', 0.5)), MAX_ENGINE_TIME)
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
    except Exception:
        return jsonify({'ok': False, 'error': 'analysis failed'}), 500

@api_bp.route("/api/engine_move", methods=["POST"])
def api_engine_move():
    # Early check: if the game is already over, don't attempt an engine move
    is_over, reason, winner = game.check_game_over()
    if is_over:
        end_payload = game.end_game(reason, winner)
        return jsonify({"ok": True, "fen": game.get_fen(), "engine_reply": None, "game_over": True, "reason": end_payload.get('reason'), "result": end_payload.get('result'), "pgn": end_payload.get('pgn')})
    data = request.get_json() or {}
    try:
        engine_time = min(float(data.get("engine_time", 0.1)), MAX_ENGINE_TIME)
    except Exception:
        engine_time = 0.1
    try:
        engine_skill = data.get("engine_skill")
        engine_skill = int(engine_skill) if engine_skill is not None else None
    except Exception:
        engine_skill = None

    engine_persona = data.get('engine_persona')
    engine_strength = data.get('engine_strength')
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
    reply = game.engine_move(limit=engine_time, engine_skill=engine_skill, engine_persona=engine_persona, engine_strength=engine_strength, rng_seed=engine_rng_seed)
    if reply is None:
        reply = _recover_last_move(game)
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
    except Exception:
        return jsonify({"ok": False, "error": "resign failed"}), 500


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
    except Exception:
        return jsonify({"ok": False, "error": "save failed"}), 500



# ---------------------------------------------------------------------------
# Bot Config Editor API

# ---------------------------------------------------------------------------

@api_bp.route('/api/editor/config', methods=['GET'])
def api_editor_config():
    """Return full bot_config.json contents."""
    try:
        from app.engine_personas import read_bot_config
        data = read_bot_config()
        return jsonify({'ok': True, 'config': data})
    except Exception:
        return jsonify({'ok': False, 'error': 'failed to load config'}), 500


@api_bp.route('/api/editor/save', methods=['POST'])
def api_editor_save():
    """Save a single field change to bot_config.json with undo history."""
    data = request.get_json() or {}
    section = data.get('section')
    profile = data.get('profile')
    field = data.get('field')
    value = data.get('value')

    if not section or not profile or not field:
        return jsonify({'ok': False, 'error': 'missing required fields'}), 400
    if section not in ('strength_profiles', 'style_profiles'):
        return jsonify({'ok': False, 'error': 'invalid section'}), 400

    try:
        from app.engine_personas import write_bot_config_field
        ok, err = write_bot_config_field(section, profile, field, value)
        if not ok:
            return jsonify({'ok': False, 'error': err}), 400
        return jsonify({'ok': True})
    except Exception:
        return jsonify({'ok': False, 'error': 'failed to save config'}), 500


@api_bp.route('/api/editor/undo', methods=['POST'])
def api_editor_undo():
    """Undo the last change for a profile."""
    data = request.get_json() or {}
    section = data.get('section')
    profile = data.get('profile')

    if not section or not profile:
        return jsonify({'ok': False, 'error': 'missing required fields'}), 400

    try:
        from app.engine_personas import undo_last_change
        ok, result = undo_last_change(section, profile)
        if not ok:
            return jsonify({'ok': False, 'error': result}), 400
        return jsonify({'ok': True, 'undone': result})
    except Exception:
        return jsonify({'ok': False, 'error': 'failed to undo'}), 500


@api_bp.route('/api/editor/history/<section>/<profile>', methods=['GET'])
def api_editor_history(section, profile):
    """Get undo stack for a profile."""
    if section not in ('strength_profiles', 'style_profiles'):
        return jsonify({'ok': False, 'error': 'invalid section'}), 400
    try:
        from app.engine_personas import get_change_history
        stack = get_change_history(section, profile)
        return jsonify({'ok': True, 'history': stack})
    except Exception:
        return jsonify({'ok': False, 'error': 'failed to load history'}), 500


@api_bp.route('/api/games/list', methods=['GET'])
def api_games_list():
    """Return a JSON list of .pgn filenames in the games folder."""
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    games_dir = os.path.join(root, 'games')
    try:
        files = sorted(
            f for f in os.listdir(games_dir)
            if f.endswith('.pgn') and os.path.isfile(os.path.join(games_dir, f))
        )
        return jsonify({'ok': True, 'files': files})
    except FileNotFoundError:
        return jsonify({'ok': True, 'files': []})
    except Exception:
        return jsonify({'ok': False, 'error': 'failed to list games'}), 500


@api_bp.route('/api/games/download/<filename>', methods=['GET'])
def api_games_download(filename):
    """Serve a specific PGN file for download from the games folder."""
    safe = os.path.basename(filename)
    if not safe.endswith('.pgn'):
        return jsonify({'ok': False, 'error': 'invalid filename'}), 400
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    path = os.path.join(root, 'games', safe)
    if not os.path.isfile(path):
        return jsonify({'ok': False, 'error': 'file_not_found'}), 404
    try:
        return send_file(path, as_attachment=True, download_name=safe)
    except Exception:
        return jsonify({'ok': False, 'error': 'download failed'}), 500


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
    except Exception:
        return jsonify({'ok': False, 'error': 'download failed'}), 500

