/* Global state is managed by AppState. Backwards-compatible globals are
  declared later and mapped to AppState to support gradual refactoring. */

/* Initialize board click handlers for mobile tap-to-move interactions.
   Call `initBoardClickHandlers()` inside your `window.addEventListener('load', ...)` init block.
   For now this only logs the tapped square and does not perform moves. */
function initBoardClickHandlers() {
  try {
    const boardEl = document.getElementById('board') || document.getElementById('board-container');
    if (!boardEl) {
      console.warn('[TAP-TO-MOVE] Board element not found!');
      return;
    }
    console.log('[TAP-TO-MOVE] Click handler attached to:', boardEl);

    boardEl.addEventListener('click', function (ev) {
      console.log('[TAP-TO-MOVE] Click detected on:', ev.target);
      try {
        // Find square element by looking up the DOM tree
        let sqEl = ev.target;
        let foundSquare = false;
        
        // Traverse up the DOM tree to find a square element
        while (sqEl && sqEl !== boardEl) {
          // Check if this element has a square class (any class matching square-XXXX or square-[a-h][1-8])
          const classList = Array.from(sqEl.classList);
          
          // First, try to extract square name from classes like 'square-e4'
          const squareNameMatch = classList
            .map(c => {
              const m = c.match(/^square-([a-h][1-8])$/);
              return m ? m[1] : null;
            })
            .find(Boolean);
          
          if (squareNameMatch) {
            console.log('[TAP-TO-MOVE] Square element found:', sqEl, 'Square:', squareNameMatch);
            handleSquareClick(squareNameMatch);
            foundSquare = true;
            break;
          }
          
          sqEl = sqEl.parentElement;
        }
        
        if (!foundSquare) {
          console.log('[TAP-TO-MOVE] No square element found in click target ancestry');
        }
      } catch (e) {
        console.warn('tap handler error', e);
      }
    }, { passive: true });
  } catch (e) { console.error('Operation failed:', e); }
}

// Highlight helpers for tap-to-move
function highlightSquare(square) {
  try {
    clearHighlights();
    // Find the square element - it has both .square-55d63 (base style) and .square-e4 (position identifier)
    const sqEl = document.querySelector(`.square-${square}`);
    if (sqEl) {
      sqEl.classList.add('highlight-selected');
      console.log("[TAP-TO-MOVE] Highlighted square:", square);
    } else {
      console.warn("[TAP-TO-MOVE] Could not find square element for:", square);
    }
  } catch (e) { console.error('Operation failed:', e); }
}

function clearHighlights() {
  try {
    const prev = document.querySelectorAll('.square-55d63.highlight-selected');
    prev.forEach(el => el.classList.remove('highlight-selected'));
  } catch (e) { console.error('Operation failed:', e); }
}

// Handle square taps: select/deselect or attempt a move
function handleSquareClick(square) {
  try {
    console.log("[TAP-TO-MOVE] handleSquareClick called with square:", square);
    // 1. LOCK: Prevent moves if game hasn't started (unless in Free Board editor)
    if (!AppState.getFreeBoardMode()) {
      if (AppState.getUIState() !== 'IN_GAME') {
        console.log("[TAP-TO-MOVE] BLOCKED: UIState is not IN_GAME, it's:", AppState.getUIState());
        AppState.setTapSourceSquare(null);
        clearHighlights();
        return;
      }
      if (AppState.isGameOver()) {
        console.log("[TAP-TO-MOVE] BLOCKED: Game is over");
        AppState.setTapSourceSquare(null);
        clearHighlights();
        return;
      }
    }
    // Scenario A: No piece selected yet
    if (!AppState.getTapSourceSquare()) {
      const g = AppState.getGame();
      if (!g) {
        console.log("[TAP-TO-MOVE] BLOCKED: No game object found");
        return;
      }
      const piece = (typeof g.get === 'function') ? g.get(square) : null;
      if (!piece) {
        console.log("[TAP-TO-MOVE] BLOCKED: No piece at square", square);
        return; // tapped empty square, nothing to do
      }

      console.log("[TAP-TO-MOVE] Piece found:", piece, "Turn:", g.turn());
      // Only allow selecting pieces of the side to move
      if (String(piece.color).toLowerCase() !== String(g.turn()).toLowerCase()) {
        console.log("[TAP-TO-MOVE] BLOCKED: Wrong color. Piece is", piece.color, "but turn is", g.turn());
        return;
      }
      console.log("[TAP-TO-MOVE] SUCCESS: Selecting piece at", square);
      AppState.setTapSourceSquare(square);
      highlightSquare(square);
      return;
    }

    // Scenario B: piece already selected
    if (AppState.getTapSourceSquare() === square) {
      // Deselect
      console.log("[TAP-TO-MOVE] Deselecting piece at", square);
      AppState.setTapSourceSquare(null);
      clearHighlights();
      return;
    }

    // If tapped another own piece, switch selection
    const g2 = AppState.getGame();
    if (!g2) {
      console.log("[TAP-TO-MOVE] BLOCKED: No game object for move attempt");
      return;
    }
    const tappedPiece = (typeof g2.get === 'function') ? g2.get(square) : null;
    if (tappedPiece && String(tappedPiece.color).toLowerCase() === String(g2.turn()).toLowerCase()) {
      console.log("[TAP-TO-MOVE] Switching selection to", square);
      AppState.setTapSourceSquare(square);
      highlightSquare(square);
      return;
    }

    // Otherwise, attempt a move from tapSourceSquare -> square
    console.log("[TAP-TO-MOVE] Attempting move from", AppState.getTapSourceSquare(), "to", square);
    const currentSource = AppState.getTapSourceSquare();
    Promise.resolve(attemptMove(currentSource, square)).then(success => {
      if (success) {
        AppState.setTapSourceSquare(null);
        clearHighlights();
      } else {
        // invalid move -> deselect
        AppState.setTapSourceSquare(null);
        clearHighlights();
      }
    }).catch(() => {
      AppState.setTapSourceSquare(null);
      clearHighlights();
    });
  } catch (e) {
    console.error('handleSquareClick error:', e);
    AppState.setTapSourceSquare(null);
    clearHighlights();
  }
}


// Placeholder for attempting a move; the real implementation will submit to server
function attemptMove(from, to) {
  try {
    console.log("[TAP-TO-MOVE] attemptMove called: from=" + from + ", to=" + to);
    const gameObj = AppState.getGame();
    if (!gameObj) {
      console.warn('[TAP-TO-MOVE] attemptMove: no game object from AppState');
      return false;
    }
    console.log("[TAP-TO-MOVE] Game object retrieved from AppState");
    const moving = gameObj.get(from);
    if (!moving) {
      console.warn('[TAP-TO-MOVE] No piece at source square:', from);
      return false;
    }
    console.log("[TAP-TO-MOVE] Piece found at " + from + ":", moving);
    // piece code like 'wP' expected by some callers
    const pieceCode = (moving.color === 'w' ? 'w' : 'b') + String(moving.type || '').toUpperCase();
    console.log("[TAP-TO-MOVE] Piece code:", pieceCode, "Calling handleGameDrop...");
    const res = handleGameDrop(from, to, pieceCode);
    console.log("[TAP-TO-MOVE] handleGameDrop returned:", res);
    // handleGameDrop returns 'trash' for accepted drops, 'snapback' for invalid
    if (res === 'trash') {
      console.log("[TAP-TO-MOVE] Move succeeded!");
      return true;
    }
    console.log("[TAP-TO-MOVE] Move failed (returned '" + res + "')");
    return false;
  } catch (e) {
    console.warn('attemptMove error', e);
    return false;
  }
}


// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

/**
 * Bot difficulty profiles - Single source of truth for persona configuration
 * Each profile defines engine parameters and hint availability
 * @property {number} skill - UCI engine skill level (0-20, higher is stronger)
 * @property {number} time - Time limit per move in seconds
 * @property {number} hints - Number of hints available (Infinity for unlimited)
 * @property {string} description - User-friendly description of difficulty level
 * 
 * BOT ARCHITECTURE:
 * 1. THE BASE: 'skill' and 'time' set the UCI engine's hard limits (Elo/Depth)
 * 2. THE PERSONA: The 'name' (e.g. 'Grasshopper') is sent to the server
 *    The server uses this name to apply a specific probability curve to move selection
 *    (e.g., favoring blunders vs. best moves)
 */
const BOT_PROFILES = {
  'Grasshopper': { 
    skill: 0, 
    time: 0.1, 
    hints: Infinity, 
    description: 'Beginner - makes obvious mistakes' 
  },
  'Student': { 
    skill: 5, 
    time: 0.5, 
    hints: 3, 
    description: 'Learning - still developing' 
  },
  'Adept': { 
    skill: 10, 
    time: 1.0, 
    hints: 2, 
    description: 'Intermediate - solid play' 
  },
  'Ninja': { 
    skill: 15, 
    time: 2.0, 
    hints: 1, 
    description: 'Advanced - strong tactical awareness' 
  },
  'Sensei': { 
    skill: 20, 
    time: 3.0, 
    hints: 0, 
    description: 'Expert - master level play' 
  }
};

// Backwards compatibility alias
const botProfiles = BOT_PROFILES;

/**
 * Applies a bot difficulty profile to the engine
 * @param {string} name - Name of bot profile (Grasshopper, Student, Adept, Ninja, or Sensei)
 * @returns {Object|null} The bot profile config or null if not found
 */
function applyBotProfile(name) {
  if (!name) return null;
  return BOT_PROFILES[name] || null;
}

/**
 * Centralized local game status helper.
 * Returns: { over: boolean, result: '1-0'|'0-1'|'1/2-1/2'|'*', resultText: string }
 */
function getLocalGameStatus() {
  try {
    const g = AppState.getGame() || game;
    if (!g) return { over: false, result: '*', resultText: '' };
    // Check checkmate first
    if (g.in_checkmate && g.in_checkmate()) {
      const winner = g.turn() === 'w' ? 'Black' : 'White';
      const result = winner === 'White' ? '1-0' : '0-1';
      const resultText = `${winner} wins (checkmate)`;
      return { over: true, result, resultText };
    }
    // Stalemate
    if (g.in_stalemate && g.in_stalemate()) {
      return { over: true, result: '1/2-1/2', resultText: 'Draw (stalemate)' };
    }
    // Threefold repetition
    if (g.in_threefold_repetition && g.in_threefold_repetition()) {
      return { over: true, result: '1/2-1/2', resultText: 'Draw (threefold repetition)' };
    }
    // Insufficient material
    if (g.insufficient_material && g.insufficient_material()) {
      return { over: true, result: '1/2-1/2', resultText: 'Draw (insufficient material)' };
    }
    // Generic draw (50-move rule, etc.)
    if (g.in_draw && g.in_draw()) {
      return { over: true, result: '1/2-1/2', resultText: 'Draw' };
    }
    return { over: false, result: '*', resultText: '' };
  } catch (e) {
    console.warn('getLocalGameStatus failed', e);
    return { over: false, result: '*', resultText: '' };
  }
}



// ============================================================================
// ENGINE CONTROL & UI UPDATES
// ============================================================================

/**
 * Updates the visual state of the engine control buttons
 * @param {boolean} busy - Whether the engine is currently processing
 */
function setEngineBusyState(b) {
  AppState.setEngineBusy(b);
  try {
    // Do NOT disable the play/end button here  - it must remain clickable to end games.
    const persona = document.getElementById('engine-persona'); 
    if (persona) persona.disabled = AppState.getEngineBusy();
    const skill = document.getElementById('engine-skill'); 
    if (skill) skill.disabled = AppState.getEngineBusy();
    const time = document.getElementById('engine-time'); 
    if (time) time.disabled = AppState.getEngineBusy();
  } catch (e) { 
    console.error('Error updating engine controls:', e);
  }
}


// Update player/opponent display elements (kept small and defensive).
function updatePlayersDisplay() {
  try {
    const pnameEl = document.getElementById('player-name');
    const oppEl = document.getElementById('engine-persona');
    const personaIndicator = document.getElementById('persona-indicator');
    const playerLabel = document.getElementById('player-label');
    const opponentLabel = document.getElementById('opponent-label');

    const playerName = (pnameEl && pnameEl.value) ? pnameEl.value : 'Player';
    const personaName = (enginePersonaSelect && enginePersonaSelect.value) ? enginePersonaSelect.value : '';

    if (personaIndicator) personaIndicator.textContent = `Persona: ${personaName || '(none)'}`;
    if (playerLabel) playerLabel.textContent = playerName;
    if (opponentLabel) opponentLabel.textContent = (oppEl && oppEl.value) ? oppEl.value : (playEngine ? 'Engine' : 'Opponent');
  } catch (e) { console.error('Operation failed:', e); }
}

// Simple theme applier (kept defensive). Placed top-level so callers in init can use it.
function applyTheme(name) {
  try {
    if (!name) return;
    const doc = document.documentElement;
    doc.setAttribute('data-theme', name);
    // update an optional theme icon/button for feedback
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) themeIcon.textContent = (name === 'dark') ? 'ðŸŒ™' : 'â˜€ï¸';
  } catch (e) {
    /* ignore theme apply failures */
  }
}

// Centralized engine parameter extraction.
// Returns `{ engine_time, engine_skill, engine_persona }` with sensible fallbacks.
function getEngineParams() {
  try {
    const personaName = (document.getElementById('engine-persona')?.value || '').trim();
    const profile = (personaName && botProfiles[personaName]) ? botProfiles[personaName] : botProfiles['Student'];
    return {
      engine_persona: personaName,
      engine_skill: profile.skill,
      engine_time: profile.time
    };
  } catch (e) {
    console.warn('getEngineParams failed', e);
    return { engine_persona: '', engine_skill: 5, engine_time: 0.5 };
  }
}

