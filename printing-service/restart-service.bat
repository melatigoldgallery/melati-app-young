@echo off
echo.
echo ========================================================
echo   RESTARTING PRINT SERVICE WITH CORS FIX
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] Stopping existing service...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo   Killing process %%a
    taskkill /PID %%a /F >nul 2>&1
)

echo.
echo [2/3] Waiting for port to be released...
timeout /t 3 /nobreak >nul

echo.
echo [3/3] Starting service with CORS fix...
start "Melati Print Service" node server.js

echo.
echo Waiting for service to start...
timeout /t 5 /nobreak >nul

echo.
echo ========================================================
echo   Testing service connection...
echo ========================================================

curl -s http://localhost:3001/api/health

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Service started successfully!
    echo.
    echo Now test from browser:
    echo   1. Open Chrome DevTools (F12)
    echo   2. Go to Console tab
    echo   3. Look for "✅ Print service online"
    echo   4. CORS error should be gone
    echo.
) else (
    echo.
    echo ❌ Service failed to start
    echo Check logs\error.log for details
    echo.
)

pause
