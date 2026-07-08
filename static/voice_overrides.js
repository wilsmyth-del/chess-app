/* voice_overrides.js
   Override ChessVoice.speak() to play prerecorded clips instead of TTS.
   Load this AFTER static/main.js.

   Voice SCHEME switches based on the player-name field, checked fresh on
   every speak() call (so it takes effect immediately, no reload needed).
   BUILD-100: "type fart as player name" was the original secret-unlock
   idea (Mariana-approved); her own name now triggers it automatically too.
*/
(function () {
  function safeAudio(url) {
    try {
      const a = new Audio(url);
      a.preload = "auto";
      return a;
    } catch (e) {
      return null;
    }
  }

  function playAudio(a, volume = 1.0) {
    if (!a) return;
    try {
      a.pause();
      a.currentTime = 0;
      a.volume = volume;
      a.play().catch(() => {});
    } catch (e) {}
  }

  // Disable browser TTS to avoid double-voice
  try {
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
      try { window.speechSynthesis.speak = function () {}; } catch (e) {}
    }
  } catch (e) {}

  if (typeof window.ChessVoice === "undefined") {
    console.warn("voice_overrides.js: ChessVoice not found (ensure this file loads after main.js)");
    return;
  }

  const V = window.ChessVoice;

  // Names (lowercase, trimmed) that unlock the fart scheme.
  const FART_TRIGGER_NAMES = ["fart", "mariana"];

  const SCHEMES = {
    default: {
      base: "/static/sounds/voices/default/",
      files: {
        gameStart: "welcome.mp3",
        check: "incheck.mp3",
        checkmateWin: "checkmatewinner.mp3",
        checkmateLose: "checkmateloss.mp3",
        checkmateWhiteWins: "checkmatewinner.mp3",
        checkmateBlackWins: "checkmateloss.mp3",
        draw: "stalemate.mp3",
        resignYou: "resigned.mp3",
        resignOpponent: "resigned.mp3",
        checkmate: "checkmate.mp3"
      }
    },
    fart: {
      base: "/static/sounds/voices/fart/",
      files: {
        gameStart: "welcome.mp3",
        check: "incheck.mp3",
        checkmateWin: "checkmatewinner.mp3",
        checkmateLose: "checkmateloss.mp3",
        checkmateWhiteWins: "checkmatewinner.mp3",
        checkmateBlackWins: "checkmateloss.mp3",
        draw: "stalemate.mp3",
        resignYou: "resigned.mp3",
        resignOpponent: "resigned.mp3",
        checkmate: "checkmate.mp3"
      }
    }
  };

  // Preload both schemes' clips up front (small files, silently skip missing).
  const voiceAudio = {};
  Object.keys(SCHEMES).forEach((scheme) => {
    voiceAudio[scheme] = {};
    const { base, files } = SCHEMES[scheme];
    Object.keys(files).forEach((k) => {
      try {
        voiceAudio[scheme][k] = safeAudio(base + files[k]);
        try { voiceAudio[scheme][k] && voiceAudio[scheme][k].load(); } catch (e) {}
      } catch (e) {}
    });
  });

  function currentPlayerName() {
    try {
      const el = document.getElementById("player-name");
      const v = (el && el.value) ? el.value : (localStorage.getItem("playerName") || "");
      return v.trim().toLowerCase();
    } catch (e) {
      return "";
    }
  }

  function currentScheme() {
    return FART_TRIGGER_NAMES.includes(currentPlayerName()) ? "fart" : "default";
  }

  // Override speak to play the right scheme's clip. Respect `enabled` and `delay`.
  V.speak = function (phraseKey) {
    try {
      if (!this.enabled) return;
      const scheme = currentScheme();
      const a = voiceAudio[scheme] && voiceAudio[scheme][phraseKey];
      if (!a) return; // silent if clip missing
      const d = Number(this.delay || 0) || 0;
      setTimeout(() => playAudio(a, 1.0), d);
    } catch (e) {
      // fail silently
    }
  };

  console.log("Voice overrides loaded - scheme switches on player name (fart/mariana -> fart scheme)");

  // Keep existing helpers that call speak() — they will now use the active scheme
  // (No further changes to main.js needed)

  // --- Randomized move-sound clips for the fart scheme ---------------------
  // Any number of mp3s can be dropped in static/sounds/voices/fart/moves/ —
  // no filename list to maintain, the server just lists what's actually there.
  if (typeof window.ChessSounds !== "undefined") {
    const S = window.ChessSounds;
    const originalPlay = S.play.bind(S);
    let fartMoveClips = [];

    fetch("/api/fart-move-sounds")
      .then((r) => (r.ok ? r.json() : []))
      .then((names) => {
        fartMoveClips = (names || [])
          .map((n) => safeAudio("/static/sounds/voices/fart/moves/" + encodeURIComponent(n)))
          .filter(Boolean);
        fartMoveClips.forEach((a) => { try { a.load(); } catch (e) {} });
      })
      .catch(() => { fartMoveClips = []; });

    S.play = function (soundName) {
      if (soundName === "move" && currentScheme() === "fart" && fartMoveClips.length > 0) {
        if (!this.enabled) return;
        const pick = fartMoveClips[Math.floor(Math.random() * fartMoveClips.length)];
        playAudio(pick);
        return;
      }
      originalPlay(soundName);
    };
  }
})();
