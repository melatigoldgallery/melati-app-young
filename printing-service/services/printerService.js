const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

class PrinterService {
  constructor() {
    this.defaultPrinter = null;
    this.printers = [];
    this.initialize();
  }

  initialize() {
    try {
      // Get default printer using PowerShell
      exec(
        'powershell -Command "Get-CimInstance -ClassName Win32_Printer | Where-Object {$_.Default -eq $true} | Select-Object -ExpandProperty Name"',
        (error, stdout) => {
          if (!error && stdout) {
            this.defaultPrinter = stdout.trim();
            logger.info(`Default printer: ${this.defaultPrinter}`);
          }
        },
      );
    } catch (error) {
      logger.error("Error getting default printer:", error);
    }
  }

  /**
   * Get printer name for specific type
   * @param {string} type - 'receipt' or 'invoice'
   * @returns {string} Printer name
   */
  getPrinterForType(type) {
    try {
      const config = require("../config/printers.json");
      const printerName = config[type] || this.defaultPrinter;

      if (!printerName) {
        throw new Error("No printer configured for type: " + type);
      }

      return printerName;
    } catch (error) {
      logger.error(`Error getting printer for type ${type}:`, error);
      return this.defaultPrinter;
    }
  }

  /**
   * List all available printers
   * @returns {Array} List of printer objects
   */
  listPrinters() {
    return new Promise((resolve, reject) => {
      // Get printers using PowerShell
      exec(
        'powershell -Command "Get-CimInstance -ClassName Win32_Printer | Select-Object Name, Default, PrinterStatus | ConvertTo-Json"',
        (error, stdout, stderr) => {
          if (error) {
            logger.error("Error listing printers:", error);
            resolve([]);
            return;
          }

          try {
            const printers = JSON.parse(stdout);
            const printerArray = Array.isArray(printers) ? printers : [printers];

            this.printers = printerArray.map((p) => ({
              name: p.Name,
              isDefault: p.Default === true,
              status: p.PrinterStatus === 3 ? "Ready" : "Offline",
            }));

            logger.info(`Found ${this.printers.length} printers`);
            resolve(this.printers);
          } catch (parseError) {
            logger.error("Error parsing printer list:", parseError);
            resolve([]);
          }
        },
      );
    });
  }

  /**
   * Print raw data (for thermal printer with ESC/POS commands)
   * @param {string} printerName - Name of printer
   * @param {string} data - Raw print data
   * @returns {Promise<string>} Job ID
   */
  printRaw(printerName, data) {
    return new Promise((resolve, reject) => {
      try {
        logger.info(`Printing to ${printerName} (RAW mode)...`);

        // Save to temp file with binary encoding
        const tempDir = path.join(__dirname, "../temp");
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const tempFile = path.join(tempDir, `receipt_${Date.now()}.prn`);

        // Write as binary buffer to preserve ESC/POS commands
        const buffer = Buffer.from(data, "binary");
        fs.writeFileSync(tempFile, buffer, "binary");

        logger.info(`Temp file created: ${tempFile} (${buffer.length} bytes)`);

        // Create PowerShell script file to avoid escaping issues
        const psScriptFile = path.join(tempDir, `print_${Date.now()}.ps1`);
        const psScript = `
$ErrorActionPreference = "Stop"

try {
    # Get printer info
    $printer = Get-CimInstance -ClassName Win32_Printer | Where-Object { $_.Name -eq "${printerName}" }
    
    if (-not $printer) {
        Write-Host "ERROR: Printer ${printerName} not found"
        exit 1
    }
    
    $portName = $printer.PortName
    Write-Host "Printer: ${printerName}"
    Write-Host "Port: $portName"
    
    # Read file as binary
    $filePath = "${tempFile.replace(/\\/g, "\\")}"
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    Write-Host "File size: $($bytes.Length) bytes"
    
    # Try direct copy to printer port (works for USB/LPT/COM ports)
    if ($portName -match "^(USB|LPT|COM)") {
        try {
            Copy-Item -Path $filePath -Destination $portName -Force
            Write-Host "SUCCESS: Sent RAW data via Copy-Item to $portName"
            exit 0
        } catch {
            Write-Host "Copy-Item failed: $_"
        }
    }
    
    # Fallback: Use .NET printing
    Add-Type -AssemblyName System.Drawing
    Add-Type -AssemblyName System.Windows.Forms
    
    $printDoc = New-Object System.Drawing.Printing.PrintDocument
    $printDoc.PrinterSettings.PrinterName = "${printerName}"
    
    # Simple print - just send as graphics/text
    $printDoc.add_PrintPage({
        param($sender, $ev)
        try {
            $font = New-Object System.Drawing.Font("Courier New", 8)
            $text = [System.Text.Encoding]::ASCII.GetString($bytes)
            $ev.Graphics.DrawString($text, $font, [System.Drawing.Brushes]::Black, 10, 10)
            $ev.HasMorePages = $false
        } catch {
            Write-Host "Print page error: $_"
            $ev.HasMorePages = $false
        }
    })
    
    $printDoc.Print()
    Write-Host "SUCCESS: Print job sent via .NET"
    
} catch {
    Write-Host "ERROR: $_"
    exit 1
}
`;

        fs.writeFileSync(psScriptFile, psScript, "utf8");

        // Execute PowerShell script
        exec(
          `powershell -ExecutionPolicy Bypass -File "${psScriptFile}"`,
          { encoding: "utf8", maxBuffer: 1024 * 1024 },
          (error, stdout, stderr) => {
            logger.info(`PowerShell output: ${stdout}`);
            if (stderr) logger.warn(`PowerShell stderr: ${stderr}`);

            // Cleanup files after delay
            setTimeout(() => {
              try {
                if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                if (fs.existsSync(psScriptFile)) fs.unlinkSync(psScriptFile);
                logger.info(`Temp files cleaned up`);
              } catch (e) {
                logger.warn(`Cleanup warning: ${e.message}`);
              }
            }, 5000);

            if (error && !stdout.includes("SUCCESS")) {
              logger.error(`Print error: ${stderr || error.message}`);
              reject(new Error(stderr || error.message || "Print failed"));
              return;
            }

            const jobID = `RAW-${Date.now()}`;
            logger.info(`✅ Print job ${jobID} sent to ${printerName}`);
            resolve(jobID);
          },
        );
      } catch (error) {
        logger.error("Print raw error:", error);
        reject(error);
      }
    });
  }

