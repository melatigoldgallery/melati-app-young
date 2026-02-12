const printerService = require("../services/printerService");
const escposService = require("../services/escposService");
const pdfService = require("../services/pdfService");
const printQueue = require("../services/printQueue");
const logger = require("../utils/logger");
const fs = require("fs").promises;

class PrintController {
  /**
   * Print thermal receipt (with queue)
   */
  async printReceipt(req, res) {
    try {
      const receiptData = req.body;

      // Validate data
      if (!receiptData.items || receiptData.items.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No items to print",
        });
      }

      logger.info(`Receipt print request: ${receiptData.items.length} items`);
      logger.info(`Receipt data received:`, JSON.stringify(receiptData, null, 2));

      // Get thermal printer
      const printerName = printerService.getPrinterForType("receipt");

      // Check if printer is available
      const isAvailable = await printerService.isPrinterAvailable(printerName);
      if (!isAvailable) {
        return res.status(404).json({
          success: false,
          error: `Printer not found: ${printerName}`,
        });
      }

      // Generate ESC/POS commands
      const commands = escposService.generateReceiptCommands(receiptData);

      // Add to queue instead of direct print (returns jobID immediately)
      const jobID = printQueue.addJob(
        printerName,
        async () => {
          return await printerService.printRaw(printerName, commands);
        },
        {
          type: "receipt",
          itemCount: receiptData.items.length,
        },
      );

      // Get job info immediately
      const queueStatus = printQueue.getQueueStatus(printerName);

      logger.info(`✅ Receipt job ${jobID} queued for ${printerName}`);
      logger.info(`📊 Queue status: ${queueStatus.queueLength} job(s) waiting, printer is ${queueStatus.status}`);

      // Return immediately with job info (don't wait for print to complete)
      res.json({
        success: true,
        jobID: jobID,
        printer: printerName,
        queueStatus: queueStatus,
        message: "Receipt queued for printing",
      });
    } catch (error) {
      logger.error("Print receipt error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Print A4 invoice (with queue)
   */
  async printInvoice(req, res) {
    try {
      const invoiceData = req.body;

      // Validate data
      if (!invoiceData.items || invoiceData.items.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No items to print",
        });
      }

      logger.info(`Invoice print request: ${invoiceData.items.length} items`);

      // Generate invoice number if not provided
      if (!invoiceData.invoiceNumber) {
        invoiceData.invoiceNumber = `INV-${Date.now()}`;
      }

      // Get inkjet printer
      const printerName = printerService.getPrinterForType("invoice");

      // Check if printer is available
      const isAvailable = await printerService.isPrinterAvailable(printerName);
      if (!isAvailable) {
        return res.status(404).json({
          success: false,
          error: `Printer not found: ${printerName}`,
        });
      }

      // Generate PDF first (outside queue to avoid delay)
      const pdfPath = await pdfService.generateInvoicePDF(invoiceData);
      logger.info(`📄 PDF generated: ${pdfPath}`);

      // Add to queue (returns jobID immediately)
      const jobID = printQueue.addJob(
        printerName,
        async () => {
          try {
            // Print PDF
            const printJobID = await printerService.printPDF(printerName, pdfPath);

            // Schedule PDF cleanup after successful print (10 seconds delay for safety)
            setTimeout(async () => {
              try {
                await fs.unlink(pdfPath);
                logger.info(`🧹 Cleaned up PDF: ${pdfPath}`);
              } catch (error) {
                logger.error("Error cleaning up PDF:", error);
              }
            }, 10000);

            return { printJobID, pdfPath };
          } catch (error) {
            // Cleanup PDF on error
            try {
              await fs.unlink(pdfPath);
            } catch (cleanupError) {
              logger.error("Error cleaning up PDF after error:", cleanupError);
            }
            throw error;
          }
        },
        {
          type: "invoice",
          invoiceNumber: invoiceData.invoiceNumber,
          itemCount: invoiceData.items.length,
          pdfPath: pdfPath,
        },
      );

      // Get queue status
      const queueStatus = printQueue.getQueueStatus(printerName);

      logger.info(`✅ Invoice job ${jobID} queued for ${printerName}`);
      logger.info(`📊 Queue status: ${queueStatus.queueLength} job(s) waiting, printer is ${queueStatus.status}`);

      res.json({
        success: true,
        jobID: jobID,
        printer: printerName,
        invoiceNumber: invoiceData.invoiceNumber,
        queueStatus: queueStatus,
        message: "Invoice queued for printing",
      });
    } catch (error) {
      logger.error("Print invoice error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

module.exports = new PrintController();
