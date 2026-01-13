import os
import json
import random
import math
import chess
import chess.engine

# Known persona names (used for API validation)
_OVERRIDES_FILENAME = 'persona_overrides.json'


def _overrides_file_path():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    data_dir = os.path.join(root, 'data')
    os.makedirs(data_dir, exist_ok=True)
    return os.path.join(data_dir, _OVERRIDES_FILENAME)


def is_persona_allowed(name):
    try:
        if not name:
            return False
        key = name.lower()
        return key in list_personas()
    except Exception:
        return False


# Centralized default persona definitions (used for UI tuning + runtime)
DEFAULT_PERSONAS = {
    'grasshopper': {
        'uci': {'UCI_LimitStrength': True, 'UCI_Elo': 450, 'Skill Level': 0, 'MultiPV': 10},
        'depth': 4,
        'pick_temperature': 2.5,
        'multipv': 10,
        'mercy': {'mate_in': 4, 'mate_keep_prob': 0.03, 'eval_gap_threshold': 300, 'eval_keep_prob': 0.15},
        'endgame_depth_delta': -2,
        'endgame_temp_delta': 0.3,
        'pieces_threshold': 10,
        'curve': {
            'type': 'table',
            'weights': [1, 2, 6, 10, 14, 14, 10, 6, 4, 3]
        },
    },
    'student': {
        'uci': {'UCI_LimitStrength': True, 'UCI_Elo': 750, 'Skill Level': 2, 'MultiPV': 10},
        'depth': 6,
        'pick_temperature': 1.6,
        'multipv': 10,
        'mercy': {'mate_in': 3, 'mate_keep_prob': 0.15, 'eval_gap_threshold': 400, 'eval_keep_prob': 0.30},
        'endgame_depth_delta': -2,
        'endgame_temp_delta': 0.3,
        'pieces_threshold': 10,
        'curve': {
            'type': 'table',
            'weights': [8, 10, 10, 8, 6, 4, 2, 1, 1, 1]
        },
    },
    'adept': {
        'uci': {'UCI_LimitStrength': True, 'UCI_Elo': 1175, 'Skill Level': 5, 'MultiPV': 10},
        'depth': 8,
        'pick_temperature': 1.2,
        'multipv': 10,
        'mercy': {'mate_in': 2, 'mate_keep_prob': 0.55, 'eval_gap_threshold': 525, 'eval_keep_prob': 0.60},
        'endgame_depth_delta': -1,
        'endgame_temp_delta': 0.3,
        'pieces_threshold': 10,
        'curve': {
            'type': 'table',
            'weights': [16, 14, 10, 6, 4, 2, 1, 1, 1, 1]
        },
    },
    'ninja': {
        'uci': {'UCI_LimitStrength': True, 'UCI_Elo': 1450, 'Skill Level': 8, 'MultiPV': 10},
        'depth': 10,
        'pick_temperature': 0.7,
        'multipv': 10,
        'mercy': {'mate_in': 1, 'mate_keep_prob': 0.90, 'eval_gap_threshold': 700, 'eval_keep_prob': 0.85},
        'endgame_depth_delta': -1,
        'endgame_temp_delta': 0.3,
        'pieces_threshold': 10,
        'curve': {
            'type': 'table',
            'weights': [28, 20, 12, 6, 3, 1, 1, 1, 1, 1]
        },
    },
    'sensei': {
        'uci': {'UCI_LimitStrength': True, 'UCI_Elo': 1700, 'Skill Level': 12, 'MultiPV': 10},
        'depth': 14,
        'pick_temperature': 0.0,
        'multipv': 10,
        'mercy': None,
        'endgame_depth_delta': -1,
        'endgame_temp_delta': 0.0,
        'pieces_threshold': 10,
        'curve': {
            'type': 'table',
            'weights': [64, 16, 4, 1, 1, 1, 1, 1, 1, 1]
        },
    },
}

# Internal default engine time (seconds) used for persona-driven play when no explicit
# UI control is provided. This is intentionally internal — the fast/deep selector was
# removed from the UI to avoid inconsistent behavior across persona sampling.
PERSONA_DEFAULT_ENGINE_TIME = 0.35

# Runtime overrides (in-memory). Backed by `data/persona_overrides.json`.
_PERSONA_OVERRIDES = {}