// Shared DOM element references (initialized on window load)
let playerSelect = null;
let enginePersonaSelect = null;
// Centralized application state container
const AppState = (function () {
  /**
   * @typedef {Object} AppStateShape
   * @property {any} board
   * @property {any} game
   * @property {'SETUP'|'IN_GAME'|'RESULT'} uiState
   * @property {boolean} moveInFlight
   * @property {object|null} pendingPromotion
   * @property {boolean} gameOver
   * @property {boolean} autoPgnSaved
   * @property {string|null} lastFinalPgn
   * @property {boolean} playEngine
   * @property {boolean} freeBoardMode
   * @property {string|null} savedGameFenBeforeFree
   * @property {number} hintsRemaining
   * @property {string|null} tapSourceSquare
   * @property {boolean} engineBusy
   */

  const state = {
    board: null,
    game: null,
    uiState: 'SETUP',
    moveInFlight: false,
    pendingPromotion: null,
    gameOver: false,
    autoPgnSaved: false,
    lastFinalPgn: null,
    playEngine: false,
    freeBoardMode: false,
    savedGameFenBeforeFree: null,
    hintsRemaining: 0,
    tapSourceSquare: null,
    engineBusy: false
  };

  const subs = {};

  function emit(key, value) {
    (subs[key] || []).forEach(fn => { try { fn(value); } catch (e) { console.warn('subscriber error', e); } });
  }

return {
    // Getters
    getBoard() { return state.board; },
    getGame() { return state.game; },
    getUIState() { return state.uiState; },
    isMoveInFlight() { return !!state.moveInFlight; },
    getPendingPromotion() { return state.pendingPromotion; },
    getSavedGameFenBeforeFree() { return state.savedGameFenBeforeFree; },
    isGameOver() { return !!state.gameOver; },
    getHintsRemaining() { return state.hintsRemaining; },
    getTapSourceSquare() { return state.tapSourceSquare; },
    getFreeBoardMode() { return !!state.freeBoardMode; },
    getPlayEngine() { return !!state.playEngine; },
    getEngineBusy() { return !!state.engineBusy; },

    // Setters (automatically sync with global variables)
    setBoard(b) { state.board = b; board = b; emit('board', b); },
    setGame(g) { state.game = g; game = g; emit('game', g); },
    setUIState(s) { if (['SETUP','IN_GAME','RESULT'].includes(s)) { state.uiState = s; uiState = s; emit('uiState', s); } else { console.warn('Invalid uiState', s); } },
    setMoveInFlight(v) { state.moveInFlight = !!v; moveInFlight = !!v; emit('moveInFlight', state.moveInFlight); },
    setPendingPromotion(o) { state.pendingPromotion = o; pendingPromotion = o; emit('pendingPromotion', o); },
    setGameOver(v) { state.gameOver = !!v; gameOver = !!v; emit('gameOver', state.gameOver); },
    setAutoPgnSaved(v) { state.autoPgnSaved = !!v; autoPgnSaved = !!v; emit('autoPgnSaved', state.autoPgnSaved); },
    setLastFinalPgn(s) { state.lastFinalPgn = s; lastFinalPgn = s; emit('lastFinalPgn', s); },
    setPlayEngine(v) { state.playEngine = !!v; playEngine = !!v; emit('playEngine', state.playEngine); },
    setFreeBoardMode(v) { state.freeBoardMode = !!v; freeBoardMode = !!v; emit('freeBoardMode', state.freeBoardMode); },
    setSavedGameFenBeforeFree(s) { state.savedGameFenBeforeFree = s; savedGameFenBeforeFree = s; emit('savedGameFenBeforeFree', s); },
    setHintsRemaining(n) { state.hintsRemaining = Number(n) || 0; hintsRemaining = Number(n) || 0; emit('hintsRemaining', state.hintsRemaining); },
    setTapSourceSquare(sq) { state.tapSourceSquare = sq; tapSourceSquare = sq; emit('tapSourceSquare', sq); },
    setEngineBusy(b) { state.engineBusy = !!b; engineBusy = !!b; emit('engineBusy', state.engineBusy); },

    // subscribe/unsubscribe helpers
    subscribe(key, fn) { if (!subs[key]) subs[key] = []; subs[key].push(fn); return () => { subs[key] = subs[key].filter(f => f !== fn); }; }
  };
})();


// Backwards-compatible globals that map to AppState. Keep these for gradual refactor.
let board = AppState.getBoard();
let game = AppState.getGame();
let uiState = AppState.getUIState(); // 'SETUP' | 'IN_GAME' | 'RESULT'
let moveInFlight = AppState.isMoveInFlight();
let pendingPromotion = AppState.getPendingPromotion(); // { source, target, fromPiece, prevFen }
let gameOver = AppState.isGameOver();
let autoPgnSaved = false;
let lastFinalPgn = null;
let playEngine = false;
let freeBoardMode = false;
let savedGameFenBeforeFree = AppState.getSavedGameFenBeforeFree ? AppState.getSavedGameFenBeforeFree() : null;
let hintsRemaining = AppState.getHintsRemaining ? AppState.getHintsRemaining() : 0;
let setUIState = (s, opts) => { AppState.setUIState(s); uiState = AppState.getUIState(); };
let tapSourceSquare = null;
let engineBusy = AppState.getEngineBusy();

// ============================================================================
// ARROW DRAWING UTILITIES
// ============================================================================

const _ARROW_NS = 'http://www.w3.org/2000/svg';

function ensureArrowLayer() {
  try {
    const boardWrap = document.getElementById('board-container') || document.getElementById('board')?.parentElement;
    if (!boardWrap) return null;

    // Check if layer already exists
    let svg = boardWrap.querySelector('.arrow-layer');
    if (svg) return svg;

    // Create new SVG layer
    svg = document.createElementNS(_ARROW_NS, 'svg');
    svg.classList.add('arrow-layer');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '1000';

    // Define a simple arrowhead marker
    const defs = document.createElementNS(_ARROW_NS, 'defs');
    const marker = document.createElementNS(_ARROW_NS, 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    const path = document.createElementNS(_ARROW_NS, 'path');
    path.setAttribute('d', 'M0,0 L10,3.5 L0,7 z');
    path.setAttribute('fill', 'currentColor');
    marker.appendChild(path);
    defs.appendChild(marker);
    svg.appendChild(defs);

    // Ensure parent has positioning context
    if (!boardWrap.style.position) boardWrap.style.position = 'relative';
    boardWrap.appendChild(svg);
    return svg;
  } catch (e) {
    console.error('Error creating arrow layer:', e);
    return null;
  }
}

function squareCenter(square) {
  // Try to locate the square element rendered by the board library
  try {
    const sel = document.querySelector('#board .square-' + square);
    const boardWrap = document.getElementById('board-container') || document.getElementById('board')?.parentElement;
    const svg = ensureArrowLayer();
    if (!sel || !svg || !boardWrap) {
      return null;
    }
    const sqRect = sel.getBoundingClientRect();
    const wrapRect = boardWrap.getBoundingClientRect();
    const x = sqRect.left - wrapRect.left + sqRect.width / 2;
    const y = sqRect.top - wrapRect.top + sqRect.height / 2;
    return { x, y };
  } catch (e) { return null; }
}

function clearArrows() {
  // 1. Clear the primary layer (class="arrow-layer")
  const svg = ensureArrowLayer();
  if (svg) {
    const defs = svg.querySelector('defs');
    svg.innerHTML = '';
    // Preserve defs (arrowheads) so we don't have to recreate them
    if (defs) svg.appendChild(defs);
  }

  // 2. Clear/Remove the fallback layer (id="arrow-overlay")
  const overlay = document.getElementById('arrow-overlay');
  if (overlay) {
    // We can safely remove this entire element; it gets recreated if needed
    overlay.remove();
  }
}

function drawArrow(fromSquare, toSquare, opts = {}) {
  try {
    const svg = ensureArrowLayer();
    if (!svg) return null;
    const a = squareCenter(fromSquare);
    const b = squareCenter(toSquare);
    if (!a || !b) return null;
    const line = document.createElementNS(_ARROW_NS, 'line');
    line.setAttribute('x1', String(a.x));
    line.setAttribute('y1', String(a.y));
    line.setAttribute('x2', String(b.x));
    line.setAttribute('y2', String(b.y));
    const color = opts.color || (opts.weak ? '#f39c12' : '#e74c3c');
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', String(opts.width || 6));
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('marker-end', 'url(#arrowhead)');
    line.style.opacity = (opts.opacity !== undefined) ? String(opts.opacity) : '0.95';
    svg.appendChild(line);
    return line;
  } catch (e) {
    console.warn('drawArrow failed', e);
    return null;
  }
}

// Alternate arrow drawer using percent coordinates and simple overlay marker
function drawArrowPercent(source, target, color = '#28a745') {
  // Ensure SVG overlay exists
  let overlay = document.getElementById('arrow-overlay');
  const boardEl = document.getElementById('board');
  if (!overlay && boardEl) {
    overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.id = 'arrow-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '1000';
    // append to board container so coordinates align
    const container = document.getElementById('board-container') || boardEl.parentElement;
    if (container) container.appendChild(overlay);
  }
  if (!overlay) return null;

  // Helper: Calculate center % of a square (assuming standard 8x8 grid)
  const files = 'abcdefgh';
  const ranks = '12345678';
  const getCoords = (sq) => {
    const f = files.indexOf(sq[0]);
    const r = ranks.indexOf(sq[1]);
    if (f < 0 || r < 0) return null;
    // If board is flipped (Black at bottom), invert coordinates
    let isFlipped = false;
    try { if (board && typeof board.orientation === 'function') isFlipped = (board.orientation() === 'black'); } catch (e) { isFlipped = false; }
    const x = (isFlipped ? (7 - f) : f) * 12.5 + 6.25;
    const y = (isFlipped ? r : (7 - r)) * 12.5 + 6.25;
    return { x, y };
  };

  const start = getCoords(source);
  const end = getCoords(target);
  if (!start || !end) return null;

  // Create arrow line
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', start.x + '%');
  line.setAttribute('y1', start.y + '%');
  line.setAttribute('x2', end.x + '%');
  line.setAttribute('y2', end.y + '%');
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '4');
  line.setAttribute('stroke-linecap', 'round');

  // Create marker definition if needed
  let defs = overlay.querySelector('defs');
  if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); overlay.appendChild(defs); }
  const safeId = 'arrowhead-' + color.replace('#','');
  if (!defs.querySelector('#' + safeId)) {
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', safeId);
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('refX', '5');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M0,0 L0,6 L6,3 z');
    path.setAttribute('fill', color);
    marker.appendChild(path);
    defs.appendChild(marker);
  }
  line.setAttribute('marker-end', 'url(#' + safeId + ')');
  line.style.opacity = '0.75';
  overlay.appendChild(line);
  return line;
}

function setStatus(msg) {
  const el = document.getElementById('status');
  const t = new Date().toLocaleTimeString();
  const out = `[${t}] ${msg}`;
  if (el) el.textContent = out;
}

// History management for FENs (server-authoritative positions)
let historyFens = [];
let historyIndex = -1; // points into historyFens
// Parallel history of SAN moves (each entry is an array of SANs added at that push)
let historyMoves = []; // array of arrays, e.g. [["e4","e5"], ["Nf3"]]
// Captured pieces tracked incrementally
let capturedByWhite = []; // black pieces captured (shown in white tray)
let capturedByBlack = []; // white pieces captured (shown in black tray)
// Auto-update trays flag (can be toggled by UI)
// captured trays always update automatically from FEN; manual controls removed

function flashTrays() {
  try {
    const els = document.querySelectorAll('.tray-items');
    els.forEach(el => {
      el.classList.remove('tray-flash');
      // trigger reflow to restart animation
      // eslint-disable-next-line no-unused-expressions
      void el.offsetWidth;
      el.classList.add('tray-flash');
      setTimeout(() => el.classList.remove('tray-flash'), 500);
    });
  } catch (e) { console.error('Operation failed:', e); }

  // Hint button listener (available when DOM ready)
  try {
    const hintBtn = document.getElementById('hint-btn');
    if (hintBtn) {
      hintBtn.addEventListener('click', async () => {
        if (hintsRemaining <= 0) return;
        if (typeof game === 'undefined' || gameOver || !playEngine) return;
        setStatus('Asking Sensei for a hint...');
        try {
          const fen = (game && typeof game.fen === 'function') ? game.fen() : (document.getElementById('fen')?.textContent || '').trim();
          const r = await fetch('/api/analyze', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ fen: fen, time_limit: 0.2 })
          });
          const data = await r.json();
          if (data && data.ok && data.best_move) {
            // 1. Decrement budget (unless infinite)
            if (typeof hintsRemaining !== 'undefined' && hintsRemaining !== Infinity) {
              hintsRemaining--;
            }
            // 2. Draw the arrow
            const uci = data.best_move;
            const source = uci.substring(0, 2);
            const target = uci.substring(2, 4);
            try { clearArrows(); } catch (e) { console.error('Operation failed:', e); }
            try { drawArrow(source, target, '#ffdd00'); } catch (e) { try { drawArrowPercent(source, target, '#ffdd00'); } catch (e) { console.error('Operation failed:', e); } }

            // 3. Update the button text and disabled state
            const label = (hintsRemaining === Infinity) ? '∞' : hintsRemaining;
            hintBtn.textContent = `💡 Hint (${label})`;
            if (hintsRemaining <= 0) {
              hintBtn.disabled = true;
            }

            // Persist updated budget
            try { localStorage.setItem('hintsRemaining', String(hintsRemaining)); } catch (e) { console.error('Operation failed:', e); }

            // 4. Show text feedback
            const hintText = document.getElementById('hint-text'); if (hintText) hintText.textContent = `Sensei suggests: ${uci}`;
            setStatus(`Hint: ${uci}`);
          } else {
            setStatus('Sensei returned no suggestion');
          }
        } catch (e) {
          console.warn('Hint fetch failed', e);
          setStatus('Sensei is silent (Network error)');
        }
      });
    }
  } catch (e) { console.error('Operation failed:', e); }
}

