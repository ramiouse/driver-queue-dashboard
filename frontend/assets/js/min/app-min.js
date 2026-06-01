const App = (() => {
  let e = {},
    t = null;
  let n = [],
    a = null,
    o = {};
  const i = new Set();
  async function s() {
    try {
      const t = await fetch("/api/drivers"),
        n = await t.json();
      JSON.stringify(e) !== JSON.stringify(n) &&
        ((e = n),
        l(),
        Object.keys(e).forEach((t) => {
          const n = e[t].status;
          ("standby" === n && "idle" === n) || b(t, n);
        }));
    } catch (e) {}
  }
  async function r(t, n = null) {
    const a = e[t];
    if (!a) return;
    const o = document.getElementById("jenis-" + t),
      i = o ? o.value : a.jenis || "supir",
      s = null !== n ? n : a.status || "standby";
    ((a.status = s),
      (a.jenis = i),
      await fetch("/api/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: t,
          name: a.name,
          noMobil: a.noMobil,
          status: s,
          jenis: i,
        }),
      }));
  }
  function d() {
    const e = document.getElementById("input-search");
    if (!e) return;
    const t = e.value.toLowerCase().trim(),
      n = document.querySelectorAll(".drivers .driver-card");
    if (!t) return void n.forEach((e) => (e.style.display = "flex"));
    const a = t
      .split(",")
      .map((e) => e.trim())
      .filter((e) => "" !== e);
    n.forEach((e) => {
      const t = e.querySelector(".driver-name").innerText.toLowerCase(),
        n = e.querySelector(".driver-detail").innerText.toLowerCase(),
        o = a.some((e) => t.includes(e) || n.includes(e));
      e.style.display = o ? "flex" : "none";
    });
  }
  function l() {
    const t = document.querySelector(".drivers");
    t &&
      ((t.innerHTML = ""),
      Object.entries(e).forEach(([e, n]) => {
        const a = n.name,
          o = n.noMobil,
          i = a.substring(0, 2).toUpperCase();
        let s = (n.status || "standby").toLowerCase().trim();
        ("idle" !== s && "" !== s) || (s = "standby");
        const r = `\n        <div class="driver-card" id="card-${e}">\n          <div class="queue-number">00</div>\n          <div class="avatar">${i}</div>\n          <div class="driver-info">\n            <div class="driver-name">${a}</div>\n            <div class="driver-detail">${o}</div>\n          </div>\n          <span class="driver-status ${n.status || "standby"}" id="status-${e}">Standby</span>\n          <div class="actions">\n            <select class="card-select" id="jenis-${e}">\n              <option value="supir">Office</option>\n              <option value="loading">Loading</option>\n            </select>\n            <button class="icon-btn edit" title="Edit" onclick="App.editDriver('${e}')">\n              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>\n            </button>\n            <button class="icon-btn del" title="Delete" onclick="App.hapusDriver('${e}')">\n              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>\n            </button>\n            <button class="call-btn primary" id="btn-${e}" onclick="App.callDriver('${e}')">📢</button>\n          </div>\n        </div>`;
        t.insertAdjacentHTML("beforeend", r);
      }),
      I(),
      d());
  }
  function c(t, a = !1) {
    const o = String(t),
      s = e[o];
    if (!s) return;
    if ("calling" === s.status || "queued" === s.status || i.has(o))
      return void p(o);
    const d = document.getElementById("jenis-" + o),
      l = d ? d.value : "supir",
      c = s.noMobil
        ? s.noMobil
            .replace(/\s+/g, "")
            .split("")
            .map((e) => ("Z" === e.toUpperCase() ? "Jet" : e))
            .join(" ")
        : s.name;
    document.getElementById("voice-select");
    let u = "";
    switch (l) {
      case "supir":
        u = `Panggilan kepada supir, plat nomor ${c}, untuk ke loket W-F-G.`;
        break;
      case "loading":
        u = `Supir dengan plat nomor ${c}, harap masuk ke lodingan W-F-G.`;
        break;
      default:
    }
    const g = document.getElementById("repeat-driver"),
      y = g ? parseInt(g.value) : 1;
    (i.add(o),
      n.push({ id: o, msg: u, repeatsLeft: y - 1 }),
      b(o, "queued"),
      r(o, "queued"),
      a || m());
  }
  let u = !1;
  async function m() {
    if (u || 0 === n.length) return;
    if (((u = !0), (a = n.shift()), !a)) return void (u = !1);
    const { id: e, msg: t, repeatsLeft: o } = a;
    try {
      if (
        (b(e, "calling"),
        await r(e, "calling"),
        await TTS.speak(t),
        L(t),
        !i.has(e))
      )
        return;
      o > 0
        ? (await ((s = 1300), new Promise((e) => setTimeout(e, s))),
          a.repeatsLeft--,
          n.unshift(a),
          g())
        : (i.delete(e), b(e, "idle"), await r(e, "standby"), g());
    } catch (e) {
      g();
    }
    var s;
  }
  function g() {
    ((u = !1), (a = null), n.length > 0 && setTimeout(() => m(), 100));
  }
  function p(e) {
    (o[e] && (clearTimeout(o[e]), delete o[e]),
      i.delete(e),
      (n = n.filter((t) => t.id !== e)),
      b(e, "idle"),
      r(e, "standby"),
      a && a.id === e && (TTS.stop(), (u = !1), (a = null), m()));
  }
  function y() {
    "undefined" != typeof TTS && TTS.stop && TTS.stop();
    for (let e in o) clearTimeout(o[e]);
    ((o = {}),
      (n = []),
      i.clear(),
      (a = null),
      (u = !1),
      Object.keys(e).forEach((t) => {
        const n = e[t].status;
        ("calling" !== n && "queued" !== n) || (b(t, "idle"), r(t, "standby"));
      }),
      $("Semua antrean panggilan dihentikan!", "success"),
      "undefined" != typeof UI &&
        UI.addLog &&
        UI.addLog("Semua panggilan dihentikan operator", "err"));
  }
  async function v() {
    const t = document.getElementById("input-vendor"),
      n = document.getElementById("input-no-mobil"),
      a = t.value.trim(),
      o = n.value.trim();
    if (!a || !o)
      return void $("Harap isi Vendor/Nama dan No. Mobil!", "error");
    const i = "drv_" + o.replace(/\s+/g, "").toUpperCase(),
      d = !!e[i];
    a.substring(0, 2).toUpperCase();
    ((e[i] = { name: a, noMobil: o, status: "standby", jenis: "supir" }),
      await r(i),
      await s(),
      (t.value = ""),
      (n.value = ""),
      UI?.addLog &&
        (d
          ? UI.addLog(`Berhasil update supir: ${o}`, "tts")
          : UI.addLog(`Berhasil tambah supir: ${o}`, "tts")),
      I());
  }
  function f(e, n = !1) {
    const a = document.getElementById("driver-modal");
    (n || e?.target === a) && (a.classList.remove("open"), (t = null));
  }
  async function h() {
    const e = document.querySelectorAll(".drivers .driver-card");
    if (0 === e.length) return void $("Tidak ada armada di daftar!", "error");
    let t = 0;
    for (const n of e) {
      if ("none" === n.style.display) continue;
      const e = n.id.replace("card-", "");
      i.has(e) || (c(e, !0), t++);
    }
    if (t > 0) {
      const e = document.getElementById("input-search");
      (e && "" !== e.value.trim()
        ? ($(`${t} armada dari hasil pencarian masuk antrian!`, "success"),
          UI?.addLog &&
            UI.addLog(`Memanggil ${t} armada (Hasil Filter)`, "tts"))
        : ($(`${t} armada dimasukkan ke dalam antrian!`, "success"),
          UI?.addLog &&
            UI.addLog(`Memanggil ${t} armada secara berurutan`, "tts")),
        m());
    } else $("Semua armada yang dicari sudah ada dalam antrian!", "error");
  }
  function I() {
    const e = document.querySelectorAll(".drivers .driver-card"),
      t = document.getElementById("total-antrian");
    (t && (t.innerText = e.length),
      e.forEach((e, t) => {
        const n = e.querySelector(".queue-number");
        n && (n.innerText = (t + 1).toString().padStart(2, "0"));
      }));
  }
  function b(e, t) {
    const n = document.getElementById("btn-" + e),
      a = document.getElementById("card-" + e),
      o = document.getElementById("status-" + e);
    if (!n || !a || !o) return;
    const i = document.getElementById("jenis-" + e),
      s = a.querySelector(".icon-btn.edit"),
      r = a.querySelector(".icon-btn.del");
    "calling" === t || "queued" === t
      ? ("calling" === t
          ? ((n.innerHTML = "⏹ Stop"),
            (o.textContent = "Dipanggil"),
            (o.className = "driver-status calling"))
          : ((n.innerHTML = "⏹ Batal"),
            (o.textContent = "Antri..."),
            (o.className = "driver-status busy")),
        n.classList.remove("primary"),
        n.classList.add("calling-state"),
        a.classList.add("calling"),
        i && (i.disabled = !0),
        s && (s.disabled = !0),
        r && (r.disabled = !0))
      : ((n.innerHTML = "📢"),
        n.classList.remove("calling-state"),
        n.classList.add("primary"),
        a.classList.remove("calling"),
        (o.textContent = "Standby"),
        (o.className = "driver-status standby"),
        i && (i.disabled = !1),
        s && (s.disabled = !1),
        r && (r.disabled = !1));
  }
  function S() {
    const e = document.getElementById("custom-text"),
      t = document.getElementById("repeat-custom");
    if (!e) return;
    let n = e.value.trim();
    if (!n) return;
    const a = t ? parseInt(t.value) : 1,
      o = A(n, a);
    (TTS.speak(o),
      L(o),
      UI?.addLog && UI.addLog(`Pengumuman Custom (${a}x)`, "tts"),
      (e.value = ""),
      e.focus());
  }
  let T = [];
  function L(e) {
    if (!e || (T.length > 0 && T[0].text === e)) return;
    const t = new Date(),
      n =
        String(t.getHours()).padStart(2, "0") +
        ":" +
        String(t.getMinutes()).padStart(2, "0");
    (T.unshift({ text: e, time: n }),
      T.length > 10 && T.pop(),
      localStorage.setItem("callHistory", JSON.stringify(T)),
      E());
  }
  function E() {
    const e = [
      document.getElementById("history-container"),
      document.getElementById("history-container-announce"),
    ];
    let t = "";
    (0 === T.length
      ? (t =
          '<div style="font-size: 11px; color: var(--text-dim); text-align: center; padding: 10px;">Belum ada riwayat panggilan/pengumuman.</div>')
      : T.forEach((e, n) => {
          const a = String(n + 1).padStart(2, "0");
          t += `\n          <div class="history-item">\n            <div class="history-number">${a}</div>\n            \n            <div class="history-body">\n              <span class="history-time">${e.time}</span>\n              <span class="history-text">"${e.text}"</span>\n            </div>\n            \n            <div class="history-actions">\n              <button class="premium-btn btn-blue history-replay-btn" onclick="App.replayHistory(${n})">\n                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">\n                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>\n                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>\n                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>\n                </svg>\n                Try Call\n              </button>\n              \n              <button class="icon-btn del history-del-btn" title="Hapus Riwayat Ini" onclick="App.deleteHistoryItem(${n})">\n                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">\n                  <polyline points="3 6 5 6 21 6"></polyline>\n                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>\n                </svg>\n              </button>\n            </div>\n          </div>\n        `;
        }),
      e.forEach((e) => {
        e && (e.innerHTML = t);
      }));
  }
  let k = null,
    w = null,
    x = !1,
    B = 0;
  function M(e) {
    const t = Math.floor((e / 36e5) % 24),
      n = Math.floor((e / 1e3 / 60) % 60),
      a = Math.floor((e / 1e3) % 60);
    return (
      String(t).padStart(2, "0") +
      ":" +
      String(n).padStart(2, "0") +
      ":" +
      String(a).padStart(2, "0")
    );
  }
  function U(e = !1) {
    const t = document.getElementById("timer-select"),
      n = document.getElementById("timer-text");
    let a = "",
      o = 0,
      i = 1,
      s = 0,
      r = !1;
    if (e) {
      const e = JSON.parse(localStorage.getItem("autoTimerData"));
      if (!e) return;
      ((a = e.text),
        (o = e.endTime),
        (i = e.hours || 1),
        (r = e.isPaused || !1),
        (s = e.pausedTimeLeft || 0),
        n && (n.value = a),
        t && (t.value = i));
    } else {
      if (!t || !n) return;
      if (((a = n.value.trim()), !a))
        return void $("Teks pengumuman tidak boleh kosong!", "error");
      i = parseInt(t.value);
      const e = 60 * i * 60 * 1e3;
      ((o = Date.now() + e),
        localStorage.setItem(
          "autoTimerData",
          JSON.stringify({ text: a, endTime: o, hours: i, isPaused: !1 }),
        ),
        $(`Timer Looping aktif! Disiarkan setiap ${i} jam.`, "success"),
        UI?.addLog && UI.addLog(`Setel Looping Pengumuman: ${i} jam`, "tts"));
    }
    ((x = r), (B = s));
    const d = document.getElementById("btn-pause-timer");
    if (
      (d &&
        ((d.style.display = "inline-block"),
        (d.innerHTML = x ? "▶ Resume" : "⏸ Pause")),
      x)
    ) {
      const e = document.getElementById("timer-countdown");
      e &&
        ((e.style.display = "block"),
        (e.innerText = `⏸ Timer Di-pause | Sisa: ${M(B)}`),
        (e.style.color = "#ff9800"));
    } else C(a, o, i);
  }
  function C(e, t, n) {
    const a = document.getElementById("timer-countdown");
    let o = t - Date.now();
    if (o <= 0) {
      TTS.speak(e);
      const t = 60 * n * 60 * 1e3,
        a = Date.now() + t;
      return (
        localStorage.setItem(
          "autoTimerData",
          JSON.stringify({ text: e, endTime: a, hours: n, isPaused: !1 }),
        ),
        void C(e, a, n)
      );
    }
    function i() {
      const e = Date.now(),
        n = t - e;
      n <= 0
        ? clearInterval(w)
        : a && (a.innerText = `🔄 Repeat Mode | Sisa: ${M(n)}`);
    }
    (k && clearTimeout(k),
      w && clearInterval(w),
      a && ((a.style.display = "block"), (a.style.color = "#ff9800")),
      i(),
      (w = setInterval(i, 1e3)),
      (k = setTimeout(() => {
        (TTS.speak(e),
          UI?.addLog && UI.addLog("Auto-Panggil disiarkan (Looping)", "tts"));
        const t = 60 * n * 60 * 1e3,
          a = Date.now() + t;
        (localStorage.setItem(
          "autoTimerData",
          JSON.stringify({ text: e, endTime: a, hours: n, isPaused: !1 }),
        ),
          C(e, a, n));
      }, o)));
  }
  function D() {
    const e = document.getElementById("custom-text-drivers"),
      t = document.getElementById("repeat-custom-drivers");
    if (!e) return;
    let n = e.value.trim();
    if (!n) return;
    const a = t ? parseInt(t.value) : 1,
      o = A(n, a);
    (TTS.speak(o),
      L(o),
      UI?.addLog && UI.addLog(`Panggilan Manual Driver (${a}x)`, "tts"),
      (e.value = ""),
      e.focus());
  }
  function A(e, t) {
    if (t <= 1) return e;
    let n = [];
    for (let a = 0; a < t; a++) n.push(e);
    return n.join(". . ");
  }
  function $(e, t = "success") {
    let n = document.getElementById("toast-container");
    n ||
      ((n = document.createElement("div")),
      (n.id = "toast-container"),
      (n.className = "toast-container"),
      document.body.appendChild(n));
    const a = document.createElement("div");
    a.className = `toast ${t}`;
    const o =
      "error" === t
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2" width="16" height="16"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    ((a.innerHTML = `${o} <span>${e}</span>`),
      n.appendChild(a),
      setTimeout(() => {
        (a.classList.add("hiding"),
          a.addEventListener("animationend", () => a.remove()));
      }, 2e3));
  }
  function P() {
    const e = {
      vol: document.getElementById("vol")?.value,
      rate: document.getElementById("rate")?.value,
      pitch: document.getElementById("pitch")?.value,
      voice: document.getElementById("voice-select")?.value,
    };
    localStorage.setItem("ttsSettings", JSON.stringify(e));
  }
  async function N() {
    try {
      const e = await fetch("/api/is-server-pc");
      if (!e.ok) return !1;
      const t = await e.json();
      return !(!t || void 0 === t.is_server_pc) && t.is_server_pc;
    } catch (e) {
      return !1;
    }
  }
  function O() {
    const t =
        ("https:" === window.location.protocol ? "wss://" : "ws://") +
        window.location.host +
        "/ws",
      r = new WebSocket(t);
    ((r.onopen = () => {}),
      (r.onmessage = (t) => {
        const r = JSON.parse(t.data);
        if ("RELOAD_ALL" === r.event) s();
        else if ("DRIVER_SAVED" === r.event)
          e[r.id] && e[r.id].name === r.name && e[r.id].noMobil === r.noMobil
            ? ((e[r.id].status = r.status),
              ("standby" !== r.status && "idle" !== r.status) ||
                (void 0 !== i && i.delete(r.id),
                void 0 !== n && (n = n.filter((e) => e.id !== r.id)),
                void 0 !== o &&
                  o[r.id] &&
                  (clearTimeout(o[r.id]), delete o[r.id]),
                void 0 !== a &&
                  a &&
                  a.id === r.id &&
                  ("undefined" != typeof TTS && TTS.stop && TTS.stop(),
                  void 0 !== u && (u = !1),
                  (a = null),
                  setTimeout(() => m(), 150))),
              b(r.id, r.status))
            : s();
        else if ("TTS_START" === r.event) {
          const e = document.getElementById("output-text"),
            t = document.getElementById("wave");
          (e && ((e.innerText = r.text), e.classList.add("speaking")),
            t && t.classList.add("active"));
        } else if ("TTS_STOP" === r.event) {
          const e = document.getElementById("output-text"),
            t = document.getElementById("wave");
          (e &&
            ((e.innerText = "Menunggu panggilan..."),
            e.classList.remove("speaking")),
            t && t.classList.remove("active"));
        }
      }),
      (r.onclose = () => {
        setTimeout(O, 3e3);
      }),
      (r.onerror = (e) => {
        r.close();
      }));
  }
  return {
    init: async function () {
      (document.addEventListener("keydown", (e) => {
        if (
          ("Escape" === e.key && y(),
          e.ctrlKey &&
            "m" === e.key &&
            (e.preventDefault(), e.stopPropagation(), Mic.toggle()),
          "Enter" === e.key)
        )
          switch (document.activeElement.id) {
            case "custom-text":
              S();
              break;
            case "custom-text-drivers":
              D();
              break;
            case "input-vendor":
              (e.preventDefault(), v());
              break;
            default:
              break;
          }
      }),
        (function () {
          const e = document.getElementById("vol"),
            t = document.getElementById("rate"),
            n = document.getElementById("pitch"),
            a = document.getElementById("voice-select"),
            o = localStorage.getItem("ttsSettings");
          if (o) {
            const a = JSON.parse(o);
            (a.vol &&
              e &&
              ((e.value = a.vol),
              (document.getElementById("vol-val").textContent =
                Math.round(a.vol) + "%")),
              a.rate &&
                t &&
                ((t.value = a.rate),
                (document.getElementById("rate-val").textContent =
                  parseFloat(a.rate).toFixed(1) + "x")),
              a.pitch &&
                n &&
                ((n.value = a.pitch),
                (document.getElementById("pitch-val").textContent =
                  (a.pitch >= 0 ? "+" : "") + a.pitch + "Hz")));
          }
          (e &&
            e.addEventListener("input", function () {
              ((document.getElementById("vol-val").textContent =
                Math.round(this.value) + "%"),
                P());
            }),
            t &&
              t.addEventListener("input", function () {
                ((document.getElementById("rate-val").textContent =
                  parseFloat(this.value).toFixed(1) + "x"),
                  P());
              }),
            n &&
              n.addEventListener("input", function () {
                ((document.getElementById("pitch-val").textContent =
                  (this.value >= 0 ? "+" : "") + this.value + "Hz"),
                  P());
              }),
            a && a.addEventListener("change", P));
        })(),
        (function () {
          const e = navigator.userAgent;
          let t = "Unknown Browser";
          e.includes("Edg")
            ? (t = "Microsoft Edge")
            : e.includes("Chrome")
              ? (t = "Google Chrome")
              : e.includes("Firefox")
                ? (t = "Mozilla Firefox")
                : e.includes("Safari") && (t = "Apple Safari");
          let n = "Unknown OS";
          (e.includes("Win")
            ? (n = "Windows")
            : e.includes("Mac")
              ? (n = "MacOS")
              : e.includes("Linux")
                ? (n = "Linux")
                : e.includes("Android") && (n = "Android"),
            (document.getElementById("sys-client").textContent =
              `${t} on ${n}`));
          const a = window.SpeechRecognition || window.webkitSpeechRecognition,
            o = document.getElementById("sys-mic");
          a
            ? ((o.textContent = "✅ Supported (Web Speech API)"),
              (o.style.color = "var(--green)"))
            : ((o.textContent = "❌ Not Supported"),
              (o.style.color = "var(--red)"));
        })(),
        (function () {
          const e = document.getElementById("timer-text");
          e &&
            ((e.value = CONFIG.DEFAULT_TIMER_TEXT.replace(/\s+/g, " ")
              .replace(/\s*\n\s*/g, "\n")
              .trim()),
            ["custom-text", "custom-text-drivers"].forEach((e) => {
              const t = document.getElementById(e);
              t &&
                (t.addEventListener("focus", function () {
                  "" === this.value.trim() &&
                    (this.value = "Panggilan kepada ");
                }),
                t.addEventListener("blur", function () {
                  "Panggilan kepada" === this.value.trim() && (this.value = "");
                }));
            }));
        })(),
        (function () {
          const e = document.getElementById("scroll-top-btn"),
            t = document.querySelector(".tabnav");
          let n = t ? t.offsetTop : 0;
          (window.addEventListener("resize", () => {
            t && !t.classList.contains("is-sticky") && (n = t.offsetTop);
          }),
            window.addEventListener("scroll", () => {
              (e &&
                (window.scrollY > 200
                  ? e.classList.add("show")
                  : e.classList.remove("show")),
                t &&
                  (window.scrollY > n
                    ? t.classList.add("is-sticky")
                    : t.classList.remove("is-sticky")));
            }));
        })(),
        (function () {
          const e = localStorage.getItem("callHistory");
          e && ((T = JSON.parse(e)), E());
        })(),
        await s(),
        O());
      const e = document.getElementById("sys-db");
      if (
        (e &&
          ((e.innerText = "✅ Terhubung (Local Database)"),
          (e.style.color = "var(--green)")),
        U(!0),
        "light" === localStorage.getItem("theme"))
      ) {
        document.body.classList.add("light-mode");
        const e = document.getElementById("icon-moon"),
          t = document.getElementById("icon-sun");
        e && t && ((e.style.display = "none"), (t.style.display = "block"));
      }
      const t = await N(),
        n = document.getElementById("admin-voice-settings");
      if (n && !t) {
        n.querySelectorAll("input, select").forEach((e) => {
          ((e.disabled = !0),
            (e.style.opacity = "0.5"),
            (e.style.cursor = "not-allowed"));
        });
        const e = n.querySelector("button");
        e && (e.style.display = "none");
        n.firstElementChild.insertAdjacentHTML(
          "afterend",
          '\n          <div style="color: var(--text-muted); font-size: 12px; text-align: center;font-style: italic; margin-bottom: 16px; padding: 6px 8px; background: rgba(0,0,0,0.05); border-radius: 4px;">\n            🔒 Pengaturan suara hanya dapat diubah dari PC Server (Admin) -> https://localhost:8888 .\n          </div>\n        ',
        );
      }
      const a = document.getElementById("admin-timer-settings");
      if (a && !t) {
        a.querySelectorAll("textarea, select").forEach((e) => {
          ((e.disabled = !0),
            (e.style.opacity = "0.5"),
            (e.style.cursor = "not-allowed"));
        });
        const e = document.getElementById("timer-lock-note");
        e && (e.style.display = "block");
        const t = document.getElementById("btn-set-timer"),
          n = document.getElementById("btn-cancel-timer"),
          o = document.getElementById("btn-pause-timer"),
          i = (e) => {
            e &&
              ((e.disabled = !0),
              (e.style.opacity = "0.5"),
              (e.style.cursor = "not-allowed"));
          };
        (i(t), i(n), i(o));
      }
      try {
        await TTS.loadVoices();
        const e = localStorage.getItem("ttsSettings");
        if (e) {
          const t = JSON.parse(e),
            n = document.getElementById("voice-select");
          t.voice && n && (n.value = t.voice);
        }
        const t = document.getElementById("sys-tts");
        (t &&
          ((t.textContent = "✅ Connected (Local API)"),
          (t.style.color = "var(--green)")),
          UI.addLog("Sistem siap. ESC = Stop Semua | Ctrl+M = Mic", "tts"));
      } catch (e) {
        const t = document.getElementById("sys-tts");
        (t &&
          ((t.textContent = "❌ Disconnected (Server Offline)"),
          (t.style.color = "var(--red)")),
          UI.addLog("Gagal terhubung ke server TTS", "err"));
      }
    },
    callDriver: c,
    stopAll: y,
    speakCustom: S,
    processVoiceCommand: function (t) {
      if (t.includes("stop") || t.includes("berhenti"))
        return (y(), void TTS.speak("Panggilan dihentikan."));
      if (t.includes("semua") || t.includes("all")) return void h();
      let n = !1;
      const a = t.replace(/\s+/g, "").toLowerCase();
      (Object.entries(e).forEach(([e, t]) => {
        const o = t.noMobil.replace(/\s+/g, "").toLowerCase();
        a.includes(o) && (c(e), (n = !0));
      }),
        !n && UI?.addLog && UI.addLog(`Tidak ditemukan: "${t}"`, "err"));
    },
    tambahDriver: v,
    editDriver: function (n) {
      const a = e[n];
      a
        ? ((t = n),
          (document.getElementById("modal-vendor").value = a.name),
          (document.getElementById("modal-no-mobil").value = a.noMobil),
          document.getElementById("driver-modal").classList.add("open"))
        : $("Data supir tidak ditemukan!", "error");
    },
    hapusDriver: async function (t) {
      i.has(t) && p(t);
      const n = document.getElementById("card-" + t);
      (n && n.remove(),
        delete e[t],
        await (async function (e) {
          await fetch(`/api/drivers/${e}`, { method: "DELETE" });
        })(t),
        await s(),
        UI?.addLog && UI.addLog("Armada dihapus", "err"),
        I());
    },
    simpanEditDriver: async function () {
      if (!t) return;
      const n = document.getElementById("modal-vendor").value.trim(),
        a = document.getElementById("modal-no-mobil").value.trim();
      if (!n || !a)
        return void $("Harap isi Vendor/Nama dan No. Mobil!", "error");
      e[t] && ((e[t].name = n), (e[t].noMobil = a));
      const o = document.getElementById("card-" + t);
      (o &&
        ((o.querySelector(".avatar").innerText = n
          .substring(0, 2)
          .toUpperCase()),
        (o.querySelector(".driver-name").innerText = n),
        (o.querySelector(".driver-detail").innerText = a)),
        await r(t),
        await s(),
        UI?.addLog && UI.addLog(`Berhasil update: ${n}`, "tts"),
        f(null, !0));
    },
    tutupModal: f,
    showToast: $,
    hapusSemuaDriver: function () {
      0 !== document.querySelectorAll(".drivers .driver-card").length
        ? Swal.fire({
            title: "Hapus Semua Antrean?",
            text: "Data akan terhapus permanen dari layar dan database. Proses ini tidak bisa dibatalkan!",
            icon: "warning",
            showCancelButton: !0,
            confirmButtonColor: "var(--red)",
            cancelButtonColor: "var(--bg-card)",
            confirmButtonText: "Ya, Kosongkan!",
            cancelButtonText: "Batal",
            background: "var(--bg-main)",
            color: "var(--text)",
          }).then((t) => {
            t.isConfirmed &&
              (y(),
              (document.querySelector(".drivers").innerHTML = ""),
              Object.keys(e).forEach((t) => delete e[t]),
              (async function () {
                await fetch("/api/drivers_all", { method: "DELETE" });
              })(),
              I(),
              UI?.addLog && UI.addLog("Semua antrian dikosongkan", "err"),
              $("Seluruh antrian berhasil dikosongkan!", "success"));
          })
        : $("Tidak ada armada dalam antrian", "error");
    },
    panggilSemuaDriver: h,
    updateAntrian: I,
    switchTab: function (e, t) {
      (document
        .querySelectorAll(".tab")
        .forEach((e) => e.classList.remove("active")),
        document
          .querySelectorAll(".panel")
          .forEach((e) => e.classList.remove("active")),
        t.classList.add("active"),
        document.getElementById("panel-" + e).classList.add("active"));
    },
    resetInput: function (e) {
      const t = document.getElementById(e);
      t && (t.focus(), (t.value = ""));
    },
    speakTemplate: function (e) {
      (TTS.speak(e), L(finalText));
    },
    speakCustomDrivers: D,
    testSpeaker: function () {
      (TTS.speak("Speaker ready dan siap digunakan!, "),
        $("Menguji speaker...", "success"),
        UI?.addLog && UI.addLog("Menjalankan test speaker", "tts"));
    },
    refreshTTS: async function () {
      $("Me-refresh sistem TTS...", "success");
      const e = document.getElementById("sys-tts");
      e &&
        ((e.textContent = "Menghubungkan ulang..."),
        (e.style.color = "var(--text-mid)"));
      try {
        (await TTS.loadVoices(),
          e &&
            ((e.textContent = "✅ Connected (Local API)"),
            (e.style.color = "var(--green)")),
          $("Sistem berjalan dengan baik dan siap digunakan!", "success"),
          UI?.addLog && UI.addLog("Sistem di-refresh & siap digunakan", "tts"));
      } catch (t) {
        (e &&
          ((e.textContent = "❌ Disconnected (Server Offline)"),
          (e.style.color = "var(--red)")),
          $("Gagal terhubung ke server TTS!", "error"),
          UI?.addLog && UI.addLog("Gagal refresh TTS", "err"));
      }
    },
    uploadData: function (t) {
      const n = t.target.files[0];
      if (!n) return;
      $("Membaca file Excel...", "success");
      const a = new FileReader();
      ((a.onload = async (n) => {
        try {
          const a = new Uint8Array(n.target.result),
            o = XLSX.read(a, { type: "array" }),
            i = o.SheetNames[0],
            d = o.Sheets[i],
            l = XLSX.utils.sheet_to_json(d);
          let c = 0,
            u = 0;
          for (let t of l) {
            const n = t.Vendor || t.vendor || t.Nama || t.nama || "Unknown",
              a = t["No Mobil"] || t["no mobil"] || t.Plat || t.plat || "";
            if (a) {
              const t = "drv_" + String(a).replace(/\s+/g, "").toUpperCase();
              (e[t] ? u++ : c++,
                (e[t] = {
                  name: n,
                  noMobil: String(a),
                  status: "standby",
                  jenis: "supir",
                }),
                await r(t));
            }
          }
          (await s(),
            I(),
            c > 0 || u > 0
              ? ($(
                  `${c} armada baru ditambah, ${u} armada diperbarui!`,
                  "success",
                ),
                UI?.addLog &&
                  UI.addLog(`Upload massal: ${c} baru, ${u} update`, "tts"))
              : $("Data kosong atau format kolom salah!", "error"));
        } catch (e) {
          $("Gagal membaca file Excel!", "error");
        } finally {
          t.target.value = "";
        }
      }),
        a.readAsArrayBuffer(n));
    },
    downloadTemplate: function () {
      const e = XLSX.utils.json_to_sheet([
        { Vendor: "Contoh: CV Maju Jaya", "No Mobil": "B 1234 ABC" },
        { Vendor: "Contoh: PT Logistik Aman", "No Mobil": "D 5678 XYZ" },
      ]);
      e["!cols"] = [{ wch: 25 }, { wch: 20 }];
      const t = XLSX.utils.book_new();
      (XLSX.utils.book_append_sheet(t, e, "Template_Antrean"),
        XLSX.writeFile(t, "Template_Antrean_Supir.xlsx"),
        $("Template berhasil didownload!", "success"),
        UI?.addLog && UI.addLog("Template Excel didownload", "tts"));
    },
    findDriver: d,
    fetchDrivers: s,
    scheduleAnnouncement: U,
    cancelAnnouncement: function () {
      const e = document.getElementById("timer-countdown"),
        t = document.getElementById("btn-pause-timer");
      let n = !1;
      (k && (clearTimeout(k), (k = null), (n = !0)),
        w && (clearInterval(w), (w = null)),
        (x = !1),
        (B = 0),
        e && (e.style.display = "none"),
        t && (t.style.display = "none"),
        localStorage.removeItem("autoTimerData"),
        n || null !== JSON.parse(localStorage.getItem("autoTimerData"))
          ? ($("Timer Auto-Panggil berhasil dibatalkan!", "success"),
            UI?.addLog && UI.addLog("Timer Auto-Panggil dibatalkan", "err"))
          : $("Tidak ada timer yang sedang aktif.", "error"));
    },
    togglePauseAnnouncement: function () {
      const e = JSON.parse(localStorage.getItem("autoTimerData"));
      if (!e) return;
      const t = document.getElementById("timer-countdown"),
        n = document.getElementById("btn-pause-timer");
      if (x) {
        x = !1;
        const t = Date.now() + B;
        ((e.endTime = t),
          (e.isPaused = !1),
          localStorage.setItem("autoTimerData", JSON.stringify(e)),
          C(e.text, t, e.hours),
          n && (n.innerHTML = "⏸ Pause"),
          $("Timer dilanjutkan!", "success"),
          UI?.addLog && UI.addLog("Timer Auto-Panggil dilanjutkan", "info"));
      } else
        ((x = !0),
          (B = e.endTime - Date.now()),
          k && clearTimeout(k),
          w && clearInterval(w),
          (e.isPaused = !0),
          (e.pausedTimeLeft = B),
          localStorage.setItem("autoTimerData", JSON.stringify(e)),
          t &&
            ((t.innerText = `⏸ Timer Di-pause | Sisa: ${M(B)}`),
            (t.style.color = "var(--red)")),
          n && (n.innerHTML = "▶ Resume"),
          $("Timer di-pause!", "info"),
          UI?.addLog && UI.addLog("Timer Auto-Panggil di-pause", "err"));
    },
    reconnectDatabase: async function () {
      const e = document.getElementById("sys-db");
      (e && ((e.innerText = "Mencoba ulang..."), (e.style.color = "#ff9800")),
        $("Mencoba menghubungkan ulang ke database...", "info"));
      try {
        const t = await fetch("/api/reconnect-db", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          }),
          n = await t.json();
        if (!t.ok) throw new Error(n.detail || "Gagal merespon dengan baik");
        (e &&
          ((e.innerText = "✅ Terhubung (Local Database)"),
          (e.style.color = "var(--green)")),
          $("Database berhasil terhubung!", "success"),
          "undefined" != typeof UI &&
            UI.addLog &&
            UI.addLog("Koneksi Database diperbarui", "sys"),
          "function" == typeof this.fetchDrivers ? this.fetchDrivers() : s());
      } catch (t) {
        (e &&
          ((e.innerText = "Terputus (Disconnected)"),
          (e.style.color = "var(--red)")),
          $("Gagal terhubung ke database. Cek server backend!", "error"),
          "undefined" != typeof UI &&
            UI.addLog &&
            UI.addLog("Gagal reconnect database: " + t.message, "err"));
      }
    },
    toggleTheme: function () {
      const e = document.body,
        t = document.getElementById("icon-moon"),
        n = document.getElementById("icon-sun");
      (e.classList.toggle("light-mode"),
        e.classList.contains("light-mode")
          ? ((t.style.display = "none"),
            (n.style.display = "block"),
            localStorage.setItem("theme", "light"),
            $("Mode Siang Aktif", "info"))
          : ((t.style.display = "block"),
            (n.style.display = "none"),
            localStorage.setItem("theme", "dark"),
            $("Mode Malam Aktif", "info")));
    },
    resetVoiceSettings: function () {
      const e = document.getElementById("rate"),
        t = document.getElementById("pitch"),
        n = document.getElementById("vol"),
        a = document.getElementById("voice-select");
      if (e) {
        e.value = 0.9;
        const t = document.getElementById("rate-val");
        t && (t.innerText = "0.9x");
      }
      if (t) {
        t.value = 10;
        const e = document.getElementById("pitch-val");
        e && (e.innerText = "+10Hz");
      }
      if (n) {
        n.value = 100;
        const e = document.getElementById("vol-val");
        e && (e.innerText = "100%");
      }
      (a && (a.selectedIndex = 48),
        localStorage.removeItem("ttsSettings"),
        $("Pengaturan suara dikembalikan ke bawaan awal!", "success"),
        "undefined" != typeof UI &&
          UI.addLog &&
          UI.addLog("Pengaturan suara di-reset", "info"));
    },
    scrollToTop: function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    checkServerPC: N,
    replayHistory: function (e) {
      const t = T[e];
      t &&
        t.text &&
        (TTS.speak(t.text),
        UI?.addLog && UI.addLog("Memanggil ulang dari riwayat", "tts"));
    },
    clearHistory: function () {
      ((T = []),
        localStorage.removeItem("callHistory"),
        E(),
        UI?.addLog && UI.addLog("Riwayat panggilan dihapus", "err"));
    },
    deleteHistoryItem: function (e) {
      (T.splice(e, 1),
        localStorage.setItem("callHistory", JSON.stringify(T)),
        E(),
        UI?.addLog && UI.addLog("Satu item riwayat dihapus", "err"));
    },
  };
})();
document.addEventListener("DOMContentLoaded", App.init);
