# Fix SLIP Printer Script
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SLIP PRINTER DIAGNOSTIC & FIX TOOL" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check if printer exists
Write-Host "1. Checking if SLIP printer exists..." -ForegroundColor Yellow
try {
    $printer = Get-Printer -Name "SLIP" -ErrorAction Stop
    Write-Host "   ✓ Printer SLIP found" -ForegroundColor Green
    Write-Host "   Status: $($printer.PrinterStatus)" -ForegroundColor Cyan
    Write-Host "   Driver: $($printer.DriverName)" -ForegroundColor Cyan
    Write-Host "   Port: $($printer.PortName)" -ForegroundColor Cyan
} catch {
    Write-Host "   ✗ Printer SLIP not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Available printers:" -ForegroundColor Yellow
    Get-Printer | Select-Object Name | Format-Table -AutoSize
    exit 1
}

Write-Host ""

# 2. Check printer status
Write-Host "2. Checking printer status..." -ForegroundColor Yellow
if ($printer.PrinterStatus -ne "Normal") {
    Write-Host "   ⚠ Printer status is: $($printer.PrinterStatus)" -ForegroundColor Red
    Write-Host "   Attempting to set printer online..." -ForegroundColor Yellow
    
    # Try to resume printer if paused
    try {
        Resume-Printer -Name "SLIP" -ErrorAction SilentlyContinue
        Write-Host "   ✓ Printer resumed" -ForegroundColor Green
    } catch {
        Write-Host "   Could not resume printer automatically" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ✓ Printer status is Normal" -ForegroundColor Green
}

Write-Host ""

# 3. Clear any stuck print jobs
Write-Host "3. Checking for stuck print jobs..." -ForegroundColor Yellow
$jobs = Get-PrintJob -PrinterName "SLIP" -ErrorAction SilentlyContinue
if ($jobs) {
    Write-Host "   Found $($jobs.Count) job(s) in queue. Clearing..." -ForegroundColor Yellow
    $jobs | Remove-PrintJob -Confirm:$false
    Write-Host "   ✓ Queue cleared" -ForegroundColor Green
} else {
    Write-Host "   ✓ No jobs in queue" -ForegroundColor Green
}

Write-Host ""

# 4. Test direct text print
Write-Host "4. Testing direct text print..." -ForegroundColor Yellow
$testFile = "$env:TEMP\slip-direct-test.txt"
$testContent = @"
========================================
    MELATI PRINTER TEST
========================================
Date/Time: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')

If you see this text, your printer
is working correctly!

This is a direct text print test.
========================================




"@

$testContent | Out-File -FilePath $testFile -Encoding ASCII
Write-Host "   Test file created: $testFile" -ForegroundColor Cyan

# Try printing
try {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c print /d:SLIP `"$testFile`"" -Wait -NoNewWindow
    Write-Host "   ✓ Print command sent" -ForegroundColor Green
    Write-Host "   → Check if paper came out from SLIP printer" -ForegroundColor Yellow
} catch {
    Write-Host "   ✗ Failed to send print: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 5. Check driver compatibility
Write-Host "5. Checking driver compatibility..." -ForegroundColor Yellow
Write-Host "   Driver Name: $($printer.DriverName)" -ForegroundColor Cyan

$thermalDrivers = @(
    "EPSON TM",
    "POS",
    "ESC/POS",
    "Thermal",
    "Receipt"
)

$isCompatible = $false
foreach ($keyword in $thermalDrivers) {
    if ($printer.DriverName -like "*$keyword*") {
        $isCompatible = $true
        break
    }
}

if ($isCompatible) {
    Write-Host "   ✓ Driver appears to be thermal/POS compatible" -ForegroundColor Green
} else {
    Write-Host "   ⚠ Driver may not be thermal printer compatible!" -ForegroundColor Red
    Write-Host "   → Install proper thermal printer driver (e.g., EPSON TM-T20II)" -ForegroundColor Yellow
}

Write-Host ""

# 6. Recommendations
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RECOMMENDATIONS:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($printer.PrinterStatus -ne "Normal") {
    Write-Host "⚠ 1. Printer is not in Normal status" -ForegroundColor Red
    Write-Host "   → Open Windows Settings > Printers" -ForegroundColor Yellow
    Write-Host "   → Right-click SLIP > Set as Online/Resume" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "✓ 2. Check physical printer:" -ForegroundColor Yellow
Write-Host "   - Is printer powered ON?" -ForegroundColor White
Write-Host "   - Is USB cable connected properly?" -ForegroundColor White
Write-Host "   - Is thermal paper loaded?" -ForegroundColor White
Write-Host "   - Is paper cover closed?" -ForegroundColor White
Write-Host "   - Is there a paper jam?" -ForegroundColor White
Write-Host ""

Write-Host "✓ 3. If still not printing:" -ForegroundColor Yellow
Write-Host "   - Try reinstalling thermal printer driver" -ForegroundColor White
Write-Host "   - Check if printer works with other apps" -ForegroundColor White
Write-Host "   - Test printer's self-test button (if available)" -ForegroundColor White
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
