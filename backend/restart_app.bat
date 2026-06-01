@echo off
echo Menghilangkan proses Python lama di background...
taskkill /f /im python.exe >nul 2>&1

echo Memulai ulang aplikasi Riyu Console...
start run_riyu.vbs

echo SELESAI! Aplikasi berhasil diperbarui.
timeout /t 2