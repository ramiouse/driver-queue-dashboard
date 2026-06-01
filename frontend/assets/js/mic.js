// ── mic.js — Speech Recognition (Web Speech API) ─────

const Mic = (() => {
  let recognition = null;
  let isListening = false;
  let isMuted = false; // true saat TTS sedang berbicara

  function setup() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      document.getElementById("mic-status").textContent =
        "Browser tidak support mic, Gunakan chrome atau ms edge.";
      return null;
    }

    const r = new SR();
    r.lang = "id-ID";
    r.continuous = true;
    r.interimResults = true;

    r.onresult = (e) => {
      let interim = "",
        final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }

      const display = final || interim;
      UI.setTranscript(display, true);

      // Abaikan hasil saat TTS sedang berbicara (speaker feedback)
      if (final) {
        if (isMuted) {
          UI.addLog("Mic: diabaikan (TTS sedang aktif)", "err");
          return;
        }
        UI.addLog('"' + final.trim() + '"', "mic");
        App.processVoiceCommand(final.toLowerCase().trim());
      }
    };

    r.onerror = (e) => {
      if (e.error !== "no-speech") {
        UI.addLog("Mic error: " + e.error, "err");
        stop();
      }
    };

    // Auto-restart agar terus mendengarkan
    r.onend = () => {
      if (isListening) r.start();
    };

    return r;
  }

  function start() {
    if (!recognition) recognition = setup();
    if (!recognition) return;
    isListening = true;
    recognition.start();
    UI.setMicState(true);
    UI.setTranscript('Katakan no mobil, contoh: "panggil B 1234 XY"');
  }

  function stop() {
    isListening = false;
    if (recognition) recognition.stop();
    UI.setMicState(false);
    UI.setTranscript('Coba: "panggil B 1234 XY" atau "panggil semua"', false);
  }

  function toggle() {
    isListening ? stop() : start();
  }

  // Dipanggil oleh tts.js saat mulai/selesai berbicara
  function mute() {
    isMuted = true;
  }
  function unmute() {
    isMuted = false;
  }

  function listening() {
    return isListening;
  }

  return { start, stop, toggle, listening, mute, unmute };
})();
