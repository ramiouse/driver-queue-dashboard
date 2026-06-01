// ── tts.js — Edge TTS API (Centralized Audio TOA) ─────

const TTS = (() => {
  // Contoh: const API_BASE = "http://10.11.10.66:8800" local pc wfg;
  const API_BASE = "https://192.168.100.5:8800";
  let isFetching = false;

  async function loadVoices() {
    try {
      const res = await fetch(`${API_BASE}/api/voices`);
      if (!res.ok) throw new Error("Server tidak merespons"); // <--- safety cek
      const data = await res.json();
      const sel = document.getElementById("voice-select");
      if (sel) {
        sel.innerHTML = "";
        data.voices.forEach((v) => {
          const opt = document.createElement("option");
          opt.value = v.short;
          opt.textContent = `${v.short} (${v.gender})`;
          if (v.short === "id-ID-GadisNeural") opt.selected = true;
          sel.appendChild(opt);
        });
      }
      if (typeof UI !== "undefined")
        UI.addLog("Voices loaded: " + data.voices.length, "tts");
    } catch (e) {
      if (typeof UI !== "undefined")
        UI.addLog("Gagal load voices — pastikan server jalan", "err");
      throw e; // <--- SANGAT PENTING: Biar fungsi refreshTTS di app.js tahu kalau ini gagal!
    }
  }

  // speak() sekarang return Promise — caller bisa await sampai audio di TOA selesai
  async function speak(text) {
    if (!text.trim()) return;
    if (isFetching) return;

    isFetching = true;

    if (typeof Mic !== "undefined") Mic.mute();
    if (typeof UI !== "undefined") {
      UI.setSpeaking(text);
      UI.addLog(text, "tts");
    }

    try {
      // 1. Kirim request ke backend Python
      // Karena Python memutar pygame dan menahan (get_busy()),
      // maka 'await fetch' ini akan otomatis menunggu sampai suara di TOA beres!
      const res = await fetch(`${API_BASE}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice:
            document.getElementById("voice-select")?.value ||
            "id-ID-GadisNeural",
          rate: getRate(),
          volume: getVolume(),
          pitch: getPitch(),
        }),
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);

      // 2. Jika kode sampai baris ini, artinya TOA sudah selesai ngomong.
      // Kita tidak butuh "new Audio()" lagi di sini. Browser tetap bisu.
      const data = await res.json();
    } catch (e) {
      if (typeof UI !== "undefined") UI.addLog("Error: " + e.message, "err");
    } finally {
      // 3. Reset UI kembali ke Standby
      isFetching = false;
      if (typeof UI !== "undefined") UI.setIdle();
      setTimeout(() => {
        if (typeof Mic !== "undefined") Mic.unmute();
      }, 500);
    }
  }

  function stop() {
    isFetching = false;
    // Tembak API ke Python untuk matikan TOA
    fetch(`${API_BASE}/api/tts/stop`, { method: "POST" }).catch((e) =>
      console.log(e),
    );

    if (typeof UI !== "undefined") UI.setIdle();
    if (typeof Mic !== "undefined") Mic.unmute();
  }

  function isSpeaking() {
    // Karena memutar audio dipindah ke server, kita cukup cek status request-nya
    return isFetching;
  }

  function getRate() {
    const val = parseFloat(document.getElementById("rate")?.value || 1);
    const pct = Math.round((val - 1) * 100);
    return (pct >= 0 ? "+" : "") + pct + "%";
  }

  function getVolume() {
    const val = parseFloat(document.getElementById("vol")?.value || 80);
    const pct = Math.round(val - 100);
    return (pct >= 0 ? "+" : "") + pct + "%";
  }

  function getPitch() {
    const val = parseInt(document.getElementById("pitch")?.value || 0);
    return (val >= 0 ? "+" : "") + val + "Hz";
  }

  return { loadVoices, speak, stop, isSpeaking };
})();
