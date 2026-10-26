#!/usr/bin/env bash
set -e

echo "======================================================"
echo "   AI TRADING TERMINAL - LAUNCHER OTOMATIS (LINUX/MAC)"
echo "======================================================"
echo ""

# 1. Periksa Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js tidak ditemukan!"
    echo "Silakan install Node.js (v22.12+) terlebih dahulu."
    exit 1
fi

# 2. Periksa dependensi
if [ ! -d "node_modules" ]; then
    echo "[INFO] Mengunduh dependensi sistem..."
    npm install
fi

# 3. Periksa build frontend
if [ ! -d "client/dist" ]; then
    echo "[INFO] Menyiapkan antarmuka dashboard..."
    if [ ! -d "client/node_modules" ]; then
        npm --prefix client install
    fi
    npm --prefix client run build
fi

# 4. Buka browser jika tersedia
if command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:3001" &
elif command -v open &> /dev/null; then
    open "http://localhost:3001" &
fi

echo ""
echo "======================================================"
echo "   SERVER AKTIF! Buka http://localhost:3001 di browser"
echo "   Tekan Ctrl+C untuk menghentikan program"
echo "======================================================"
echo ""

npm start