function fenPieceCounts(fen) {
  const boardPart = fen.split(' ')[0];
  const rows = boardPart.split('/');
  const counts = { w: { p:0,r:0,n:0,b:0,q:0,k:0 }, b: { p:0,r:0,n:0,b:0,q:0,k:0 } };
  for (const r of rows) {
    for (const ch of r) {
      if (/[1-8]/.test(ch)) continue;
      const isUpper = ch === ch.toUpperCase();
      const color = isUpper ? 'w' : 'b';
      const t = ch.toLowerCase();
      if (counts[color][t] !== undefined) counts[color][t] += 1;
    }
  }
  return counts;
}

// Recompute captured-piece trays from an absolute FEN snapshot.
// Captured-by-white (pieces shown in white tray) are the black pieces
// missing from the standard starting set; similarly for captured-by-black.
function setCapturedFromFen(fen) {
  try {
    const counts = fenPieceCounts(fen);
    const start = { p: 8, r: 2, n: 2, b: 2, q: 1, k: 1 };
    capturedByWhite = [];
    capturedByBlack = [];

    // Black pieces missing -> captured by white (show in white tray)
    for (const t of ['p','r','n','b','q','k']) {
      const have = (counts.b && counts.b[t]) ? counts.b[t] : 0;
      const missing = Math.max(0, (start[t] || 0) - have);
      for (let i = 0; i < missing; i++) capturedByWhite.push(t);
    }

    // White pieces missing -> captured by black (show in black tray)
    for (const t of ['p','r','n','b','q','k']) {
      const have = (counts.w && counts.w[t]) ? counts.w[t] : 0;
      const missing = Math.max(0, (start[t] || 0) - have);
      for (let i = 0; i < missing; i++) capturedByBlack.push(t);
    }

    renderCapturedTrays();
  } catch (e) {
    console.warn('setCapturedFromFen failed', e);
  }
}

function renderCapturedTrays() {
  const trayW = document.getElementById('tray-white');
  const trayB = document.getElementById('tray-black');

  // Define values just for sorting (so Queen appears before Pawn)
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9 };

  function renderTray(container, pieces, isWhiteTray) {
    if (!container) return;
    container.innerHTML = '';

    // Sort pieces by value (High to Low looks best)
    pieces = (pieces || []).slice();
    pieces.sort((a, b) => (values[b] || 0) - (values[a] || 0));

    const counts = {};
    pieces.forEach(p => { counts[p] = (counts[p] || 0) + 1; });

    // Render in standard order (Q, R, B, N, P)
    const pieceOrder = ['q','r','b','n','p'];

    pieceOrder.forEach(p => {
      if (!counts[p]) return;

      const wrapper = document.createElement('span');
      wrapper.className = 'tray-item';
      wrapper.style.display = 'inline-flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.marginRight = '6px';

      const img = document.createElement('img');
      // If this is White's tray, it holds captured Black pieces
      const colorPrefix = isWhiteTray ? 'b' : 'w';
      img.src = `/static/img/chesspieces/wikipedia/${colorPrefix}${p.toUpperCase()}.png`;
      img.style.height = '28px';

      wrapper.appendChild(img);

      // Add tiny badge if multiple (e.g., 2 Pawns)
      if (counts[p] > 1) {
        const badge = document.createElement('span');
        badge.style.fontSize = '0.75em';
        badge.style.marginLeft = '1px';
        badge.style.color = '#777';
        badge.textContent = `x${counts[p]}`;
        wrapper.appendChild(badge);
      }
      container.appendChild(wrapper);
    });
  }

  // Render the trays (No scoring math needed)
  renderTray(trayW, capturedByWhite, true);
  renderTray(trayB, capturedByBlack, false);
}

function markAutoPgnSaved(filename) {
  try {
    autoPgnSaved = true;
    if (filename) setStatus('Auto-saved PGN: ' + filename);
    else setStatus('Auto-saved PGN');
  } catch (e) { console.error('Operation failed:', e); }
}

// Auto-save helper: send PGN to server for persistent storage
async function autoSaveGameToServer(pgn, result) {
  if (!pgn) return;
  try {
    const userSide = (document.getElementById('player-color')?.value === 'black') ? 'black' : 'white';
    const userName = (function(){ try { return localStorage.getItem('playerName') || 'Player'; } catch (e){ return 'Player'; } })();
    const oppName = (function(){ try { return localStorage.getItem('enginePersona') || 'Opponent'; } catch (e){ return 'Opponent'; } })();

    const r = await fetch('/api/save_pgn', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        pgn_text: pgn,
        result: result,
        user_side: userSide,
        user_name: userName,
        opponent_name: oppName,
        engine: !!playEngine
      })
    });
    const data = await r.json();
    // Auto-save successful but don't display message to user
    // The game is saved silently in the background
  } catch (e) {
    console.warn('Auto-save failed', e);
  }
}


function clearCapturedTrays() {
  capturedByWhite = [];
  capturedByBlack = [];
  renderCapturedTrays();
}

// Rebuild the internal Chess() state from a chessboard.js position object
function rebuildGameFromPosition(posObj) {
  try {
    const b = new Chess();
    b.clear();
    for (const sq of Object.keys(posObj)) {
      const code = posObj[sq]; // like 'wP' or 'bq'
      if (!code || code.length < 2) continue;
      const color = code[0] === 'w' ? 'w' : 'b';
      const p = code[1].toLowerCase();
      b.put({ type: p, color }, sq);
    }
    // replace global game with this position
    game = b;
    // update fen display
    const fenEl = document.getElementById('fen');
    if (fenEl) fenEl.textContent = game.fen();
    // update result indicator
    try { updateResultIndicator(); } catch (e) { console.error('Operation failed:', e); }
    return game.fen();
  } catch (e) {
    console.warn('rebuildGameFromPosition failed', e);
    return null;
  }
}

function findFirstEmptySquare(posObj) {
  const files = ['a','b','c','d','e','f','g','h'];
  const ranks = ['1','2','3','4','5','6','7','8'];
  for (let r=0;r<ranks.length;r++){
    for (let f=0;f<files.length;f++){
      const s = files[f] + ranks[r];
      if (!posObj[s]) return s;
    }
  }
  return null;
}

// Copy a FEN string to the clipboard with a safe fallback
async function copyFenToClipboard(fen) {
  if (!fen) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(fen);
      return true;
    }
  } catch (e) {
    console.warn('clipboard API failed', e);
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = fen;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch (e) {
    console.warn('clipboard fallback failed', e);
    return false;
  }
}



function setFen(fen, pushHistory = false) {
  if (!fen) return;
  // If pushing new history while we're not at the end, truncate future branch
  if (pushHistory && historyIndex < historyFens.length - 1) {
    historyFens = historyFens.slice(0, historyIndex + 1);
    historyMoves = historyMoves.slice(0, historyIndex + 1);
  }

  if (pushHistory) {
    // compute SANs from previous fen to this fen (up to 2 plies)
    const prevFen = historyFens.length ? historyFens[historyIndex] : null;
    const sanList = computeSanSequence(prevFen, fen);

    historyFens.push(fen);
    historyMoves.push(sanList || []);
    historyIndex = historyFens.length - 1;
    // update captured trays based on fen diff
    try { setCapturedFromFen(fen); } catch (e) { console.warn('setCapturedFromFen failed', e); }
  } else if (historyIndex === -1) {
    // initial load fallback
    historyFens.push(fen);
    historyIndex = 0;
  }

  // prefer AppState-stored game/board when available
  const g = AppState.getGame() || game;
  const b = AppState.getBoard() || board;
  try { g.load(fen); } catch (e) { console.warn('setFen: game.load failed', e); }
  try { if (b && typeof b.position === 'function') b.position(fen); } catch (e) { console.warn('setFen: board.position failed', e); }
  // sync compatibility globals
  game = g; board = b; AppState.setGame(g); AppState.setBoard(b);
  try { clearArrows(); } catch (e) { console.error('Operation failed:', e); }
  const fenEl = document.getElementById('fen'); if (fenEl) fenEl.textContent = fen;
  updateResultIndicator();
  // Check if this position is terminal and auto-save if enabled
  try { maybeTriggerAutoSave(); } catch (e) { }
  renderMoveList();
  try {
    // Trigger analysis update for Free Board / Study mode
    try { updateAnalysis(fen); } catch (e) { console.error('Operation failed:', e); }
  } catch (e) { console.error('Operation failed:', e); }
}

function computeSanSequence(prevFen, newFen) {
  // Returns array of SAN strings representing the plies that transform prevFen -> newFen
  if (!prevFen) return null;
  try {
    const temp = new Chess();
    temp.load(prevFen);

    // Try single ply
    const moves1 = temp.moves({ verbose: true });
    for (const m1 of moves1) {
      const t1 = new Chess(); t1.load(prevFen);
      const applied1 = t1.move({ from: m1.from, to: m1.to, promotion: m1.promotion });
      if (!applied1) continue;
      if (t1.fen() === newFen) return [applied1.san];

      // Try second ply
      const moves2 = t1.moves({ verbose: true });
      for (const m2 of moves2) {
        const t2 = new Chess(); t2.load(t1.fen());
        const applied2 = t2.move({ from: m2.from, to: m2.to, promotion: m2.promotion });
        if (!applied2) continue;
        if (t2.fen() === newFen) return [applied1.san, applied2.san];
      }
    }
  } catch (e) {
    console.warn('SAN compute failed', e);
  }
  return null;
}

function renderMoveList() {
  const listEl = document.getElementById('move-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  // Flatten the historyMoves array (since it might contain chunks like ['e4'] or ['e4','e5'])
  let allMoves = [];
  historyMoves.forEach(chunk => {
    if (Array.isArray(chunk)) allMoves.push(...chunk);
  });

  for (let i = 0; i < allMoves.length; i++) {
    const moveNum = Math.floor(i / 2) + 1;
    // Add move number for White's moves
    if (i % 2 === 0) {
      const numSpan = document.createElement('span');
      numSpan.style.color = '#888'; numSpan.style.marginRight = '4px'; numSpan.style.marginLeft = '8px';
      numSpan.textContent = moveNum + '.';
      listEl.appendChild(numSpan);
    }

    // The Move Element
    const moveSpan = document.createElement('span');
    moveSpan.textContent = allMoves[i];
    moveSpan.style.cursor = 'pointer';
    moveSpan.style.padding = '1px 3px';
    moveSpan.style.borderRadius = '3px';
    // Highlight if this is the active move in history
    // historyIndex points to the FEN after this move.
    // Since historyFens has 1 extra item (start pos), historyIndex 1 = after move 1.
    // So move index 'i' corresponds to historyIndex 'i+1'.
    if (i + 1 === historyIndex) {
      moveSpan.style.background = '#28a745'; // Green highlight
      moveSpan.style.color = '#fff';
      moveSpan.id = 'active-move'; // Marker for auto-scroll
    } else {
      moveSpan.style.color = '#ccc';
    }

    // Click to jump to this move
    moveSpan.onclick = () => { try { historyIndex = i + 1; setFen(historyFens[historyIndex], false); } catch (e) { console.error('Operation failed:', e); } };

    listEl.appendChild(moveSpan);
  }

  // Auto-scroll to bottom or active move
  const active = document.getElementById('active-move');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  else listEl.scrollTop = listEl.scrollHeight;
}

// Accordion toggle handlers
document.addEventListener('DOMContentLoaded', () => {
  const toggles = document.querySelectorAll('.accordion-toggle');
  toggles.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      const content = btn.nextElementSibling;
      if (!content) return;
      const open = content.classList.contains('open');
      // close all
      document.querySelectorAll('.accordion-content').forEach(c => c.classList.remove('open'));
      if (!open) content.classList.add('open');
    });
    // Open first accordion by default
    if (idx === 0) btn.click();
  });

  // Arrow key navigation for move history
  window.addEventListener('keydown', (ev) => {
    const active = document.activeElement;
    const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.isContentEditable);
    if (isInput) return; // don't intercept when typing
    if (ev.key === 'ArrowLeft') {
      ev.preventDefault(); goBack();
    } else if (ev.key === 'ArrowRight') {
      ev.preventDefault(); goForward();
    } else if (ev.key === 'Home') {
      ev.preventDefault(); try { if (historyFens && historyFens.length > 0) { historyIndex = 0; setFen(historyFens[0], false); setStatus('Jumped to start'); } } catch (e) { console.error('Operation failed:', e); }
    } else if (ev.key === 'End') {
      ev.preventDefault(); try { if (historyFens && historyFens.length > 0) { historyIndex = historyFens.length - 1; setFen(historyFens[historyIndex], false); setStatus('Jumped to end'); } } catch (e) { console.error('Operation failed:', e); }
    }
  });

  // Sensei Analysis toggle: trigger immediate analysis when enabled
  try {
    const senseiToggle = document.getElementById('sensei-analysis-toggle');
    if (senseiToggle) {
      senseiToggle.addEventListener('change', () => {
        try {
          const checked = !!senseiToggle.checked;
          const scoreEl = document.getElementById('analysis-score');
          const lineEl = document.getElementById('analysis-line');
          if (!checked) {
            if (scoreEl) scoreEl.textContent = '-';
            if (lineEl) lineEl.textContent = '-';
            return;
          }
          const fen = (document.getElementById('fen')?.textContent || '').trim() || (game && game.fen ? game.fen() : null);
          if (fen) updateAnalysis(fen);
        } catch (e) { console.warn('sensei toggle handler failed', e); }
      });
    }
  } catch (e) { console.error('Operation failed:', e); }
});