  /**
   * Print PDF file (for A4 invoice)
   * @param {string} printerName - Name of printer
   * @param {string} pdfPath - Path to PDF file
   * @returns {Promise<string>} Job ID
   */
  printPDF(printerName, pdfPath) {
    return new Promise((resolve, reject) => {
      try {
        logger.info(`Printing PDF to ${printerName}: ${pdfPath}`);

        // Try pdf-to-printer package first (if installed)
        try {
          const ptp = require("pdf-to-printer");

          ptp
            .print(pdfPath, { printer: printerName })
            .then(() => {
              const jobID = `PDF-${Date.now()}`;
              logger.info(`✅ PDF print job ${jobID} sent to ${printerName}`);
              resolve(jobID);
            })
            .catch((err) => {
              logger.warn("pdf-to-printer failed, trying alternative method:", err.message);
              this.printPDFAlternative(printerName, pdfPath, resolve, reject);
            });
        } catch (requireError) {
          // pdf-to-printer not installed, use alternative
          logger.info("pdf-to-printer not available, using PowerShell method");
          this.printPDFAlternative(printerName, pdfPath, resolve, reject);
        }
      } catch (error) {
        logger.error("Print PDF error:", error);
        reject(error);
      }
    });
  }

  /**
   * Alternative PDF printing using PowerShell
   */
  printPDFAlternative(printerName, pdfPath, resolve, reject) {
    // Method 1: Use Adobe Reader command line (if installed)
    const adobePath = "C:\\Program Files\\Adobe\\Acrobat DC\\Acrobat\\Acrobat.exe";
    const adobeAltPath = "C:\\Program Files (x86)\\Adobe\\Acrobat Reader DC\\Reader\\AcroRd32.exe";

    let printCommand = "";

    if (fs.existsSync(adobePath)) {
      printCommand = `"${adobePath}" /t "${pdfPath}" "${printerName}"`;
    } else if (fs.existsSync(adobeAltPath)) {
      printCommand = `"${adobeAltPath}" /t "${pdfPath}" "${printerName}"`;
    } else {
      // Method 2: Use Edge for printing (Windows built-in)
      printCommand = `start msedge --headless --print-to-printer="${printerName}" "${pdfPath}"`;
    }

    exec(printCommand, (error, stdout, stderr) => {
      if (error) {
        logger.error(`PDF print error: ${stderr || error.message}`);
        reject(new Error(stderr || error.message));
        return;
      }

      const jobID = `PDF-${Date.now()}`;
      logger.info(`✅ PDF print job ${jobID} sent to ${printerName}`);
      resolve(jobID);
    });
  }

  /**
   * Check if printer is available
   * @param {string} printerName - Name of printer
   * @returns {Promise<boolean>} True if available
   */
  async isPrinterAvailable(printerName) {
    try {
      const printers = await this.listPrinters();
      return printers.some((p) => p.name === printerName);
    } catch (error) {
      logger.error("Error checking printer availability:", error);
      return false;
    }
  }
}

module.exports = new PrinterService();
