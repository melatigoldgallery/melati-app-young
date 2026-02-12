@echo off
echo ========================================
echo CHECKING PRINTER STATUS
echo ========================================
echo.

echo 1. LIST ALL PRINTERS:
echo ----------------------------------------
powershell -Command "Get-Printer | Select-Object Name, PrinterStatus, DriverName | Format-Table -AutoSize"
echo.

echo 2. DETAILED STATUS FOR SLIP:
echo ----------------------------------------
powershell -Command "Get-Printer -Name 'SLIP' -ErrorAction SilentlyContinue | Select-Object * | Format-List"
echo.

echo 3. CHECK PRINT JOBS IN QUEUE:
echo ----------------------------------------
powershell -Command "Get-PrintJob -PrinterName 'SLIP' -ErrorAction SilentlyContinue"
echo.

echo 4. TEST SIMPLE TEXT PRINT TO SLIP:
echo ----------------------------------------
echo Creating test file...
echo TEST PRINT FROM MELATI > "%TEMP%\slip-test.txt"
echo Date: %date% %time% >> "%TEMP%\slip-test.txt"
echo ======================================== >> "%TEMP%\slip-test.txt"
echo If you see this, printer is working! >> "%TEMP%\slip-test.txt"
echo ======================================== >> "%TEMP%\slip-test.txt"
echo. >> "%TEMP%\slip-test.txt"
echo. >> "%TEMP%\slip-test.txt"
echo. >> "%TEMP%\slip-test.txt"

echo Sending to printer...
powershell -Command "$printer = Get-Printer -Name 'SLIP' -ErrorAction Stop; if ($printer.PrinterStatus -eq 'Normal') { print /d:SLIP '%TEMP%\slip-test.txt' } else { Write-Host 'ERROR: Printer status is not Normal. Status:' $printer.PrinterStatus -ForegroundColor Red }"
echo.

echo 5. CHECK PRINTER PORT AND DRIVER:
echo ----------------------------------------
powershell -Command "Get-PrinterPort | Where-Object { $_.Name -eq (Get-Printer -Name 'SLIP' -ErrorAction SilentlyContinue).PortName } | Format-List"
echo.

echo ========================================
echo TROUBLESHOOTING TIPS:
echo ========================================
echo - If status is "Paused" or "Offline", restart printer
echo - If driver is generic, install proper thermal printer driver
echo - Check USB cable connection
echo - Try setting printer online in Windows Settings
echo - Check paper loaded correctly in thermal printer
echo ========================================
pause