// --- Auto-sync snapshot at session end -------------------------------------------------
// When the user leaves the page, attempt to tell the server to write a snapshot
// copy of the served `static/main.js` into the repo root as `main.js.txt`.
function _syncMainJsSnapshot() {
  try {
    const url = '/api/sync_main_js';
    // Try lightweight beacon first so it works during unload
    if (navigator && typeof navigator.sendBeacon === 'function') {
      try { navigator.sendBeacon(url); return; } catch (e) { /* fallthrough */ }
    }
    // Fallback to fetch with keepalive where supported
    try {
      fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
    } catch (e) { console.error('Operation failed:', e); }
  } catch (e) { console.error('Operation failed:', e); }
}

// Prefer beforeunload to capture navigations and tab/window close events
window.addEventListener('beforeunload', () => {
  _syncMainJsSnapshot();
});

// Also send a final attempt on pagehide (better for some browsers)
window.addEventListener('pagehide', () => {
  _syncMainJsSnapshot();
});


function updateResultIndicator() {
  const el = document.getElementById('result-indicator');
  if (!el || !game) return;
  // Clear by default
  el.textContent = '';
  el.classList.remove('result-win', 'result-draw');
  try {
    const s = getLocalGameStatus();
    if (!s || !s.over) return;
    // display message and classes consistently
    el.textContent = s.resultText || '';
    el.classList.remove('result-win', 'result-draw');
    if (s.result && (s.result === '1-0' || s.result === '0-1')) {
      el.classList.add('result-win');
    } else {
      el.classList.add('result-draw');
    }
  } catch (e) {
    console.warn('Result indicator check failed', e);
  }
}

// If a terminal result is reached, automatically save PGN once.
async function maybeTriggerAutoSave() {
  if (autoPgnSaved) return;
  if (!game) return;
  try {
    const s = getLocalGameStatus();
    if (!s || !s.over) return;
    const result = s.result || '*';
    const resultText = s.resultText || '';

    // Compose payload using current UI values
    const userSide = (playerSelect && playerSelect.value === 'black') ? 'black' : 'white';
    const userName = 'Player';
    const opponentName = (enginePersonaSelect && enginePersonaSelect.value) ? enginePersonaSelect.value : (playEngine ? 'Engine' : 'Opponent');
    const engineFlag = !!playEngine;

    // Do not auto-generate PGN here; the server is now authoritative and will
    // return a final PGN inside the move/engine responses when the game ends.
    try {
      try { setPlayEngine(false); } catch (e) { console.error('Operation failed:', e); }
      gameOver = true;
      setStatus('Game ended: ' + resultText);
      const el = document.getElementById('result-indicator'); if (el) el.textContent = resultText;
    } catch (e) {
      console.warn('Finalizing game end failed', e);
    }

  } catch (e) {
    console.warn('auto-save check failed', e);
  }
}

function goBack() {
  if (historyIndex > 0) {
    historyIndex -= 1;
    setFen(historyFens[historyIndex], false);
    setStatus(`Rewind: ${historyIndex}`);
  } else {
    setStatus('Already at oldest move');
  }
}

function goForward() {
  if (historyIndex < historyFens.length - 1) {
    historyIndex += 1;
    setFen(historyFens[historyIndex], false);
    setStatus(`Forward: ${historyIndex}`);
  } else {
    setStatus('Already at newest move');
  }
}

function rejectMove(msg) {
  setStatus(msg);

  const fen = (document.getElementById('fen')?.textContent || '').trim() || game.fen();

  try {
    game.load(fen);
    board.position(fen);
    // force the renderer to settle after a drag-drop
    setTimeout(() => board.position(fen), 0);
  } catch (e) {
    console.warn('rejectMove reset failed', e);
  }

  return 'snapback';
}

async function fetchState() {
  const r = await fetch('/api/state');
  return r.json();
}

async function postMove(uci) {
  // If we're in free-board (editor) mode, do not submit moves to the live game/server
  if (freeBoardMode) {
    return Promise.resolve({ ok: false, error: 'free_board_active' });
  }
  // mark move in flight in centralized state
  AppState.setMoveInFlight(true);

  const engine = playEngine || false;
  const { engine_time: engineTime, engine_skill: engineSkill, engine_persona: enginePersona } = getEngineParams();
  
  // Get player info for PGN generation
  const userName = (document.getElementById('player-name')?.value || localStorage.getItem('playerName') || 'Player').trim();
  const userSide = (document.getElementById('player-color')?.value || 'white').trim();
  const opponentName = enginePersona || 'Opponent';
  
  const payload = { 
    uci, 
    engine_reply: engine, 
    engine_time: engineTime, 
    engine_skill: engineSkill, 
    engine_persona: enginePersona,
    user_name: userName,
    user_side: userSide,
    opponent_name: opponentName
  };
  // If this move requests an engine reply, ensure we don't start another engine request
  if (payload.engine_reply) {
    if (engineBusy) {
      AppState.setMoveInFlight(false);
      return Promise.resolve({ ok: false, error: 'engine_busy' });
    }
    setEngineBusyState(true);
    try {
      const r = await fetch('/api/move', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      const j = await r.json();
      AppState.setMoveInFlight(false);
      return j;
    } catch (e) {
      AppState.setMoveInFlight(false);
      throw e;
    } finally {
      setEngineBusyState(false);
    }
  }

  // No engine reply requested  - normal move post
  const r = await fetch('/api/move', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
  try {
    const j = await r.json();
    AppState.setMoveInFlight(false);
    return j;
  } catch (e) {
    AppState.setMoveInFlight(false);
    throw e;
  }
}

async function postReset() {
  const r = await fetch('/api/reset', {method: 'POST'});
  return r.json();
}

async function postEngineMove() {
  // Don't request engine moves while editing positions in free-board mode
  if (freeBoardMode) {
    return null;
  }
  const { engine_time: engineTime, engine_skill: engineSkill, engine_persona: enginePersona } = getEngineParams();
  const payload = { engine_time: engineTime, engine_skill: engineSkill, engine_persona: enginePersona };
  if (engineBusy) {
    return null;
  }
  setEngineBusyState(true);
  try {
    const r = await fetch('/api/engine_move', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    return r.json();
  } catch (e) {
    throw e;
  } finally {
    setEngineBusyState(false);
  }
}

// Study: request analysis for a FEN when Sensei Analysis toggle is active
async function updateAnalysis(fen) {
  if (!fen) return;
  try {
    const toggle = document.getElementById('sensei-analysis-toggle');
    if (!toggle || !toggle.checked) return;

    const outScore = document.getElementById('analysis-score');
    const outLine = document.getElementById('analysis-line');

    const r = await fetch('/api/analyze', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ fen: fen })
    });
    const j = await r.json();
    // Accept direct payload or wrapped {ok:..., payload...}
    const payload = (j && typeof j === 'object' && j.ok === false) ? j : j;

    let score = payload && payload.score !== undefined ? payload.score : (payload && payload.eval ? payload.eval : null);
    let best = payload && payload.best_move !== undefined ? payload.best_move : (payload && payload.best ? payload.best : null);
    let cont = payload && payload.continuation !== undefined ? payload.continuation : (payload && payload.pv ? payload.pv : null);

    function fmtScore(s) {
      if (s === null || s === undefined) return '-';
      if (typeof s === 'string' && s.startsWith('M')) return s; // mate string
      const n = Number(s);
      if (!isNaN(n)) {
        const v = (n / 100.0).toFixed(2);
        return (v[0] !== '-') ? ('+' + v) : v;
      }
      return String(s);
    }

    if (outScore) outScore.textContent = 'Evaluation: ' + fmtScore(score);
    if (outLine) {
      if (cont && Array.isArray(cont) && cont.length > 0) {
        outLine.textContent = cont.join(' ');
      } else if (best) {
        outLine.textContent = best;
      } else {
        outLine.textContent = '-';
      }
    }
  } catch (e) {
    try { if (document.getElementById('analysis-score')) document.getElementById('analysis-score').textContent = '-'; } catch (e) { console.error('Operation failed:', e); }
    try { if (document.getElementById('analysis-line')) document.getElementById('analysis-line').textContent = '-'; } catch (e) { console.error('Operation failed:', e); }
    console.warn('analysis request failed', e);
  }
}

function showPromotionModal(color) {
  return new Promise(resolve => {
    const modal = document.getElementById('promotion-modal');
    const buttons = modal.querySelectorAll('.promo-btn');
    const cancel = modal.querySelector('#promo-cancel');

    // populate images for the current color
    buttons.forEach(b => {
      const piece = b.getAttribute('data-piece');
      const img = b.querySelector('.promo-img');
      if (img) img.src = `/static/img/chesspieces/wikipedia/${color}${piece.toUpperCase()}.png`;
    });

    function cleanup() {
      buttons.forEach(b => b.removeEventListener('click', onChoose));
      cancel.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
      modal.classList.add('hidden');
    }

    function onChoose(e) {
      const p = e.currentTarget.getAttribute('data-piece');
      cleanup();
      resolve(p);
    }
    function onCancel() {
      cleanup();
      resolve(null);
    }
    function onKey(e) {
      const keyMap = { q: 'q', r: 'r', b: 'b', n: 'n' };
      if (e.key === 'Escape') { cleanup(); resolve(null); return; }
      if (keyMap[e.key]) { cleanup(); resolve(keyMap[e.key]); }
    }

    buttons.forEach(b => b.addEventListener('click', onChoose));
    cancel.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);

    modal.classList.remove('hidden');
  });
}

// Handle piece drops while in Free Board edit mode.
async function handleFreeBoardDrop(source, target, piece, newPos, oldPos) {
  try {
    const pos = board.position(); // object mapping
    if (target === 'offboard') {
      // remove piece from source
      delete pos[source];
      board.position(pos);
      const fen = rebuildGameFromPosition(pos);
      await copyFenToClipboard(fen);
      setStatus('Piece removed (free board)  - FEN copied');
      return;
    }
    if (source === target) return; // no-op
    // place the dragged piece onto target square
    pos[target] = piece;
    // if source was from board (not offboard) and moving, clear source
    if (oldPos && oldPos[source]) delete pos[source];
    board.position(pos);
    const fen = rebuildGameFromPosition(pos);
    await copyFenToClipboard(fen);
    setStatus('Piece placed (free board)  - FEN copied');
    try { updateAnalysis(fen); } catch (e) { console.error('Operation failed:', e); }
    return;
  } catch (e) {
    console.warn('Free-board drop failed', e);
    return rejectMove('No move');
  }
}

// Handle piece drops during a live game (legal move checks, promotions, submitUci)
function handleGameDrop(source, target, piece) {
  console.log("[handleGameDrop] Called with source=" + source + ", target=" + target + ", piece=" + piece);
  // Block user moves while an engine request is in flight to avoid UI/server desync
  if (engineBusy && !freeBoardMode) { 
    console.warn("[handleGameDrop] Blocked: engine busy"); 
    setStatus('Engine busy  - try again'); 
    return 'snapback'; 
  }

  if (target === 'offboard') {
    console.log("[handleGameDrop] Target is offboard");
    return rejectMove('No move');
  }

  // Same-square "drop" means user tapped a piece - let the click handler deal with it
  // Don't call handleSquareClick here to avoid double-triggering (click event will also fire)
  if (source === target) {
    console.log("[handleGameDrop] Source equals target, ignoring (click handler will process)");
    return 'snapback';
  }

  // Don't accept moves while server reply pending or promotion chooser open
  if (moveInFlight || pendingPromotion) {
    console.warn("[handleGameDrop] Blocked: moveInFlight=" + moveInFlight + ", pendingPromotion=" + (pendingPromotion ? 'YES' : 'NO'));
    return 'snapback';
  }

  console.log("[handleGameDrop] Checking piece at source square...");
  const moving = game.get(source);
  if (!moving) {
    console.warn("[handleGameDrop] No piece at source square", source);
    return rejectMove('No piece');
  }
  console.log("[handleGameDrop] Piece found:", moving);

  if (String(moving.color).toLowerCase() !== String(game.turn()).toLowerCase()) {
    console.warn("[handleGameDrop] Wrong color to move");
    return rejectMove('Wrong side to move');
  }

  const fromPiece = moving;
  const isPawn = fromPiece && fromPiece.type === 'p';
  const willPromote =
    isPawn &&
    ((fromPiece.color === 'w' && target[1] === '8') ||
     (fromPiece.color === 'b' && target[1] === '1'));

  const prevFen = game.fen();
  console.log("[handleGameDrop] prevFen:", prevFen);

  // HARD legality gate  - no side effects
  console.log("[handleGameDrop] Checking legality...");
  const legal = game.move({ from: source, to: target, promotion: 'q' });
  if (legal === null) {
    console.warn("[handleGameDrop] Illegal move");
    return rejectMove('Illegal move');
  }
  console.log("[handleGameDrop] Move is legal, undoing for now...");
  game.undo();

  // Promotion: open modal, but onDrop MUST return immediately
  if (willPromote) {
    pendingPromotion = { source, target, fromPiece, prevFen };

    showPromotionModal(fromPiece.color).then(promotion => {
      const p = pendingPromotion;
      pendingPromotion = null;

      // Hard guard: ensure the pending promotion state still exists
      if (!p) {
        setStatus('Promotion state lost (ignored)');
        console.warn('Promotion callback fired but pendingPromotion was cleared. Ignoring.');
        return;
      }

      if (!promotion) {
        setStatus('Promotion canceled');
        return;
      }

      // Validate locally with chosen piece
      const attempted = game.move({ from: p.source, to: p.target, promotion });
      if (attempted == null) {
        setStatus('Illegal promotion move');
        return;
      }
      game.undo();

      submitUci(p.source + p.target + promotion, p.prevFen);
    });

    return 'snapback';
  }

  // Normal move: local legality gate
  const attempted = game.move({ from: source, to: target });
  if (attempted == null) return 'snapback';
  // 1. Apply the move locally and SAVE it to history (Intermediate State)
  // (we intentionally do not undo here so the UI reflects the user's ply)
  const intermediateFen = game.fen();
  // Push to history immediately so we have the "User Moved" state
  setFen(intermediateFen, true);
  // 2. Send to server (which will eventually return the Engine's move)
  submitUci(source + target, prevFen);
  // 3. Update status
  setStatus('Move sent: ' + source + target);
  // Accept the drop visually since we've already updated the board
  return 'trash';
}

