@echo off
REM ========================================
REM Melati Print Service - Auto Installer
REM ========================================

echo.
echo ========================================
echo   Melati Print Service Auto Installer
echo ========================================
echo.

REM Change to script directory (FIX for Administrator mode)
cd /d "%~dp0"
echo Working directory: %cd%
echo.

REM Check if running as Administrator
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo [ERROR] Script ini membutuhkan Administrator privileges!
    echo.
    echo Cara jalankan sebagai Administrator:
    echo 1. Klik kanan file install-auto-start.bat
    echo 2. Pilih "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo [1/5] Checking Node.js installation...
node --version >nul 2>&1
if %errorLevel% NEQ 0 (
    echo [ERROR] Node.js belum terinstall!
    echo Download dari: https://nodejs.org
    echo Install Node.js terlebih dahulu, lalu jalankan script ini lagi.
    pause
    exit /b 1
)
echo [OK] Node.js terdeteksi
node --version

echo.
echo [2/5] Installing npm dependencies...
if exist "node_modules\express" (
    echo [OK] Dependencies already installed
    goto SKIP_INSTALL
)
set NODE_OPTIONS=--max-old-space-size=4096
call npm install --no-audit --no-fund
if %errorLevel% NEQ 0 (
    echo [WARN] Retrying with cache clean...
    call npm cache clean --force
    call npm install --no-audit --no-fund
    if %errorLevel% NEQ 0 (
        echo [ERROR] npm install gagal!
        pause
        exit /b 1
    )
)
:SKIP_INSTALL
set NODE_OPTIONS=
echo [OK] Dependencies ready

echo.
echo [3/5] Installing node-windows globally...
call npm install -g node-windows
if %errorLevel% NEQ 0 (
    echo [WARNING] node-windows install gagal, akan pakai Task Scheduler
    goto TASK_SCHEDULER
)
echo [OK] node-windows installed

echo.
echo [4/5] Installing Windows Service...
call npm run install-service
if %errorLevel% NEQ 0 (
    echo [WARNING] Windows Service install gagal, akan pakai Task Scheduler
    goto TASK_SCHEDULER
)

echo.
echo [5/5] Starting service...
net start MelatiPrintService
if %errorLevel% NEQ 0 (
    echo [WARNING] Service gagal start, coba manual: net start MelatiPrintService
)

echo.
echo ========================================
echo   INSTALLATION COMPLETED!
echo ========================================
echo.
echo Service: MelatiPrintService
echo Status: Running
echo URL: http://localhost:3001
echo.
echo Test service:
echo   http://localhost:3001/api/health
echo.
echo Control service:
echo   net start MelatiPrintService    - Start
echo   net stop MelatiPrintService     - Stop
echo   net restart MelatiPrintService  - Restart
echo.
pause
exit /b 0

:TASK_SCHEDULER
echo.
echo ========================================
echo   Setting up Task Scheduler (Alternative)
echo ========================================
echo.
echo [4/5] Creating startup script...
echo @echo off > "%~dp0start-service.bat"
echo cd /d "%~dp0" >> "%~dp0start-service.bat"
echo node server.js >> "%~dp0start-service.bat"
echo [OK] Startup script created: start-service.bat

echo.
echo [5/5] Creating scheduled task...
schtasks /create /tn "MelatiPrintService" /tr "%~dp0start-service.bat" /sc onlogon /rl highest /f
if %errorLevel% EQU 0 (
    echo [OK] Task scheduled successfully
    echo.
    echo Starting service now...
    start "" "%~dp0start-service.bat"
) else (
    echo [ERROR] Failed to create scheduled task
)

echo.
echo ========================================
echo   INSTALLATION COMPLETED!
echo ========================================
echo.
echo Task Name: MelatiPrintService
echo Trigger: On user logon
echo URL: http://localhost:3001
echo.
echo Test service:
echo   http://localhost:3001/api/health
echo.
echo Control task:
echo   schtasks /run /tn MelatiPrintService    - Start
echo   schtasks /end /tn MelatiPrintService    - Stop
echo   schtasks /delete /tn MelatiPrintService - Remove
echo.
pause
exit /b 0