def _load_persona_overrides():
    global _PERSONA_OVERRIDES
    path = _overrides_file_path()
    if not os.path.exists(path):
        _PERSONA_OVERRIDES = {}
        return
    try:
        with open(path, 'r', encoding='utf-8') as fh:
            data = json.load(fh) or {}
        # normalize keys to lowercase
        normalized = {}
        for k, v in data.items():
            if not k:
                continue
            normalized[k.lower()] = v
        _PERSONA_OVERRIDES = normalized
    except Exception:
        _PERSONA_OVERRIDES = {}


def _save_persona_overrides():
    try:
        path = _overrides_file_path()
        # write atomically
        tmp = path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as fh:
            json.dump(_PERSONA_OVERRIDES, fh, indent=2, ensure_ascii=False)
        os.replace(tmp, path)
        return True
    except Exception:
        return False


def list_personas():
    # include any override keys in the persona list
    names = set(k.lower() for k in DEFAULT_PERSONAS.keys())
    names.update(k.lower() for k in _PERSONA_OVERRIDES.keys())
    return sorted(list(names))


def get_persona_config(name: str):
    if not name:
        return None
    key = name.lower()
    base = DEFAULT_PERSONAS.get(key, {})
    over = _PERSONA_OVERRIDES.get(key, {})
    # shallow merge
    merged = dict(base)
    merged.update(over)
    return merged


def set_persona_override(name: str, params: dict):
    if not name:
        return False
    key = name.lower()
    if key not in DEFAULT_PERSONAS:
        return False
    # validate params before applying
    ok, err = validate_persona_override(key, params or {})
    if not ok:
        return False
    cur = dict(_PERSONA_OVERRIDES.get(key, {}))
    cur.update(params or {})
    _PERSONA_OVERRIDES[key] = cur
    _save_persona_overrides()
    return True


def reset_persona(name: str):
    if not name:
        return False
    key = name.lower()
    if key in _PERSONA_OVERRIDES:
        del _PERSONA_OVERRIDES[key]
    _save_persona_overrides()
    return True


def export_persona_overrides():
    """Return a shallow copy of the current overrides dict for export or API consumption."""
    try:
        return dict(_PERSONA_OVERRIDES)
    except Exception:
        return {}


