let board = null;
let game = null;
let moveInFlight = false;
let pendingPromotion = null; // { source, target, fromPiece, prevFen }
let gameOver = false;
let autoPgnSaved = false;
// `playEngine` tracks whether a game (engine play) is active
let playEngine = false;
let freeBoardMode = false;
let selectedPiece = null; // like 'wK' or 'bq'
// saved game FEN when entering Free Board tab so we can restore later
let savedGameFenBeforeFree = null;

// Debug/version stamp to detect wrong/old files being loaded in the browser
console.log('main.js loaded: v1.2 - turn lock + promo modal + dark mode');

function setStatus(msg) {
  const el = document.getElementById('status');
  const t = new Date().toLocaleTimeString();
  const out = `[${t}] ${msg}`;
  if (el) el.textContent = out;
  console.log('STATUS:', out);
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
  } catch (e) { /* ignore */ }
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
  if (trayW) trayW.innerHTML = '';
  if (trayB) trayB.innerHTML = '';
  // Show fixed piece trays (5 pieces each color: P,R,N,B,Q). Click to add in free-board mode.
  const pieceOrder = ['p','r','n','b','q'];

  // Compute counts from captured arrays (capturedByWhite shows black pieces captured by white)
  const countsW = { p:0, r:0, n:0, b:0, q:0 };
  const countsB = { p:0, r:0, n:0, b:0, q:0 };
  for (const t of capturedByWhite) if (countsW[t] !== undefined) countsW[t]++;
  for (const t of capturedByBlack) if (countsB[t] !== undefined) countsB[t]++;

  if (trayW) {
    for (const p of pieceOrder) {
      const wrapper = document.createElement('span');
      wrapper.className = 'tray-item';
      wrapper.style.display = 'inline-flex';
      wrapper.style.alignItems = 'center';
      const img = document.createElement('img');
      // tray-white shows black pieces captured by White, so use black piece images
      img.src = `/static/img/chesspieces/wikipedia/b${p.toUpperCase()}.png`;
      img.className = 'captured-piece';
      img.style.cursor = 'pointer';
      img.addEventListener('click', async () => {
        if (!freeBoardMode) return;
        try {
          const pos = board.position();
          const sq = findFirstEmptySquare(pos);
          if (!sq) { setStatus('No empty square to add piece'); return; }
          // add a black piece (captured piece shown in white tray is black)
          pos[sq] = 'b' + p.toUpperCase();
          board.position(pos);
          const fen = rebuildGameFromPosition(pos);
          await copyFenToClipboard(fen);
          setStatus('Piece added from tray — FEN copied');
        } catch (e) { console.warn('tray add failed', e); }
      });
      wrapper.appendChild(img);
      const cnt = countsW[p] || 0;
      if (cnt > 0) {
        const badge = document.createElement('span');
        badge.className = 'tray-badge';
        badge.textContent = String(cnt);
        wrapper.appendChild(badge);
      }
      trayW.appendChild(wrapper);
    }
  }

  if (trayB) {
    for (const p of pieceOrder) {
      const wrapper = document.createElement('span');
      wrapper.className = 'tray-item';
      wrapper.style.display = 'inline-flex';
      wrapper.style.alignItems = 'center';
      const img = document.createElement('img');
      // tray-black shows white pieces captured by Black, so use white piece images
      img.src = `/static/img/chesspieces/wikipedia/w${p.toUpperCase()}.png`;
      img.className = 'captured-piece';
      img.style.cursor = 'pointer';
      img.addEventListener('click', async () => {
        if (!freeBoardMode) return;
        try {
          const pos = board.position();
          const sq = findFirstEmptySquare(pos);
          if (!sq) { setStatus('No empty square to add piece'); return; }
          // add a white piece (captured piece shown in black tray is white)
          pos[sq] = 'w' + p.toUpperCase();
          board.position(pos);
          const fen = rebuildGameFromPosition(pos);
          await copyFenToClipboard(fen);
          setStatus('Piece added from tray — FEN copied');
        } catch (e) { console.warn('tray add failed', e); }
      });
      wrapper.appendChild(img);
      const cnt = countsB[p] || 0;
      if (cnt > 0) {
        const badge = document.createElement('span');
        badge.className = 'tray-badge';
        badge.textContent = String(cnt);
        wrapper.appendChild(badge);
      }
      trayB.appendChild(wrapper);
    }
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
    try { updateResultIndicator(); } catch (e) {}
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

function updateCapturedFromFens(prevFen, newFen) {
  if (!prevFen || !newFen) return;
  const prev = fenPieceCounts(prevFen);
  const now = fenPieceCounts(newFen);
  const types = ['p','r','n','b','q','k'];
  for (const t of types) {
    const decW = (prev.w[t]||0) - (now.w[t]||0);
    if (decW > 0) {
      for (let i=0;i<decW;i++) capturedByBlack.push(t);
    }
    const decB = (prev.b[t]||0) - (now.b[t]||0);
    if (decB > 0) {
      for (let i=0;i<decB;i++) capturedByWhite.push(t);
    }
  }
  renderCapturedTrays();
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

  game.load(fen);
  board.position(fen);
  document.getElementById('fen').textContent = fen;
  updateResultIndicator();
  // Check if this position is terminal and auto-save if enabled
  try { maybeTriggerAutoSave(); } catch (e) { }
  renderMoveList();
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
  // move list UI removed — no-op
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
    }
  });
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
    } catch (e) { /* ignore */ }
  } catch (e) { /* ignore */ }
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
    // If checkmate, the side NOT to move is the winner
    if (game.in_checkmate && game.in_checkmate()) {
      const winner = game.turn() === 'w' ? 'Black' : 'White';
      el.textContent = `${winner} wins (checkmate)`;
      el.classList.remove('result-win', 'result-draw');
      el.classList.add('result-win');
      return;
    }

    // Draw conditions
    if (game.in_stalemate && game.in_stalemate()) {
      el.textContent = 'Draw (stalemate)';
      el.classList.remove('result-win', 'result-draw');
      el.classList.add('result-draw');
      return;
    }
    if (game.in_threefold_repetition && game.in_threefold_repetition()) {
      el.textContent = 'Draw (threefold repetition)';
      el.classList.remove('result-win', 'result-draw');
      el.classList.add('result-draw');
      return;
    }
    if (game.insufficient_material && game.insufficient_material()) {
      el.textContent = 'Draw (insufficient material)';
      el.classList.remove('result-win', 'result-draw');
      el.classList.add('result-draw');
      return;
    }
    if (game.in_draw && game.in_draw()) {
      el.textContent = 'Draw';
      el.classList.remove('result-win', 'result-draw');
      el.classList.add('result-draw');
      return;
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
    let terminal = false;
    let result = '*';
    let resultText = '';
    if (game.in_checkmate && game.in_checkmate()) {
      terminal = true;
      const winner = game.turn() === 'w' ? 'Black' : 'White';
      result = winner === 'White' ? '1-0' : '0-1';
      resultText = `${winner} wins (checkmate)`;
    } else if (game.in_stalemate && game.in_stalemate()) {
      terminal = true; result = '1/2-1/2'; resultText = 'Draw (stalemate)';
    } else if (game.in_threefold_repetition && game.in_threefold_repetition()) {
      terminal = true; result = '1/2-1/2'; resultText = 'Draw (threefold repetition)';
    } else if (game.insufficient_material && game.insufficient_material()) {
      terminal = true; result = '1/2-1/2'; resultText = 'Draw (insufficient material)';
    } else if (game.in_draw && game.in_draw()) {
      terminal = true; result = '1/2-1/2'; resultText = 'Draw';
    }

    if (!terminal) return;

    // Compose payload using current UI values
    const userSide = (playerSelect && playerSelect.value === 'black') ? 'black' : 'white';
    const userName = 'Player';
    const opponentName = (enginePersonaSelect && enginePersonaSelect.value) ? enginePersonaSelect.value : (playEngine ? 'Engine' : 'Opponent');
    const engineFlag = !!playEngine;

    // Auto-save PGN (fire-and-forget) and mark saved when successful
    try {
      const r = await fetch('/api/save_pgn', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ result, user_side: userSide, user_name: userName, opponent_name: opponentName, engine: engineFlag })
      });
      const j = await r.json();
      if (j && j.pgn_file) {
        autoPgnSaved = true;
        setStatus('Auto-saved PGN: ' + j.pgn_file);
      }
    } catch (e) {
      // ignore network errors for auto-save
    }

    // Prompt the user and offer to reset the board to a neutral starting state
    try {
      const ok = window.confirm(`Game over: ${resultText}\n\nPress OK to reset the board to the starting position.`);
      if (ok) {
        try { setPlayEngine(false); } catch (e) { /* ignore */ }
        // Ask server for a fresh reset position and apply it
        try {
          const resp = await postReset();
          if (resp && resp.fen) {
            historyFens = [];
            historyIndex = -1;
            setFen(resp.fen, true);
            gameOver = true;
            autoPgnSaved = true;
            setStatus('Game ended: ' + resultText);
            const el = document.getElementById('result-indicator'); if (el) el.textContent = resultText;
          } else {
            setStatus('Reset failed after game end');
          }
        } catch (e) {
          setStatus('Reset failed after game end');
        }
      } else {
        // Keep board as-is but mark as game over
        gameOver = true;
        setStatus('Game ended: ' + resultText);
        const el = document.getElementById('result-indicator'); if (el) el.textContent = resultText;
      }
    } catch (e) {
      console.warn('User prompt failed', e);
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
  const engine = playEngine || false;
  const engineTime = parseFloat(document.getElementById('engine-time')?.value || '0.1');
  // Determine engine skill: prefer slider value; fall back to persona profile skill when slider missing/invalid
  const enginePersona = (document.getElementById('engine-persona')?.value || '').trim();
  let engineSkill = NaN;
  try {
    const raw = document.getElementById('engine-skill')?.value;
    engineSkill = parseInt(typeof raw !== 'undefined' && raw !== null ? raw : NaN, 10);
  } catch (e) { engineSkill = NaN; }
  if (isNaN(engineSkill)) {
    try {
      if (typeof botProfiles !== 'undefined' && enginePersona && botProfiles[enginePersona] && typeof botProfiles[enginePersona].skill === 'number') {
        engineSkill = botProfiles[enginePersona].skill;
      } else {
        engineSkill = 1; // sensible default
      }
    } catch (e) { engineSkill = 1; }
  }
  const payload = { uci, engine_reply: engine, engine_time: engineTime, engine_skill: engineSkill, engine_persona: enginePersona };
  console.debug('postMove payload', payload);
  const r = await fetch('/api/move', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
  return r.json();
}

async function postReset() {
  const r = await fetch('/api/reset', {method: 'POST'});
  return r.json();
}

async function postEngineMove() {
  const engineTime = parseFloat(document.getElementById('engine-time')?.value || '0.1');
  // Determine engine skill for engine-move request using same fallback logic
  const enginePersona = (document.getElementById('engine-persona')?.value || '').trim();
  let engineSkill = NaN;
  try {
    const raw = document.getElementById('engine-skill')?.value;
    engineSkill = parseInt(typeof raw !== 'undefined' && raw !== null ? raw : NaN, 10);
  } catch (e) { engineSkill = NaN; }
  if (isNaN(engineSkill)) {
    try {
      if (typeof botProfiles !== 'undefined' && enginePersona && botProfiles[enginePersona] && typeof botProfiles[enginePersona].skill === 'number') {
        engineSkill = botProfiles[enginePersona].skill;
      } else {
        engineSkill = 1;
      }
    } catch (e) { engineSkill = 1; }
  }
  const payload = { engine_time: engineTime, engine_skill: engineSkill, engine_persona: enginePersona };
  console.debug('postEngineMove payload', payload);
  const r = await fetch('/api/engine_move', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
  return r.json();
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

async function onDrop(source, target, piece, newPos, oldPos, orientation) {
  console.log('ON DROP HANDLER ACTIVE', source, target, piece);
  // Free-board editing: allow dragging pieces freely and removing to offboard
  if (freeBoardMode) {
    try {
      const pos = board.position(); // object mapping
      if (target === 'offboard') {
        // remove piece from source
        delete pos[source];
        board.position(pos);
        const fen = rebuildGameFromPosition(pos);
        await copyFenToClipboard(fen);
        setStatus('Piece removed (free board) — FEN copied');
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
      setStatus('Piece placed (free board) — FEN copied');
      return;
    } catch (e) {
      console.warn('Free-board drop failed', e);
      return rejectMove('No move');
    }
  }

  if (target === 'offboard' || source === target) return rejectMove('No move');

  // Don’t accept moves while server reply pending or promotion chooser open
  if (moveInFlight || pendingPromotion) return 'snapback';

  const moving = game.get(source);
  if (!moving) return rejectMove('No piece');

  if (String(moving.color).toLowerCase() !== String(game.turn()).toLowerCase()) {
    return rejectMove('Wrong side to move');
  }

  const fromPiece = moving;
  const isPawn = fromPiece && fromPiece.type === 'p';
  const willPromote =
    isPawn &&
    ((fromPiece.color === 'w' && target[1] === '8') ||
     (fromPiece.color === 'b' && target[1] === '1'));

  const prevFen = game.fen();

  // HARD legality gate — no side effects
  const legal = game.move({ from: source, to: target, promotion: 'q' });
  if (legal === null) return rejectMove('Illegal move');
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
  game.undo();

  submitUci(source + target, prevFen);

  // Server-authoritative: don’t let piece sit on target square yet
  return 'snapback';
}

function submitUci(uci, prevFen) {
  moveInFlight = true;
  setStatus('Sending move: ' + uci);

  postMove(uci).then(resp => {
    moveInFlight = false;

    if (resp && resp.error) {
      // Revert (should already be there since we snapback)
      setFen(prevFen, false);
      setStatus('Move rejected: ' + resp.error);
      return;
    }

    if (resp && resp.fen) {
      setFen(resp.fen, true);

      let msg = 'Move played: ' + uci;
      if (resp.engine_reply) msg += ' | Engine: ' + resp.engine_reply;
      setStatus(msg);
      return;
    }

    // Defensive fallback
    setFen(prevFen, false);
    setStatus('Move error: no FEN returned');
  }).catch(() => {
    moveInFlight = false;
    board.position(prevFen);
    game.load(prevFen);
    document.getElementById('fen').textContent = prevFen;
    setStatus('Network error (move not sent)');
  });
}

function onDragStart(source, piece, position, orientation) {
  // piece is like "wP", "bQ" in chessboard.js
  const turn = (game && typeof game.turn === 'function') ? String(game.turn()).toLowerCase() : 'w'; // 'w' or 'b'
  const pieceColor = (piece && piece[0]) ? String(piece[0]).toLowerCase() : null; // 'w' or 'b'
  console.debug('onDragStart:', { piece, pieceColor, turn });

  // Allow free editing/drags when freeBoardMode is on (engine off)
  if (freeBoardMode) {
    if (moveInFlight || pendingPromotion) return false;
    return true;
  }

  if (moveInFlight || pendingPromotion || gameOver) return false;
  if (!pieceColor) return false;
  if (pieceColor !== turn) return false;

  return true;
}


window.addEventListener('load', async () => {
  if (typeof Chess === 'undefined') {
    console.error('Chess.js not loaded — `Chess` is undefined');
    return;
  }
  if (typeof Chessboard === 'undefined') {
    console.error('Chessboard.js not loaded — `Chessboard` is undefined');
    return;
  }

  const init = await fetchState();
  game = new Chess();
  // Load player color preference (controls which side is at the bottom)
  const savedPlayerColor = (localStorage.getItem('playerColor') || 'white');
  const playerSelect = document.getElementById('player-color');
  if (playerSelect) playerSelect.value = savedPlayerColor;

  // Position captured trays under the board on the side matching the opponent
  const capturedTraysEl = document.querySelector('.captured-trays');
  function updateCapturedTraysAnchor() {
    try {
      if (!capturedTraysEl || !playerSelect) return;
      capturedTraysEl.classList.remove('anchored-left','anchored-right');
      const humanIsWhite = playerSelect.value === 'white';
      // If human is white (white at bottom), anchor captured pieces to the right below board
      if (humanIsWhite) capturedTraysEl.classList.add('anchored-right');
      else capturedTraysEl.classList.add('anchored-left');
    } catch (e) { /* ignore */ }
  }
  // apply immediately
  try { updateCapturedTraysAnchor(); } catch (e) {}
  // update when player color changes
  if (playerSelect) playerSelect.addEventListener('change', () => {
    try { localStorage.setItem('playerColor', playerSelect.value); } catch (e) {}
    try { updateCapturedTraysAnchor(); } catch (e) {}
    try { updatePlayersDisplay(); } catch (e) {}
  });

  // Persona controls
  const enginePersonaSelect = document.getElementById('engine-persona');
  try {
    const savedPersona = localStorage.getItem('enginePersona');
    if (enginePersonaSelect && savedPersona) enginePersonaSelect.value = savedPersona;
    if (enginePersonaSelect && savedPersona) {
      enginePersonaSelect.value = savedPersona;
    } else if (enginePersonaSelect) {
      // default persona
      enginePersonaSelect.value = 'Student';
      try { localStorage.setItem('enginePersona', 'Student'); } catch (e) {}
    }
  } catch (e) { /* ignore localStorage errors */ }
  if (enginePersonaSelect) enginePersonaSelect.addEventListener('change', () => { try { localStorage.setItem('enginePersona', enginePersonaSelect.value); } catch (e) {} });
  const playersDisplay = document.getElementById('players-display');
  function updatePlayersDisplay() {
    if (!playersDisplay) return;
    const humanIsWhite = (playerSelect && playerSelect.value === 'white');
    const oppName = (enginePersonaSelect && enginePersonaSelect.value) ? enginePersonaSelect.value : (playEngine ? 'Engine' : 'Opponent');
    const whiteName = humanIsWhite ? 'Player' : oppName;
    const blackName = humanIsWhite ? oppName : 'Player';
    playersDisplay.textContent = `White: ${whiteName}  |  Black: ${blackName}`;
  }
  // update display when names or side change
  if (enginePersonaSelect) enginePersonaSelect.addEventListener('change', updatePlayersDisplay);
  // initial render of the players mapping
  try { updatePlayersDisplay(); } catch (e) { }

  // Header persona indicator (keeps user informed which persona is active)
  const personaIndicator = document.getElementById('persona-indicator');
  function refreshPersonaIndicator() {
    try {
      const name = enginePersonaSelect ? enginePersonaSelect.value : '';
      if (personaIndicator) personaIndicator.textContent = `Persona: ${name || '(none)'}`;
    } catch (e) { /* ignore */ }
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
    pieceTheme: '/static/img/chesspieces/wikipedia/{piece}.png'
  });
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
              setStatus('Piece added from palette — FEN copied');
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
          setStatus('Piece placed — FEN copied');
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
          setStatus('Piece removed (dblclick) — FEN copied');
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
          try { setPlayEngine(false); } catch (e) {}
        }
        const pal = document.getElementById('piece-palette');
        if (pal) pal.style.display = freeBoardMode ? 'flex' : 'none';
        setStatus(freeBoardMode ? 'Free board editing enabled' : 'Free board editing disabled');
        // When leaving free-board mode (i.e., entering game mode), ensure captured trays are visible
        // Also ensure engine controls are disabled while in free-board mode
        try {
          if (freeBoardMode) {
            if (playBtn) playBtn.disabled = true;
          } else {
            if (playBtn) playBtn.disabled = false;
            try { renderCapturedTrays(); } catch (e) { /* ignore */ }
          }
        } catch (e) { /* ignore */ }
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
                setStatus('FEN exported — copied to clipboard');
              } else {
                // fallback to textarea copy
                const ta = document.createElement('textarea');
                ta.value = fen;
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(ta);
                setStatus(ok ? 'FEN exported — copied to clipboard' : 'FEN exported (copy failed)');
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
          setStatus('Board cleared — FEN copied');
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
          // build board part of FEN from pos (ranks 8..1)
          const files = ['a','b','c','d','e','f','g','h'];
          const ranks = ['8','7','6','5','4','3','2','1'];
          const rows = [];
          for (const r of ranks) {
            let empty = 0;
            let row = '';
            for (const f of files) {
              const sq = f + r;
              const pc = pos[sq];
              if (!pc) { empty += 1; continue; }
              if (empty > 0) { row += String(empty); empty = 0; }
              // pc like 'wP' or 'bq'
              const color = pc[0] === 'w' ? pc[1].toUpperCase() : pc[1].toLowerCase();
              row += color;
            }
            if (empty > 0) row += String(empty);
            rows.push(row);
          }
          const boardPart = rows.join('/');
          const toMove = (startSide && startSide.value === 'black') ? 'b' : 'w';
          const fen = `${boardPart} ${toMove} - - 0 1`;

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
            try { playerSelect.value = color; localStorage.setItem('playerColor', color); } catch (e) {}
            try { if (board && typeof board.orientation === 'function') board.orientation(color); } catch (e) {}
          }

          // Start engine-enabled play from this position without resetting server position
          try {
            setPlayEngine(true, { keepPosition: true });
          } catch (e) { /* ignore */ }

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
  // Initialize game and history from server state
  game.load(init.fen);
  setFen(init.fen, true);
  setStatus(`${game.turn() === 'w' ? 'White' : 'Black'} to move`);

  // Wire up player color selector to persist and apply orientation
  if (playerSelect) {
    playerSelect.addEventListener('change', () => {
      const v = playerSelect.value === 'black' ? 'black' : 'white';
      try { localStorage.setItem('playerColor', v); } catch (e) { /* ignore */ }
      if (board && typeof board.orientation === 'function') {
        try { board.orientation(v); } catch (e) { console.warn('Failed to set board orientation', e); }
      }
      try { if (typeof updatePlayersDisplay === 'function') updatePlayersDisplay(); } catch (e) {}
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
          setStatus('Free board reset to starting position — FEN copied');
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
        historyIndex = -1;
        setFen(resp.fen, true);
        // clear captured pieces on reset
        try { clearCapturedTrays(); } catch (e) {}
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
              historyIndex = -1;
              setFen(r2.fen, true);
              setStatus('Engine played first move');
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
        try { clearCapturedTrays(); } catch (e) {}
        gameOver = false; autoPgnSaved = false;
        setStatus('Position reset');
      } else {
        setStatus('Reset failed');
      }
    });
  }

  // Resign logic: extracted to `doResign()` and invoked by the play button when acting as Resign
  async function doResign() {
    const ok = confirm('Are you sure you want to resign this game?');
    if (!ok) return;
    try { setPlayEngine(false); } catch (e) { /* ignore if not initialized yet */ }
    // Determine which side the human is playing from UI
    const playerSide = (playerSelect && playerSelect.value === 'black') ? 'black' : 'white';
    try {
      const opponentName = (enginePersonaSelect && enginePersonaSelect.value) ? enginePersonaSelect.value : (playEngine ? 'Engine' : 'Opponent');
      const payload = { resigned_side: playerSide, user_side: playerSide, user_name: 'Player', opponent_name: opponentName, engine: !!playEngine };
      const r = await fetch('/api/resign', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (data && data.fen) {
        // mark game over and show result
        gameOver = true;
        autoPgnSaved = true;
        historyFens = [];
        historyIndex = -1;
        setFen(data.fen, true);
        if (data.winner) {
          setStatus(`Resigned — ${data.winner} wins` + (data.pgn_file ? ` | saved: ${data.pgn_file}` : ''));
          const el = document.getElementById('result-indicator');
          if (el) el.textContent = `${data.winner} wins (resignation)`;
        } else {
          setStatus('Resigned' + (data.pgn_file ? ` | saved: ${data.pgn_file}` : ''));
        }
      }
    } catch (e) {
      setStatus('Network error: resign failed');
    }
  }

  // Save PGN button
  const savePgnBtn = document.getElementById('save-pgn-btn');
  if (savePgnBtn) {
    savePgnBtn.addEventListener('click', async () => {
      // Ask server to write PGN of current board
      // Determine provisional result from result-indicator if present
      const resultText = document.getElementById('result-indicator')?.textContent || '';
      let result = '*';
      if (resultText.includes('wins')) result = resultText.startsWith('White') ? '1-0' : '0-1';
      if (resultText.includes('Draw')) result = '1/2-1/2';
      try {
        const userSide = (playerSelect && playerSelect.value === 'black') ? 'black' : 'white';
        const opponentName = (enginePersonaSelect && enginePersonaSelect.value) ? enginePersonaSelect.value : (playEngine ? 'Engine' : 'Opponent');
        const payload = { result, user_side: userSide, user_name: 'Player', opponent_name: opponentName, engine: !!playEngine };
        const r = await fetch('/api/save_pgn', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const data = await r.json();
        if (data && data.pgn_file) {
          autoPgnSaved = true;
          setStatus('PGN saved: ' + data.pgn_file);
        } else {
          setStatus('PGN save failed');
        }
      } catch (e) {
        setStatus('Network error: save pgn failed');
      }
    });
  }

  // Clear captured trays on reset/load
  try { clearCapturedTrays(); } catch (e) {}

  // Move list is a permanent element under the right-side accordion (#move-list)

  // Keyboard navigation for history (left/right arrows)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goBack();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goForward();
    }
  });

  // Theme (dark mode) toggle: apply and persist preference
  function applyTheme(theme) {
    const doc = document.documentElement;
    doc.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
      btn.setAttribute('aria-pressed', theme === 'dark');
    }
  }

  function initThemeFromPreference() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') {
      applyTheme(saved);
      return;
    }
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
    });
  }
  initThemeFromPreference();

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
      try { localStorage.setItem('engineTime', timeSlider.value); } catch (e) { /* ignore */ }
    });
  }
  if (skillSlider && skillVal) {
    skillVal.textContent = skillSlider.value;
    skillSlider.addEventListener('input', () => {
      skillVal.textContent = skillSlider.value;
      try { localStorage.setItem('engineSkill', skillSlider.value); } catch (e) { /* ignore */ }
    });
  }

  // Bot profiles
  const botProfiles = {
    'Grasshopper': { skill: 0, fast: 0.10, deep: 0.60 },
    'Student':     { skill: 1, fast: 0.12, deep: 0.80 },
    'Adept':       { skill: 3, fast: 0.20, deep: 1.00 },
    'Ninja':       { skill: 5, fast: 0.30, deep: 1.50 },
    'Sensei':      { skill: 8, fast: 0.50, deep: 2.50 }
  };

  function applyBotProfile(name) {
    if (!name || !botProfiles[name]) return;
    const p = botProfiles[name];
    if (skillSlider) { skillSlider.value = p.skill; skillVal.textContent = p.skill; }
  }

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
  const playBtn = document.getElementById('play-engine-btn');
  function setPlayEngine(on, opts = {}) {
    playEngine = !!on;
    // when a game is active, persona cannot be changed
    if (enginePersonaSelect) enginePersonaSelect.disabled = playEngine;
    if (playBtn) {
      playBtn.textContent = playEngine ? 'Resign' : 'Start Game';
      try {
        playBtn.classList.remove('play-start','play-resign');
        playBtn.classList.add(playEngine ? 'play-resign' : 'play-start');
      } catch (e) {}
    }
    setStatus(playEngine ? 'Game started' : 'Game stopped');

    // If turning on play mode, reset the board to start a fresh game
    if (playEngine) {
      if (opts && opts.keepPosition) {
        // Start play mode from the existing server position (do not reset)
        try { renderCapturedTrays(); } catch (e) {}
        if (playerSelect && playerSelect.value === 'black') {
          postEngineMove().then(r2 => {
            if (r2 && r2.fen) {
              historyFens = [];
              historyIndex = -1;
              setFen(r2.fen, true);
              try { renderCapturedTrays(); } catch (e) { }
              setStatus('Engine played first move — Game started');
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
            setStatus('Position reset — Game started');
            try { renderCapturedTrays(); } catch (e) { }
            // If player sits Black, have engine (White) play the first move
            if (playerSelect && playerSelect.value === 'black') {
              postEngineMove().then(r2 => {
                if (r2 && r2.fen) {
                  historyFens = [];
                  historyIndex = -1;
                  setFen(r2.fen, true);
                  try { renderCapturedTrays(); } catch (e) { }
                  setStatus('Engine played first move — Game started');
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
      try { renderCapturedTrays(); } catch (e) {}
    }
  }

    if (playBtn) {
    // ensure button is enabled and wired
    try { playBtn.disabled = false; } catch (e) {}
    playBtn.addEventListener('click', async (ev) => {
      console.debug('playBtn clicked — current playEngine=', playEngine);
      try {
        if (!playEngine) {
          // start the game
            setPlayEngine(true);
        } else {
          // act as Resign when pressed during an active game
          await doResign();
        }
      } catch (e) { console.error('playBtn handler threw', e); }
    });
      // ensure initial class matches state on load
      try { playBtn.classList.remove('play-start','play-resign'); playBtn.classList.add(playEngine ? 'play-resign' : 'play-start'); } catch (e) {}
  }
});