async function onDrop(source, target, piece, newPos, oldPos, orientation) {
  try { clearArrows(); } catch (e) { console.error('Operation failed:', e); }
  if (freeBoardMode) {
    return handleFreeBoardDrop(source, target, piece, newPos, oldPos);
  }
  return handleGameDrop(source, target, piece);
}

function submitUci(uci, prevFen) {
  moveInFlight = true;
  setStatus('Sending move: ' + uci);

  postMove(uci).then(resp => {
    moveInFlight = false;

    if (resp && resp.error) {
      // Revert: remove the intermediate ply from history if present and restore previous FEN
      try {
        if (historyFens && historyFens.length > 0) {
          // Try to find the last occurrence of prevFen in history; prefer restoring to that index
          const idx = historyFens.lastIndexOf(prevFen);
          if (idx !== -1) {
            historyFens = historyFens.slice(0, idx + 1);
            historyIndex = idx;
          } else {
            // Fallback: drop the last entry
            historyFens.pop();
            historyIndex = historyFens.length - 1;
          }
        }
      } catch (e) { console.error('Operation failed:', e); }
      setFen(prevFen, false);
      setStatus('Move rejected: ' + resp.error);
      return;
    }

    if (resp && resp.fen) {
      setFen(resp.fen, true);

      let msg = 'Move played: ' + uci;
      if (resp.engine_reply) msg += ' | Engine: ' + resp.engine_reply;
      setStatus(msg);

      // If server reports game end, use the canonical PGN returned once
      if (resp.game_over) {
        gameOver = true;
        lastFinalPgn = resp.pgn || null;
        const resultText = resp.reason ? `${resp.reason}  - ${resp.result}` : resp.result || '';
        setStatus('Game ended: ' + resultText);
        // Update result indicator and switch to RESULT UI
        const el = document.getElementById('result-indicator'); if (el) el.textContent = resultText;
        try { setPlayEngine(false); } catch (e) { console.error('Operation failed:', e); }
        setUIState('RESULT', { result: resp.result || '', reason: resp.reason || '', pgn: resp.pgn || '' });
        try { autoSaveGameToServer(resp.pgn, resp.result); } catch (e) { console.error('Operation failed:', e); }
      }
      return;
    }

    // Defensive fallback
    setFen(prevFen, false);
    setStatus('Move error: no FEN returned');
  }).catch((err) => {
    moveInFlight = false;
    // log the full error for debugging
    console.error('submitUci error', err);
    try {
      if (historyFens && historyFens.length > 0) {
        historyFens.pop();
        historyIndex = historyFens.length - 1;
      }
    } catch (e) { console.error('Operation failed:', e); }
    try { setFen(prevFen, false); } catch (e) { try { board.position(prevFen); } catch (e) { console.error('Operation failed:', e); } try { game.load(prevFen); } catch (e) { console.error('Operation failed:', e); } }
    const fenEl = document.getElementById('fen'); if (fenEl) fenEl.textContent = prevFen;
    // Surface the error message to the user when available
    const msg = (err && err.message) ? ('Network error: ' + err.message) : 'Network error (move not sent)';
    setStatus(msg);
  });
}

function onDragStart(source, piece, position, orientation) {
  try { clearArrows(); } catch (e) { console.error('Operation failed:', e); }
  // piece is like "wP", "bQ" in chessboard.js
  const turn = (game && typeof game.turn === 'function') ? String(game.turn()).toLowerCase() : 'w'; // 'w' or 'b'
  const pieceColor = (piece && piece[0]) ? String(piece[0]).toLowerCase() : null; // 'w' or 'b'

  // Allow free editing/drags when freeBoardMode is on (engine off)
  if (freeBoardMode) {
    if (moveInFlight || pendingPromotion) return false;
    return true;
  }

  // Only allow drags when UI is in IN_GAME state
  try {
    if (typeof uiState !== 'undefined' && uiState !== 'IN_GAME') return false;
  } catch (e) { }

  if (moveInFlight || pendingPromotion || gameOver) return false;
  if (!pieceColor) return false;
  if (pieceColor !== turn) return false;

  return true;
}


