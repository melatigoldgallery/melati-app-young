@echo off
REM ========================================
REM Melati Print Service - Uninstaller
REM ========================================

echo.
echo ========================================
echo   Melati Print Service Uninstaller
echo ========================================
echo.

REM Check if running as Administrator
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo [ERROR] Script ini membutuhkan Administrator privileges!
    echo.
    echo Cara jalankan sebagai Administrator:
    echo 1. Klik kanan file uninstall-service.bat
    echo 2. Pilih "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo [1/3] Stopping service...
net stop MelatiPrintService >nul 2>&1
if %errorLevel% EQU 0 (
    echo [OK] Service stopped
) else (
    echo [INFO] Service not running or not installed
)

echo.
echo [2/3] Uninstalling Windows Service...
call npm run uninstall-service >nul 2>&1
if %errorLevel% EQU 0 (
    echo [OK] Windows Service uninstalled
) else (
    echo [INFO] Windows Service not found
)

echo.
echo [3/3] Removing scheduled task...
schtasks /delete /tn MelatiPrintService /f >nul 2>&1
if %errorLevel% EQU 0 (
    echo [OK] Scheduled task removed
) else (
    echo [INFO] Scheduled task not found
)

echo.
echo ========================================
echo   UNINSTALLATION COMPLETED!
echo ========================================
echo.
pause
