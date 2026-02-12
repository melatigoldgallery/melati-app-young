const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs").promises;
const logger = require("../utils/logger");
const Handlebars = require("handlebars");

class PDFService {
  constructor() {
    this.browser = null;
    this.templateCache = new Map();
    this.isProcessing = false;
    this.requestQueue = [];
    this.initializeHelpers();
  }

  /**
   * Initialize Handlebars helpers
   */
  initializeHelpers() {
    Handlebars.registerHelper("formatRupiah", function (angka) {
      if (!angka && angka !== 0) return "";
      const number = typeof angka === "string" ? parseInt(angka.replace(/\./g, "")) : angka;
      return "Rp " + new Intl.NumberFormat("id-ID").format(number);
    });

    Handlebars.registerHelper("add", function (a, b) {
      return a + b;
    });

    Handlebars.registerHelper("eq", function (a, b) {
      return a === b;
    });
  }

  /**
   * Initialize Puppeteer browser
   * Fallback strategy:
   * 1. Try Chrome from system paths
   * 2. Try Chromium bundled with Puppeteer
   * 3. Try Microsoft Edge (Chromium-based)
   */
  async init() {
    try {
      if (!this.browser) {
        logger.info("Initializing Puppeteer browser...");

        const launchOptions = {
          headless: "new",
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        };

        // 🔍 STEP 1: Try Chrome from system
        const chromePaths = [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
          process.env.PROGRAMFILES + "\\Google\\Chrome\\Application\\chrome.exe",
        ];

        let chromeFound = false;
        for (const chromePath of chromePaths) {
          try {
            const fs = require("fs");
            if (fs.existsSync(chromePath)) {
              launchOptions.executablePath = chromePath;
              logger.info(`✅ Found Chrome at: ${chromePath}`);
              chromeFound = true;
              break;
            }
          } catch (err) {
            // Continue to next path
          }
        }

        // 🔍 STEP 2: If Chrome not found, try Edge (Chromium-based)
        if (!chromeFound) {
          const edgePaths = [
            "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
            "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          ];

          for (const edgePath of edgePaths) {
            try {
              const fs = require("fs");
              if (fs.existsSync(edgePath)) {
                launchOptions.executablePath = edgePath;
                logger.info(`✅ Found Edge (Chromium) at: ${edgePath}`);
                chromeFound = true;
                break;
              }
            } catch (err) {
              // Continue
            }
          }
        }

        // 🔍 STEP 3: If still not found, let Puppeteer use bundled Chromium (if available)
        if (!chromeFound) {
          logger.warn("⚠️ Chrome/Edge not found in system. Attempting to use Puppeteer's bundled Chromium...");
          logger.warn(
            "💡 If this fails, please install Google Chrome or run: cd printing-service && npm install puppeteer",
          );
          // Don't set executablePath, let Puppeteer use default
        }

        this.browser = await puppeteer.launch(launchOptions);
        logger.info("✅ Puppeteer browser initialized successfully");
      }
    } catch (error) {
      logger.error("❌ Failed to initialize Puppeteer browser");
      logger.error("Error details:", error.message);
      logger.error("");
      logger.error("🔧 TROUBLESHOOTING:");
      logger.error("   1. Install Google Chrome: https://www.google.com/chrome/");
      logger.error("   2. OR install Puppeteer with Chromium: cd printing-service && npm install puppeteer");
      logger.error("   3. Restart the print service after installation");
      logger.error("");
      throw new Error(`Browser initialization failed: ${error.message}`);
    }
  }

  /**
   * Generate invoice PDF with queue mechanism
   * @param {Object} data - Invoice data
   * @returns {Promise<string>} Path to generated PDF
   */
  async generateInvoicePDF(data) {
    // Add to queue if another request is processing
    if (this.isProcessing) {
      logger.info("Request queued, waiting for previous request to complete...");
      return new Promise((resolve, reject) => {
        this.requestQueue.push({ data, resolve, reject });
      });
    }

    return this._generateInvoicePDFInternal(data);
  }

  /**
   * Internal PDF generation method
   * @private
   */
  async _generateInvoicePDFInternal(data) {
    this.isProcessing = true;
    let page = null;

    try {
      logger.info("🔄 Starting PDF generation...");

      // Ensure browser is initialized
      await this.init();

      // Clear template cache to ensure latest version is loaded
      this.templateCache.clear();

      // Transform data to match template format
      const templateData = {
        date: data.tanggal || data.date || "",
        customerName: data.customerName || "",
        customerPhone: data.customerPhone || "",
        sales: data.sales || "Admin",
        total: data.totalHarga || data.total || 0,
        items: (data.items || []).map((item) => ({
          code: item.kode || item.kodeText || item.code || "-",
          quantity: item.jumlah || item.quantity || 1,
          name: item.nama || item.name || "-",
          purity: item.kadar || item.purity || "-",
          weight:
            item.berat ||
            (typeof item.weight === "string" ? item.weight.replace(" gr", "").trim() : item.weight) ||
            "-",
          price: item.totalHarga || item.harga || item.price || 0,
        })),
        notes: data.notes || "",
      };

      // Load and compile template
      const template = await this.loadTemplate("invoice");
      const html = template(templateData);

      // Create new page with viewport matching physical paper size
      page = await this.browser.newPage();

      // Set viewport to match paper dimensions (20.5cm x 10.5cm at 96 DPI)
      await page.setViewport({
        width: 774, // 20.5cm = 774px
        height: 396, // 10.5cm = 396px
      });

      await page.setContent(html, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });

      // Generate PDF - Let CSS @page control size and orientation
      const pdfBuffer = await page.pdf({
        preferCSSPageSize: true, // Follow CSS @page rules
        printBackground: false,
        margin: {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        },
        scale: 1, // Default scale, no zoom
      });

      await page.close();
      page = null;

      // Save to temp directory
      const tempDir = path.join(__dirname, "../temp");
      await fs.mkdir(tempDir, { recursive: true });

      const filename = `invoice_${Date.now()}.pdf`;
      const tempPath = path.join(tempDir, filename);

      await fs.writeFile(tempPath, pdfBuffer);

      logger.info(`✅ PDF generated: ${filename}`);

      return tempPath;
    } catch (error) {
      logger.error("PDF generation error:", error);

      // Close page if still open
      if (page) {
        try {
          await page.close();
        } catch (closeError) {
          logger.error("Error closing page:", closeError);
        }
      }

      throw error;
    } finally {
      this.isProcessing = false;

      // Process next request in queue
      if (this.requestQueue.length > 0) {
        const nextRequest = this.requestQueue.shift();
        logger.info(`Processing queued request (${this.requestQueue.length} remaining)...`);

        this._generateInvoicePDFInternal(nextRequest.data).then(nextRequest.resolve).catch(nextRequest.reject);
      }
    }
  }

