import os
import json
import random
import math
import logging
import chess
import chess.engine

_log = logging.getLogger(__name__)

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


# Bot configuration - loaded from bot_config.json
# Supports both legacy format and new modular (strength + style) format
def _load_bot_config():
    """Load bot configuration from bot_config.json
    
    Supports two formats:
    1. MODULAR (v2.0): Separate strength_profiles and style_profiles that bots compose
    2. LEGACY (v1.0): Direct bot definitions with all params in one place
    """
    try:
        config_path = os.path.join(os.path.dirname(__file__), '..', 'bot_config.json')
        if not os.path.exists(config_path):
            return _get_default_bot_config()
        
        with open(config_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
            # Check if this is the new modular format (v2.0)
            if 'strength_profiles' in data and 'style_profiles' in data:
                return _load_modular_config(data)
            else:
                # Legacy format (v1.0) - direct bot definitions
                return _load_legacy_config(data)
                
    except Exception:
        return _get_default_bot_config()

def _load_modular_config(data):
    """Load modular config (v2.0): strength_profiles + style_profiles
    
    Creates personas from:
    1. style_profiles (for Build-A-Bot dynamic composition)
    2. bots section if present (for pre-configured combinations)
    """
    strength_profiles = data.get('strength_profiles', {})
    style_profiles = data.get('style_profiles', {})
    bots = data.get('bots', {})
    
    personas = {}
    
    # Expose style_profiles directly as personas for Build-A-Bot.
    # Style only defines personality (temperature, blunder_cap, curve, endgame_temp).
    # Mercy and endgame_depth_delta are ability concerns — they live in strength.
    for style_key, style_data in style_profiles.items():
        if style_key.startswith('_'):
            continue

        personas[style_key] = {
            'pick_temperature': style_data.get('pick_temperature', 1.0),
            'blunder_cap': style_data.get('blunder_cap', 500),
            'endgame_temp_delta': style_data.get('endgame_temp_delta', 0.3),
            'pieces_threshold': style_data.get('pieces_threshold', 10),
            'curve': style_data.get('curve', {'type': 'table', 'weights': [10] * 10}),
            'multipv': 10
        }
    
    # Also load any pre-configured bots if present (optional)
    for bot_key, bot_data in bots.items():
        if bot_key.startswith('_'):
            continue
            
        strength_key = bot_data.get('strength')
        style_key = bot_data.get('style')
        
        if not strength_key or not style_key:
            continue
            
        strength = strength_profiles.get(strength_key, {})
        style = style_profiles.get(style_key, {})
        
        if not strength or not style:
            continue
        
        # Merge strength + style into a complete persona
        personas[bot_key] = {
            # From STRENGTH module (ability/vision)
            'uci': {
                'UCI_LimitStrength': True,
                'UCI_Elo': strength.get('engine_elo', 1000),
                'Skill Level': strength.get('engine_skill', 5),
                'MultiPV': strength.get('multipv', 10)
            },
            'depth': strength.get('depth', 8),
            'multipv': strength.get('multipv', 10),
            'mercy': strength.get('mercy'),
            'endgame_depth_delta': strength.get('endgame_depth_delta', -1),

            # From STYLE module (personality/choice)
            'pick_temperature': style.get('pick_temperature', 1.0),
            'blunder_cap': style.get('blunder_cap', 500),
            'endgame_temp_delta': style.get('endgame_temp_delta', 0.3),
            'pieces_threshold': style.get('pieces_threshold', 10),
            'curve': style.get('curve', {'type': 'table', 'weights': [10] * 10})
        }
    
    return personas

def _load_legacy_config(data):
    """Load legacy config (v1.0): all params in bot definitions"""
    bots = data.get('bots', {})
    personas = {}
    
    for bot_key, bot_data in bots.items():
        personas[bot_key] = {
            'blunder_cap': bot_data.get('blunder_cap', 500),
            'uci': {
                'UCI_LimitStrength': True,
                'UCI_Elo': bot_data.get('engine_elo', 1000),
                'Skill Level': bot_data.get('engine_skill', 5),
                'MultiPV': bot_data.get('multipv', 10)
            },
            'depth': bot_data.get('depth', 8),
            'pick_temperature': bot_data.get('pick_temperature', 1.0),
            'multipv': bot_data.get('multipv', 10),
            'mercy': bot_data.get('mercy'),
            'endgame_depth_delta': bot_data.get('endgame_depth_delta', -1),
            'endgame_temp_delta': bot_data.get('endgame_temp_delta', 0.3),
            'pieces_threshold': bot_data.get('pieces_threshold', 10),
            'curve': bot_data.get('curve', {'type': 'table', 'weights': [10] * 10})
        }
    
    return personas

def _get_default_bot_config():
    """Fallback configuration if bot_config.json is missing"""
    return {
        'beginner': {
            'uci': {'UCI_LimitStrength': True, 'UCI_Elo': 600, 'Skill Level': 2, 'MultiPV': 10},
            'depth': 5,
            'multipv': 10,
            'mercy': {'mate_in': 4, 'mate_keep_prob': 0.10, 'eval_gap_threshold': 250, 'eval_keep_prob': 0.20},
            'endgame_depth_delta': -4,
            'pick_temperature': 2.0,
            'blunder_cap': 600,
            'endgame_temp_delta': 0.5,
            'pieces_threshold': 10,
            'curve': {'type': 'table', 'weights': [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]},
        },
        'intermediate': {
            'uci': {'UCI_LimitStrength': True, 'UCI_Elo': 1200, 'Skill Level': 8, 'MultiPV': 10},
            'depth': 10,
            'multipv': 10,
            'mercy': {'mate_in': 3, 'mate_keep_prob': 0.40, 'eval_gap_threshold': 400, 'eval_keep_prob': 0.50},
            'endgame_depth_delta': -2,
            'pick_temperature': 0.8,
            'blunder_cap': 250,
            'endgame_temp_delta': 0.1,
            'pieces_threshold': 10,
            'curve': {'type': 'table', 'weights': [25, 18, 10, 5, 2, 1, 1, 1, 1, 1]},
        },
        'advanced': {
            'uci': {'UCI_LimitStrength': True, 'UCI_Elo': 1800, 'Skill Level': 15, 'MultiPV': 10},
            'depth': 16,
            'multipv': 10,
            'mercy': {'mate_in': 2, 'mate_keep_prob': 0.85, 'eval_gap_threshold': 600, 'eval_keep_prob': 0.90},
            'endgame_depth_delta': 0,
            'pick_temperature': 0.0,
            'blunder_cap': 10,
            'endgame_temp_delta': 0.0,
            'pieces_threshold': 10,
            'curve': {'type': 'table', 'weights': [100, 0, 0, 0, 0, 0, 0, 0, 0, 0]},
        },
    }

# Load personas from config file on module import
DEFAULT_PERSONAS = _load_bot_config()


def _load_strength_profiles():
    """Load strength_profiles from bot_config.json. Returns dict or empty."""
    try:
        config_path = os.path.join(os.path.dirname(__file__), '..', 'bot_config.json')
        with open(config_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get('strength_profiles', {})
    except Exception:
        return {}


# Cached strength profiles and reverse skill->name map
STRENGTH_PROFILES = _load_strength_profiles()
_SKILL_TO_STRENGTH = {}
for _sname, _sprof in STRENGTH_PROFILES.items():
    if not _sname.startswith('_'):
        _sk = _sprof.get('engine_skill')
        if _sk is not None:
            _SKILL_TO_STRENGTH[int(_sk)] = _sname

# Default strength used when nothing else resolves
_DEFAULT_STRENGTH = {
    'engine_elo': 1200, 'engine_skill': 8, 'depth': 10,
    'engine_time': 0.35, 'multipv': 10,
    'endgame_depth_delta': -2,
    'mercy': {'mate_in': 3, 'mate_keep_prob': 0.40, 'eval_gap_threshold': 400, 'eval_keep_prob': 0.50}
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


def assemble_persona_config(style_name, strength_name=None, engine_skill=None):
    """Single authority for assembling a complete engine config from strength + style.

    Args:
        style_name: Style profile key (e.g. "cautious") OR a legacy combined
                    persona name (e.g. "beginner").
        strength_name: Strength profile key (e.g. "casual", "moderate", "strong").
        engine_skill: Integer skill level fallback if strength_name is absent.

    Returns:
        dict with ALL fields needed by pick_move_with_multipv — no Nones for
        required fields.  Strength owns depth/elo/skill/multipv/uci/mercy/endgame_depth.
        Style owns pick_temperature/curve/blunder_cap/endgame_temp.
    """
    key = (style_name or '').lower()

    # Legacy detection: if the persona already has depth + uci it is a fully
    # assembled bot from the bots section of bot_config.json — return as-is.
    legacy_cfg = get_persona_config(key)
    if legacy_cfg and legacy_cfg.get('depth') is not None and legacy_cfg.get('uci'):
        return legacy_cfg

    # --- Modular path: merge strength + style ---

    # Resolve strength profile
    strength = None
    if strength_name:
        sn = strength_name.lower()
        # Accept legacy 'weak' as alias for 'casual'
        if sn == 'weak':
            sn = 'casual'
        strength = STRENGTH_PROFILES.get(sn)
    if not strength and engine_skill is not None:
        matched = _SKILL_TO_STRENGTH.get(int(engine_skill))
        if matched:
            strength = STRENGTH_PROFILES.get(matched)
    if not strength:
        strength = STRENGTH_PROFILES.get('moderate', _DEFAULT_STRENGTH)

    # Resolve style (already loaded as a persona entry without depth/uci)
    style = legacy_cfg or {}

    return {
        # STRENGTH-owned (ability/vision)
        'depth': strength.get('depth', 10),
        'multipv': strength.get('multipv', 10),
        'uci': {
            'UCI_LimitStrength': True,
            'UCI_Elo': strength.get('engine_elo', 1200),
            'Skill Level': strength.get('engine_skill', 8),
            'MultiPV': strength.get('multipv', 10),
        },
        'engine_time': strength.get('engine_time', 0.35),
        'mercy': strength.get('mercy'),
        'endgame_depth_delta': strength.get('endgame_depth_delta', -2),
        # STYLE-owned (personality/choice)
        'pick_temperature': style.get('pick_temperature', 1.0),
        'blunder_cap': style.get('blunder_cap', 500),
        'curve': style.get('curve', {'type': 'table', 'weights': [10] * 10}),
        'endgame_temp_delta': style.get('endgame_temp_delta', 0.3),
        'pieces_threshold': style.get('pieces_threshold', 10),
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


def pick_move_with_multipv(engine: chess.engine.SimpleEngine, board: chess.Board, depth: int, temperature: float, multipv: int = 10, mercy: dict = None, enforce_no_blunder: bool = False, blunder_threshold: int = 150, blunder_cap: int = None, curve: dict = None, endgame_depth_delta: int = None, endgame_temp_delta: float = None, pieces_threshold: int = None):
    """
    If temperature > 0, sample among top MultiPV moves with a soft weighting.
    If temperature == 0, just take best move.
    Returns a `chess.Move`.

    All config values (curve, endgame params) should be passed explicitly from the
    assembled config — this function does NOT re-read from persona config.
    """
    if depth is None:
        _log.warning('pick_move_with_multipv called with depth=None; falling back to 8')
        depth = 8

    # Phase-aware adjustments: if few pieces remain, make engine/persona softer
    try:
        # count pieces excluding kings
        pieces = sum(1 for sq in board.piece_map().values() if sq.piece_type != chess.KING)
    except Exception:
        try:
            pieces = len(board.piece_map()) - 2
        except Exception:
            pieces = 16

    # Use caller-provided endgame values (from assembled config), with sensible defaults
    threshold = int(pieces_threshold) if pieces_threshold is not None else 10
    depth_delta = int(endgame_depth_delta) if endgame_depth_delta is not None else -1
    temp_delta = float(endgame_temp_delta) if endgame_temp_delta is not None else 0.3

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

    # --- SOFT FILTER ---
    # Zero out any candidate whose centipawn loss exceeds blunder_cap.
    # This removes objectively losing moves from the pool before curve/sampling,
    # so even a reckless bot won't pick a move that drops a piece when better
    # options exist.
    if blunder_cap is not None:
        for i, cp in enumerate(cps):
            if best - cp > blunder_cap:
                weights[i] = 0.0

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
    # Apply curve weights (by candidate rank) from the assembled config
    try:
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
    for m, cp, _ in candidates:
        if m == selected:
            sel_cp = cp
            break

    # Determine if selection is a blunder relative to best (legacy threshold)
    is_blunder = False
    if sel_cp is not None:
        try:
            gap = best_cp - sel_cp
            if gap >= blunder_threshold:
                is_blunder = True
        except Exception:
            is_blunder = False

    # If we're enforcing no blunders and selected is a blunder, pick the best instead
    if enforce_no_blunder and is_blunder:
        selected = candidates[0][0]
        sel_cp = candidates[0][1]
        is_blunder = False

    return selected, sel_cp, best_cp, is_blunder


# ---------------------------------------------------------------------------
# Bot Config Editor helpers (read / write / undo history)
# ---------------------------------------------------------------------------

def _bot_config_path():
    return os.path.join(os.path.dirname(__file__), '..', 'bot_config.json')


def _history_file_path():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    data_dir = os.path.join(root, 'data')
    os.makedirs(data_dir, exist_ok=True)
    return os.path.join(data_dir, 'config_history.json')


def read_bot_config():
    """Read and return the full bot_config.json as a dict."""
    path = _bot_config_path()
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def _read_history():
    path = _history_file_path()
    if not os.path.exists(path):
        return {"strength_profiles": {}, "style_profiles": {}}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {"strength_profiles": {}, "style_profiles": {}}


def _write_history(history):
    path = _history_file_path()
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(history, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


def _reload_config():
    """Re-read bot_config.json into DEFAULT_PERSONAS and STRENGTH_PROFILES globals."""
    global DEFAULT_PERSONAS, STRENGTH_PROFILES, _SKILL_TO_STRENGTH
    DEFAULT_PERSONAS = _load_bot_config()
    STRENGTH_PROFILES = _load_strength_profiles()
    _SKILL_TO_STRENGTH = {}
    for sname, sprof in STRENGTH_PROFILES.items():
        if not sname.startswith('_'):
            sk = sprof.get('engine_skill')
            if sk is not None:
                _SKILL_TO_STRENGTH[int(sk)] = sname


def write_bot_config_field(section, profile_name, field, value):
    """Update a single field in bot_config.json and push old value to history.

    section: 'strength_profiles' or 'style_profiles'
    profile_name: e.g. 'strong', 'reckless'
    field: e.g. 'depth', 'pick_temperature', or 'mercy.mate_in' for nested
    value: new value
    """
    config = read_bot_config()
    if section not in config:
        return False, 'unknown section'
    profiles = config[section]
    if profile_name not in profiles:
        return False, 'unknown profile'

    profile = profiles[profile_name]

    # Support dotted field paths for nested fields like mercy.mate_in or curve.weights.3
    parts = field.split('.')
    target = profile
    for part in parts[:-1]:
        if isinstance(target, dict) and part in target:
            target = target[part]
        elif isinstance(target, list):
            try:
                target = target[int(part)]
            except (ValueError, IndexError):
                return False, f'field path invalid: {field}'
        else:
            return False, f'field path invalid: {field}'
    last_key = parts[-1]

    if isinstance(target, list):
        try:
            idx = int(last_key)
            old_value = target[idx]
            target[idx] = value
        except (ValueError, IndexError):
            return False, f'field path invalid: {field}'
    elif isinstance(target, dict):
        old_value = target.get(last_key)
        target[last_key] = value
    else:
        return False, f'field path invalid: {field}'

    # Push old value to history
    from datetime import datetime as _dt
    history = _read_history()
    if section not in history:
        history[section] = {}
    if profile_name not in history[section]:
        history[section][profile_name] = []
    history[section][profile_name].append({
        "ts": _dt.now().isoformat(timespec='seconds'),
        "field": field,
        "old": old_value,
        "new": value
    })
    _write_history(history)

    # Write updated config
    path = _bot_config_path()
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)

    _reload_config()
    return True, None


def undo_last_change(section, profile_name):
    """Pop last history entry for a profile and write old value back."""
    history = _read_history()
    stack = history.get(section, {}).get(profile_name, [])
    if not stack:
        return False, 'nothing to undo'

    entry = stack.pop()
    _write_history(history)

    # Write old value back to config
    config = read_bot_config()
    profile = config.get(section, {}).get(profile_name)
    if profile is None:
        return False, 'profile not found'

    field = entry['field']
    old_value = entry['old']

    parts = field.split('.')
    target = profile
    for part in parts[:-1]:
        if isinstance(target, dict) and part in target:
            target = target[part]
        elif isinstance(target, list):
            try:
                target = target[int(part)]
            except (ValueError, IndexError):
                return False, f'field path invalid: {field}'
        else:
            return False, f'field path invalid: {field}'

    last_key = parts[-1]
    if isinstance(target, list):
        try:
            target[int(last_key)] = old_value
        except (ValueError, IndexError):
            return False, f'field path invalid: {field}'
    else:
        target[last_key] = old_value

    path = _bot_config_path()
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)

    _reload_config()
    return True, entry


def get_change_history(section, profile_name):
    """Return the undo stack for a profile."""
    history = _read_history()
    return history.get(section, {}).get(profile_name, [])


# Load overrides from disk at module import time
try:
    _load_persona_overrides()
except Exception:
    # ignore failures; runtime will operate with defaults
    _PERSONA_OVERRIDES = {}
