@echo off
REM ================================================================
REM Script untuk setup Printing Service di device baru
REM ================================================================

echo.
echo ========================================================
echo   MELATI PRINTING SERVICE - INSTALLATION CHECKER
echo ========================================================
echo.

REM Check if Chrome is installed
echo [1/3] Checking Google Chrome installation...
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    echo [OK] Chrome found at: C:\Program Files\Google\Chrome\Application\chrome.exe
    set CHROME_FOUND=1
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    echo [OK] Chrome found at: C:\Program Files ^(x86^)\Google\Chrome\Application\chrome.exe
    set CHROME_FOUND=1
) else (
    echo [WARNING] Chrome not found
    set CHROME_FOUND=0
)

REM Check if Edge is installed
echo.
echo [2/3] Checking Microsoft Edge installation...
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    echo [OK] Edge found at: C:\Program Files ^(x86^)\Microsoft\Edge\Application\msedge.exe
    set EDGE_FOUND=1
) else if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    echo [OK] Edge found at: C:\Program Files\Microsoft\Edge\Application\msedge.exe
    set EDGE_FOUND=1
) else (
    echo [WARNING] Edge not found
    set EDGE_FOUND=0
)

echo.
echo [3/3] Installation status...
echo.

if %CHROME_FOUND%==1 (
    echo ✓ Google Chrome is installed - Print service will work!
    goto :SUCCESS
)

if %EDGE_FOUND%==1 (
    echo ✓ Microsoft Edge is installed - Print service will work!
    goto :SUCCESS
)

REM If neither Chrome nor Edge found
echo ========================================================
echo   WARNING: No compatible browser found!
echo ========================================================
echo.
echo The printing service requires one of:
echo   1. Google Chrome (Recommended)
echo   2. Microsoft Edge (Chromium version)
echo.
echo SOLUTION 1 - Install Chrome (Recommended):
echo   Download from: https://www.google.com/chrome/
echo.
echo SOLUTION 2 - Install Puppeteer with bundled Chromium:
echo   cd printing-service
echo   npm install puppeteer
echo.
pause
exit /b 1

:SUCCESS
echo ========================================================
echo   ✓ All requirements met!
echo ========================================================
echo.
echo You can now run the printing service:
echo   cd printing-service
echo   npm install
echo   npm start
echo.
pause
