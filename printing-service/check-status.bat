@echo off
REM ========================================
REM Melati Print Service - Status Checker
REM ========================================

echo.
echo ========================================
echo   Melati Print Service Status
echo ========================================
echo.

REM Check if service is running on port 3001
netstat -ano | findstr :3001 >nul 2>&1
if %errorLevel% EQU 0 (
    echo [STATUS] Service is RUNNING on port 3001
    echo.
    
    REM Get process info
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do (
        echo Process ID: %%a
        for /f "tokens=*" %%b in ('tasklist /fi "PID eq %%a" /fo list ^| findstr "Image Name:"') do echo %%b
    )
    
    echo.
    echo Testing endpoint...
    powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3001/api/health' -UseBasicParsing; Write-Host '[OK] Health check passed'; Write-Host 'Response:' $r.Content } catch { Write-Host '[ERROR] Health check failed:' $_.Exception.Message }"
) else (
    echo [STATUS] Service is NOT RUNNING
    echo.
    echo To start the service:
    echo   - Windows Service: net start MelatiPrintService
    echo   - Task Scheduler: schtasks /run /tn MelatiPrintService
    echo   - Manual: node server.js
)

echo.
echo ========================================

REM Check Windows Service
echo.
echo Checking Windows Service...
sc query MelatiPrintService >nul 2>&1
if %errorLevel% EQU 0 (
    echo [OK] Windows Service installed
    sc query MelatiPrintService | findstr STATE
) else (
    echo [INFO] Windows Service not installed
)

REM Check Task Scheduler
echo.
echo Checking Task Scheduler...
schtasks /query /tn MelatiPrintService >nul 2>&1
if %errorLevel% EQU 0 (
    echo [OK] Scheduled Task found
    schtasks /query /tn MelatiPrintService /fo list | findstr "Status:"
) else (
    echo [INFO] Scheduled Task not found
)

echo.
echo ========================================
echo.
pause
