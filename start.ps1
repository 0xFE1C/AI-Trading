# AI Trading Terminal - PowerShell Quick Launcher
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Clear-Host

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   AI TRADING TERMINAL - LAUNCHER OTOMATIS (POWERSHELL)" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Periksa Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js tidak ditemukan pada sistem!" -ForegroundColor Red
    Write-Host "Silakan download dan install Node.js (v18+) dari: https://nodejs.org" -ForegroundColor Yellow
    Read-Host "Tekan Enter untuk keluar"
    Exit 1
}

# 2. Periksa dependensi root
if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] Mengunduh dependensi sistem (pertama kali dijalankan)..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Gagal menginstal dependensi." -ForegroundColor Red
        Read-Host "Tekan Enter untuk keluar"
        Exit 1
    }
}

# 3. Periksa build frontend
if (-not (Test-Path "client/dist")) {
    Write-Host "[INFO] Menyiapkan antarmuka dashboard..." -ForegroundColor Yellow
    if (-not (Test-Path "client/node_modules")) {
        npm --prefix client install
    }
    npm --prefix client run build
}

# 4. Buka browser
Write-Host "[INFO] Membuka browser ke http://localhost:3001 ..." -ForegroundColor Green
Start-Process "http://localhost:3001"

# 5. Jalankan server
Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   SERVER AKTIF! JANGAN TUTUP JENDELA INI" -ForegroundColor Cyan
Write-Host "   Tekan Ctrl+C untuk menghentikan program" -ForegroundColor Yellow
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

npm start
