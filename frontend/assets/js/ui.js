// ── ui.js — DOM updates, wave, log ───────────────────

const UI = (() => {
  const outputText = document.getElementById("output-text");
  const wave = document.getElementById("wave");
  // const logEl = document.getElementById("log");

  function setSpeaking(text) {
    outputText.textContent = text;
    outputText.classList.add("speaking");
    wave.classList.add("active");
  }

  function setIdle(text = "Menunggu panggilan...") {
    outputText.textContent = text;
    outputText.classList.remove("speaking");
    wave.classList.remove("active");
  }

  function setLoading(id, loading) {
    const btn = document.getElementById("btn-" + id);
    if (loading) {
      btn.innerHTML = '<span class="spinner"></span>Loading...';
      btn.disabled = true;
    } else {
      btn.disabled = false;
    }
  }

  function addLog(msg, type = "tts") {
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    const icon = type === "mic" ? "🎤" : type === "err" ? "❌" : "🔊";

    // Cari SEMUA kontainer log di semua tab
    const logContainers = document.querySelectorAll(".log-container");

    logContainers.forEach((container) => {
      const entry = document.createElement("div");
      entry.className = "log-entry";
      entry.innerHTML = `<span class="log-time">${time}</span><span class="log-msg ${type}">${icon} ${msg}</span>`;

      container.prepend(entry);

      // Jaga agar log tidak terlalu panjang (maksimal 25 baris per tab)
      while (container.children.length > 25) {
        container.removeChild(container.lastChild);
      }
    });
  }

  function setMicState(listening) {
    const btn = document.getElementById("mic-btn");
    const statusText = document.getElementById("mic-status");
    if (listening) {
      btn.classList.add("listening");
      statusText.textContent = "🔴 Mendengarkan... (aktif)";
    } else {
      btn.classList.remove("listening");
      statusText.textContent = "Klik mic untuk mulai dengarkan";
    }
  }

  function setTranscript(text, active = false) {
    const el = document.getElementById("mic-transcript");
    el.textContent = text;
    active ? el.classList.add("active") : el.classList.remove("active");
  }

  return {
    setSpeaking,
    setIdle,
    // setDriverState,
    setLoading,
    addLog,
    setMicState,
    setTranscript,
  };
})();