def validate_persona_override(name: str, data: dict):
    """Validate a persona override dict. Returns (True, None) on success or (False, error_message).

    Allowed keys in `data`:
      - 'uci': dict (string->str/int/bool/float)
      - 'depth': int >= 1
      - 'pick_temperature': number
      - 'multipv': int >= 1
      - 'mercy': dict with optional keys 'mate_in'(int>=0), 'mate_keep_prob'(0..1 float), 'eval_gap_threshold'(int>=0), 'eval_keep_prob'(0..1 float)
      - 'endgame_depth_delta': int, 'endgame_temp_delta': number, 'pieces_threshold': int
      - 'endgame': dict with keys similar to above (optional)
    """
    if not isinstance(data, dict):
        return False, 'persona must be an object'
    # uci
    if 'uci' in data:
        if not isinstance(data['uci'], dict):
            return False, 'uci must be an object'
        for k, v in data['uci'].items():
            if not isinstance(k, str):
                return False, 'uci keys must be strings'
            if not (isinstance(v, (str, int, float, bool)) or v is None):
                return False, f"uci value for {k} must be scalar"
    # depth
    if 'depth' in data:
        try:
            d = int(data['depth'])
            if d < 1:
                return False, 'depth must be >= 1'
        except Exception:
            return False, 'depth must be an integer'
    # pick_temperature
    if 'pick_temperature' in data:
        try:
            float(data['pick_temperature'])
        except Exception:
            return False, 'pick_temperature must be a number'
    # multipv
    if 'multipv' in data:
        try:
            m = int(data['multipv'])
            if m < 1:
                return False, 'multipv must be >= 1'
        except Exception:
            return False, 'multipv must be an integer'
    # mercy
    if 'mercy' in data and data['mercy'] is not None:
        if not isinstance(data['mercy'], dict):
            return False, 'mercy must be an object or null'
        merc = data['mercy']
        if 'mate_in' in merc:
            try:
                mi = int(merc['mate_in'])
                if mi < 0:
                    return False, 'mercy.mate_in must be >= 0'
            except Exception:
                return False, 'mercy.mate_in must be an integer'
        if 'mate_keep_prob' in merc:
            try:
                p = float(merc['mate_keep_prob'])
                if p < 0 or p > 1:
                    return False, 'mercy.mate_keep_prob must be between 0 and 1'
            except Exception:
                return False, 'mercy.mate_keep_prob must be a number'
        if 'eval_gap_threshold' in merc:
            try:
                eg = int(merc['eval_gap_threshold'])
                if eg < 0:
                    return False, 'mercy.eval_gap_threshold must be >= 0'
            except Exception:
                return False, 'mercy.eval_gap_threshold must be an integer'
        if 'eval_keep_prob' in merc:
            try:
                p2 = float(merc['eval_keep_prob'])
                if p2 < 0 or p2 > 1:
                    return False, 'mercy.eval_keep_prob must be between 0 and 1'
            except Exception:
                return False, 'mercy.eval_keep_prob must be a number'
    # endgame fields
    if 'endgame_depth_delta' in data:
        try:
            int(data['endgame_depth_delta'])
        except Exception:
            return False, 'endgame_depth_delta must be an integer'
    if 'endgame_temp_delta' in data:
        try:
            float(data['endgame_temp_delta'])
        except Exception:
            return False, 'endgame_temp_delta must be a number'
    if 'pieces_threshold' in data:
        try:
            int(data['pieces_threshold'])
        except Exception:
            return False, 'pieces_threshold must be an integer'
    if 'endgame' in data:
        if not isinstance(data['endgame'], dict):
            return False, 'endgame must be an object'
        # allow endgame to carry pieces_threshold, depth_delta, temp_delta
        eg = data['endgame']
        if 'pieces_threshold' in eg:
            try:
                int(eg['pieces_threshold'])
            except Exception:
                return False, 'endgame.pieces_threshold must be an integer'
        if 'depth_delta' in eg:
            try:
                int(eg['depth_delta'])
            except Exception:
                return False, 'endgame.depth_delta must be an integer'
        if 'temp_delta' in eg:
            try:
                float(eg['temp_delta'])
            except Exception:
                return False, 'endgame.temp_delta must be a number'
    # curve (optional): allow persona move-selection curves
    if 'curve' in data and data['curve'] is not None:
        if not isinstance(data['curve'], dict):
            return False, 'curve must be an object or null'
        cur = data['curve']
        # type must be 'table' or 'power'
        if 'type' not in cur or not isinstance(cur['type'], str):
            return False, 'curve.type must be a string'
        if cur['type'] not in ('table', 'power'):
            return False, "curve.type must be 'table' or 'power'"
        if cur['type'] == 'table':
            if 'weights' not in cur:
                return False, 'curve.weights must be provided for table type'
            if not isinstance(cur['weights'], (list, tuple)):
                return False, 'curve.weights must be a list'
            if len(cur['weights']) < 1:
                return False, 'curve.weights must contain at least one number'
            for i, w in enumerate(cur['weights']):
                try:
                    float(w)
                except Exception:
                    return False, f'curve.weights[{i}] must be a number'
        else:
            # power
            if 'alpha' not in cur:
                return False, 'curve.alpha must be provided for power type'
            try:
                float(cur['alpha'])
            except Exception:
                return False, 'curve.alpha must be a number'
    return True, None


def import_persona_overrides(data: dict):
    """Import overrides from a dict, normalize keys, and persist to disk.

    Returns True on success, False otherwise.
    """
    global _PERSONA_OVERRIDES
    if not isinstance(data, dict):
        return False
    try:
        normalized = {}
        for k, v in data.items():
            if not k:
                continue
            if not isinstance(v, dict):
                # ignore malformed entries
                continue
            normalized[k.lower()] = v
        # validate all entries before saving
        for k, v in normalized.items():
            ok, err = validate_persona_override(k, v)
            if not ok:
                return False
        _PERSONA_OVERRIDES = normalized
        return _save_persona_overrides()
    except Exception:
        return False


def reset_all_persona_overrides():
    """Clear all persona overrides and persist the empty state."""
    global _PERSONA_OVERRIDES
    _PERSONA_OVERRIDES = {}
    return _save_persona_overrides()


def configure_persona(engine: chess.engine.SimpleEngine, persona: str):
    """
    Configure Stockfish UCI options for different personas.
    Returns a dict with search parameters (e.g. depth, pick_temperature).
    """
    if not persona:
        try:
            engine.configure({"MultiPV": 10})
        except Exception:
            pass
        return {"depth": 12, "pick_temperature": 0.0, "multipv": 10}

    cfg = get_persona_config(persona)
    if not cfg:
        try:
            engine.configure({"MultiPV": 10})
        except Exception:
            pass
        return {"depth": 12, "pick_temperature": 0.0, "multipv": 10}

    # Apply UCI options if provided
    try:
        uci_opts = cfg.get('uci') or {}
        if uci_opts:
            engine.configure(uci_opts)
        else:
            # ensure some sensible default (default to 10 MultiPV)
            engine.configure({"MultiPV": cfg.get('multipv', 10)})
    except Exception:
        pass

    # Return the merged configuration for use by callers
    return {
        'depth': cfg.get('depth'),
        'pick_temperature': cfg.get('pick_temperature'),
        'multipv': cfg.get('multipv'),
        'mercy': cfg.get('mercy'),
        'endgame_depth_delta': cfg.get('endgame_depth_delta'),
        'endgame_temp_delta': cfg.get('endgame_temp_delta'),
        'pieces_threshold': cfg.get('pieces_threshold'),
    }


