/* audio_overrides.js
   Purpose: Override ONLY audio behavior (paths + voice clips + reset sound hooks)
   Load AFTER main.js
*/

(function () {
  // -----------------------------
  // Disable browser TTS to avoid double-voice
  // -----------------------------
  try {
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
      try { window.speechSynthesis.speak = function () {}; } catch (e) {}
    }
  } catch (e) {}

  // -----------------------------
  // Helpers
  // -----------------------------
  function safeAudio(url) {
    try {
      const a = new Audio(url);
      a.preload = "auto";
      return a;
    } catch (e) {
      console.warn("Audio init failed for", url, e);
      return null;
    }
  }

  function playAudio(a, volume = 1.0) {
    if (!a) return;
    try {
      a.pause();
      a.currentTime = 0;
      a.volume = volume;
      // Some browsers require a user interaction before audio will play.
      a.play().catch(() => {});
    } catch (e) {
      console.warn("Audio play failed", e);
    }
  }

  // -----------------------------
  // SFX OVERRIDES (ChessSounds)
  // -----------------------------
  if (typeof window.ChessSounds !== "undefined") {
    const SFX = window.ChessSounds;

    // Add missing properties if older object
    SFX.reset = SFX.reset || null;

    // Override init() to load from your new folder structure
    SFX.init = function init() {
      try {
        // Piece sounds
        this.move = safeAudio("/static/sounds/piece/move.mp3");
        this.capture = safeAudio("/static/sounds/piece/capture.mp3");
        this.reset = safeAudio("/static/sounds/piece/reset.mp3");

        // System sounds
        this.select = safeAudio("/static/sounds/system/select.mp3");

        // (Optional) keep these null; voice handles check/checkmate in your setup
        this.check = null;
        this.checkmate = null;

        // Preload
        [this.move, this.capture, this.reset, this.select].forEach((a) => {
          try { a && a.load(); } catch (e) {}
        });

        console.log("Audio overrides: SFX loaded");
      } catch (e) {
        console.warn("Audio overrides: SFX init failed", e);
      }
    };

    // Override play() to support reset + be robust
    SFX.play = function play(soundName) {
      if (!this.enabled) return;
      const a = this[soundName];
      playAudio(a, 1.0);
    };

    // Keep existing convenience methods + add reset
    SFX.playMove = function () { this.play("move"); };
    SFX.playCapture = function () { this.play("capture"); };
    SFX.playSelect = function () { this.play("select"); };
    SFX.playReset = function () { this.play("reset"); };

    // Avoid double/noisy behavior if the main file calls playCheckmate/playCheck
    // (Voice will handle these events using mp3 files)
    SFX.playCheck = function () {};
    SFX.playCheckmate = function () {};
  } else {
    console.warn("audio_overrides.js: ChessSounds not found (main.js must load first).");
  }

  // -----------------------------
  // VOICE OVERRIDES (ChessVoice)
  // Uses your mp3 voice clips instead of browser TTS.
  // -----------------------------
  if (typeof window.ChessVoice !== "undefined") {
    const V = window.ChessVoice;

    // Map phrase keys used by main.js to actual filenames
    const voiceMap = {
      gameStart: "welcome.mp3",
      check: "incheck.mp3",
      checkmateWin: "checkmatewinner.mp3",
      checkmateLose: "checkmateloss.mp3",
      draw: "stalemate.mp3",
      resignYou: "resigned.mp3",
      resignOpponent: "resigned.mp3"
      // Note: checkmate.mp3 exists but isn't used (we use checkmateWin/checkmateLose instead)
    };

    // Preload voice clips
    const voiceBase = "/static/sounds/voices/default/";
    const voiceAudio = {};
    Object.keys(voiceMap).forEach((k) => {
      voiceAudio[k] = safeAudio(voiceBase + voiceMap[k]);
      try { voiceAudio[k] && voiceAudio[k].load(); } catch (e) {}
    });

    // Completely replace the speak method - do NOT call TTS at all
    V.speak = function (phraseKey) {
      if (!this.enabled) return;
      const a = voiceAudio[phraseKey];
      if (!a) {
        console.log("Voice clip not found for:", phraseKey);
        return;
      }
      const delayMs = Number(this.delay || 0);
      setTimeout(() => playAudio(a, 1.0), delayMs);
    };

    // Also replace all the helper methods to use our speak
    V.sayGameStart = function () { this.speak("gameStart"); };
    V.sayCheck = function () { this.speak("check"); };
    V.sayCheckmateWin = function () { this.speak("checkmateWin"); };
    V.sayCheckmateLose = function () { this.speak("checkmateLose"); };
    V.sayDraw = function () { this.speak("draw"); };
    V.sayResignYou = function () { this.speak("resignYou"); };
    V.sayResignOpponent = function () { this.speak("resignOpponent"); };

    console.log("Audio overrides: Voice MP3 mode ACTIVE (TTS disabled)");
  } else {
    console.warn("audio_overrides.js: ChessVoice not found (main.js must load first).");
  }

  // -----------------------------
  // Reset sound hooks (no main.js edits)
  // -----------------------------
  // You mentioned reset.mp3 should play when someone presses reset.
  // We hook common reset buttons by id, using capture to ensure we fire.
  document.addEventListener(
    "click",
    (ev) => {
      const t = ev.target;
      if (!t) return;

      const id = t.id || "";
      const isReset =
        id === "reset-btn" ||
        id === "game-reset-btn" ||
        id === "tune_reset_btn";

      if (isReset && window.ChessSounds && typeof window.ChessSounds.playReset === "function") {
        try { window.ChessSounds.playReset(); } catch (e) {}
      }
    },
    true
  );
})();
