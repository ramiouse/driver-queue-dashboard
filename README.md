# Driver Call System

Aplikasi pemanggil supir dengan tts + mic perintah suara.

## 📁 Struktur Folder

```
driver-call/
├── backend/
│   ├── main.py              # FastAPI server + Edge TTS
│   ├── requirements.txt     # Python dependencies
│   └── .env                 # Konfigurasi port
├── frontend/
│   ├── index.html           # Entry point
│   └── assets/
│       ├── css/
│       │   ├── main.css         # Reset, variabel global
│       │   ├── animations.css   # Semua keyframes
│       │   ├── header.css       # Breadcrumb, judul
│       │   ├── cards.css        # Driver cards
│       │   └── controls.css     # Tombol, mic, settings
│       └── js/
│           ├── ui.js            # DOM updates, wave, log
│           ├── tts.js           # Edge TTS API calls
│           ├── mic.js           # Speech recognition
│           └── app.js           # Logic utama, init
├── audio/                   # Cache audio sementara
└── README.md
```

## ⌨️ Shortcut Keyboard

| Tombol   | Aksi                         |
| -------- | ---------------------------- |
| `Escape` | Stop semua                   |
| `Ctrl+M` | Toggle mic                   |
| `Enter`  | Ucapkan teks/announce custom |

## 🎤 Perintah Suara

- **"panggil nomobil"** → Panggil nomobil
- **"panggil semua"** → Panggil all
- **"stop"** / **"berhenti"** → Hentikan panggilan
