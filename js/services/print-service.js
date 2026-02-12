/**
 * Print Service Client
 * Handles communication with local print service for silent printing
 * Fallback to window.print() if service is offline
 */

class PrintService {
  constructor() {
    // ⚠️ IMPORTANT: Update this if you deploy to GitHub Pages
    this.serviceURL = this.detectServiceURL();
    this.isOnline = false;
    this.checkInterval = null;
    this.statusIndicator = null;
  }

  /**
   * Detect service URL based on environment
   */
  detectServiceURL() {
    // Check if running on GitHub Pages
    if (window.location.hostname.includes("github.io")) {
      return "http://localhost:3001/api";
    }

    // Local development
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "http://localhost:3001/api";
    }

    // Default
    return "http://localhost:3001/api";
  }

  /**
   * Initialize print service
   */
  async init() {
    console.log("🖨️ Initializing Print Service...");
    console.log("📡 Service URL:", this.serviceURL);

    await this.checkServiceStatus();

    // Check status setiap 30 detik
    this.checkInterval = setInterval(() => {
      this.checkServiceStatus();
    }, 30000);

    console.log("✅ Print Service initialized");
  }

  /**
   * Check if print service is online
   */
  async checkServiceStatus() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // Increase timeout

      const response = await fetch(`${this.serviceURL}/health`, {
        method: "GET",
        signal: controller.signal,
        mode: "cors",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      clearTimeout(timeoutId);
      this.isOnline = response.ok;

      if (this.isOnline) {
        console.log("✅ Print service online");
      } else {
        console.warn("⚠️ Print service returned error status");
      }

      this.updateStatusIndicator();
      return this.isOnline;
    } catch (error) {
      if (error.name === "AbortError") {
        console.warn("⚠️ Print service timeout (service may be starting...)");
      } else if (error.message.includes("CORS") || error.message.includes("loopback")) {
        console.error("❌ CORS blocked - Chrome Private Network Access policy");
        console.error("🔧 Fix: Add 'Access-Control-Allow-Private-Network: true' header to print service");
        console.error("📖 Docs: https://developer.chrome.com/blog/private-network-access-preflight/");
      } else {
        console.warn("⚠️ Print service offline:", error.message);
      }
      this.isOnline = false;
      this.updateStatusIndicator();
      return false;
    }
  }

  /**
   * Update status indicator in UI
   */
  updateStatusIndicator() {
    const indicator = document.getElementById("printServiceStatus");
    const statusText = document.getElementById("printServiceStatusText");

    if (!indicator || !statusText) return;

    if (this.isOnline) {
      indicator.className = "alert alert-success";
      indicator.style.display = "block";
      statusText.innerHTML = '<i class="fas fa-check-circle me-2"></i>Print service aktif - Siap cetak otomatis';

      // Auto hide after 3 seconds
      setTimeout(() => {
        indicator.style.display = "none";
      }, 3000);
    } else {
      indicator.className = "alert alert-warning";
      indicator.style.display = "block";
      statusText.innerHTML =
        '<i class="fas fa-exclamation-triangle me-2"></i>Print service offline - Menggunakan browser print';
    }
  }

  /**
   * Print thermal receipt
   * @param {Object} data - Receipt data
   * @returns {Promise<Object>} Result
   */
  async printReceipt(data) {
    // Check service status first
    if (!this.isOnline) {
      const isAvailable = await this.checkServiceStatus();
      if (!isAvailable) {
        console.log("🔄 Fallback to browser print (receipt)");
        return this.fallbackToBrowserPrint("receipt", data);
      }
    }

    try {
      console.log("🖨️ Sending receipt to print service...");

      const response = await fetch(`${this.serviceURL}/print/receipt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
        mode: "cors",
        credentials: "omit",
      });

      const result = await response.json();

      if (result.success) {
        console.log("✅ Receipt sent to printer:", result.jobID);
        return {
          success: true,
          jobID: result.jobID,
          printer: result.printer,
        };
      } else {
        throw new Error(result.error || "Print failed");
      }
    } catch (error) {
      console.error("❌ Print service error:", error);
      console.log("🔄 Fallback to browser print");
      return this.fallbackToBrowserPrint("receipt", data);
    }
  }

  /**
   * Print A4 invoice
   * @param {Object} data - Invoice data
   * @returns {Promise<Object>} Result
   */
  async printInvoice(data) {
    console.log("🖨️ === printInvoice called ===");
    console.log("  - isOnline:", this.isOnline);
    console.log("  - serviceURL:", this.serviceURL);
    console.log("  - data:", data);

    // Check service status first
    if (!this.isOnline) {
      console.log("⚠️ Service offline, checking status...");
      const isAvailable = await this.checkServiceStatus();
      if (!isAvailable) {
        console.log("❌ Service still offline, using fallback");
        return this.fallbackToBrowserPrint("invoice", data);
      }
      console.log("✅ Service is now online");
    }

    try {
      console.log("📤 Sending invoice to print service...");

      const response = await fetch(`${this.serviceURL}/print/invoice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
        mode: "cors",
        credentials: "omit",
      });

      console.log("📥 Response status:", response.status, response.statusText);

      const result = await response.json();
      console.log("📥 Response data:", result);

      if (result.success) {
        console.log("✅ Invoice sent to printer successfully!");
        console.log("  - Job ID:", result.jobID);
        console.log("  - Printer:", result.printer);
        return {
          success: true,
          jobID: result.jobID,
          printer: result.printer,
          invoiceNumber: result.invoiceNumber,
          method: "service", // Explicitly mark as service method
        };
      } else {
        console.error("❌ Print service returned error:", result.error);
        throw new Error(result.error || "Print failed");
      }
    } catch (error) {
      console.error("❌ Print service error:", error);
      console.error("  - Error type:", error.constructor.name);
      console.error("  - Error message:", error.message);
      console.log("🔄 Fallback to browser print");
      return this.fallbackToBrowserPrint("invoice", data);
    }
  }

  /**
   * Fallback to browser print (window.print)
   * @param {string} type - 'receipt' or 'invoice'
   * @param {Object} data - Print data
   * @returns {Object} Result
   */
  fallbackToBrowserPrint(type, data) {
    console.warn("📄 === Using fallback: window.print() ===");
    console.log("  - Type:", type);
    console.log("  - Data:", data);

    try {
      // Store data globally untuk diakses oleh existing print functions
      window.currentTransactionData = data;

      // Trigger existing print functions
      if (type === "receipt") {
        if (typeof printDocument === "function") {
          printDocument("receipt");
        } else if (window.penjualanHandler && typeof window.penjualanHandler.printReceiptBrowser === "function") {
          window.penjualanHandler.printReceiptBrowser(data);
        } else {
          console.error("No fallback print function available");
          return { success: false, method: "browser", error: "No print function" };
        }
      } else {
        if (typeof printDocument === "function") {
          printDocument("invoice");
        } else if (window.penjualanHandler && typeof window.penjualanHandler.printInvoiceBrowser === "function") {
          window.penjualanHandler.printInvoiceBrowser(data);
        } else {
          console.error("No fallback print function available");
          return { success: false, method: "browser", error: "No print function" };
        }
      }

      console.log("✅ Browser print triggered");
      return {
        success: true,
        method: "browser", // Mark clearly as browser method
        message: "Using browser print dialog",
      };
    } catch (error) {
      console.error("Fallback print error:", error);
      return {
        success: false,
        method: "fallback",
        error: error.message,
      };
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log("🧹 Print service cleaned up");
  }
}

// Initialize globally
if (typeof window !== "undefined") {
  window.PrintService = PrintService;
  window.printService = new PrintService();

  // Auto-initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      window.printService.init();
    });
  } else {
    window.printService.init();
  }

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    window.printService.cleanup();
  });
}
