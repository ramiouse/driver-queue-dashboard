async function processQueue() {
  // Double lock: isProcessing (sync) + isSpeakingQueue (async)
  if (isProcessing || callQueue.length === 0) return;

  isProcessing = true; // kunci SYNCHRONOUS — langsung, sebelum await apapun
  // isSpeakingQueue = true;

  currentActiveCall = callQueue.shift();
  if (!currentActiveCall) {
    isProcessing = false;
    return;
  }
  const { id, msg, repeatsLeft } = currentActiveCall;

  console.log(
    `▶ processQueue sedang dijalanlan untuk: ${id} | queue sisa: ${callQueue.length}`,
  );

  try {
    updateUIState(id, "calling");
    // KASIH TAHU DATABASE KALAU LAGI DIPANGGIL
    // await saveDriverDB(id, "calling");
    // UBAHAN 1: Hapus 'await', ganti jadi .catch() biar non-blocking
    saveDriverDB(id, "calling").catch(console.error);

    // TETAP PAKAI AWAIT: Tunggu Python (TTS) sampai benar-benar beres bersuara
    await TTS.speak(msg);

    addHistory(msg);

    // 3. Cek lagi setelah suara selesai (kali aja di-stop pas lagi ngomong)
    if (!activeDrivers.has(id)) {
      console.log(`[Queue] ID ${id} di-stop saat berbicara.`);
      // cleanupAndNext();
      return;
    }

    if (repeatsLeft > 0) {
      await delay(800); // Beri jeda antar pengulangan
      currentActiveCall.repeatsLeft--;
      callQueue.unshift(currentActiveCall);
      cleanupAndNext();
    } else {
      activeDrivers.delete(id);
      updateUIState(id, "idle");

      // KEMBALIKAN STATUS DATABASE KE STANDBY
      // await saveDriverDB(id, "standby");
      // UBAHAN 2: Hapus 'await', ganti jadi .catch()
      saveDriverDB(id, "standby").catch(console.error);

      // stopDriver(id); // Set ke standby
      cleanupAndNext();
    }
  } catch (err) {
    console.error("Queue Error:", err);
    cleanupAndNext();
  }
}
