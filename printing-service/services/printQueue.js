const logger = require("../utils/logger");

/**
 * Print Queue Manager
 * Handles sequential printing to prevent race conditions
 */
class PrintQueue {
  constructor() {
    // Map of printer queues: printerName -> array of jobs
    this.queues = new Map();
    // Map of processing status: printerName -> boolean
    this.processing = new Map();
    // Map of job tracking: jobID -> job info
    this.jobs = new Map();
    // Job counter for generating IDs
    this.jobCounter = 1;
  }

  /**
   * Add a print job to the queue
   * @param {string} printerName - Name of the target printer
   * @param {Function} jobFunction - Async function that performs the actual printing
   * @param {Object} metadata - Additional info about the job
   * @returns {string} jobID - Returns immediately (non-blocking)
   */
  addJob(printerName, jobFunction, metadata = {}) {
    const jobID = `JOB-${Date.now()}-${this.jobCounter++}`;

    logger.info(`📥 Queue: Adding job ${jobID} for printer ${printerName}`);

    // Initialize queue for this printer if not exists
    if (!this.queues.has(printerName)) {
      this.queues.set(printerName, []);
      this.processing.set(printerName, false);
    }

    // Create job info
    const jobInfo = {
      id: jobID,
      printerName,
      status: "queued",
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      error: null,
      metadata,
    };

    this.jobs.set(jobID, jobInfo);

    // Create job with promise for internal tracking
    const job = {
      id: jobID,
      jobFunction,
      metadata,
      promise: null, // Will be set when processing starts
    };

    this.queues.get(printerName).push(job);
    logger.info(`📊 Queue: ${printerName} now has ${this.queues.get(printerName).length} job(s)`);

    // Start processing the queue (async, non-blocking)
    setImmediate(() => this.processQueue(printerName));

    // Return jobID immediately so caller can track status
    return jobID;
  }

  /**
   * Process the queue for a specific printer
   * @param {string} printerName
   */
  async processQueue(printerName) {
    // Check if already processing
    if (this.processing.get(printerName)) {
      logger.info(`⏳ Queue: ${printerName} is busy, job will be processed when ready`);
      return;
    }

    const queue = this.queues.get(printerName);

    // Check if queue is empty
    if (!queue || queue.length === 0) {
      logger.info(`✅ Queue: ${printerName} is empty`);
      return;
    }

    // Mark printer as busy
    this.processing.set(printerName, true);

    // Get next job
    const job = queue.shift();
    const jobInfo = this.jobs.get(job.id);

    logger.info(`🖨️  Queue: Processing job ${job.id} for ${printerName}`);
    logger.info(`📊 Queue: ${queue.length} job(s) remaining in queue`);

    // Update job status
    jobInfo.status = "processing";
    jobInfo.startedAt = new Date();

    try {
      // Execute the print job
      const result = await job.jobFunction();

      // Mark job as completed
      jobInfo.status = "completed";
      jobInfo.completedAt = new Date();
      jobInfo.result = result; // Store result for reference

      logger.info(`✅ Queue: Job ${job.id} completed successfully`);
    } catch (error) {
      // Mark job as failed
      jobInfo.status = "error";
      jobInfo.completedAt = new Date();
      jobInfo.error = error.message;

      logger.error(`❌ Queue: Job ${job.id} failed:`, error);
    } finally {
      // Mark printer as available
      this.processing.set(printerName, false);

      logger.info(`🔓 Queue: ${printerName} is now available`);

      // Process next job in queue (if any)
      setImmediate(() => this.processQueue(printerName));
    }
  }

  /**
   * Get job status
   * @param {string} jobID
   * @returns {Object|null}
   */
  getJobStatus(jobID) {
    const job = this.jobs.get(jobID);
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      printerName: job.printerName,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      metadata: job.metadata,
    };
  }

  /**
   * Get queue status for a printer
   * @param {string} printerName
   * @returns {Object}
   */
  getQueueStatus(printerName) {
    const queue = this.queues.get(printerName);
    const isProcessing = this.processing.get(printerName) || false;

    return {
      printerName,
      queueLength: queue ? queue.length : 0,
      isProcessing,
      status: isProcessing ? "busy" : "idle",
    };
  }

  /**
   * Get all queue statuses
   * @returns {Array}
   */
  getAllQueueStatuses() {
    const statuses = [];
    for (const [printerName] of this.queues) {
      statuses.push(this.getQueueStatus(printerName));
    }
    return statuses;
  }

  /**
   * Cleanup old completed jobs (older than 5 minutes)
   */
  cleanupOldJobs() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    let cleaned = 0;

    for (const [jobID, job] of this.jobs.entries()) {
      if (job.completedAt && job.completedAt < fiveMinutesAgo) {
        this.jobs.delete(jobID);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`🧹 Queue: Cleaned up ${cleaned} old job(s)`);
    }
  }

  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    let totalQueued = 0;
    let totalProcessing = 0;
    let totalCompleted = 0;
    let totalError = 0;

    for (const [, job] of this.jobs.entries()) {
      switch (job.status) {
        case "queued":
          totalQueued++;
          break;
        case "processing":
          totalProcessing++;
          break;
        case "completed":
          totalCompleted++;
          break;
        case "error":
          totalError++;
          break;
      }
    }

    return {
      totalJobs: this.jobs.size,
      queued: totalQueued,
      processing: totalProcessing,
      completed: totalCompleted,
      error: totalError,
      printers: this.queues.size,
    };
  }
}

// Create singleton instance
const printQueue = new PrintQueue();

// Cleanup old jobs every minute
setInterval(() => {
  printQueue.cleanupOldJobs();
}, 60000);

module.exports = printQueue;
