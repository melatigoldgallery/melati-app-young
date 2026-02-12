@echo off
echo.
echo ========================================================
echo   MELATI PRINTING SERVICE - BROWSER TEST
echo ========================================================
echo.
echo Running browser compatibility test...
echo This will check if Puppeteer can find and use a browser
echo.

cd /d "%~dp0"
node test-browser.js

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Test passed! You can proceed with installation.
    echo.
) else (
    echo.
    echo ❌ Test failed! Please fix the issues above before proceeding.
    echo.
)

pause
