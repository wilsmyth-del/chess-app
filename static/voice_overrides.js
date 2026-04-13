/* voice_overrides.js
   Override ChessVoice.speak() to play prerecorded MP3s instead of TTS.
   Load this AFTER static/main.js.
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

  // Map ChessVoice phrase keys -> filenames in /static/sounds/voices/default/
  const voiceMap = {
    gameStart: "welcome.mp3",
    check: "incheck.mp3",
    checkmateWin: "checkmatewinner.mp3",
    checkmateLose: "checkmateloss.mp3",
    checkmateWhiteWins: "checkmatewinner.mp3",
    checkmateBlackWins: "checkmatewinner.mp3",
    draw: "stalemate.mp3",
    resignYou: "resigned.mp3",
    resignOpponent: "resigned.mp3",
    checkmate: "checkmate.mp3"
  };

  const voiceBase = "/static/sounds/voices/default/";
  const voiceAudio = {};

  // Preload clips (silently skip missing)
  Object.keys(voiceMap).forEach((k) => {
    try {
      voiceAudio[k] = safeAudio(voiceBase + voiceMap[k]);
      try { voiceAudio[k] && voiceAudio[k].load(); } catch (e) {}
    } catch (e) {}
  });

  // Override speak to play MP3s. Respect `enabled` and `delay`.
  V.speak = function (phraseKey) {
    try {
      if (!this.enabled) return;
      const a = voiceAudio[phraseKey];
      if (!a) return; // silent if clip missing
      const d = Number(this.delay || 0) || 0;
      setTimeout(() => playAudio(a, 1.0), d);
    } catch (e) {
      // fail silently
    }
  };

  console.log("Voice overrides loaded - now using MP3 files instead of TTS");

  // Keep existing helpers that call speak() — they will now use MP3s
  // (No further changes to main.js needed)
})();