window.addEventListener('load', async () => {
  if (typeof Chess === 'undefined') {
    console.error('Chess.js not loaded  - `Chess` is undefined');
    return;
  }
  if (typeof Chessboard === 'undefined') {
    console.error('Chessboard.js not loaded  - `Chessboard` is undefined');
    return;
  }

  const init = await fetchState();
  game = new Chess();
  // Load player color preference (controls which side is at the bottom)
  const savedPlayerColor = (localStorage.getItem('playerColor') || 'white');
  playerSelect = document.getElementById('player-color');
  if (playerSelect) playerSelect.value = savedPlayerColor;

  // Captured trays are now statically placed in the sidebar; dynamic anchoring removed.
  try { /* no-op placeholder for static tray placement */ } catch (e) { console.error('Operation failed:', e); }

  // Persona controls
  enginePersonaSelect = document.getElementById('engine-persona');
  try {
    const savedPersona = localStorage.getItem('enginePersona');
    if (enginePersonaSelect && savedPersona) enginePersonaSelect.value = savedPersona;
    if (enginePersonaSelect && savedPersona) {
      enginePersonaSelect.value = savedPersona;
    } else if (enginePersonaSelect) {
      // default persona
      enginePersonaSelect.value = 'Student';
      try { localStorage.setItem('enginePersona', 'Student'); } catch (e) { console.error('Operation failed:', e); }
    }
  } catch (e) { /* ignore localStorage errors */ }
  if (enginePersonaSelect) enginePersonaSelect.addEventListener('change', () => { try { localStorage.setItem('enginePersona', enginePersonaSelect.value); } catch (e) { console.error('Operation failed:', e); } });
  // playersDisplay and updatePlayersDisplay moved to top-level
  // update display when names or side change
  if (enginePersonaSelect) enginePersonaSelect.addEventListener('change', updatePlayersDisplay);
  // initial render of the players mapping
  try { updatePlayersDisplay(); } catch (e) { }

  // Setup pill-style selectors for player color and persona (if present)
  try {
    function setupPillSelector(containerId, inputId, defaultValue, onChange) {
      const container = document.getElementById(containerId);
      const input = document.getElementById(inputId);
      if (!input || !container) return;
      const buttons = Array.from(container.querySelectorAll('[data-value]'));
      // initialize from localStorage or input value
      const saved = localStorage.getItem(inputId) || input.value || defaultValue;
      input.value = saved;
      buttons.forEach(b => {
        const v = b.getAttribute('data-value');
        if (v === input.value) {
          b.style.background = '#222'; b.style.color = '#fff';
        } else { b.style.background = 'transparent'; b.style.color = '#ccc'; }
        b.addEventListener('click', () => {
          try { input.value = v; } catch (e) { console.error('Operation failed:', e); }
          buttons.forEach(x => { if (x === b) { x.style.background = '#222'; x.style.color = '#fff'; } else { x.style.background = 'transparent'; x.style.color = '#ccc'; } });
          try { localStorage.setItem(inputId, v); } catch (e) { console.error('Operation failed:', e); }
          try { input.dispatchEvent(new Event('change')); } catch (e) { console.error('Operation failed:', e); }
          if (typeof onChange === 'function') onChange(v);
        });
      });
    }

    setupPillSelector('player-color-pills', 'player-color', 'white', (v) => { try { setBoardOrientation(v); } catch (e) { console.error('Operation failed:', e); } });
    setupPillSelector('engine-persona-pills', 'engine-persona', 'Student', (v) => { try { applyBotProfile(v); updatePlayersDisplay(); } catch (e) { console.error('Operation failed:', e); } });
  } catch (e) { /* ignore pill wiring errors */ }

  // Load persisted hintsRemaining if present
  try {
    const savedHints = localStorage.getItem('hintsRemaining');
    if (savedHints !== null && typeof savedHints !== 'undefined') {
      hintsRemaining = (savedHints === 'Infinity') ? Infinity : (parseInt(savedHints, 10) || 0);
    }
    const hintBtnInit = document.getElementById('hint-btn');
    if (hintBtnInit) {
      const label = (hintsRemaining === Infinity) ? '∞' : hintsRemaining;
      hintBtnInit.textContent = `💡 Hint (${label})`;
      hintBtnInit.disabled = (hintsRemaining <= 0);
    }
  } catch (e) { /* ignore localStorage or DOM errors */ }

  // Ensure playBtn reference is available for handlers that run earlier
  // Prefer the new main start button; fall back to legacy play-engine-btn if present
  playBtn = document.getElementById('main-start-btn') || document.getElementById('play-engine-btn');

  // Header persona indicator (keeps user informed which persona is active)
  const personaIndicator = document.getElementById('persona-indicator');
  function refreshPersonaIndicator() {
    try {
      const name = enginePersonaSelect ? enginePersonaSelect.value : '';
      if (personaIndicator) personaIndicator.textContent = `Persona: ${name || '(none)'}`;
    } catch (e) { console.error('Operation failed:', e); }
  }
  // initialize and keep in sync
  refreshPersonaIndicator();
  if (enginePersonaSelect) enginePersonaSelect.addEventListener('change', refreshPersonaIndicator);

  board = Chessboard('board', {
    draggable: true,
    position: init.fen,
    orientation: savedPlayerColor,
    onDragStart: onDragStart,
    onDrop: onDrop,
    pieceTheme: '/static/img/chesspieces/wikipedia/{piece}.png',
    dropOffBoard: 'snapback',
    showNotation: true,
    moveSpeed: 'fast',
    snapbackSpeed: 200,
    snapSpeed: 100
  });
  // Initialize mobile tap handlers after board renders
  setTimeout(() => { 
    console.log('[INIT] Attempting to initialize tap-to-move handlers...');
    try { 
      initBoardClickHandlers(); 
      console.log('[INIT] Tap-to-move initialization complete');
    } catch (e) { 
      console.error('[INIT] Failed to initialize tap-to-move:', e); 
    } 
  }, 500); // Increased delay to 500ms
  // Ensure the board uses the container width and resizes when tabs change
  try {
    const resizeBoard = () => { try { if (board && typeof board.resize === 'function') board.resize(); else if (board && typeof board.position === 'function') board.position(board.fen()); } catch(e){} };

    // Tab switching: show/hide tab-cards and mark selected tab
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabCards = document.querySelectorAll('.tab-card');
    function activateTab(name) {
      tabButtons.forEach(b => { const sel = b.getAttribute('data-tab') === name; b.setAttribute('aria-selected', sel ? 'true' : 'false'); });
      tabCards.forEach(c => { c.style.display = (c.getAttribute('data-tab') === name) ? 'block' : 'none'; });
      // call resize to ensure board fits new layout
      setTimeout(resizeBoard, 40);

      // Special handling for Free Board tab: preserve ongoing game FEN and present starting position
      try {
        const freeToggle = document.getElementById('free-board-toggle');
        if (name === 'free') {
          if (!freeBoardMode) {
            try { if (playEngine) setPlayEngine(false); } catch (e) { console.error('Operation failed:', e); }
            // remember current game position if present
            try { savedGameFenBeforeFree = game ? game.fen() : null; } catch (e) { savedGameFenBeforeFree = null; }
            freeBoardMode = true;
            if (freeToggle) freeToggle.checked = true;
            // show standard starting position for editing
            try {
              const startFen = (new Chess()).fen();
              // do not push into history; just set board and game state for editing
              game.load(startFen);
              board.position(startFen);
              const fenEl = document.getElementById('fen'); if (fenEl) fenEl.textContent = startFen;
              setStatus('Free Board: starting position loaded (original game saved)');
            } catch (e) { console.warn('Failed to load start position for free board', e); }
          }
        } else {
          // leaving free board tab: restore saved game if any
          if (freeBoardMode) {
            freeBoardMode = false;
            if (freeToggle) freeToggle.checked = false;
            if (savedGameFenBeforeFree) {
              try {
                setFen(savedGameFenBeforeFree, false);
                setStatus('Restored game position');
              } catch (e) { console.warn('Failed to restore saved game fen', e); }
              savedGameFenBeforeFree = null;
            }
          }
        }
      } catch (e) { console.warn('activateTab free-board handling failed', e); }
    }
    tabButtons.forEach(b => b.addEventListener('click', () => activateTab(b.getAttribute('data-tab'))));
    // initial
    activateTab('game');
  } catch (e) { console.warn('tab init failed', e); }
    // Tools card wiring: open simulator in new tab and open tests folder via API
    // Skip tools and free-board UI in V1 mode
    if (!window.V1_MODE) {
      try {
      const launchBtn = document.getElementById('launch-simulator');
      if (launchBtn) launchBtn.addEventListener('click', ()=> window.open('/test_personas', '_blank'));
      const openTests = document.getElementById('open-tests-folder');
      if (openTests) openTests.addEventListener('click', async ()=>{
        try {
          // attempt to open the tests folder via server route if available
          const r = await fetch('/api/open_pgn_notepad', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({filename: ''})});
          alert('Open folder action triggered (if supported on this OS)');
        } catch (e) { alert('Open folder not supported: '+e); }
      });
      } catch(e) { console.warn('tools wiring failed', e); }
    // Tools panel wiring: persona tuning, engine info, simulator batch
    try {
      async function getJson(url){ const r=await fetch(url); return r.json(); }

      // Persona tuning
      const personaSelect = document.getElementById('persona_select_tune');
      const fields = {
        depth: document.getElementById('tune_depth'),
        multipv: document.getElementById('tune_multipv'),
        temp: document.getElementById('tune_temp'),
        mercy_mate_in: document.getElementById('tune_mercy_mate_in'),
        mercy_mate_keep: document.getElementById('tune_mercy_mate_keep'),
        mercy_gap: document.getElementById('tune_mercy_gap'),
        mercy_keep: document.getElementById('tune_mercy_keep'),
        end_pieces: document.getElementById('tune_endgame_pieces'),
        end_depth: document.getElementById('tune_endgame_depth'),
        end_temp: document.getElementById('tune_endgame_temp')
      };

      async function loadPersona(p){
        try{
          const res = await getJson('/api/persona/' + encodeURIComponent(p));
          if(!res.ok) { console.warn('failed to load persona', res); return; }
          const cfg = res.config || {};
          fields.depth.value = cfg.depth || '';
          fields.multipv.value = cfg.multipv || '';
          fields.temp.value = cfg.pick_temperature || '';
          const mercy = cfg.mercy || {};
          fields.mercy_mate_in.value = mercy.mate_in || '';
          fields.mercy_mate_keep.value = mercy.mate_keep_prob || '';
          fields.mercy_gap.value = mercy.eval_gap_threshold || '';
          fields.mercy_keep.value = mercy.eval_keep_prob || '';
          fields.end_pieces.value = cfg.pieces_threshold || '';
          fields.end_depth.value = cfg.endgame_depth_delta || '';
          fields.end_temp.value = cfg.endgame_temp_delta || '';
        }catch(e){ console.warn('load persona failed', e); }
      }

      if(personaSelect){
        personaSelect.addEventListener('change', ()=> loadPersona(personaSelect.value));
        // initial load
        loadPersona(personaSelect.value);
      }

      document.getElementById('tune_save_btn').addEventListener('click', async ()=>{
        const p = personaSelect.value;
        const payload = { depth: parseInt(fields.depth.value)||null, multipv: parseInt(fields.multipv.value)||null, pick_temperature: parseFloat(fields.temp.value)||null, pieces_threshold: parseInt(fields.end_pieces.value)||null, endgame_depth_delta: parseInt(fields.end_depth.value)||null, endgame_temp_delta: parseFloat(fields.end_temp.value)||null };
        payload.mercy = { mate_in: parseInt(fields.mercy_mate_in.value)||null, mate_keep_prob: parseFloat(fields.mercy_mate_keep.value)||null, eval_gap_threshold: parseInt(fields.mercy_gap.value)||null, eval_keep_prob: parseFloat(fields.mercy_keep.value)||null };
        try{
          const r = await fetch('/api/persona/' + encodeURIComponent(p), {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
          const j = await r.json();
          if(j.ok) alert('Persona saved'); else alert('Save failed: '+(j.error||JSON.stringify(j)));
        }catch(e){ alert('Save request failed: '+e); }
      });

      document.getElementById('tune_reset_btn').addEventListener('click', async ()=>{
        const p = personaSelect.value;
        try{
          const r = await fetch('/api/persona/' + encodeURIComponent(p) + '/reset', {method:'POST'});
          const j = await r.json();
          if(j.ok){ alert('Reset to defaults'); loadPersona(p); } else alert('Reset failed');
        }catch(e){ alert('Reset request failed: '+e); }
      });

      // Engine info
      async function loadEngineInfo(){
        try{
          const j = await getJson('/api/engine_info');
          if(!j.ok) return;
          const e = j.engine || {};
          const el = document.getElementById('engine_info');
          el.textContent = (e.engine_detected ? 'Detected: ' + (e.engine_path || '(on PATH)') : 'Engine not found');
          const t = document.getElementById('engine_default_time'); if(t) t.value = e.default_engine_time || 0.05;
          const m = document.getElementById('engine_multipv_cap'); if(m) m.value = e.multipv_cap || 10;
        }catch(e){ console.warn('engine info load failed', e); }
      }
      loadEngineInfo();

      // Simulator batch run
      document.getElementById('sim_run').addEventListener('click', async ()=>{
        const wp = document.getElementById('sim_white').value;
        const bp = document.getElementById('sim_black').value;
        const count = parseInt(document.getElementById('sim_count').value) || 1;
        const time = parseFloat(document.getElementById('sim_time').value) || 0.05;
        const seed = document.getElementById('sim_seed').value || null;
        const payload = { white_persona: wp, black_persona: bp, count: count, engine_time: time, seed: seed };
        try{
          const r = await fetch('/api/simulate_batch', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
          const j = await r.json();
          if(!j.ok){ alert('Batch failed: '+(j.error||JSON.stringify(j))); return; }
          const sum = document.getElementById('sim_last_summary');
          sum.textContent = `Ran ${j.count} games. Files: ${j.files.join(', ')} CSV: ${j.csv}`;
          const csvLink = document.getElementById('sim_csv_link');
          if(j.csv){ csvLink.href = '/games/tests/' + j.csv; csvLink.textContent = j.csv; csvLink.onclick = null; }
        }catch(e){ alert('Batch request failed: '+e); }
      });

      // Debugging
      document.getElementById('show_last_engine').addEventListener('click', async ()=>{
        try{
          const r = await fetch('/api/open_engine_debug', {method:'GET'});
          const j = await r.json();
          if(j.ok){ document.getElementById('debug_output').textContent = j.output.join('\n'); }
          else alert('Failed to load debug');
        }catch(e){ alert('Debug request failed: '+e); }
      });

    } catch(e) { console.warn('tools panel wiring failed', e); }
  // Create piece palette for free-board editing (injected into board-wrap)
  try {
    const boardWrap = document.querySelector('.board-wrap');
    if (boardWrap) {
      const palette = document.createElement('div');
      palette.id = 'piece-palette';
      palette.style.display = 'flex';
      palette.style.flexWrap = 'wrap';
      palette.style.marginTop = '8px';
      palette.style.gap = '6px';
      const pieces = ['p','r','n','b','q','k'];
      for (const color of ['w','b']) {
        for (const p of pieces) {
          const img = document.createElement('img');
          img.src = `/static/img/chesspieces/wikipedia/${color}${p.toUpperCase()}.png`;
          img.className = 'palette-piece';
          img.style.width = '28px';
          img.style.height = '28px';
          img.style.cursor = 'pointer';
          img.dataset.piece = color + p.toUpperCase();
          img.title = (color==='w'?'White ':'Black ') + p.toUpperCase();
          img.addEventListener('click', async () => {
            // In free-board mode, place directly to first empty square; otherwise select
            if (!freeBoardMode) {
              // toggle selection
              if (selectedPiece === img.dataset.piece) { selectedPiece = null; img.classList.remove('selected'); }
              else { selectedPiece = img.dataset.piece; document.querySelectorAll('.palette-piece').forEach(x=>x.classList.remove('selected')); img.classList.add('selected'); }
              return;
            }
            try {
              const pos = board.position();
              const sq = findFirstEmptySquare(pos);
              if (!sq) { setStatus('No empty square to add piece'); return; }
              pos[sq] = img.dataset.piece;
              board.position(pos);
              const fen = rebuildGameFromPosition(pos);
              await copyFenToClipboard(fen);
              setStatus('Piece added from palette  - FEN copied');
            } catch (e) { console.warn('palette add failed', e); }
          });
          palette.appendChild(img);
        }
      }
      // Prefer placeholder in Free tab if present, otherwise fall back to board wrap
      const placeholder = document.getElementById('piece-palette-placeholder');
      if (placeholder) placeholder.appendChild(palette);
      else boardWrap.appendChild(palette);
    }
  } catch (e) { console.warn('Failed to create piece palette', e); }

  // Board click/dblclick handlers for free-board interactions
  try {
    const boardEl = document.getElementById('board');
    function findSquareFromEvent(ev) {
      let el = ev.target;
      while (el && el !== boardEl) {
        if (el.classList) {
          for (const cls of el.classList) {
            if (cls.startsWith('square-')) return cls.slice(7);
          }
        }
        el = el.parentElement;
      }
      return null;
    }
    if (boardEl) {
      boardEl.addEventListener('click', async (ev) => {
        if (!freeBoardMode) return;
        const sq = findSquareFromEvent(ev);
        if (!sq) return;
        const pos = board.position();
        if (selectedPiece) {
          pos[sq] = selectedPiece;
          board.position(pos);
          const fen = rebuildGameFromPosition(pos);
          // clear selection
          selectedPiece = null;
          document.querySelectorAll('.palette-piece').forEach(x=>x.classList.remove('selected'));
          await copyFenToClipboard(fen);
          setStatus('Piece placed  - FEN copied');
        }
      });

      boardEl.addEventListener('dblclick', async (ev) => {
        if (!freeBoardMode) return;
        const sq = findSquareFromEvent(ev);
        if (!sq) return;
        const pos = board.position();
        if (pos[sq]) {
          delete pos[sq];
          board.position(pos);
          const fen = rebuildGameFromPosition(pos);
          await copyFenToClipboard(fen);
          setStatus('Piece removed (dblclick)  - FEN copied');
        }
      });
    }
  } catch (e) { console.warn('board click handlers failed', e); }

  // Wire up Free Board toggle and Export FEN button
  try {
    const freeToggle = document.getElementById('free-board-toggle');
    const exportBtn = document.getElementById('export-fen-btn');
    const clearBtn = document.getElementById('clear-board-btn');
    const startBtn = document.getElementById('start-from-pos-btn');
    const startSide = document.getElementById('start-to-move');
    if (freeToggle) {
      freeToggle.checked = freeBoardMode;
      freeToggle.addEventListener('change', () => {
        freeBoardMode = !!freeToggle.checked;
        // disable game/engine mode when entering free-board mode
        if (freeBoardMode) {
          try { setPlayEngine(false); } catch (e) { console.error('Operation failed:', e); }
        }
        const pal = document.getElementById('piece-palette');
        if (pal) pal.style.display = freeBoardMode ? 'flex' : 'none';
        const analysis = document.getElementById('analysis-controls');
        if (analysis) analysis.style.display = freeBoardMode ? 'block' : 'none';
        setStatus(freeBoardMode ? 'Free board editing enabled' : 'Free board editing disabled');
        // When leaving free-board mode (i.e., entering game mode), ensure captured trays are visible
        // Also ensure engine controls are disabled while in free-board mode
        try {
          if (freeBoardMode) {
            if (playBtn) playBtn.disabled = true;
          } else {
            if (playBtn) playBtn.disabled = false;
            try { renderCapturedTrays(); } catch (e) { console.error('Operation failed:', e); }
          }
        } catch (e) { console.error('Operation failed:', e); }
      });
    }
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        try {
          const pos = board.position();
          const fen = rebuildGameFromPosition(pos);
          if (fen) {
            const fenEl = document.getElementById('fen');
            if (fenEl) fenEl.textContent = fen;
            // try clipboard API first
            try {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(fen);
                setStatus('FEN exported  - copied to clipboard');
              } else {
                // fallback to textarea copy
                const ta = document.createElement('textarea');
                ta.value = fen;
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(ta);
                setStatus(ok ? 'FEN exported  - copied to clipboard' : 'FEN exported (copy failed)');
              }
            } catch (e) {
              console.warn('clipboard copy failed', e);
              setStatus('FEN exported (copy failed)');
            }
          } else {
            setStatus('Export failed');
          }
        } catch (e) { console.warn('export fen failed', e); setStatus('Export failed'); }
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        if (!freeBoardMode) { setStatus('Enable Free Board to clear board'); return; }
        try {
          const empty = {};
          board.position(empty);
          const fen = rebuildGameFromPosition(empty);
          await copyFenToClipboard(fen);
          setStatus('Board cleared  - FEN copied');
        } catch (e) { console.warn('clear board failed', e); setStatus('Clear failed'); }
      });
    }
    if (startBtn) {
      startBtn.addEventListener('click', async () => {
        if (!freeBoardMode) { setStatus('Enable Free Board to start from position'); return; }
        try {
          // confirm with user before replacing current game
          if (!confirm('Start game from the current free-board position?')) return;
          const pos = board.position();
          // Prefer using the game's FEN if available; otherwise rebuild from board position.
          let fen = null;
          try {
            if (game && typeof game.fen === 'function') fen = game.fen();
          } catch (e) { fen = null; }
          if (!fen) {
            try { fen = rebuildGameFromPosition(pos); } catch (e) { fen = null; }
          }
          // Respect chosen side to move from the UI (override if necessary)
          const toMove = (startSide && startSide.value === 'black') ? 'b' : 'w';
          try {
            if (fen) {
              const parts = fen.split(' ');
              if (parts.length >= 2) {
                parts[1] = toMove;
                fen = parts.join(' ');
              }
            }
          } catch (e) { console.error('Operation failed:', e); }

          // preserve captured-piece counts (do not clear trays)
          // set the FEN locally and record in history
          setFen(fen, true);
          // also tell server to load this FEN so engine/play operate from same position
          try {
            const r = await fetch('/api/set_fen', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({fen}) });
            const j = await r.json();
            if (!j || !j.ok) {
              console.warn('server set_fen failed', j);
              setStatus('Game started locally (server not updated)');
            }
          } catch (e) {
            console.warn('server set_fen request failed', e);
            setStatus('Game started locally (server not updated)');
          }

          // exit free-board editing
          freeBoardMode = false;
          if (freeToggle) { freeToggle.checked = false; }
          const pal = document.getElementById('piece-palette'); if (pal) pal.style.display = 'none';

          // Ensure player is the chosen starting color and persist preference
          if (playerSelect && startSide) {
            const color = (startSide.value === 'black') ? 'black' : 'white';
            try { playerSelect.value = color; localStorage.setItem('playerColor', color); } catch (e) { console.error('Operation failed:', e); }
            try { setBoardOrientation(color); } catch (e) { console.error('Operation failed:', e); }
          }

          // Start engine-enabled play from this position without resetting server position
          try {
            setPlayEngine(true, { keepPosition: true });
          } catch (e) { console.error('Operation failed:', e); }

          setStatus('Game started from custom position');
        } catch (e) {
          console.warn('start from pos failed', e);
          setStatus('Start failed');
        }
      });
    }
    // hide palette by default until free-board mode enabled
    const pal = document.getElementById('piece-palette'); if (pal) pal.style.display = freeBoardMode ? 'flex' : 'none';
    // Tray update controls
    // Manual tray update UI removed; captured trays update automatically when FEN changes
  } catch (e) { console.warn('free-board wireup failed', e); }
}
  // Initialize game and history from server state
  game.load(init.fen);
  setFen(init.fen, true);
  setStatus(`${game.turn() === 'w' ? 'White' : 'Black'} to move`);

  // UI state: 'SETUP' | 'IN_GAME' | 'RESULT'
  uiState = 'SETUP';
  let lastFinalPgn = null;

  setUIState = function(state, info) {
    uiState = state;
    // CRITICAL: Also update AppState so tap-to-move and other features know the game state
    try { AppState.setUIState(state); } catch (e) { console.error('Failed to update AppState:', e); }
    const setup = document.getElementById('setup-panel');
    const ingame = document.getElementById('in-game-panel');
    const result = document.getElementById('result-panel');
    try {
      if (setup) setup.style.display = (state === 'SETUP') ? 'block' : 'none';
      if (ingame) ingame.style.display = (state === 'IN_GAME') ? 'block' : 'none';
      if (result) result.style.display = (state === 'RESULT') ? 'block' : 'none';
    } catch (e) { console.error('Operation failed:', e); }

    // Toggle dimming overlay for game focus mode
    try {
      if (state === 'IN_GAME') {
        document.body.classList.add('game-in-progress');
      } else {
        document.body.classList.remove('game-in-progress');
      }
    } catch (e) { console.error('Operation failed:', e); }

    // Removed flip-on-start control (not used)

    // Disable other setup controls while in game
    try {
      const persona = document.getElementById('engine-persona'); if (persona) persona.disabled = (state !== 'SETUP');
      const pcolor = document.getElementById('player-color'); if (pcolor) pcolor.disabled = (state !== 'SETUP');
      const opp = document.getElementById('engine-persona'); if (opp) opp.disabled = (state !== 'SETUP');
    } catch (e) { console.error('Operation failed:', e); }

    // Update result banner if provided
    if (state === 'RESULT' && info) {
      lastFinalPgn = info.pgn || null;
      const banner = document.getElementById('result-banner');
      const reasonEl = document.getElementById('result-reason');
      if (banner) banner.textContent = info.result || '';
      if (reasonEl) reasonEl.textContent = info.reason || '';
    }
    // Hint button visibility
    try {
      const hintBtn = document.getElementById('hint-btn');
      if (hintBtn) {
        const show = (state === 'IN_GAME');
        hintBtn.style.display = show ? 'inline-flex' : 'none';

        // Update label/disabled state if visible
        if (show && typeof hintsRemaining !== 'undefined') {
          const label = (hintsRemaining === Infinity) ? '∞' : hintsRemaining;
          hintBtn.textContent = `💡 Hint (${label})`;
          hintBtn.disabled = (hintsRemaining <= 0);
        }
      }
    } catch (e) { console.error('Operation failed:', e); }
    try { const hintText = document.getElementById('hint-text'); if (hintText && state !== 'IN_GAME') hintText.textContent = ''; } catch (e) { console.error('Operation failed:', e); }
  }

  // Move history navigation wiring (buttons and keyboard shortcuts were added above).
  try {
    const navStart = document.getElementById('nav-start');
    const navPrev = document.getElementById('nav-prev');
    const navNext = document.getElementById('nav-next');
    const navEnd = document.getElementById('nav-end');

    function jumpToStart() {
      try {
        if (!historyFens || historyFens.length === 0) return;
        historyIndex = 0;
        setFen(historyFens[historyIndex], false);
        setStatus('Jumped to start');
      } catch (e) { console.error('Operation failed:', e); }
    }
    function jumpToEnd() {
      try {
        if (!historyFens || historyFens.length === 0) return;
        historyIndex = historyFens.length - 1;
        setFen(historyFens[historyIndex], false);
        setStatus('Jumped to end');
      } catch (e) { console.error('Operation failed:', e); }
    }

    if (navStart) navStart.addEventListener('click', jumpToStart);
    if (navEnd) navEnd.addEventListener('click', jumpToEnd);
    if (navPrev) navPrev.addEventListener('click', () => { try { goBack(); } catch (e) { console.error('Operation failed:', e); } });
    if (navNext) navNext.addEventListener('click', () => { try { goForward(); } catch (e) { console.error('Operation failed:', e); } });
  } catch (e) { /* ignore wiring failures */ }

  // Wire setup and control buttons
  try {
    const pname = document.getElementById('player-name');
    const opp = document.getElementById('engine-persona');
    const endBtn = document.getElementById('end-game-btn');
    const downloadFinal = document.getElementById('download-final-pgn');
    const newGameBtn = document.getElementById('new-game-btn');

    if (pname) pname.value = localStorage.getItem('playerName') || pname.value || '';

    // Start Game wiring moved to unified `startGame()`; the setup panel Start button was removed.

    if (endBtn) endBtn.addEventListener('click', async () => {
      // Delegate to existing resign flow which will return PGN/result
      await doResign();
    });

    if (downloadFinal) downloadFinal.addEventListener('click', async () => {
      try {
        if (lastFinalPgn) {
          const blob = new Blob([lastFinalPgn], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = 'game.pgn'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        } else {
          setStatus('No PGN available');
        }
      } catch (e) { setStatus('Download failed'); }
    });

    if (newGameBtn) {
      newGameBtn.addEventListener('click', async () => {
        // 1. Force Engine/Game Stop
        try { setPlayEngine(false); } catch (e) { console.error('Operation failed:', e); }
        gameOver = false;
        lastFinalPgn = null;

        // 2. Switch UI back to Lobby (Setup)
        try { setUIState('SETUP'); } catch (e) { console.error('Operation failed:', e); }

        // 3. Reset the Board (Server & Client)
        try {
          setStatus('Resetting board...');
          const r = await postReset();
          if (r && r.fen) {
            historyFens = [];
            historyMoves = [];
            historyIndex = -1;
            setFen(r.fen, true);
            try { renderMoveList(); } catch (e) { console.error('Operation failed:', e); }
            setStatus('Ready for new game');
          } else {
            setStatus('Reset failed (Network)');
          }
        } catch (e) {
          setStatus('Reset failed (Network)');
          console.error(e);
        }
      });
    }
  } catch (e) { /* ignore wiring errors */ }

  // start in SETUP
  setUIState('SETUP');

  // Hint button wiring: request analysis and draw arrow for best move
  try {
    const hintBtn = document.getElementById('hint-btn');
    const hintText = document.getElementById('hint-text');
    if (hintBtn) {
      hintBtn.addEventListener('click', async () => {
        // 1. Safety check: Don't allow click if out of hints
        if (typeof hintsRemaining !== 'undefined' && hintsRemaining !== Infinity && hintsRemaining <= 0) {
          return;
        }
        try {
          hintBtn.disabled = true;
          if (hintText) hintText.textContent = 'Thinking...';

          const fen = (document.getElementById('fen')?.textContent || '').trim() || (game && game.fen ? game.fen() : null);
          if (!fen) return;

          // Request the hint
          const r = await fetch('/api/analyze', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ fen: fen, time_limit: 0.5 })
          });
          const j = await r.json();
          if (j && j.ok !== false && j.best_move) {
            // 2. SUCCESS: Decrement the budget
            if (typeof hintsRemaining !== 'undefined' && hintsRemaining !== Infinity) {
              hintsRemaining--;
              try { localStorage.setItem('hintsRemaining', String(hintsRemaining)); } catch (e) { console.error('Operation failed:', e); }
            }

            // 3. Update the Button Label
            const label = (hintsRemaining === Infinity) ? '∞' : hintsRemaining;
            hintBtn.textContent = `💡 Hint (${label})`;

            // 4. Draw Arrow
            try { clearArrows(); } catch (e) { console.error('Operation failed:', e); }
            const uci = j.best_move;
            const from = uci.slice(0,2), to = uci.slice(2,4);
            try { drawArrowPercent(from, to, '#ffdd00'); } catch (e) { console.error('Operation failed:', e); }

            // 5. Update Text
            if (hintText) hintText.textContent = `Sensei suggests: ${uci}`;
            setStatus(`Hint used: ${uci}`);
          } else {
            if (hintText) hintText.textContent = 'No suggestion found';
          }
        } catch (e) {
          console.warn('Hint request failed', e);
          if (document.getElementById('hint-text')) document.getElementById('hint-text').textContent = 'Error';
        } finally {
          // 6. Re-enable button ONLY if they have hints left
          if (typeof hintsRemaining !== 'undefined' && hintsRemaining > 0) {
            hintBtn.disabled = false;
          } else if (hintsRemaining === Infinity) {
            hintBtn.disabled = false;
          } else {
            hintBtn.disabled = true; // Stay disabled if 0
          }
        }
      });
    }
    // Update hint visibility when persona changes
    try { if (enginePersonaSelect) enginePersonaSelect.addEventListener('change', () => { try { setUIState(uiState); } catch (e) { console.error('Operation failed:', e); } }); } catch (e) { console.error('Operation failed:', e); }
  } catch (e) { console.error('Operation failed:', e); }

  // Wire up player color selector to persist and apply orientation
  if (playerSelect) {
    playerSelect.addEventListener('change', () => {
      const v = playerSelect.value === 'black' ? 'black' : 'white';
      try { localStorage.setItem('playerColor', v); } catch (e) { console.error('Operation failed:', e); }
      try { setBoardOrientation(v); } catch (e) { console.warn('Failed to set board orientation', e); }
      try { if (typeof updatePlayersDisplay === 'function') updatePlayersDisplay(); } catch (e) { console.error('Operation failed:', e); }
    });
  }

  // Reset button handler
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      // If in free-board mode, a Reset should restore the standard starting position
      if (freeBoardMode) {
        try {
          const startFen = (new Chess()).fen();
          game.load(startFen);
          board.position(startFen);
          const fen = startFen;
          await copyFenToClipboard(fen);
          setStatus('Free board reset to starting position  - FEN copied');
        } catch (e) {
          console.warn('free reset failed', e);
          setStatus('Free board reset failed');
        }
        return;
      }

      const resp = await postReset();
      if (resp && resp.fen) {
        // Reset history and load server position
        historyFens = [];
        historyMoves = [];
        historyIndex = -1;
        setFen(resp.fen, true);
        try { renderMoveList(); } catch (e) { console.error('Operation failed:', e); }
        // clear captured pieces on reset
        try { clearCapturedTrays(); } catch (e) { console.error('Operation failed:', e); }
        // clearing any game-over state
        gameOver = false;
        autoPgnSaved = false;
        setStatus('Position reset');
        // If play mode active and player is black, ask engine to play White's first move
        if (playEngine && playerSelect && playerSelect.value === 'black') {
          try {
            const r2 = await postEngineMove();
            if (r2 && r2.fen) {
              historyFens = [];
              historyMoves = [];
              historyIndex = -1;
              setFen(r2.fen, true);
              try { renderMoveList(); } catch (e) { console.error('Operation failed:', e); }
              // If server reports game end, finalize locally as well
              if (r2.game_over) {
                gameOver = true;
                lastFinalPgn = r2.pgn || null;
                try { setPlayEngine(false); } catch (e) { console.error('Operation failed:', e); }
                const resultText = r2.reason ? `${r2.reason}  - ${r2.result}` : (r2.result || '');
                setStatus('Game ended: ' + resultText);
                const el = document.getElementById('result-indicator'); if (el) el.textContent = resultText;
                setUIState('RESULT', { result: r2.result || '', reason: r2.reason || '', pgn: r2.pgn || '' });
                try { autoSaveGameToServer(r2.pgn, r2.result); } catch (e) { console.error('Operation failed:', e); }
              } else {
                setStatus('Engine played first move');
              }
            } else {
              setStatus('Engine move failed');
            }
          } catch (e) {
            setStatus('Network error: engine move failed');
          }
        }
      } else {
        setStatus('Reset failed');
      }
    });
  }

  // Game-tab reset button (server reset)
  const gameResetBtn = document.getElementById('game-reset-btn');
  if (gameResetBtn) {
    gameResetBtn.addEventListener('click', async () => {
      // Ensure free-board is not active
      if (freeBoardMode) {
        // Exit free-board and restore saved game or starting position before resetting
        freeBoardMode = false;
        const pal = document.getElementById('piece-palette'); if (pal) pal.style.display = 'none';
        if (savedGameFenBeforeFree) {
          try { setFen(savedGameFenBeforeFree, false); } catch (e) { }
          savedGameFenBeforeFree = null;
        }
      }
      const resp = await postReset();
      if (resp && resp.fen) {
        historyFens = [];
        historyIndex = -1;
        setFen(resp.fen, true);
        try { clearCapturedTrays(); } catch (e) { console.error('Operation failed:', e); }
        gameOver = false; autoPgnSaved = false;
        setStatus('Position reset');
      } else {
        setStatus('Reset failed');
      }
    });
  }

  // End-game logic: extracted to `doResign()` and invoked by the play button when acting as End Game
  async function doResign() {
    const ok = confirm('Are you sure you want to end this game?');
    if (!ok) return;
    // Determine which side the human is playing from UI
    const playerSide = (playerSelect && playerSelect.value === 'black') ? 'black' : 'white';
    // Capture engine state before stopping play
    const engineFlag = !!playEngine;
      const opponentName = (enginePersonaSelect && enginePersonaSelect.value) ? enginePersonaSelect.value : (engineFlag ? 'Engine' : 'Opponent');
    try {
      try { setPlayEngine(false); } catch (e) { /* ignore if not initialized yet */ }

      // include player name and opponent preset from UI when available
      const playerNameEl = document.getElementById('player-name');
      const opponentEl = document.getElementById('engine-persona');
      const payload = { resigned_side: playerSide, user_side: playerSide, user_name: (playerNameEl && playerNameEl.value) ? playerNameEl.value : 'Player', opponent_name: (opponentEl && opponentEl.value) ? opponentEl.value : opponentName, engine: engineFlag };
      const r = await fetch('/api/resign', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      // Mark game over and show end result due to resignation; keep the final board position as-is
      gameOver = true;
      if (data && data.pgn_file) markAutoPgnSaved(data.pgn_file);
      else autoPgnSaved = false;
      const resText = data && data.winner ? `${data.winner} wins (resignation)` : 'Game ended (resignation)';
      setStatus(resText + (data && data.pgn_file ? ` | saved: ${data.pgn_file}` : ''));
      const el = document.getElementById('result-indicator'); if (el) el.textContent = resText;
      // switch to RESULT UI and expose PGN
      setUIState('RESULT', { result: data && data.result ? data.result : '', reason: data && data.reason ? data.reason : 'resign', pgn: data && data.pgn ? data.pgn : '' });
      try { if (data && data.pgn) autoSaveGameToServer(data.pgn, data.result); } catch (e) { console.error('Operation failed:', e); }
      // Do NOT modify board FEN or clear history here; user may inspect final position or use Reset button.
    } catch (e) {
      setStatus('Network error: end-game failed');
    }
  }

  // Save PGN button removed: server now auto-saves PGNs. The Result panel
  // still exposes a manual `download-final-pgn` button for personal downloads.

  // Clear captured trays on reset/load
  try { clearCapturedTrays(); } catch (e) { console.error('Operation failed:', e); }

  // Move list is a permanent element under the right-side accordion (#move-list)

  // Keyboard navigation for history (left/right arrows)
  // (Listener already registered on DOMContentLoaded; do not register again)

  // Theme helpers moved to top-level: applyTheme()

  // getLocalGameStatus() moved to top-level for accessibility during game moves

  function initThemeFromPreference() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') {
      applyTheme(saved);
      return;
    }
    // Default to dark mode when no explicit preference is stored
    try { applyTheme('dark'); } catch (e) { console.error('Operation failed:', e); }
  }

  // --- Theme Toggle Logic ---
  const themeToggle = document.getElementById('theme-toggle');
  function updateThemeBtnText(currentTheme) { if (themeToggle) { // If current is dark, button should offer Light Mode, and vice versa
    themeToggle.textContent = (currentTheme === 'dark') ? 'Light Mode' : 'Dark Mode'; } }

  if (themeToggle) { themeToggle.addEventListener('click', () => { const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; const next = current === 'dark' ? 'light' : 'dark'; applyTheme(next); updateThemeBtnText(next); try { localStorage.setItem('theme', next); } catch (e) { console.error('Operation failed:', e); } }); }

  // Initialize theme on load (default to dark unless user preference exists)
  try { initThemeFromPreference(); } catch (e) { console.error('Operation failed:', e); }
  const startTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  updateThemeBtnText(startTheme);

  // Engine control sliders: wire up display and defaults
  const timeSlider = document.getElementById('engine-time');
  const timeVal = document.getElementById('engine-time-val');
  const skillSlider = document.getElementById('engine-skill');
  const skillVal = document.getElementById('engine-skill-val');
  // Load persisted engine settings if available
  try {
    const savedTime = localStorage.getItem('engineTime');
    const savedSkill = localStorage.getItem('engineSkill');
    if (timeSlider && typeof savedTime === 'string') timeSlider.value = savedTime;
    if (skillSlider && typeof savedSkill === 'string') skillSlider.value = savedSkill;
  } catch (e) {
    // ignore localStorage errors
  }

  if (timeSlider && timeVal) {
    timeVal.textContent = timeSlider.value;
    timeSlider.addEventListener('input', () => {
      timeVal.textContent = timeSlider.value;
      try { localStorage.setItem('engineTime', timeSlider.value); } catch (e) { console.error('Operation failed:', e); }
    });
  }
  if (skillSlider && skillVal) {
    skillVal.textContent = skillSlider.value;
    skillSlider.addEventListener('input', () => {
      skillVal.textContent = skillSlider.value;
      try { localStorage.setItem('engineSkill', skillSlider.value); } catch (e) { console.error('Operation failed:', e); }
    });
  }

  // Bot/profile helpers moved to top-level: botProfiles and applyBotProfile()

  // Persona select drives bot profile; opponent-name remains for display only
  if (enginePersonaSelect) {
    enginePersonaSelect.addEventListener('change', () => {
      applyBotProfile(enginePersonaSelect.value);
    });
    // apply profile once on load so controls reflect default persona when idle
    try { applyBotProfile(enginePersonaSelect ? enginePersonaSelect.value : null); } catch (e) { }
  }

  // Game start/stop (replaces old engine toggle). Track active game state in `playEngine`.
  // playback flag (game active)
  // Ensure playBtn references the main start button or the legacy button
  playBtn = playBtn || document.getElementById('main-start-btn') || document.getElementById('play-engine-btn');
  function setPlayEngine(on, opts = {}) {
    playEngine = !!on;
    // when a game is active, persona cannot be changed
    if (enginePersonaSelect) enginePersonaSelect.disabled = playEngine;
    if (playBtn) {
      playBtn.textContent = playEngine ? 'End Game' : 'Start Game';
      try {
        playBtn.classList.remove('play-start','play-resign');
        playBtn.classList.add(playEngine ? 'play-resign' : 'play-start');
      } catch (e) { console.error('Operation failed:', e); }
    }
    setStatus(playEngine ? 'Game started' : 'Game stopped');

    // If turning on play mode, reset the board to start a fresh game
    if (playEngine) {
      if (opts && opts.keepPosition) {
        // Start play mode from the existing server position (do not reset)
        try { renderCapturedTrays(); } catch (e) { console.error('Operation failed:', e); }
        if (playerSelect && playerSelect.value === 'black') {
          postEngineMove().then(r2 => {
              if (r2 && r2.fen) {
                historyFens = [];
                historyMoves = [];
                historyIndex = -1;
                setFen(r2.fen, true);
                try { renderMoveList(); } catch (e) { console.error('Operation failed:', e); }
                try { renderCapturedTrays(); } catch (e) { }
              if (r2.game_over) {
                gameOver = true;
                lastFinalPgn = r2.pgn || null;
                try { setPlayEngine(false); } catch (e) { console.error('Operation failed:', e); }
                const resultText = r2.reason ? `${r2.reason}  - ${r2.result}` : (r2.result || '');
                setStatus('Game ended: ' + resultText);
                const el = document.getElementById('result-indicator'); if (el) el.textContent = resultText;
                setUIState('RESULT', { result: r2.result || '', reason: r2.reason || '', pgn: r2.pgn || '' });
              } else {
                setStatus('Engine played first move  - Game started');
              }
            } else {
              setStatus('Engine failed to play first move');
            }
          }).catch(() => { setStatus('Engine failed to play first move'); });
        }
      } else {
        postReset().then(resp => {
          if (resp && resp.fen) {
            // reset local history and load server position
            historyFens = [];
            historyIndex = -1;
            setFen(resp.fen, true);
            setStatus('Position reset  - Game started');
            try { renderCapturedTrays(); } catch (e) { }
            // If player sits Black, have engine (White) play the first move
            if (playerSelect && playerSelect.value === 'black') {
              postEngineMove().then(r2 => {
                if (r2 && r2.fen) {
                  historyFens = [];
                  historyIndex = -1;
                  setFen(r2.fen, true);
                  try { renderCapturedTrays(); } catch (e) { }
                  if (r2.game_over) {
                      gameOver = true;
                      lastFinalPgn = r2.pgn || null;
                      try { setPlayEngine(false); } catch (e) { console.error('Operation failed:', e); }
                      const resultText = r2.reason ? `${r2.reason}  - ${r2.result}` : (r2.result || '');
                      setStatus('Game ended: ' + resultText);
                      const el = document.getElementById('result-indicator'); if (el) el.textContent = resultText;
                      setUIState('RESULT', { result: r2.result || '', reason: r2.reason || '', pgn: r2.pgn || '' });
                      try { autoSaveGameToServer(r2.pgn, r2.result); } catch (e) { console.error('Operation failed:', e); }
                  } else {
                    setStatus('Engine played first move  - Game started');
                  }
                } else {
                  setStatus('Engine failed to play first move');
                }
              }).catch(() => {
                setStatus('Engine failed to play first move');
              });
            }
          }
        }).catch(() => { setStatus('Failed to reset before starting game'); });
      }
    } else {
      // game stopped
      try { renderCapturedTrays(); } catch (e) { console.error('Operation failed:', e); }
      try { if (document.getElementById('hint-btn')) document.getElementById('hint-btn').style.display = 'none'; } catch (e) { console.error('Operation failed:', e); }
    }
  }

  // Centralized board orientation helper  - single source of truth
  function setBoardOrientation(arg) {
    try {
      if (!board || typeof board.orientation !== 'function') return;
      if (typeof arg === 'string') {
        board.orientation(arg);
      } else if (typeof arg === 'boolean') {
        // boolean true means apply player's chosen color as orientation
        const v = (playerSelect && playerSelect.value) ? playerSelect.value : 'white';
        board.orientation(v);
      } else {
        // fallback: apply player's chosen color
        const v = (playerSelect && playerSelect.value) ? playerSelect.value : 'white';
        board.orientation(v);
      }
    } catch (e) { console.warn('setBoardOrientation failed', e); }
  }

  // Unified startGame using the Lobby inputs
  async function startGame() {
    // 1. Gather settings from the Setup Panel
    const nameInput = document.getElementById('player-name');
    const colorInput = document.getElementById('player-color');
    const personaInput = document.getElementById('engine-persona');

    const playerName = nameInput ? nameInput.value : 'Guest';
    const playerColor = colorInput ? colorInput.value : 'white';
    const personaVal = personaInput ? personaInput.value : 'Student';

    // 2. Persist preferences
    try {
      if (nameInput) localStorage.setItem('playerName', playerName);
      if (colorInput) localStorage.setItem('playerColor', playerColor);
      if (personaInput) localStorage.setItem('enginePersona', personaVal);
    } catch (e) { console.error('Operation failed:', e); }

    // 3. Reset the Hint Budget (Rules)
    try {
      const pLower = personaVal.toLowerCase();
      if (pLower === 'grasshopper') hintsRemaining = Infinity;
      else if (pLower === 'student') hintsRemaining = 3;
      else if (pLower === 'adept') hintsRemaining = 2;
      else if (pLower === 'ninja') hintsRemaining = 1;
      else hintsRemaining = 0;
    } catch (e) { hintsRemaining = 0; }

    // 4. Update Board Orientation
    try { if (board && typeof board.orientation === 'function') { board.orientation(playerColor); } } catch (e) { console.error('Operation failed:', e); }

    // 5. Apply Bot Profile (Skill/Time)
    try { applyBotProfile(personaVal); } catch (e) { console.error('Operation failed:', e); }

    // 6. Switch UI to GAME Mode
    try { setUIState('IN_GAME'); } catch (e) { console.error('Operation failed:', e); }

    // 7. Start the Engine/Server Game
    try { setPlayEngine(true); } catch (e) { console.error('Operation failed:', e); }

    // 8. Update Displays
    try { updatePlayersDisplay(); } catch (e) { console.error('Operation failed:', e); }
    try {
      const hintBtn = document.getElementById('hint-btn');
      if (hintBtn) {
        const label = (hintsRemaining === Infinity) ? '∞' : hintsRemaining;
        hintBtn.textContent = `💡 Hint (${label})`;
        hintBtn.disabled = (hintsRemaining <= 0);
        hintBtn.style.display = 'inline-flex';
      }
    } catch (e) { console.error('Operation failed:', e); }
  }

    if (playBtn) {
    // ensure button is enabled and wired
    try { playBtn.disabled = false; } catch (e) { console.error('Operation failed:', e); }
    playBtn.addEventListener('click', async (ev) => {
      try {
        if (!playEngine) {
          // start the game via unified entrypoint
          await startGame();
        } else {
          // act as End Game when pressed during an active game
          await doResign();
        }
      } catch (e) { console.error('playBtn handler threw', e); }
    });
      // ensure initial class matches state on load
      try { playBtn.classList.remove('play-start','play-resign'); playBtn.classList.add(playEngine ? 'play-resign' : 'play-start'); } catch (e) { console.error('Operation failed:', e); }
  }
});