  /**
   * Load and compile template
   * @param {string} templateName - Template filename without extension
   * @returns {Promise<Function>} Compiled template function
   */
  async loadTemplate(templateName) {
    // Check cache
    if (this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName);
    }

    try {
      const templatePath = path.join(__dirname, "../templates", `${templateName}.html`);
      const templateContent = await fs.readFile(templatePath, "utf-8");

      // Compile with Handlebars
      const compiled = Handlebars.compile(templateContent);

      // Cache it
      this.templateCache.set(templateName, compiled);

      logger.info(`Template loaded and cached: ${templateName}`);
      return compiled;
    } catch (error) {
      logger.error(`Error loading template ${templateName}:`, error);
      throw error;
    }
  }

  /**
   * Cleanup browser and temp files
   */
  async cleanup() {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        logger.info("Puppeteer browser closed");
      }

      // Clean old temp files (older than 1 hour)
      const tempDir = path.join(__dirname, "../temp");
      const files = await fs.readdir(tempDir);
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;

      for (const file of files) {
        if (file.endsWith(".pdf")) {
          const filePath = path.join(tempDir, file);
          const stats = await fs.stat(filePath);

          if (now - stats.mtimeMs > oneHour) {
            await fs.unlink(filePath);
            logger.info(`Cleaned up old temp file: ${file}`);
          }
        }
      }
    } catch (error) {
      logger.error("Cleanup error:", error);
    }
  }
}

module.exports = new PDFService();
