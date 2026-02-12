const ServisPrinter = require("../services/servisPrinter");
const printerService = require("../services/printerService");
const printQueue = require("../services/printQueue");
const logger = require("../utils/logger");

class ServisPrintController {
  async printNotaServis(req, res) {
    try {
      const data = req.body;

      // Validate data
      if (!data.customerName || !data.items || data.items.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid data: customerName and items are required",
        });
      }

      logger.info(`Nota servis print request: ${data.items.length} items for ${data.customerName}`);

      // Get printer for nota (invoice printer)
      const printerName = printerService.getPrinterForType("invoice");

      // Add to queue
      const jobID = printQueue.addJob(
        printerName,
        async () => {
          const printer = new ServisPrinter(printerName);
          return await printer.printNotaServis(data);
        },
        {
          type: "nota-servis",
          customer: data.customerName,
          itemCount: data.items.length,
        },
      );

      const queueStatus = printQueue.getQueueStatus(printerName);

      logger.info(`✅ Nota servis job ${jobID} queued for ${printerName}`);
      logger.info(`📊 Queue status: ${queueStatus.queueLength} job(s) waiting`);

      // Return immediately
      res.json({
        success: true,
        jobID: jobID,
        printer: printerName,
        queueStatus: queueStatus,
        message: "Nota servis queued for printing",
      });
    } catch (error) {
      logger.error("Print nota servis error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async printNotaCustom(req, res) {
    try {
      const data = req.body;

      // Validate data
      if (!data.customerName || !data.items || data.items.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid data: customerName and items are required",
        });
      }

      logger.info(`Nota custom print request: ${data.items.length} items for ${data.customerName}`);

      // Get printer for nota (invoice printer)
      const printerName = printerService.getPrinterForType("invoice");

      // Add to queue
      const jobID = printQueue.addJob(
        printerName,
        async () => {
          const printer = new ServisPrinter(printerName);
          return await printer.printNotaCustom(data);
        },
        {
          type: "nota-custom",
          customer: data.customerName,
          itemCount: data.items.length,
        },
      );

      const queueStatus = printQueue.getQueueStatus(printerName);

      logger.info(`✅ Nota custom job ${jobID} queued for ${printerName}`);
      logger.info(`📊 Queue status: ${queueStatus.queueLength} job(s) waiting`);

      // Return immediately
      res.json({
        success: true,
        jobID: jobID,
        printer: printerName,
        queueStatus: queueStatus,
        message: "Nota custom queued for printing",
      });
    } catch (error) {
      logger.error("Print nota custom error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

module.exports = new ServisPrintController();
