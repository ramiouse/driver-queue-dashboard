// ── app.js — main logic, init, driver calls ──────────

const App = (() => {
  let drivers = {};
  let editingDriverId = null;
  let isServerPC = false;
  let isProcessing = false;

  // ── GENERATOR ID AMAN (PENGGANTI crypto.randomUUID) ──
  function generateSafeID() {
    // Gabungan waktu saat ini (biar unik) + angka acak
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  }

  // ── HELPER UNTUK MENGEJA TEKS DI DALAM LINGKUP [ ] ──
  function prosesEjaanDalamKurung(str) {
    // Regex ini akan mencari semua teks yang dibungkus [ ]
    return str.replace(/\[(.*?)\]/g, (match, kata) => {
      return kata
        .replace(/\s+/g, "") // Hapus spasi gak penting di dalem kurung
        .split("") // Pecah jadi per karakter huruf
        .map((c) => (c.toUpperCase() === "Z" ? "Jet" : c)) // Logic huruf Z jadi 'Jet' bawaan lu
        .join(" "); // Gabungkan kembali dengan spasi biar dieja
    });
  }

  // ── ANTRIAN ──────────────────────────────────────
  let callQueue = [];
  let isSpeakingQueue = false;
  let currentActiveCall = null;
  let callTimers = {};
  const activeDrivers = new Set();

  // ── SQLITE SYNC & POLLING (MULTI-ADMIN) ──────────
  async function fetchDrivers(toast = false) {
    try {
      const res = await fetch("/api/drivers");
      const remoteData = await res.json();

      // Hanya re-render layar JIKA ada perubahan data dari PC lain (Biar layar tidak kedip)
      if (JSON.stringify(drivers) !== JSON.stringify(remoteData)) {
        drivers = remoteData;
        if (typeof renderDrivers === "function") renderDrivers();

        syncSpeakerUIFromDB();

        Object.keys(drivers).forEach((id) => {
          const statusDB = drivers[id].status;
          if (statusDB !== "standby" || statusDB !== "idle") {
            if (typeof updateUIState === "function") {
              updateUIState(id, statusDB);
            }
          }
        });
      }

      if (typeof showToast === "function" && toast) {
        showToast("Data diperbarui!", "success");
      }
    } catch (err) {
      console.error("Gagal sinkronisasi dengan database", err);
    }
  }

  // Contoh logika pembersih di dalam fetchDrivers atau init:
  async function resetGhostStatus() {
    for (let id in drivers) {
      if (drivers[id].status === "calling" || drivers[id].status === "queued") {
        drivers[id].status = "standby";
        await saveDriverDB(id, "standby"); // Timpa ke DB

        // 👉 TAMBAHAN: Paksa layarnya balik ke normal (standby)
        if (typeof updateUIState === "function") {
          updateUIState(id, "standby");
        }
      }
    }
    updateAntrian();
  }

  // ── RECOVERY ANTREAN SETELAH REFRESH ──
  async function resumeQueueFromDB() {
    let recoveredCount = 0;
    let wasCalling = null;
    let wasQueued = [];

    // 1. Kumpulkan data dari memory 'drivers' (Data dari DB)
    for (let id in drivers) {
      if (drivers[id].status === "calling") {
        wasCalling = id;
      } else if (drivers[id].status === "queued") {
        wasQueued.push(id);
      }
    }

    // Helper untuk merakit ulang teks panggilan
    const buildQueueItem = (id) => {
      const driver = drivers[id];

      // 🚀 AMBIL DARI DATABASE (Bukan dari layar HTML)
      const jenis = driver.jenis || "supir";
      const jumlahRepeat = driver.repeat || 1;

      // Susun ulang ejaan plat nomor
      const noMobilEja = driver.noMobil
        ? driver.noMobil
            .replace(/\s+/g, "")
            .split("")
            .map((char) => (char.toUpperCase() === "Z" ? "Jet" : char))
            .join(" ")
        : driver.name;

      // Susun ulang pesan
      let msg = "";
      if (jenis === "supir")
        msg = `Panggilan kepada supir, plat nomor ${noMobilEja}, untuk ke loket W-F-G.`;
      else if (jenis === "loading")
        msg = `Supir dengan plat nomor ${noMobilEja}, harap masuk ke lodingan W-F-G.`;

      return { id, msg, repeatsLeft: Math.max(0, jumlahRepeat - 1) };
    };

    // 2. Susun ulang antrean (Yang calling ditaruh paling depan)
    if (wasCalling) {
      callQueue.push(buildQueueItem(wasCalling));
      activeDrivers.add(wasCalling);
      recoveredCount++;
    }

    wasQueued.forEach((id) => {
      callQueue.push(buildQueueItem(id));
      activeDrivers.add(id);
      recoveredCount++;
    });

    // 3. 🚀 LANGSUNG EKSEKUSI (Bypass Autoplay Browser!)
    if (recoveredCount > 0) {
      if (typeof showToast === "function") {
        showToast(
          `Memulihkan ${recoveredCount} antrean secara otomatis!`,
          "info",
        );
      }
      if (UI?.addLog) {
        UI.addLog(`Memulihkan ${recoveredCount} antrean otomatis...`, "sys");
      }

      // Langsung gas nyalain mesin tanpa nunggu klik operator
      if (typeof isProcessing !== "undefined" && !isProcessing) {
        processQueue();
      }
    }

    if (typeof updateAntrian === "function") {
      updateAntrian();
    }
  }

  // ── FITUR INGATAN JUMLAH PANGGILAN ──
  function initRepeatMemory() {
    const repeatEl = document.getElementById("repeat-driver"); // Pastikan ID ini sesuai sama yang ada di HTML lu

    if (repeatEl) {
      // 1. Cek apakah ada nilai yang tersimpan sebelumnya di memori browser
      const savedRepeat = localStorage.getItem("savedRepeatValue");
      if (savedRepeat) {
        repeatEl.value = savedRepeat; // Balikin ke nilai terakhir (misal: 2 atau 3)
      }

      // 2. Setiap kali operator ngubah pilihan, otomatis simpan ke memori
      repeatEl.addEventListener("change", function () {
        localStorage.setItem("savedRepeatValue", this.value);
      });
    }
  }

  async function saveDriverDB(id, customStatus = null, customRepeat = null) {
    const d = drivers[id];
    if (!d) return;

    const selectEl = document.getElementById("jenis-" + id);
    const jenisVal = selectEl ? selectEl.value : d.jenis || "supir";

    // 🚀 Ambil nilai repeat. Kalau gak dikirim dari parameter, baca dari layar client.
    let jumlahRepeat = customRepeat;
    if (jumlahRepeat === null) {
      const repeatEl = document.getElementById("repeat-driver");
      jumlahRepeat = repeatEl ? parseInt(repeatEl.value) : 1;
    }

    // Gunakan customStatus jika ada, jika tidak pakai yang di DB
    const finalStatus =
      customStatus !== null ? customStatus : d.status || "standby";

    d.status = finalStatus;
    d.jenis = jenisVal;
    d.repeat = jumlahRepeat; // (Opsional) simpan di memori lokal juga

    // Jalankan request ke Node.js lu
    await fetch("/api/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: id,
        name: d.name,
        noMobil: d.noMobil,
        status: finalStatus,
        jenis: jenisVal,
        jumlahRepeat: jumlahRepeat, // 🚀 <--- Ini kuncinya! Bawa settingan dari Client ke Server
      }),
    });
  }

  async function deleteDriverDB(id) {
    await fetch(`/api/drivers/${id}`, { method: "DELETE" });
  }

  async function deleteAllDriversDB() {
    await fetch("/api/drivers_all", { method: "DELETE" });
  }

  // ── PENCARIAN DRIVER (MULTIPLE) ──────────────────
  function findDriver() {
    const searchInput = document.getElementById("input-search");
    if (!searchInput) return;

    const query = searchInput.value.toLowerCase().trim();
    const cards = document.querySelectorAll(".drivers .driver-card");

    // Jika input kosong, tampilkan semua kartu
    if (!query) {
      cards.forEach((card) => (card.style.display = "flex"));
      return;
    }

    // Pisahkan kata kunci berdasarkan koma dan hapus spasi berlebih
    const searchTerms = query
      .split(",")
      .map((term) => term.trim())
      .filter((term) => term !== "");

    // Loop semua kartu di layar
    cards.forEach((card) => {
      const name = card.querySelector(".driver-name").innerText.toLowerCase();
      const noMobil = card
        .querySelector(".driver-detail")
        .innerText.toLowerCase();

      // Cek apakah ada minimal SATU kata kunci yang cocok dengan Nama atau No Mobil
      const isMatch = searchTerms.some(
        (term) => name.includes(term) || noMobil.includes(term),
      );

      if (isMatch) {
        card.style.display = "flex"; // Tampilkan jika cocok
      } else {
        card.style.display = "none"; // Sembunyikan jika tidak cocok
      }
    });
  }

  function renderDrivers() {
    const container = document.querySelector(".drivers");
    if (!container) return;

    container.innerHTML = ""; // Bersihkan layar dulu

    // Gambar ulang setiap kartu dari data yang ada
    Object.entries(drivers).forEach(([id, driver]) => {
      const vendor = driver.name;
      const noMobil = driver.noMobil;
      const avatarInitials = vendor.substring(0, 2).toUpperCase();

      // ── TAMBAHAN NORMALISASI STATUS (BIAR WARNA SERAGAM) ──
      let currentStatus = (driver.status || "standby").toLowerCase().trim();
      if (currentStatus === "idle" || currentStatus === "") {
        currentStatus = "standby";
      }

      const cardHTML = `
        <div class="driver-card" id="card-${id}">
          <div class="queue-number">00</div>
          <div class="avatar">${avatarInitials}</div>
          <div class="driver-info">
            <div class="driver-name">${vendor}</div>
            <div class="driver-detail">${noMobil}</div>
          </div>
          <span class="driver-status ${driver.status || "standby"}" id="status-${id}">Standby</span>
          <div class="actions">
            <select class="card-select" id="jenis-${id}">
              <option value="supir">Office</option>
              <option value="loading">Loading</option>
            </select>
            <button class="icon-btn edit" title="Edit" onclick="App.editDriver('${id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn del" title="Delete" onclick="App.hapusDriver('${id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
            <button class="call-btn primary" id="btn-${id}" onclick="App.callDriver('${id}')">📢</button>
          </div>
        </div>`;
      container.insertAdjacentHTML("beforeend", cardHTML);
    });

    updateAntrian();
    findDriver();
  }

  // ── PANGGIL DRIVER ───────────────────────────────
  // silent=true: hanya push ke queue, tidak trigger processQueue
  function callDriver(rawId, silent = false) {
    const id = String(rawId);
    const driver = drivers[id];
    if (!driver) return;

    if (
      driver.status === "calling" ||
      driver.status === "queued" ||
      activeDrivers.has(id)
    ) {
      stopDriver(id);
      return;
    }

    const selectEl = document.getElementById("jenis-" + id);
    const jenis = selectEl ? selectEl.value : "supir";

    // ── BACA SETTINGAN DROPDOWN REPEAT ──
    const repeatEl = document.getElementById("repeat-driver");
    const jumlahRepeat = repeatEl ? parseInt(repeatEl.value) : 1;

    if (!isServerPC) {
      console.log("ADMIN SEDANG AKTIF calldriver");
      drivers[id].status = "queued";
      drivers[id].jenis = jenis;
      drivers[id].repeat = jumlahRepeat;

      updateUIState(id, "queued");
      // 🚀 PASTIKAN fungsi saveDriverDB lu juga ngirim jenis & jumlahRepeat ke server/WS
      saveDriverDB(id, "queued", jumlahRepeat).catch(console.error);
      return; // Stop sampai di sini untuk PC Client
    }

    const noMobilEja = driver.noMobil
      ? driver.noMobil
          .replace(/\s+/g, "") // 1. Hapus semua spasi
          .split("") // 2. Pecah jadi huruf/angka tunggal (B,2,1,3,4,X,Y,Z)
          .map((char) => (char.toUpperCase() === "Z" ? "Jet" : char)) // 3. Kalau ketemu Z, ganti jadi "Zet" utuh
          .join(" ") // 4. Gabung lagi dengan jeda (B/2/1/3/4/X/Y/Zet)
      : driver.name;

    // --- LOGIKA TEMPLATE CALL ---
    let msg = "";
    switch (jenis) {
      case "supir":
        msg = `Panggilan kepada supir, plat nomor ${noMobilEja}, untuk ke loket W-F-G.`;
        break;
      case "loading":
        msg = `Supir dengan plat nomor ${noMobilEja}, harap masuk ke lodingan W-F-G.`;
        break;
      default:
    }

    activeDrivers.add(id);

    // ── MASUKKAN KE DALAM QUEUE JAVASCRIPT ──
    callQueue.push({ id, msg, repeatsLeft: Math.max(0, jumlahRepeat - 1) });

    updateUIState(id, "queued");

    saveDriverDB(id, "queued", jumlahRepeat).catch(console.error);

    if (!silent) {
      processQueue();
    }
  }

  function syncSpeakerUIFromDB() {
    // 1. Cari driver mana yang statusnya 'calling' di memori drivers
    const activeDriverId = Object.keys(drivers).find(
      (id) => drivers[id].status === "calling",
    );

    const outText = document.getElementById("output-text");
    const wave = document.getElementById("wave");

    if (activeDriverId) {
      const driver = drivers[activeDriverId];

      // 2. Rakit ulang pesan yang harusnya sedang dibaca
      // Gunakan logika perakitan yang sama dengan yang ada di server/queue
      const noMobilEja = driver.noMobil
        ? driver.noMobil
            .replace(/\s+/g, "")
            .split("")
            .map((c) => (c.toUpperCase() === "Z" ? "Jet" : c))
            .join(" ")
        : driver.name;

      const msg =
        driver.jenis === "loading"
          ? `Supir dengan plat nomor ${noMobilEja}, harap masuk ke lodingan W-F-G.`
          : `Panggilan kepada supir, plat nomor ${noMobilEja}, untuk ke loket W-F-G.`;

      // 3. Update UI
      if (outText) {
        outText.innerText = msg;
        outText.classList.add("speaking");
      }
      if (wave) wave.classList.add("active");
    } else {
      // Jika tidak ada yang calling, pastikan UI kembali ke default
      if (outText) {
        outText.innerText = "Menunggu panggilan...";
        outText.classList.remove("speaking");
      }
      if (wave) wave.classList.remove("active");
    }
  }

  // FUNGSI BARU: Khusus Server untuk menangkap panggilan dari PC Client
  // 🚀 Tambahkan parameter remoteRepeat di fungsi ini
  function serverHandleRemoteCall(id, jenis, remoteRepeat = null) {
    if (!isServerPC || activeDrivers.has(id)) return;
    console.log("ADMIN SEDANG AKTIF parameter");
    const driver = drivers[id];
    if (!driver) return;

    const noMobilEja = driver.noMobil
      ? driver.noMobil
          .replace(/\s+/g, "")
          .split("")
          .map((c) => (c.toUpperCase() === "Z" ? "Jet" : c))
          .join(" ")
      : driver.name;

    let msg =
      jenis === "loading"
        ? `Supir dengan plat nomor ${noMobilEja}, harap masuk ke lodingan W-F-G.`
        : `Panggilan kepada supir, plat nomor ${noMobilEja}, untuk ke loket W-F-G.`;

    // 🚀 JIKA ADA KIRIMAN DARI CLIENT, PAKAI ITU. Kalo gak ada, baru baca dropdown Server.
    let jumlahRepeat = remoteRepeat ? parseInt(remoteRepeat) : null;
    if (!jumlahRepeat || isNaN(jumlahRepeat)) {
      const repeatEl = document.getElementById("repeat-driver");
      jumlahRepeat = repeatEl ? parseInt(repeatEl.value) : 1;
    }

    activeDrivers.add(id);

    callQueue.push({ id, msg, repeatsLeft: Math.max(0, jumlahRepeat - 1) });

    updateUIState(id, "queued");
    processQueue();
  }

  // ── ENGINE ANTRIAN (async) ───────────────────────
  // Flag synchronous terpisah untuk cegah double-entry sebelum await
  // ── ENGINE ANTRIAN UTAMA ───────────────────────
  async function processQueue() {
    // 1. Single Lock: Cek apakah sedang memproses atau antrean kosong
    // Komentar disesuaikan karena isSpeakingQueue sudah resmi pensiun
    if (isProcessing || callQueue.length === 0) return;

    isProcessing = true; // Kunci SYNCHRONOUS — langsung, sebelum await apapun
    // isSpeakingQueue = true; // Sudah tidak dipakai

    currentActiveCall = callQueue.shift();
    if (!currentActiveCall) {
      isProcessing = false;
      return;
    }
    const { id, msg, repeatsLeft } = currentActiveCall;

    console.log(
      `▶ processQueue sedang dijalankan untuk: ${id} | queue sisa: ${callQueue.length}`,
    );

    try {
      updateUIState(id, "calling");

      // UBAHAN 1 LU (Bagus!): Hapus 'await' ganti jadi .catch() biar DB gak nahan speed suara
      saveDriverDB(id, "calling").catch(console.error);

      // TETAP PAKAI AWAIT: Tunggu Python (TTS) sampai benar-benar beres bersuara
      await TTS.speak(msg);

      // Masukkan ke riwayat setelah panggilan selesai dikumandangkan
      if (typeof addHistory === "function") {
        addHistory(msg);
      }

      // 3. CEK ULANG: Kali aja supir ini di-stop manual oleh operator saat dia lagi ngomong
      if (!activeDrivers.has(id)) {
        console.log(`[Queue] ID ${id} di-stop saat berbicara.`);
        cleanupAndNext(); // 🚀 FIX: WAJIB dinyalain biar isProcessing balik jadi false & lanjut ke antrean berikutnya!
        return;
      }

      // 4. LOGIKA PENGULANGAN PANGGILAN (REPEAT)
      if (repeatsLeft > 0) {
        await delay(800); // Beri jeda antar pengulangan (0.8 detik)
        currentActiveCall.repeatsLeft--;

        // Masukkan kembali ke antrean paling depan agar langsung diulang
        callQueue.unshift(currentActiveCall);
        cleanupAndNext();
      } else {
        // Jika jatah repeat sudah habis, hapus dari daftar driver aktif
        activeDrivers.delete(id);
        updateUIState(id, "idle");

        // UBAHAN 2 LU (Bagus!): Kembalikan status ke standby tanpa blocking
        saveDriverDB(id, "standby").catch(console.error);

        cleanupAndNext();
      }
    } catch (err) {
      console.error("Queue Error:", err);
      cleanupAndNext(); // Fail-safe: jika TTS error, antrean gak ikutan macet
    }
  }

  function cleanupAndNext() {
    isProcessing = false;
    isSpeakingQueue = false;
    currentActiveCall = null;
    if (callQueue.length > 0) {
      setTimeout(() => processQueue(), 100);
    }

    // Panggil antrean berikutnya dengan sedikit delay agar tidak stack overflow
    // setTimeout(() => processQueue(), 50);
  }

  // Helper delay pakai Promise
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── STOP PER DRIVER (PROSES DI BACKEND) ──────────────────────────────
  function stopDriver(id) {
    // 1. Bersihkan timer lokal & antrean memori lokal (Optimistic UI supaya instan & responsif)
    if (callTimers[id]) {
      clearTimeout(callTimers[id]);
      delete callTimers[id];
    }
    activeDrivers.delete(id);
    callQueue = callQueue.filter((item) => item.id !== id);
    updateUIState(id, "idle");

    // Cek apakah driver ini yang memicu audio TOA aktif saat ini
    const isCurrentActive = currentActiveCall && currentActiveCall.id === id;

    // 2. Tembak API Backend untuk mengurus SQLite & Pemutusan Audio Fisik
    fetch(`/api/drivers/${id}/stop?stop_audio=${isCurrentActive}`, {
      method: "POST",
    })
      .then((res) => res.json())
      .then((data) => {
        console.log(`[Backend Stop] Driver ${id} berhasil diproses:`, data);
      })
      .catch((err) =>
        console.error("Gagal menghentikan driver di backend:", err),
      );

    // 3. Jika yang di-stop sedang berbicara, ganti antrean lokal ke driver berikutnya
    if (isCurrentActive) {
      // Langsung reset UI secara lokal biar layarnya instan berubah
      if (typeof UI !== "undefined") UI.setIdle();
      if (typeof Mic !== "undefined") Mic.unmute();

      isProcessing = false;
      currentActiveCall = null;
      setTimeout(() => processQueue(), 100); // Jalankan antrean selanjutnya jika ada
    }
  }

  // ── STOP SEMUA (GLOBAL STOP) ─────────────────────
  async function stopAll() {
    // 1. Panggil API Python untuk stop fisik suara & broadcast sinyal ke semua PC
    try {
      // Pakai await karena ini operasi jaringan
      const response = await fetch("/api/stop-all", { method: "POST" });
      if (!response.ok) throw new Error("Gagal menghubungi server");

      console.log("✅ Perintah stop berhasil dikirim ke server.");
    } catch (e) {
      console.error("❌ Gagal stop via server:", e);
      // Tetap jalanin reset lokal kalau server lagi down (fail-safe)
    }
    // 1. Hentikan suara seketika (Nembak API Python)
    if (typeof TTS !== "undefined" && TTS.stop) {
      TTS.stop();
    }

    // 2. Bersihkan antrean memori lokal di PC yang ngeklik
    for (let id in callTimers) {
      clearTimeout(callTimers[id]);
    }
    callTimers = {};
    callQueue = [];
    activeDrivers.clear();
    currentActiveCall = null;
    isProcessing = false;
    // isSpeakingQueue = false; // Buka comment ini kalau lu masih pakai variabel ini

    // Reset UI ke standby
    const outText = document.getElementById("output-text");
    const wave = document.getElementById("wave");
    if (outText) {
      outText.innerText = "Menunggu panggilan...";
      outText.classList.remove("speaking");
    }
    if (wave) wave.classList.remove("active");

    // Reset status tombol di layar (visual aja)
    Object.keys(drivers).forEach((id) => {
      if (typeof updateUIState === "function") updateUIState(id, "idle");
    });

    // 4. Kasih notifikasi ke operator
    if (typeof showToast === "function") {
      showToast("Semua antrean panggilan dihentikan!", "success");
    }
    if (typeof UI !== "undefined" && UI.addLog) {
      UI.addLog("Semua panggilan dihentikan operator", "err");
    }

    console.log("🛑 Semua panggilan dihentikan secara global.");
  }

  // ── TAMBAH DRIVER ────────────────────────────────
  async function tambahDriver() {
    const vendorInput = document.getElementById("input-vendor");
    const noMobilInput = document.getElementById("input-no-mobil");
    const vendor = vendorInput.value.trim();
    const noMobil = noMobilInput.value.trim();

    if (!vendor || !noMobil) {
      showToast("Harap isi Vendor/Nama dan No. Mobil!", "error");
      return;
    }

    // ── PERUBAHAN UTAMA: JADIKAN PLAT NOMOR SEBAGAI ID ──
    // Hapus semua spasi dan ubah jadi huruf besar (Contoh: "B 1234 CD" -> "B1234CD")
    const cleanNoMobil = noMobil.replace(/\s+/g, "").toUpperCase();

    // Gabungkan dengan prefix 'drv_'
    const uniqueId = "drv_" + cleanNoMobil;

    // (Opsional) Kita deteksi apakah ini nambah baru atau update data yang sudah ada
    const isUpdate = drivers[uniqueId] ? true : false;

    const avatarInitials = vendor.substring(0, 2).toUpperCase();

    // Masukkan/Timpa data di memory frontend
    drivers[uniqueId] = {
      name: vendor,
      noMobil,
      status: "standby",
      jenis: "supir",
    };

    await saveDriverDB(uniqueId); // <--- SIMPAN DATA KE BACKEND (Otomatis UPSERT)
    await fetchDrivers();

    vendorInput.value = "";
    noMobilInput.value = "";

    // Tampilkan log yang berbeda supaya operator tahu itu ditimpa atau ditambah
    if (UI?.addLog) {
      if (isUpdate) {
        UI.addLog(`Berhasil update supir: ${noMobil}`, "tts");
      } else {
        UI.addLog(`Berhasil tambah supir: ${noMobil}`, "tts");
      }
    }

    updateAntrian();

    // Setelah nambah supir ke object 'drivers', simpan ke browser:
    // localStorage.setItem("dataSupir", JSON.stringify(drivers));
  }

  // ── UPLOAD DATA DARI EXCEL/CSV ───────────────────
  function uploadData(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Tampilkan loading (opsional)
    if (typeof showToast === "function")
      showToast("Membaca file Excel...", "success");

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });

        // Ambil sheet pertama
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Ubah isi sheet jadi object JSON
        const json = XLSX.utils.sheet_to_json(worksheet);

        let count = 0;
        let updateCount = 0; // Tambahan: untuk menghitung berapa data yang di-update

        for (let row of json) {
          // Cari kolom dengan nama "Vendor" atau "Nama" (huruf besar/kecil bebas)
          const vendor =
            row["Vendor"] ||
            row["vendor"] ||
            row["Nama"] ||
            row["nama"] ||
            "Unknown";

          // Cari kolom dengan nama "No Mobil", "Nomor Mobil", atau "Plat"
          const noMobil =
            row["No Mobil"] ||
            row["no mobil"] ||
            row["Plat"] ||
            row["plat"] ||
            "";

          if (noMobil) {
            // ── PERUBAHAN UTAMA: JADIKAN PLAT NOMOR SEBAGAI ID ──
            // Gunakan String() untuk berjaga-jaga jika Excel membacanya sebagai angka murni
            const cleanNoMobil = String(noMobil)
              .replace(/\s+/g, "")
              .toUpperCase();
            const uniqueId = "drv_" + cleanNoMobil;

            // Cek apakah ini data baru atau update data yang sudah ada
            if (drivers[uniqueId]) {
              updateCount++;
            } else {
              count++;
            }

            // Masukkan ke object drivers
            drivers[uniqueId] = {
              name: vendor,
              noMobil: String(noMobil), // Tetap simpan format asli
              status: "standby",
              jenis: "supir",
            };

            // Simpan ke SQLite (otomatis UPSERT kalau ID sama)
            await saveDriverDB(uniqueId);
          }
        }

        await fetchDrivers();

        updateAntrian();

        if (count > 0 || updateCount > 0) {
          if (typeof showToast === "function") {
            showToast(
              `${count} armada baru ditambah, ${updateCount} armada diperbarui!`,
              "success",
            );
          }
          if (UI?.addLog)
            UI.addLog(
              `Upload massal: ${count} baru, ${updateCount} update`,
              "tts",
            );
        } else {
          if (typeof showToast === "function")
            showToast("Data kosong atau format kolom salah!", "error");
        }
      } catch (err) {
        console.error(err);
        if (typeof showToast === "function")
          showToast("Gagal membaca file Excel!", "error");
      } finally {
        // Reset input file biar bisa upload file yang sama lagi kalau butuh
        event.target.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ── DOWNLOAD TEMPLATE EXCEL ──────────────────────
  function downloadTemplate() {
    // 1. Buat data contoh (header + dummy data)
    const templateData = [
      { Vendor: "Contoh: CV Maju Jaya", "No Mobil": "B 1234 ABC" },
      { Vendor: "Contoh: PT Logistik Aman", "No Mobil": "D 5678 XYZ" },
    ];

    // 2. Ubah data jadi format Worksheet Excel
    const ws = XLSX.utils.json_to_sheet(templateData);

    // 3. Atur lebar kolom biar rapi saat dibuka
    ws["!cols"] = [{ wch: 25 }, { wch: 20 }];

    // 4. Buat Workbook baru dan masukkan Worksheet-nya
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template_Antrean");

    // 5. Trigger download file ke komputer user
    XLSX.writeFile(wb, "Template_Antrean_Supir.xlsx");

    showToast("Template berhasil didownload!", "success");
    if (UI?.addLog) UI.addLog("Template Excel didownload", "tts");
  }

  // ── EDIT DRIVER ──────────────────────────────────
  function editDriver(id) {
    // Ambil data langsung dari sumber kebenaran (object drivers)
    const driver = drivers[id];
    if (!driver) {
      showToast("Data supir tidak ditemukan!", "error");
      return;
    }

    editingDriverId = id;

    // Isi kotak input di modal dengan data dari memori
    document.getElementById("modal-vendor").value = driver.name;
    document.getElementById("modal-no-mobil").value = driver.noMobil;

    // Tampilkan modal (buka popup)
    document.getElementById("driver-modal").classList.add("open");
  }

  async function simpanEditDriver() {
    if (!editingDriverId) return;
    const vendor = document.getElementById("modal-vendor").value.trim();
    const noMobil = document.getElementById("modal-no-mobil").value.trim();
    if (!vendor || !noMobil) {
      showToast("Harap isi Vendor/Nama dan No. Mobil!", "error");
      return;
    }

    console.log(editingDriverId);

    if (drivers[editingDriverId]) {
      drivers[editingDriverId].name = vendor;
      drivers[editingDriverId].noMobil = noMobil;
    }

    const card = document.getElementById("card-" + editingDriverId);
    if (card) {
      card.querySelector(".avatar").innerText = vendor
        .substring(0, 2)
        .toUpperCase();
      card.querySelector(".driver-name").innerText = vendor;
      card.querySelector(".driver-detail").innerText = noMobil;
    }

    await saveDriverDB(editingDriverId);
    await fetchDrivers();

    if (UI?.addLog) UI.addLog(`Berhasil update: ${vendor}`, "tts");
    tutupModal(null, true);
  }

  function tutupModal(event, force = false) {
    const modal = document.getElementById("driver-modal");
    if (force || event?.target === modal) {
      modal.classList.remove("open");
      editingDriverId = null;
    }
  }

  // ── HAPUS DRIVER ─────────────────────────────────
  async function hapusDriver(id) {
    if (activeDrivers.has(id)) stopDriver(id);

    const card = document.getElementById("card-" + id);
    if (card) card.remove();
    delete drivers[id];

    await deleteDriverDB(id);
    await fetchDrivers();

    if (UI?.addLog) UI.addLog(`Armada dihapus`, "err");
    updateAntrian();
  }

  // ── HAPUS SEMUA DRIVER ───────────────────────────
  function hapusSemuaDriver() {
    const cards = document.querySelectorAll(".drivers .driver-card");
    if (cards.length === 0) {
      showToast("Tidak ada armada dalam antrian", "error");
      return;
    }

    // Panggil SweetAlert2
    Swal.fire({
      title: "Hapus Semua Antrean?",
      text: "Data akan terhapus permanen dari layar dan database. Proses ini tidak bisa dibatalkan!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "var(--red)", // Mengikuti warna tema merahmu
      cancelButtonColor: "var(--bg-card)", // Mengikuti warna kartu
      confirmButtonText: "Ya, Kosongkan!",
      cancelButtonText: "Batal",
      background: "var(--bg-main)", // Agar Swal ikut dark mode
      color: "var(--text)", // Teks warna putih/terang
    }).then((result) => {
      // Jika user klik "Ya, Kosongkan!"
      if (result.isConfirmed) {
        // --- LOGIKA HAPUS DIJALANKAN DI SINI ---
        stopAll();
        document.querySelector(".drivers").innerHTML = "";
        Object.keys(drivers).forEach((k) => delete drivers[k]);

        deleteAllDriversDB(); // Menghapus dari database SQLite

        updateAntrian();
        if (UI?.addLog) UI.addLog(`Semua antrian dikosongkan`, "err");

        // Kasih notif sukses (bisa pakai bawaanmu atau Swal lagi)
        showToast("Seluruh antrian berhasil dikosongkan!", "success");
      }
    });
  }

  // ── PANGGIL SEMUA (DENGAN FILTER SEARCH) ──────────────────
  async function panggilSemuaDriver() {
    const cards = document.querySelectorAll(".drivers .driver-card");
    if (cards.length === 0) {
      showToast("Tidak ada armada di daftar!", "error");
      return;
    }

    let count = 0;

    // Pakai loop biasa (for...of) agar lebih stabil
    for (const card of cards) {
      // KUNCI LOGIKA: Lewati kartu yang sedang disembunyikan oleh fitur Search
      if (card.style.display === "none") {
        continue; // Lompat ke kartu berikutnya
      }

      const id = card.id.replace("card-", "");

      // Cek apakah driver sudah ada di antrean panggilan
      if (!activeDrivers.has(id)) {
        // Masukkan data ke Array Antrean secara diam-diam (silent = true)
        callDriver(id, true);
        count++;
      }
    }

    // Jika ada armada yang berhasil dimasukkan ke antrean
    if (count > 0) {
      const searchInput = document.getElementById("input-search");
      const isSearching = searchInput && searchInput.value.trim() !== "";

      // Bedakan notifikasi jika sedang pakai fitur search atau tidak
      if (isSearching) {
        showToast(
          `${count} armada dari hasil pencarian masuk antrian!`,
          "success",
        );
        if (UI?.addLog)
          UI.addLog(`Memanggil ${count} armada (Hasil Filter)`, "tts");
      } else {
        showToast(`${count} armada dimasukkan ke dalam antrian!`, "success");
        if (UI?.addLog)
          UI.addLog(`Memanggil ${count} armada secara berurutan`, "tts");
      }

      // Mulai proses antrean
      processQueue();
    } else {
      showToast("Semua armada yang dicari sudah ada dalam antrian!", "error");
    }
  }
  // ── UPDATE ANTRIAN ───────────────────────────────
  function updateAntrian() {
    const cards = document.querySelectorAll(".drivers .driver-card");
    const totalEl = document.getElementById("total-antrian");
    if (totalEl) totalEl.innerText = cards.length;
    cards.forEach((card, index) => {
      const q = card.querySelector(".queue-number");
      if (q) q.innerText = (index + 1).toString().padStart(2, "0");
    });
  }

  // ── UI STATE ─────────────────────────────────────
  function updateUIState(id, state) {
    const btn = document.getElementById("btn-" + id);
    const card = document.getElementById("card-" + id);
    const statusEl = document.getElementById("status-" + id);
    if (!btn || !card || !statusEl) return;

    // Cari elemen select dan tombol edit/delete di dalam kartu tersebut
    const selectEl = document.getElementById("jenis-" + id);
    const editBtn = card.querySelector(".icon-btn.edit");
    const delBtn = card.querySelector(".icon-btn.del");

    if (state === "calling" || state === "queued") {
      if (state === "calling") {
        btn.innerHTML = "⏹ Stop";
        statusEl.textContent = "Dipanggil";
        statusEl.className = "driver-status calling";
      } else {
        btn.innerHTML = "⏹ Batal";
        statusEl.textContent = "Antri...";
        statusEl.className = "driver-status busy";
      }
      btn.classList.remove("primary");
      btn.classList.add("calling-state");
      card.classList.add("calling");

      //  KUNCI (DISABLE) DROPDOWN DAN TOMBOL ACTION
      if (selectEl) selectEl.disabled = true;
      if (editBtn) editBtn.disabled = true;
      if (delBtn) delBtn.disabled = true;
    } else {
      btn.innerHTML = "📢";
      btn.classList.remove("calling-state");
      btn.classList.add("primary");
      card.classList.remove("calling");
      statusEl.textContent = "Standby";
      statusEl.className = "driver-status standby";

      // 🔓 BUKA KUNCI (ENABLE) KEMBALI
      if (selectEl) selectEl.disabled = false;
      if (editBtn) editBtn.disabled = false;
      if (delBtn) delBtn.disabled = false;
    }
  }

  // ── FITUR TEMA SIANG/MALAM ──
  function toggleTheme() {
    const body = document.body;
    const iconMoon = document.getElementById("icon-moon");
    const iconSun = document.getElementById("icon-sun");

    // Tukar kelas light-mode di body
    body.classList.toggle("light-mode");

    // Cek apakah sekarang lagi light mode
    if (body.classList.contains("light-mode")) {
      iconMoon.style.display = "none";
      iconSun.style.display = "block";
      localStorage.setItem("theme", "light"); // Simpan ke memori
      if (typeof showToast === "function")
        showToast("Mode Siang Aktif", "info");
    } else {
      iconMoon.style.display = "block";
      iconSun.style.display = "none";
      localStorage.setItem("theme", "dark"); // Simpan ke memori
      if (typeof showToast === "function")
        showToast("Mode Malam Aktif", "info");
    }
  }

  // ── CUSTOM TEXT DI TAB ANNOUNCE ──────────────────
  function speakCustom() {
    const inputEl = document.getElementById("custom-text");
    const repeatEl = document.getElementById("repeat-custom");
    if (!inputEl) return;

    let text = inputEl.value.trim();
    if (!text) return;

    // PROSES KATA DI DALAM KURUNG SIKU [ ] JADI EJAAN
    text = prosesEjaanDalamKurung(text);

    const jumlahRepeat = repeatEl ? parseInt(repeatEl.value) : 1;
    const finalText = ulangiTeks(text, jumlahRepeat);

    // 🚀 PERUBAHAN DI SINI: Jangan pakai TTS.speak(), masukin ke antrean!
    const customId = "custom-" + Date.now();
    activeDrivers.add(customId); // Biar nggak diblokir sistem
    callQueue.push({ id: customId, msg: finalText, repeatsLeft: 0 });
    processQueue();

    addHistory(finalText);
    if (UI?.addLog) UI.addLog(`Pengumuman Custom (${jumlahRepeat}x)`, "tts");

    inputEl.value = "";
    inputEl.focus();
  }

  // ── RIWAYAT PANGGILAN (HISTORY) ──────────────────
  let callHistory = [];

  function initHistory() {
    const saved = localStorage.getItem("callHistory");
    if (saved) {
      callHistory = JSON.parse(saved);
      renderHistory();
    }
  }

  function addHistory(text) {
    // Abaikan kalau teks kosong atau isinya sama dengan panggilan terakhir (cegah spam)
    if (!text || (callHistory.length > 0 && callHistory[0].text === text))
      return;

    // Ambil jam sekarang
    const now = new Date();
    const timeString =
      String(now.getHours()).padStart(2, "0") +
      ":" +
      String(now.getMinutes()).padStart(2, "0");

    // Masukkan data baru ke urutan paling atas
    callHistory.unshift({ text: text, time: timeString });

    // Batasi maksimal 10 riwayat saja biar memori browser tidak penuh
    if (callHistory.length > 10) {
      callHistory.pop();
    }

    localStorage.setItem("callHistory", JSON.stringify(callHistory));
    renderHistory();
  }

  function renderHistory() {
    const containers = [
      document.getElementById("history-container"),
      document.getElementById("history-container-announce"),
    ];

    let htmlContent = "";

    if (callHistory.length === 0) {
      htmlContent =
        '<div style="font-size: 11px; color: var(--text-dim); text-align: center; padding: 10px;">Belum ada riwayat panggilan/pengumuman.</div>';
    } else {
      callHistory.forEach((item, index) => {
        const displayNum = String(index + 1).padStart(2, "0");

        htmlContent += `
          <div class="history-item">
            <div class="history-number">${displayNum}</div>
            
            <div class="history-body">
              <span class="history-time">${item.time}</span>
              <span class="history-text">"${item.text}"</span>
            </div>
            
            <div class="history-actions">
              <button class="premium-btn btn-blue history-replay-btn" onclick="App.replayHistory(${index})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
                Try Call
              </button>
              
              <button class="icon-btn del history-del-btn" title="Hapus Riwayat Ini" onclick="App.deleteHistoryItem(${index})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                </svg>
              </button>
            </div>
          </div>
        `;
      });
    }

    containers.forEach((container) => {
      if (container) container.innerHTML = htmlContent;
    });
  }

  function deleteHistoryItem(index) {
    // 1. Hapus 1 item berdasarkan index-nya
    callHistory.splice(index, 1);

    // 2. Simpan perubahan ke cache browser
    localStorage.setItem("callHistory", JSON.stringify(callHistory));

    // 3. Render ulang layar biar langsung update di kedua tab
    renderHistory();

    // 4. Tambahkan log sistem samar jika dibutuhkan
    if (UI?.addLog) UI.addLog("Satu item riwayat dihapus", "err");
  }

  function replayHistory(index) {
    const item = callHistory[index];
    if (item && item.text) {
      TTS.speak(item.text);
      if (UI?.addLog) UI.addLog("Memanggil ulang dari riwayat", "tts");
    }
  }

  function clearHistory() {
    callHistory = [];
    localStorage.removeItem("callHistory");
    renderHistory();
    if (UI?.addLog) UI.addLog("Riwayat panggilan dihapus", "err");
  }

  // ── TABS ─────────────────────────────────────────
  function switchTab(tabId, el) {
    document
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.remove("active"));
    document
      .querySelectorAll(".panel")
      .forEach((p) => p.classList.remove("active"));

    el.classList.add("active");
    document.getElementById("panel-" + tabId).classList.add("active");
  }

  // ── TEMPLATE CEPAT (KANBAN) ──────────────────────
  function speakTemplate(text) {
    const tempId = "template-" + Date.now();
    activeDrivers.add(tempId);
    callQueue.push({ id: tempId, msg: text, repeatsLeft: 0 });
    processQueue();

    addHistory(text);
  }

  // ── TEST SPEAKER ─────────────────────────────────
  function testSpeaker() {
    const testId = "test-" + Date.now();
    activeDrivers.add(testId);
    callQueue.push({
      id: testId,
      msg: "Speaker ready dan siap digunakan!",
      repeatsLeft: 0,
    });
    processQueue();

    showToast("Menguji speaker...", "success");
    if (UI?.addLog) UI.addLog("Menjalankan test speaker", "tts");
  }

  // ── AUTO-PANGGIL (TIMER DENGAN COUNTDOWN + PAUSE/RESUME + ANTI REFRESH + AUTO REPEAT) ──
  let announcementTimer = null;
  let countdownInterval = null;
  let isTimerPaused = false;
  let pausedTimeLeft = 0; // Menyimpan sisa waktu saat di-pause

  // Helper format waktu
  function formatWaktu(ms) {
    const h = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const m = Math.floor((ms / 1000 / 60) % 60);
    const s = Math.floor((ms / 1000) % 60);
    return (
      String(h).padStart(2, "0") +
      ":" +
      String(m).padStart(2, "0") +
      ":" +
      String(s).padStart(2, "0")
    );
  }

  // ── SCHEDULE ANNOUNC ──────────────────────
  function scheduleAnnouncement(isRestoring = false) {
    const selectEl = document.getElementById("timer-select");
    const textEl = document.getElementById("timer-text");

    let text = "";
    let endTime = 0;
    let selectedHours = 1;
    let pTimeLeft = 0;
    let isPausedState = false;

    if (isRestoring) {
      // 1. AMBIL DATA DARI MEMORI
      const savedData = JSON.parse(localStorage.getItem("autoTimerData"));
      if (!savedData) return;

      text = savedData.text;
      endTime = savedData.endTime;
      selectedHours = savedData.hours || 1;
      isPausedState = savedData.isPaused || false;
      pTimeLeft = savedData.pausedTimeLeft || 0;

      if (textEl) textEl.value = text;
      if (selectEl) selectEl.value = selectedHours;
    } else {
      // 2. SETEL BARU (Dari Tombol)
      if (!selectEl || !textEl) return;
      text = textEl.value.trim();
      if (!text) {
        showToast("Teks pengumuman tidak boleh kosong!", "error");
        return;
      }
      selectedHours = parseInt(selectEl.value);
      const ms = selectedHours * 60 * 60 * 1000;
      endTime = Date.now() + ms;

      localStorage.setItem(
        "autoTimerData",
        JSON.stringify({
          text,
          endTime,
          hours: selectedHours,
          isPaused: false,
        }),
      );
      showToast(
        `Timer Looping aktif! Disiarkan setiap ${selectedHours} jam.`,
        "success",
      );
      if (UI?.addLog)
        UI.addLog(`Setel Looping Pengumuman: ${selectedHours} jam`, "tts");
    }

    // Set state global
    isTimerPaused = isPausedState;
    pausedTimeLeft = pTimeLeft;

    // Munculkan & atur tombol pause
    const pauseBtn = document.getElementById("btn-pause-timer");
    if (pauseBtn) {
      pauseBtn.style.display = "inline-block";
      pauseBtn.innerHTML = isTimerPaused ? "▶ Resume" : "⏸ Pause";
    }

    // Kalau pas di-refresh posisinya lagi ke-pause, jangan jalankan mesinnya
    if (isTimerPaused) {
      const countdownEl = document.getElementById("timer-countdown");
      if (countdownEl) {
        countdownEl.style.display = "block";
        countdownEl.innerText = `⏸ Timer Di-pause | Sisa: ${formatWaktu(pausedTimeLeft)}`;
        countdownEl.style.color = "#ff9800";
      }
      return;
    }

    // 3. JALANKAN MESIN TIMER
    startTimerCore(text, endTime, selectedHours);
  }

  // Mesin Utama Timer (Dipisah agar mudah dipanggil saat Resume)
  function startTimerCore(text, endTime, selectedHours) {
    const countdownEl = document.getElementById("timer-countdown");
    let timeLeftInit = endTime - Date.now();

    // Jika waktu sudah lewat (misal PC mati lama), langsung eksekusi & buat loop baru
    if (timeLeftInit <= 0) {
      TTS.speak(text);
      const ms = selectedHours * 60 * 60 * 1000;
      const newEndTime = Date.now() + ms;
      localStorage.setItem(
        "autoTimerData",
        JSON.stringify({
          text,
          endTime: newEndTime,
          hours: selectedHours,
          isPaused: false,
        }),
      );
      startTimerCore(text, newEndTime, selectedHours);
      return;
    }

    if (announcementTimer) clearTimeout(announcementTimer);
    if (countdownInterval) clearInterval(countdownInterval);
    if (countdownEl) {
      countdownEl.style.display = "block";
      countdownEl.style.color = "#ff9800";
    }

    function updateCountdownDisplay() {
      const now = Date.now();
      const timeLeft = endTime - now;

      if (timeLeft <= 0) {
        clearInterval(countdownInterval);
      } else {
        if (countdownEl)
          countdownEl.innerText = `🔄 Repeat Mode | Sisa: ${formatWaktu(timeLeft)}`;
      }
    }

    updateCountdownDisplay();
    countdownInterval = setInterval(updateCountdownDisplay, 1000);

    announcementTimer = setTimeout(() => {
      // PERUBAHAN DI SINI: Masukin timer ke antrean biar gak nabrak supir
      const timerId = "autotimer-" + Date.now();
      activeDrivers.add(timerId);
      callQueue.push({ id: timerId, msg: text, repeatsLeft: 0 });
      processQueue();

      if (UI?.addLog) UI.addLog("Auto-Panggil disiarkan (Looping)", "tts");

      // Auto-Repeat
      const nextMs = selectedHours * 60 * 60 * 1000;
      const nextEndTime = Date.now() + nextMs;
      localStorage.setItem(
        "autoTimerData",
        JSON.stringify({
          text,
          endTime: nextEndTime,
          hours: selectedHours,
          isPaused: false,
        }),
      );

      startTimerCore(text, nextEndTime, selectedHours);
    }, timeLeftInit);
  }

  // ── FUNGSI TOMBOL PAUSE / RESUME ──
  function togglePauseAnnouncement() {
    const savedData = JSON.parse(localStorage.getItem("autoTimerData"));
    if (!savedData) return;

    const countdownEl = document.getElementById("timer-countdown");
    const pauseBtn = document.getElementById("btn-pause-timer");

    if (isTimerPaused) {
      // PROSES RESUME
      isTimerPaused = false;
      const newEndTime = Date.now() + pausedTimeLeft; // Hitung ulang waktu target

      savedData.endTime = newEndTime;
      savedData.isPaused = false;
      localStorage.setItem("autoTimerData", JSON.stringify(savedData));

      startTimerCore(savedData.text, newEndTime, savedData.hours);

      if (pauseBtn) pauseBtn.innerHTML = "⏸ Pause";
      showToast("Timer dilanjutkan!", "success");
      if (UI?.addLog) UI.addLog("Timer Auto-Panggil dilanjutkan", "info");
    } else {
      // PROSES PAUSE
      isTimerPaused = true;
      pausedTimeLeft = savedData.endTime - Date.now(); // Simpan sisa waktu

      if (announcementTimer) clearTimeout(announcementTimer);
      if (countdownInterval) clearInterval(countdownInterval);

      savedData.isPaused = true;
      savedData.pausedTimeLeft = pausedTimeLeft;
      localStorage.setItem("autoTimerData", JSON.stringify(savedData));

      if (countdownEl) {
        countdownEl.innerText = `⏸ Timer Di-pause | Sisa: ${formatWaktu(pausedTimeLeft)}`;
        countdownEl.style.color = "var(--red)";
      }
      if (pauseBtn) pauseBtn.innerHTML = "▶ Resume";

      showToast("Timer di-pause!", "info");
      if (UI?.addLog) UI.addLog("Timer Auto-Panggil di-pause", "err");
    }
  }

  function cancelAnnouncement() {
    const countdownEl = document.getElementById("timer-countdown");
    const pauseBtn = document.getElementById("btn-pause-timer");
    let wasActive = false;

    if (announcementTimer) {
      clearTimeout(announcementTimer);
      announcementTimer = null;
      wasActive = true;
    }
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    isTimerPaused = false;
    pausedTimeLeft = 0;

    if (countdownEl) countdownEl.style.display = "none";
    if (pauseBtn) pauseBtn.style.display = "none"; // Sembunyikan tombol pause

    localStorage.removeItem("autoTimerData");

    if (
      wasActive ||
      JSON.parse(localStorage.getItem("autoTimerData")) !== null
    ) {
      showToast("Timer Auto-Panggil berhasil dibatalkan!", "success");
      if (UI?.addLog) UI.addLog("Timer Auto-Panggil dibatalkan", "err");
    } else {
      showToast("Tidak ada timer yang sedang aktif.", "error");
    }
  }

  // ── CUSTOM TEXT DI TAB DRIVERS ───────────────────
  function speakCustomDrivers() {
    const inputEl = document.getElementById("custom-text-drivers");
    const repeatEl = document.getElementById("repeat-custom-drivers");
    if (!inputEl) return;

    let text = inputEl.value.trim();
    if (!text) return;

    // 🚀 PROSES KATA DI DALAM KURUNG SIKU [ ] JADI EJAAN
    text = prosesEjaanDalamKurung(text);

    const jumlahRepeat = repeatEl ? parseInt(repeatEl.value) : 1;
    const finalText = ulangiTeks(text, jumlahRepeat);

    // 🚀 PERUBAHAN DI SINI: Masukin ke antrean!
    const customId = "announce-" + Date.now();
    activeDrivers.add(customId);
    callQueue.push({ id: customId, msg: finalText, repeatsLeft: 0 });
    processQueue();

    addHistory(finalText);
    if (UI?.addLog)
      UI.addLog(`Panggilan Manual Driver (${jumlahRepeat}x)`, "tts");

    inputEl.value = "";
    inputEl.focus();
  }
  // ── ALAT BANTU: MENGULANG TEKS DENGAN JEDA NAPAS AI ──
  function ulangiTeks(teks, jumlah) {
    if (jumlah <= 1) return teks;
    let hasil = [];
    for (let i = 0; i < jumlah; i++) {
      hasil.push(teks);
    }
    // Gabungkan dengan titik dan spasi (. .) agar AI berhenti sejenak sebelum mengulang
    return hasil.join(". . ");
  }

  // ── VOICE COMMAND ────────────────────────────────
  function processVoiceCommand(cmd) {
    if (cmd.includes("stop") || cmd.includes("berhenti")) {
      stopAll();
      TTS.speak("Panggilan dihentikan.");
      return;
    }
    if (cmd.includes("semua") || cmd.includes("all")) {
      panggilSemuaDriver();
      return;
    }

    let found = false;
    const cmdClean = cmd.replace(/\s+/g, "").toLowerCase();

    Object.entries(drivers).forEach(([id, driver]) => {
      const noMobilClean = driver.noMobil.replace(/\s+/g, "").toLowerCase();
      if (cmdClean.includes(noMobilClean)) {
        callDriver(id);
        found = true;
      }
    });

    if (!found && UI?.addLog) UI.addLog(`Tidak ditemukan: "${cmd}"`, "err");
  }

  // ── KEYBOARD ─────────────────────────────────────
  function initKeyboard() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        stopAll();
      }
      if (e.ctrlKey && e.key === "m") {
        e.preventDefault();
        e.stopPropagation();
        Mic.toggle();
      }

      if (e.key === "Enter") {
        // Cek input mana yang sedang aktif/diketik oleh user:
        switch (document.activeElement.id) {
          case "custom-text":
            // Jika Enter di input teks kustom tab Announce
            speakCustom();
            break;

          case "custom-text-drivers":
            speakCustomDrivers();
            break;

          case "input-vendor":
            e.preventDefault(); // Mencegah form ke-submit otomatis / reload halaman
            tambahDriver();
            break;

          default:
            // Jika enter di tempat lain, biarkan berjalan normal bawaan browser
            break;
        }
      }
    });
  }

  // ── TOAST ────────────────────────────────────────
  function showToast(message, type = "success") {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const icon =
      type === "error"
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2" width="16" height="16"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("hiding");
      toast.addEventListener("animationend", () => toast.remove());
    }, 2000);
  }

  // ── SETTINGS ─────────────────────────────────────
  function saveSettings() {
    const settings = {
      vol: document.getElementById("vol")?.value,
      rate: document.getElementById("rate")?.value,
      pitch: document.getElementById("pitch")?.value,
      voice: document.getElementById("voice-select")?.value,
    };
    localStorage.setItem("ttsSettings", JSON.stringify(settings));
  }

  function initSettings() {
    const volEl = document.getElementById("vol");
    const rateEl = document.getElementById("rate");
    const pitchEl = document.getElementById("pitch");
    const voiceEl = document.getElementById("voice-select");

    // 1. Load dari Local Storage
    const saved = localStorage.getItem("ttsSettings");
    if (saved) {
      const settings = JSON.parse(saved);
      if (settings.vol && volEl) {
        volEl.value = settings.vol;
        document.getElementById("vol-val").textContent =
          Math.round(settings.vol) + "%";
      }
      if (settings.rate && rateEl) {
        rateEl.value = settings.rate;
        document.getElementById("rate-val").textContent =
          parseFloat(settings.rate).toFixed(1) + "x";
      }
      if (settings.pitch && pitchEl) {
        pitchEl.value = settings.pitch;
        document.getElementById("pitch-val").textContent =
          (settings.pitch >= 0 ? "+" : "") + settings.pitch + "Hz";
      }
    }

    // 2. Tambah event listener buat simpan ke Local Storage pas digeser
    if (volEl) {
      volEl.addEventListener("input", function () {
        document.getElementById("vol-val").textContent =
          Math.round(this.value) + "%";
        saveSettings();
      });
    }

    if (rateEl) {
      rateEl.addEventListener("input", function () {
        document.getElementById("rate-val").textContent =
          parseFloat(this.value).toFixed(1) + "x";
        saveSettings();
      });
    }

    if (pitchEl) {
      pitchEl.addEventListener("input", function () {
        document.getElementById("pitch-val").textContent =
          (this.value >= 0 ? "+" : "") + this.value + "Hz";
        saveSettings();
      });
    }

    // Simpan pilihan suara saat dropdown diganti
    if (voiceEl) {
      voiceEl.addEventListener("change", saveSettings);
    }
  }

  // ── RESET INPUT ──────────────────────────────────
  function resetInput(id) {
    const el = document.getElementById(id);
    if (el) {
      el.focus(); // Berikan fokus kembali ke input setelah dihapus
      el.value = "";
    }
  }

  // ── FUNGSI RESET PENGATURAN SUARA ──
  function resetVoiceSettings() {
    const rateEl = document.getElementById("rate");
    const pitchEl = document.getElementById("pitch");
    const volEl = document.getElementById("vol");
    const voiceSelect = document.getElementById("voice-select");

    // 2. Kembalikan ke default bawaan HTML lu
    if (rateEl) {
      rateEl.value = 0.9;
      const rateVal = document.getElementById("rate-val");
      if (rateVal) rateVal.innerText = "0.9x";
    }

    if (pitchEl) {
      pitchEl.value = 10;
      const pitchVal = document.getElementById("pitch-val");
      if (pitchVal) pitchVal.innerText = "+10Hz";
    }

    if (volEl) {
      volEl.value = 100;
      const volVal = document.getElementById("vol-val");
      if (volVal) volVal.innerText = "100%";
    }

    if (voiceSelect) {
      // Set ke suara default
      voiceSelect.selectedIndex = 48;
    }

    // 3. Hapus data settingan dari cache (agar tidak nge-load yang lama saat di-refresh)
    localStorage.removeItem("ttsSettings");

    // 4. Beri notifikasi
    showToast("Pengaturan suara dikembalikan ke bawaan awal!", "success");
    if (typeof UI !== "undefined" && UI.addLog) {
      UI.addLog("Pengaturan suara di-reset", "info");
    }
  }

  // ── SYSTEM INFO DETECTOR ─────────────────────────
  function initSystemInfo() {
    // 1. Deteksi Browser & OS
    const ua = navigator.userAgent;
    let browser = "Unknown Browser";
    if (ua.includes("Edg")) browser = "Microsoft Edge";
    else if (ua.includes("Chrome")) browser = "Google Chrome";
    else if (ua.includes("Firefox")) browser = "Mozilla Firefox";
    else if (ua.includes("Safari")) browser = "Apple Safari";

    let os = "Unknown OS";
    if (ua.includes("Win")) os = "Windows";
    else if (ua.includes("Mac")) os = "MacOS";
    else if (ua.includes("Linux")) os = "Linux";
    else if (ua.includes("Android")) os = "Android";

    document.getElementById("sys-client").textContent = `${browser} on ${os}`;

    // 2. Deteksi Dukungan Mic (Web Speech API)
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micEl = document.getElementById("sys-mic");
    if (SR) {
      micEl.textContent = "✅ Supported (Web Speech API)";
      micEl.style.color = "var(--green)";
    } else {
      micEl.textContent = "❌ Not Supported";
      micEl.style.color = "var(--red)";
    }
  }

  // ── TEST SPEAKER ─────────────────────────────────
  function testSpeaker() {
    // Memutar suara dummy untuk ngetes speaker
    TTS.speak("Speaker ready dan siap digunakan!, ");
    showToast("Menguji speaker...", "success");
    if (UI?.addLog) UI.addLog("Menjalankan test speaker", "tts");
  }

  // ── REFRESH TTS & SYSTEM ─────────────────────────
  async function refreshTTS() {
    showToast("Me-refresh sistem TTS...", "success");

    // Ubah status info sistem ke "Menghubungkan..."
    const ttsEl = document.getElementById("sys-tts");
    if (ttsEl) {
      ttsEl.textContent = "Menghubungkan ulang...";
      ttsEl.style.color = "var(--text-mid)";
    }

    try {
      // Reload voice list dari backend
      await TTS.loadVoices();

      // Update info menjadi sukses
      if (ttsEl) {
        ttsEl.textContent = "✅ Connected (Local API)";
        ttsEl.style.color = "var(--green)";
      }

      // Notifikasi berhasil
      showToast("Sistem berjalan dengan baik dan siap digunakan!", "success");
      if (UI?.addLog) UI.addLog("Sistem di-refresh & siap digunakan", "tts");
    } catch (err) {
      // Update info menjadi gagal
      if (ttsEl) {
        ttsEl.textContent = "❌ Disconnected (Server Offline)";
        ttsEl.style.color = "var(--red)";
      }

      // Notifikasi gagal
      showToast("Gagal terhubung ke server TTS!", "error");
      if (UI?.addLog) UI.addLog("Gagal refresh TTS", "err");
    }
  }

  // ── RECONNECT / PING DATABASE ───────────────────────────
  async function reconnectDatabase() {
    const dbStatus = document.getElementById("sys-db");

    // 1. Ubah status UI jadi proses menghubungkan
    if (dbStatus) {
      dbStatus.innerText = "Mencoba ulang...";
      dbStatus.style.color = "#ff9800"; // Warna Orange
    }

    if (typeof showToast === "function") {
      showToast("Mencoba menghubungkan ulang ke database...", "info");
    }

    try {
      // 2. Lakukan tembakan (Ping) ke endpoint FastAPI
      const response = await fetch("/api/reconnect-db", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (response.ok) {
        // 3. Jika sukses beneran
        if (dbStatus) {
          dbStatus.innerText = "✅ Terhubung (Local Database)";
          dbStatus.style.color = "var(--green)";
        }
        if (typeof showToast === "function")
          showToast("Database berhasil terhubung!", "success");
        if (typeof UI !== "undefined" && UI.addLog)
          UI.addLog("Koneksi Database diperbarui", "sys");

        // Langsung refresh data antrean terbaru
        if (typeof this.fetchDrivers === "function") {
          this.fetchDrivers();
        } else if (typeof fetchDrivers === "function") {
          fetchDrivers();
        }
      } else {
        // Jika Python melempar error HTTP (misal 500)
        throw new Error(result.detail || "Gagal merespon dengan baik");
      }
    } catch (error) {
      // 4. Jika gagal / server mati / file DB terkunci
      if (dbStatus) {
        dbStatus.innerText = "Terputus (Disconnected)";
        dbStatus.style.color = "var(--red)";
      }
      if (typeof showToast === "function") {
        showToast("Gagal terhubung ke database. Cek server backend!", "error");
      }
      if (typeof UI !== "undefined" && UI.addLog) {
        UI.addLog("Gagal reconnect database: " + error.message, "err");
      }
      console.error("DB Reconnect Error:", error);
    }
  }
  // bersihin kata
  function cleanText(text) {
    return text
      .replace(/\s+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .trim();
  }

  // ── AUTO-PREFIX CUSTOM TEXT (Free-text input, textarea handler) ──
  function initCustomTextAutoPrefix() {
    const targetIds = ["custom-text", "custom-text-drivers"];
    const timerText = document.getElementById("timer-text");

    if (!timerText) return;
    timerText.value = cleanText(CONFIG.DEFAULT_TIMER_TEXT);

    targetIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      // Saat elemen mendapatkan fokus (diklik / di-tab)
      el.addEventListener("focus", function () {
        if (this.value.trim() === "") {
          this.value = "Panggilan kepada ";
        }
      });

      // Saat elemen kehilangan fokus (operator klik area luar)
      el.addEventListener("blur", function () {
        if (this.value.trim() === "Panggilan kepada") {
          this.value = "";
        }
      });
    });
  }

  // ── SCROLL TO TOP ────────────────────────────────
  // ── SCROLL EFFECTS (TOMBOL KE ATAS & STICKY TAB NAV) ──
  function initScrollToTop() {
    const scrollBtn = document.getElementById("scroll-top-btn");
    const tabNav = document.querySelector(".tabnav");

    // Ambil titik kordinat awal si Tab Nav
    let stickyOffset = tabNav ? tabNav.offsetTop : 0;

    // Kalau ukuran layar berubah, hitung ulang titik nempelnya biar presisi
    window.addEventListener("resize", () => {
      if (tabNav && !tabNav.classList.contains("is-sticky")) {
        stickyOffset = tabNav.offsetTop;
      }
    });

    window.addEventListener("scroll", () => {
      // 1. Logika Tombol Scroll ke Atas
      if (scrollBtn) {
        if (window.scrollY > 200) {
          scrollBtn.classList.add("show");
        } else {
          scrollBtn.classList.remove("show");
        }
      }

      // 2. Logika Tab Nav Sticky & Smooth Shadow
      if (tabNav) {
        // Kalau layar udah ngelewatin batas atas tab nav, aktifkan efeknya
        if (window.scrollY > stickyOffset) {
          tabNav.classList.add("is-sticky");
        } else {
          tabNav.classList.remove("is-sticky");
        }
      }
    });
  }

  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function checkServerPC() {
    try {
      const res = await fetch("/api/is-server-pc");

      if (!res.ok) {
        console.error(`Backend menolak koneksi! Status: ${res.status}`);
        return false;
      }
      const data = await res.json();
      if (data && data.is_server_pc !== undefined) {
        return data.is_server_pc;
      } else {
        return false;
      }
    } catch (error) {
      console.error("Gagal total mengecek status PC:", error);
      return false;
    }
  }

  // ── AUTO-SYNC (WEBSOCKET) ────────────────────────
  function initWebSocket() {
    // Ambil protocol (ws/wss) dan host (IP + Port) yang sedang dipakai browser
    const wsProtocol =
      window.location.protocol === "https:" ? "wss://" : "ws://";
    const wsUrl = wsProtocol + window.location.host + "/ws";

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("✅ WebSocket Terhubung ke Server gue");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // KONDISI 1: Kalau ada driver dihapus, WAJIB refresh total
      if (data.event === "RELOAD_ALL") {
        fetchDrivers();
      }
      // KONDISI 2: Kalau ada yang Ditambah, Diedit, atau Dipanggil
      else if (data.event === "DRIVER_SAVED") {
        // Kita cek, ini driver baru atau driver lama?
        if (
          !drivers[data.id] ||
          drivers[data.id].name !== data.name ||
          drivers[data.id].noMobil !== data.noMobil
        ) {
          // A. Kalau ID-nya belum ada di memori , berarti ini Driver BARU (Add)
          // Makanya butuh refresh total buat bikin kotak barunya
          fetchDrivers();
        } else {
          drivers[data.id].status = data.status;
          // Jika status dikembalikan ke standby, hapus dari memori antrean PC ini!
          if (data.status === "standby" || data.status === "idle") {
            // 1. Hapus dari memori antrean
            if (typeof activeDrivers !== "undefined")
              activeDrivers.delete(data.id);
            if (typeof callQueue !== "undefined") {
              callQueue = callQueue.filter((item) => item.id !== data.id);
            }
            if (typeof callTimers !== "undefined" && callTimers[data.id]) {
              clearTimeout(callTimers[data.id]);
              delete callTimers[data.id];
            }

            //  2. FIX BARU: Kalau PC lain nge-stop driver yang LAGI NGOMONG di PC ini
            if (
              typeof currentActiveCall !== "undefined" &&
              currentActiveCall &&
              currentActiveCall.id === data.id
            ) {
              console.log(
                `🛑 Panggilan ${data.id} dihentikan secara remote oleh PC lain!`,
              );

              // Matikan suara TOA secara paksa
              if (typeof TTS !== "undefined" && TTS.stop) {
                TTS.stop();
              }

              // Reset status mesin antrean
              if (typeof isProcessing !== "undefined") isProcessing = false;
              currentActiveCall = null;

              // 🌟 LANGSUNG LANJUT KE ANTREAN BERIKUTNYA!
              if (typeof processQueue === "function") {
                // Kasih jeda 300ms biar nggak tabrakan sama request database
                setTimeout(() => processQueue(), 150);
              }
            }
          }
          if (isServerPC && data.status === "queued") {
            if (!activeDrivers.has(data.id)) {
              console.log("ADMIN SEDANG AKTIF WS");
              // Kalau client gak ngirim, baru fallback ke memori driver atau default 1
              const remoteRepeat =
                data.repeat ||
                data.jumlahRepeat ||
                drivers[data.id].repeat ||
                1;

              serverHandleRemoteCall(
                data.id,
                data.jenis || drivers[data.id].jenis,
                remoteRepeat,
              );
            }
          }

          // Langsung panggil fungsi sakti lu buat ngubah tombol/gembok/warna
          // tanpa bikin layar kedip sama sekali!
          if (typeof updateUIState === "function") {
            updateUIState(data.id, data.status);
          }
        }
      } else if (data.event === "TTS_START") {
        const outText = document.getElementById("output-text");
        const wave = document.getElementById("wave");

        if (outText) {
          outText.innerText = data.text; // Tampilkan teks yang dibaca Python
          outText.classList.add("speaking"); // Ubah warna teks
        }
        if (wave) {
          wave.classList.add("active"); // Nyalakan animasi gelombang
        }
      }
      //  KONDISI 4: Kalau suara TTS selesai atau di-stop paksa
      else if (data.event === "TTS_STOP") {
        const outText = document.getElementById("output-text");
        const wave = document.getElementById("wave");

        if (outText) {
          outText.innerText = "Menunggu panggilan..."; // Kembalikan ke teks awal
          outText.classList.remove("speaking");
        }
        if (wave) {
          wave.classList.remove("active"); // Matikan animasi gelombang
        }
      } else if (data.event === "FORCE_STOP_ALL") {
        console.log("🛑 Menerima perintah STOP GLOBAL dari Server");

        // 1. Matikan suara
        if (typeof TTS !== "undefined" && TTS.stop) TTS.stop();

        // 2. Reset antrean lokal PC tersebut
        callQueue = [];
        currentActiveCall = null;
        isProcessing = false;

        // 3. Reset UI biar layar balik ke "Menunggu panggilan..."
        const outText = document.getElementById("output-text");
        const wave = document.getElementById("wave");
        if (outText) {
          outText.innerText = "Menunggu panggilan...";
          outText.classList.remove("speaking");
        }
        if (wave) wave.classList.remove("active");

        // 4. Update status tombol-tombol supir (reset ke idle semua)
        Object.keys(drivers).forEach((id) => {
          updateUIState(id, "idle");
        });
      }
    };

    ws.onclose = () => {
      console.log("❌ WebSocket Terputus. Reconnecting dalam 3 detik...");
      setTimeout(initWebSocket, 3000);
    };

    ws.onerror = (err) => {
      console.error("WebSocket Error:", err);
      ws.close();
    };
  }

  // ── INIT ─────────────────────────────────────────
  async function init() {
    initKeyboard();
    initSettings();
    initSystemInfo();
    initCustomTextAutoPrefix();
    initScrollToTop();
    initHistory();
    // updateAntrian();

    initRepeatMemory();

    // <!-- cek server -->
    isServerPC =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    console.log(isServerPC);

    if (isServerPC) {
      // 1. TAMBAHAN: Fitur Cegah Refresh (Biar suara gak mati di tengah jalan)
      window.addEventListener("beforeunload", function (e) {
        const isBusy = Object.values(drivers).some(
          (d) => d.status === "calling" || d.status === "queued",
        );
        if (isBusy) {
          e.preventDefault();
          e.returnValue =
            "Lagi ada antrean berjalan, yakin mau ditutup/refresh?";
        }
      });
    }

    // Tarik data dari Database saat pertama kali buka
    await fetchDrivers();

    // 2. TAMBAHAN: Bersihkan status "Dipanggil" yang nyangkut akibat refresh paksa
    // await resetGhostStatus(); buat matiin semua panggilan after refresh
    // BUNGKUS RECOVERY ANTREAN BIAR CUMA JALAN DI PC SERVER
    if (isServerPC) {
      console.log("ADMIN ADKTI DI RESUME");
      await resumeQueueFromDB();
    }
    //  --- share data input/updated ---
    initWebSocket();

    // --- statu reconnect db ---
    const dbStatus = document.getElementById("sys-db");
    if (dbStatus) {
      dbStatus.innerText = "✅ Terhubung (Local Database)";
      dbStatus.style.color = "var(--green)";
    }
    // ---------------------------------------------

    scheduleAnnouncement(true);

    // ── CEK TEMA TERAKHIR DARI MEMORI ──
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
      document.body.classList.add("light-mode");
      const iconMoon = document.getElementById("icon-moon");
      const iconSun = document.getElementById("icon-sun");
      if (iconMoon && iconSun) {
        iconMoon.style.display = "none";
        iconSun.style.display = "block";
      }
    }

    // ── KUNCI PENGATURAN SUARA KHUSUS SERVER ──
    const voiceSettingsBox = document.getElementById("admin-voice-settings");
    if (voiceSettingsBox) {
      // Cek apakah web dibuka pakai IP jaringan lokal atau bukan

      if (!isServerPC) {
        // 1. Kunci semua input (range) dan dropdown (select)
        const inputs = voiceSettingsBox.querySelectorAll("input, select");
        inputs.forEach((el) => {
          el.disabled = true;
          el.style.opacity = "0.5"; // Bikin agak transparan biar keliatan mati
          el.style.cursor = "not-allowed";
        });

        // 2. Sembunyikan tombol "Reset Default"
        const resetBtn = voiceSettingsBox.querySelector("button");
        if (resetBtn) resetBtn.style.display = "none";

        // 3. Tambahkan NOTE gembok tepat di bawah judul tanpa menghapus slider
        // 'firstElementChild' itu nargetin div judul + tombol reset yang ada di baris pertama
        const headerDiv = voiceSettingsBox.firstElementChild;
        headerDiv.insertAdjacentHTML(
          "afterend",
          `
          <div style="color: var(--text-muted); font-size: 12px; text-align: center;font-style: italic; margin-bottom: 16px; padding: 6px 8px; background: rgba(0,0,0,0.05); border-radius: 4px;">
            🔒 Pengaturan suara hanya dapat diubah dari PC Server (Admin) -> https://localhost:8800 .
          </div>
        `,
        );
      }
    }

    // <!-- MENGUNCI AUTO-VOICE TIMER -->
    const timerSettingsBox = document.getElementById("admin-timer-settings");
    if (timerSettingsBox && !isServerPC) {
      // 1. Kunci input teks (textarea) & dropdown jam
      const timerInputs = timerSettingsBox.querySelectorAll("textarea, select");
      timerInputs.forEach((el) => {
        el.disabled = true;
        el.style.opacity = "0.5";
        el.style.cursor = "not-allowed";
      });

      // 2. Munculkan note gembok
      const timerLockNote = document.getElementById("timer-lock-note");
      if (timerLockNote) timerLockNote.style.display = "block";

      // 3. Bikin tombol TETAP TERLIHAT tapi DISABLED (Mati)
      const btnSet = document.getElementById("btn-set-timer");
      const btnCancel = document.getElementById("btn-cancel-timer");
      const btnPause = document.getElementById("btn-pause-timer"); // Kalau tombol pause lu udah dikasih ID ini

      // Fungsi kecil biar gampang nerapin efek disable ke banyak tombol
      const disableBtn = (btn) => {
        if (btn) {
          btn.disabled = true; // Mengunci fungsi klik
          btn.style.opacity = "0.5"; // Bikin tombol agak pudar
          btn.style.cursor = "not-allowed"; // Kursor jadi tanda silang merah
        }
      };

      disableBtn(btnSet);
      disableBtn(btnCancel);
      disableBtn(btnPause);
    }

    // Auto-refresh cek database setiap 2.5 detik untuk Multi-Admin
    // setInterval(fetchDrivers, 2500);

    try {
      // Coba load voices dari backend
      await TTS.loadVoices();

      // --- TAMBAHAN: Setel kembali suara pilihan dari LocalStorage ---
      const savedSettings = localStorage.getItem("ttsSettings");
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        const voiceSelect = document.getElementById("voice-select");
        if (parsed.voice && voiceSelect) {
          voiceSelect.value = parsed.voice;
        }
      }
      // ---------------------------------------------------------------

      // Jika berhasil, update status TTS ke hijau
      const ttsEl = document.getElementById("sys-tts");
      if (ttsEl) {
        ttsEl.textContent = "✅ Connected (Local API)";
        ttsEl.style.color = "var(--green)";
      }
      UI.addLog("Sistem siap. ESC = Stop Semua | Ctrl+M = Mic", "tts");
    } catch (err) {
      // Jika server mati/gagal load, update status TTS ke merah
      const ttsEl = document.getElementById("sys-tts");
      if (ttsEl) {
        ttsEl.textContent = "❌ Disconnected (Server Offline)";
        ttsEl.style.color = "var(--red)";
      }
      UI.addLog("Gagal terhubung ke server TTS", "err");
    }
  }

  return {
    init,
    callDriver,
    stopAll,
    speakCustom,
    processVoiceCommand,
    tambahDriver,
    editDriver,
    hapusDriver,
    simpanEditDriver,
    tutupModal,
    showToast,
    hapusSemuaDriver,
    panggilSemuaDriver,
    updateAntrian,
    switchTab,
    resetInput,
    speakTemplate,
    speakCustomDrivers,
    testSpeaker,
    refreshTTS,
    uploadData,
    downloadTemplate,
    findDriver,
    fetchDrivers,
    scheduleAnnouncement,
    cancelAnnouncement,
    togglePauseAnnouncement,
    reconnectDatabase,
    toggleTheme,
    resetVoiceSettings,
    scrollToTop,
    checkServerPC,
    replayHistory,
    clearHistory,
    deleteHistoryItem,
    serverHandleRemoteCall,
  };
})();

document.addEventListener("DOMContentLoaded", App.init);
