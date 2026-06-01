import asyncio
import sys
# use winloop
if sys.platform == "win32":
    try:
        import winloop

        asyncio.set_event_loop_policy(
            winloop.EventLoopPolicy()
        )
        print("🚀 Winloop aktif")

    except Exception as e:
        print("⚠️ Winloop gagal:", e)

        asyncio.set_event_loop_policy(
            asyncio.WindowsSelectorEventLoopPolicy()
        )
        print("↩️ Fallback ke WindowsSelectorEventLoopPolicy")
        print("Loop Policy:", asyncio.get_event_loop_policy())

        
# endd
import uuid
import pygame
import edge_tts
import sqlite3
import os
import json
from fastapi import FastAPI, Request, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

# --- TAMBAHKAN IMPORT INI ---
from deep_translator import GoogleTranslator

load_dotenv()

# --- INISIALISASI AUDIO TOA ---
pygame.mixer.init()
audio_lock = asyncio.Lock() # Kunci antrean suara


# ── CONFIG ──────────────────────────────────────────
PORT      = int(os.getenv("PORT", 8800))
AUDIO_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../audio"))
os.makedirs(AUDIO_DIR, exist_ok=True)

# ── APP ─────────────────────────────────────────────
app = FastAPI(title="Driver Call API")

# logs handle notification
from asyncio import CancelledError

@app.middleware("http")
async def catch_disconnect(request, call_next):
    try:
        return await call_next(request)
    except (ConnectionResetError, CancelledError):
        pass  # Client disconnect, abaikan saja

# middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── WEBSOCKET MANAGER ───────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except:
                pass # Abaikan jika ada client yang terputus mendadak

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# Paths
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend"))
ASSETS_DIR   = os.path.join(FRONTEND_DIR, "assets")

app.mount("/audio", StaticFiles(directory=AUDIO_DIR), name="audio")
app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")

# ── MODELS ──────────────────────────────────────────
class TTSRequest(BaseModel):
    text: str
    voice: str = "id-ID-GadisNeural"
    rate: str  = "+0%"
    volume: str = "+0%"
    pitch: str  = "+0Hz"

# ── SETUP SQLITE DATABASE ───────────────────────────
DB_FILE = "database.db"

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS drivers (
            id TEXT PRIMARY KEY,
            name TEXT,
            no_mobil TEXT,
            status TEXT,
            jenis TEXT
        )
    ''')

    c.execute('CREATE INDEX IF NOT EXISTS idx_driver_name ON drivers(name)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_driver_id ON drivers(id)')
    
    conn.commit()
    conn.close()

init_db() # Jalankan saat server nyala

class DriverData(BaseModel):
    id: str
    name: str
    noMobil: str
    status: str = "standby"
    jenis: str = "supir"
    jumlahRepeat: int = 1  # 🚀 TAMBAHIN INI (Default 1x)

# ── API ENDPOINTS UNTUK ARMADA ──────────────────────
# Get all armada and showit
@app.get("/api/drivers")
def get_drivers():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM drivers")
    rows = c.fetchall()
    conn.close()
    
    # Ubah format ke Dictionary agar cocok dengan frontend kamu
    drivers_dict = {}
    for r in rows:
        drivers_dict[r["id"]] = {
            "id": r["id"], 
            "name": r["name"], 
            "noMobil": r["no_mobil"], 
            "status": r["status"],
            "jenis": r["jenis"]
        }
    return drivers_dict

@app.post("/api/drivers")
async def save_driver(d: DriverData): # <-- Ubah jadi async def
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        INSERT INTO drivers (id, name, no_mobil, status, jenis)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, no_mobil=excluded.no_mobil, status=excluded.status, jenis=excluded.jenis
    ''', (d.id, d.name, d.noMobil, d.status, d.jenis))
    conn.commit()
    conn.close()
    
    # Trigger WebSocket ke semua layar!
    await manager.broadcast({
        "event": "DRIVER_SAVED",
        "id": d.id,
        "status": d.status,
        "name": d.name,
        "noMobil": d.noMobil,
        "jenis": d.jenis,             # Penting biar PC Server tau ini manggil loading / supir
        "jumlahRepeat": d.jumlahRepeat # 🚀 <--- INI KUNCINYA!

    })
    return {"message": "Saved"}

@app.delete("/api/drivers/{d_id}")
async def delete_driver(d_id: str): # <-- Ubah jadi async def
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("DELETE FROM drivers WHERE id=?", (d_id,))
    conn.commit()
    conn.close()
    
    # Trigger WebSocket ke semua layar!
    await manager.broadcast({"event": "RELOAD_ALL"})
    return {"message": "Deleted"}

@app.delete("/api/drivers_all")
async def delete_all_drivers(): # <-- Ubah jadi async def
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("DELETE FROM drivers")
    conn.commit()
    conn.close()
    
    # Trigger WebSocket ke semua layar!
    await manager.broadcast({"event": "RELOAD_ALL"})
    return {"message": "All Cleared"}