# Module RNG for reproducible sampling. Use `set_rng_seed(seed)` to control.
_RNG = random.Random()


def set_rng_seed(seed):
    """Set the module RNG. If seed is None, reset to non-deterministic Random().

    seed: int|str|None
    """
    global _RNG
    try:
        if seed is None:
            _RNG = random.Random()
        else:
            _RNG = random.Random(int(seed))
    except Exception:
        _RNG = random.Random(seed)


def get_rng():
    return _RNG


def normalize_weights(ws):
    """Normalize an iterable of weights to sum to 1. Returns a list of floats.

    - Treats NaN/inf as 0. If sum is 0, returns uniform weights.
    """
    out = []
    for v in ws:
        try:
            fv = float(v)
            if math.isfinite(fv) and fv > 0:
                out.append(fv)
            else:
                out.append(0.0)
        except Exception:
            out.append(0.0)
    s = sum(out)
    if s <= 0:
        # fallback to uniform positive weights
        if len(out) == 0:
            return []
        return [1.0 / len(out) for _ in out]
    return [v / s for v in out]


def make_curve_weights(curve, K):
    """Return a list of K positive weights according to `curve` spec.

    curve: None or dict with keys:
      - type: 'table' or 'power'
      - for 'table': 'weights': list (ranks 1..N)
      - for 'power': 'alpha': float
    Behavior:
      - table: use first K entries; if K>len(weights) extend by repeating last value.
      - power: weight[r] = 1/(r**alpha) for rank r starting at 1.
    """
    if K <= 0:
        return []
    if not curve or not isinstance(curve, dict):
        return [1.0] * K
    typ = curve.get('type')
    if typ == 'table':
        tbl = curve.get('weights') or []
        # ensure numeric
        cleaned = []
        for w in tbl:
            try:
                cleaned.append(float(w))
            except Exception:
                cleaned.append(0.0)
        if not cleaned:
            return [1.0] * K
        if K <= len(cleaned):
            return cleaned[:K]
        # extend by repeating last weight
        last = cleaned[-1]
        return cleaned + [last] * (K - len(cleaned))
    if typ == 'power':
        try:
            alpha = float(curve.get('alpha', 1.0))
        except Exception:
            alpha = 1.0
        weights = []
        for r in range(1, K + 1):
            try:
                w = 1.0 / (r ** alpha) if alpha != 0 else 1.0
            except Exception:
                w = 0.0
            weights.append(w)
        return weights
    # unknown curve type: default uniform
    return [1.0] * K


