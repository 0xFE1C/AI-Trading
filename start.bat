@echo off
chcp 65001 >nul
title AI Trading Terminal - Starter Launcher
cls

echo ======================================================
echo    AI TRADING TERMINAL - LAUNCHER OTOMATIS
echo ======================================================
echo.

:: 1. Periksa ketersediaan Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js tidak ditemukan!
    echo Silakan download dan install Node.js (v22.12+) dari https://nodejs.org
    echo Setelah terpasang, jalankan kembali launcher ini.
    echo.
    pause
    exit /b 1
)

:: 2. Periksa dependensi root
if not exist "node_modules\" (
    echo [INFO] Mengunduh dependensi sistem (pertama kali dijalankan)...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Gagal menginstal dependensi root.
        pause
        exit /b 1
    )
)

:: 3. Periksa build frontend
if not exist "client\dist\" (
    echo [INFO] Menyiapkan tampilan dashboard...
    if not exist "client\node_modules\" (
        call npm --prefix client install
    )
    call npm --prefix client run build
)

:: 4. Buka browser otomatis ke localhost:3001
echo [INFO] Membuka browser ke http://localhost:3001 ...
start "" "http://localhost:3001"

:: 5. Jalankan server utama
echo.
echo ======================================================
echo    SERVER AKTIF! JANGAN TUTUP JENDELA INI
echo    Tekan Ctrl+C untuk menghentikan program
echo ======================================================
echo.
call npm start

pause