@app.get("/api/voices")
async def get_voices():
    voices = await edge_tts.list_voices()
    filtered = [
        {"name": v["Name"], "short": v["ShortName"], "gender": v["Gender"], "lang": v["Locale"]}
        for v in voices
        if v["Locale"].startswith("id") or v["Locale"].startswith("en")
    ]
    return {"voices": filtered}


# ── TTS ENDPOINT (DENGAN TRANSLATE OTOMATIS) ────────
@app.post("/api/tts")
async def text_to_speech(req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    final_text = req.text

    # Jika voice bahasa Inggris, terjemahkan teks (ID -> EN)
    if req.voice.lower().startswith("en"):
        try:
            # # Lakukan translasi secara asinkronus
            # translation = await translator.translate(req.text, src='id', dest='en')
            # final_text = translation.text
            # print(f"[TRANSLATE] {req.text} -> {final_text}")

            # Menggunakan deep-translator (Jauh lebih stabil)
            final_text = GoogleTranslator(source='id', target='en').translate(req.text)
            print(f"[TRANSLATE] {req.text} -> {final_text}")
        except Exception as e:
            print(f"[TRANSLATE ERROR] Gagal menerjemahkan: {str(e)}")
            # Jika error, tetap gunakan teks asli agar sistem tidak crash

    filename = f"{uuid.uuid4().hex}.mp3"
    filepath = os.path.join(AUDIO_DIR, filename)

    try:
        # 1. Bikin file MP3-nya
        communicate = edge_tts.Communicate(
            text=final_text,
            voice=req.voice,
            rate=req.rate,
            volume=req.volume,
            pitch=req.pitch,
        )
        await communicate.save(filepath)

        # 2. PUTAR AUDIO LANGSUNG DI PC SERVER (TOA)
        async with audio_lock: # Antre satu-satu biar gak tabrakan
            # Kasih tahu semua PC kalau suara mau mulai
            await manager.broadcast({
                "event": "TTS_START",
                "text": final_text
            })

            pygame.mixer.music.load(filepath)
            pygame.mixer.music.play()
            
            # Tahan proses (freeze endpoint) sampai suara di TOA selesai ngomong
            while pygame.mixer.music.get_busy():
                await asyncio.sleep(0.1)
                
            # Lepas memori file agar MP3 bisa dihapus oleh sistem cleanup nanti
            pygame.mixer.music.unload()

            # Kasih tahu semua PC kalau suara sudah selesai 👇
            await manager.broadcast({
                "event": "TTS_STOP"
            })
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS error: {str(e)}")

    cleanup_audio(AUDIO_DIR)

    # Kembalikan url audio beserta teks final agar frontend tahu apa yang diucapkan
    return {"url": f"/audio/{filename}", "filename": filename, "spoken_text": final_text}

@app.post("/api/tts/stop")
async def stop_audio(): # <-- Wajib ubah jadi async def
    try:
        if pygame.mixer.music.get_busy():
            pygame.mixer.music.stop()
            
        # TAMBAHAN BARU: Matikan animasi di semua layar saat di-stop paksa 
        await manager.broadcast({"event": "TTS_STOP"})
        
        return {"message": "Audio dihentikan"}
    except Exception as e:
        return {"error": str(e)}

def cleanup_audio(directory: str, max_files: int = 20):
    files = sorted(
        [os.path.join(directory, f) for f in os.listdir(directory) if f.endswith(".mp3")],
        key=os.path.getmtime
    )
    while len(files) > max_files:
        os.remove(files.pop(0))

# ── RECONNECT / PING DATABASE ───────────────────────
@app.post("/api/reconnect-db")
def reconnect_db():
    try:
        # Karena SQLite di kode ini membuka koneksi baru tiap request,
        # kita lakukan "Ping" (tes baca) untuk memastikan file DB tidak terkunci (locked).
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute("SELECT 1") # Tes eksekusi paling ringan
        conn.close()
        
        return {"status": "success", "message": "Database terhubung kembali dan siap digunakan"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal terhubung ke database: {str(e)}")

@app.get("/api/is-server-pc")
async def is_server_pc(request: Request):
    client_ip = "127.0.0.1"
    server_ip = os.getenv("SERVER_IP", "")
    is_server = (client_ip == "127.0.0.1") or (client_ip == server_ip)
    # CCTV Level 2
    # print(f" CEK -> IP Asli: {client_ip} | IP Bawaan: {request.client.host}")
    return {"is_server_pc": is_server}


@app.get("/")
async def root():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

if __name__ == "__main__":
    import uvicorn
    
    print(f"\n✅  Driver Call Server running at https://192.168.100.5:{PORT} / https://192.168.100.5:{PORT}\n")
   
    # untuk localeee
    # ── 2. JALANKAN UVICORN (Siap untuk PM2) ──
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=PORT, 
        ssl_keyfile="key.pem",
        ssl_certfile="cert.pem",
        # log_config=LOG_CONFIG
        # reload=True DIHAPUS karena PM2 yang akan mengurus auto-restart
    )