def pick_move_with_multipv(engine: chess.engine.SimpleEngine, board: chess.Board, depth: int, temperature: float, multipv: int = 10, mercy: dict = None, enforce_no_blunder: bool = False, blunder_threshold: int = 150, persona: str = None):
    """
    If temperature > 0, sample among top MultiPV moves with a soft weighting.
    If temperature == 0, just take best move.
    Returns a `chess.Move`.
    """
    if depth is None:
        depth = 12

    # Phase-aware adjustments: if few pieces remain, make engine/persona softer
    try:
        # count pieces excluding kings
        pieces = sum(1 for sq in board.piece_map().values() if sq.piece_type != chess.KING)
    except Exception:
        try:
            pieces = len(board.piece_map()) - 2
        except Exception:
            pieces = 16

    # Persona-specific phase rules: reduce depth and increase temperature in endgames
    try:
        cfg = get_persona_config(persona) if persona else None
        threshold = int(cfg.get('pieces_threshold', 10)) if cfg else 10
        depth_delta = int(cfg.get('endgame_depth_delta', -1)) if cfg else -1
        temp_delta = float(cfg.get('endgame_temp_delta', 0.3)) if cfg else 0.3
    except Exception:
        threshold = 10
        depth_delta = -1
        temp_delta = 0.3

    if pieces <= threshold:
        depth = max(1, (depth or 1) + depth_delta)
        temperature = (temperature or 0.0) + temp_delta

    # Request multi-PV analysis (engine should have MultiPV configured)
    try:
        effective_multipv = multipv
        if not temperature or temperature <= 0:
            effective_multipv = 1
        info = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=effective_multipv)
    except Exception:
        # Fallback to single best move via play()
        res = engine.play(board, chess.engine.Limit(depth=depth))
        mv = res.move if res and getattr(res, 'move', None) else None
        return (mv, None, None, False)

    # python-chess returns a list when multipv > 1
    if not isinstance(info, list):
        # info is a dict-like
        pv = info.get('pv')
        if pv:
            return (pv[0], None, None, False)
        return None

    candidates = []
    for entry in info:
        pv = entry.get('pv')
        score = entry.get('score')
        if not pv or score is None:
            continue
        move = pv[0]
        # Convert score to a centipawn-ish number and capture mate distance if present
        mate_dist = None
        try:
            s = score.pov(board.turn)
            if hasattr(s, 'is_mate') and s.is_mate():
                # Score represents a mate; try to get mate distance
                try:
                    mate_dist = s.mate()
                except Exception:
                    mate_dist = None
                cp = 100000
            else:
                cp = s.score(mate_score=100000) or 0
        except Exception:
            cp = 0
        candidates.append((move, cp, mate_dist))

    if not candidates:
        return (None, None, None, False)

    # Sort best-first
    candidates.sort(key=lambda x: x[1], reverse=True)

    if temperature <= 0 or len(candidates) == 1:
        return (candidates[0][0], candidates[0][1], candidates[0][1], False)

    cps = [cp for _, cp, _ in candidates]
    best = cps[0]
    weights = []
    for cp, (_, _, mate_dist) in zip(cps, candidates):
        delta = best - cp
        # Use a softmax-like weighting based on centipawn difference and temperature
        scale = max(0.0001, temperature)
        w = math.exp(-(delta / 100.0) / scale)
        weights.append(w)

    # Apply mercy rules if provided
    if mercy:
        # Reduce probability for forced mates within mercy['mate_in'] (beginners may miss short mates)
        try:
            mate_in = mercy.get('mate_in')
            mate_keep = mercy.get('mate_keep_prob', 0.5)
            if mate_in is not None:
                for i, (_, cp, mate_dist) in enumerate(candidates):
                    if mate_dist is not None and abs(mate_dist) <= mate_in:
                        weights[i] = weights[i] * float(mate_keep)
        except Exception:
            pass

        # If the best move is far stronger than others, reduce its selection probability
        try:
            gap_thr = mercy.get('eval_gap_threshold')
            gap_keep = mercy.get('eval_keep_prob', 0.5)
            if gap_thr is not None and len(cps) > 1:
                second = cps[1]
                gap = best - second
                if gap >= gap_thr:
                    # scale down best weight
                    weights[0] = weights[0] * float(gap_keep)
        except Exception:
            pass

    move_choices = [m for m, _, _ in candidates]
    # Apply persona curve weights (by candidate rank) if configured
    try:
        cfg = get_persona_config(persona) if persona else None
        curve = cfg.get('curve') if cfg else None
        curve_ws = make_curve_weights(curve, len(weights))
        # multiply elementwise
        weights = [w * cw for w, cw in zip(weights, curve_ws)]
    except Exception:
        pass

    # Normalize weights and guard against degenerate distributions
    weights = normalize_weights(weights)

    try:
        selected = _RNG.choices(move_choices, weights=weights, k=1)[0]
    except Exception:
        # fallback to global random
        selected = random.choices(move_choices, weights=weights, k=1)[0]

    # find selected cp and best cp
    best_cp = candidates[0][1]
    sel_cp = None
    sel_idx = None
    for i, (m, cp, _) in enumerate(candidates):
        if m == selected:
            sel_cp = cp
            sel_idx = i
            break

    # Determine if selection is a blunder relative to best
    is_blunder = False
    if sel_cp is not None:
        gap = best_cp - sel_cp
        if gap >= blunder_threshold:
            is_blunder = True

    # If we're enforcing no blunders and selected is a blunder, pick the best instead
    if enforce_no_blunder and is_blunder:
        selected = candidates[0][0]
        sel_cp = candidates[0][1]
        is_blunder = False

    return selected, sel_cp, best_cp, is_blunder


# Load overrides from disk at module import time
try:
    _load_persona_overrides()
except Exception:
    # ignore failures; runtime will operate with defaults
    _PERSONA_OVERRIDES = {}
