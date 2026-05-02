const { Worker } = require("bullmq");
const { getQueueConnection } = require("./connection");
const logger = require("../utils/logger");
const { QUEUE_NAME } = require("./renewalQueue");

let renewalWorker = null;

const startRenewalWorker = () => {
  const connection = getQueueConnection();
  if (!connection) {
    logger.info("[RenewalWorker] Redis not available — worker not started");
    return null;
  }

  if (renewalWorker) return renewalWorker;

  renewalWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { orderCode, forceRenewal } = job.data;
      logger.info(`[RenewalWorker] Processing job ${job.id} — order: ${orderCode}`);

      const { processRenewalTask, queueRenewalTask } =
        require("../../webhook/sepay/renewalQueue");

      queueRenewalTask(orderCode, { forceRenewal });
      const result = await processRenewalTask(orderCode);

      if (!result?.success) {
        throw new Error(result?.lastError || `Renewal failed for ${orderCode}`);
      }

      logger.info(`[RenewalWorker] Completed job ${job.id} — order: ${orderCode}`);
      return result;
    },
    {
      connection,
      concurrency: 1,
      limiter: { max: 2, duration: 60_000 },
    }
  );

  renewalWorker.on("completed", (job) => {
    logger.info(`[RenewalWorker] Job ${job.id} completed`);
  });

  renewalWorker.on("failed", (job, err) => {
    logger.error(`[RenewalWorker] Job ${job?.id} failed: ${err.message}`);
  });

  renewalWorker.on("error", (err) => {
    logger.error(`[RenewalWorker] Worker error: ${err.message}`);
  });

  logger.info("[RenewalWorker] Started");
  return renewalWorker;
};

module.exports = { startRenewalWorker };
