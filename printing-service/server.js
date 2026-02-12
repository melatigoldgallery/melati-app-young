const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const logger = require("./utils/logger");
const printController = require("./controllers/printController");
const servisPrintController = require("./controllers/servisPrintController");
const printerService = require("./services/printerService");
const printQueue = require("./services/printQueue");

const app = express();
const PORT = process.env.PORT || 3001;

// ✅ CORS Configuration untuk GitHub Pages
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    // Or from file:// protocol (local HTML files)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      "https://melatigoldgallery.github.io", 
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "http://localhost:5500", 
      "http://127.0.0.1:5500",
      "http://localhost:5501",
      "http://127.0.0.1:5501",
    ];

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // Allow file:// protocol for local testing
      callback(null, true);
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  optionsSuccessStatus: 200,
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

// Middleware untuk Chrome Private Network Access
// Fix CORS block dari HTTPS → HTTP localhost
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Set CORS headers
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Chrome Private Network Access headers
  res.setHeader("Access-Control-Allow-Private-Network", "true");

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  next();
});

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Preflight requests
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date(),
    uptime: process.uptime(),
    version: "1.0.0",
  });
});

// List available printers
app.get("/api/printers", async (req, res) => {
  try {
    const printers = await printerService.listPrinters();
    const config = require("./config/printers.json");

    res.json({
      success: true,
      printers: printers,
      config: config,
    });
  } catch (error) {
    logger.error("Error listing printers:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update printer configuration
app.post("/api/printers/config", async (req, res) => {
  try {
    const { type, printerName } = req.body;

    if (!type || !printerName) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: type, printerName",
      });
    }

    // Validate printer exists
    const printers = printerService.listPrinters();
    const exists = printers.find((p) => p.name === printerName);

    if (!exists) {
      return res.status(400).json({
        success: false,
        error: "Printer not found",
      });
    }

    // Update config
    const fs = require("fs");
    const configPath = path.join(__dirname, "config", "printers.json");
    const config = require("./config/printers.json");
    config[type] = printerName;

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    logger.info(`Printer config updated: ${type} -> ${printerName}`);
    res.json({ success: true, message: "Configuration updated" });
  } catch (error) {
    logger.error("Error updating printer config:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Print receipt endpoint
app.post("/api/print/receipt", printController.printReceipt.bind(printController));

// Print invoice endpoint
app.post("/api/print/invoice", printController.printInvoice.bind(printController));

// Print nota servis endpoint
app.post("/api/print/nota-servis", servisPrintController.printNotaServis.bind(servisPrintController));

// Print nota custom endpoint
app.post("/api/print/nota-custom", servisPrintController.printNotaCustom.bind(servisPrintController));

// Get job status endpoint
app.get("/api/job/:jobID", (req, res) => {
  try {
    const { jobID } = req.params;
    const jobStatus = printQueue.getJobStatus(jobID);

    if (!jobStatus) {
      return res.status(404).json({
        success: false,
        error: "Job not found",
      });
    }

    res.json({
      success: true,
      job: jobStatus,
    });
  } catch (error) {
    logger.error("Error getting job status:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get queue status endpoint
app.get("/api/queue/status", (req, res) => {
  try {
    const statuses = printQueue.getAllQueueStatuses();
    const stats = printQueue.getStats();

    res.json({
      success: true,
      queues: statuses,
      stats: stats,
    });
  } catch (error) {
    logger.error("Error getting queue status:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get specific printer queue status
app.get("/api/queue/:printerName", (req, res) => {
  try {
    const { printerName } = req.params;
    const queueStatus = printQueue.getQueueStatus(printerName);

    res.json({
      success: true,
      queue: queueStatus,
    });
  } catch (error) {
    logger.error("Error getting printer queue status:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
  });
});

// Start server
app.listen(PORT, () => {
  logger.info("=".repeat(50));
  logger.info("🖨️  Program Print Otomatis Melati App - Jangan Ditutup!");
  logger.info("🖨️  Melati Print Service Started");
  logger.info(`📡 Server running on http://localhost:${PORT}`);
  logger.info(`📋 API Endpoints:`);
  logger.info(`   GET  /api/health            - Health check`);
  logger.info(`   GET  /api/printers          - List printers`);
  logger.info(`   POST /api/printers/config   - Update config`);
  logger.info(`   POST /api/print/receipt     - Print receipt`);
  logger.info(`   POST /api/print/invoice     - Print invoice`);
  logger.info(`   POST /api/print/nota-servis - Print nota servis`);
  logger.info(`   POST /api/print/nota-custom - Print nota custom`);
  logger.info(`   GET  /api/job/:jobID        - Get job status`);
  logger.info(`   GET  /api/queue/status      - Get all queue statuses`);
  logger.info(`   GET  /api/queue/:printer    - Get printer queue status`);
  logger.info("=".repeat(50));
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully...");
  process.exit(0);
});

module.exports = app;
