const { db } = require("../../db");
const logger = require("../../utils/logger");
const { TABLE, COLS } = require("./accountTable");
const { resolveAdobeSlotsUsed } = require("./usersSnapshotUtils");

function resolveCheckAllConcurrency(raw = process.env.RENEW_ADOBE_CHECK_ALL_CONCURRENCY) {
  const parsed = Number.parseInt(String(raw || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 4;
  return Math.max(1, Math.min(parsed, 4));
}

const adobeQueueStatus = (_req, res) => {
  const maxConcurrent = resolveCheckAllConcurrency();
  return res.json({
    running: 0,
    queued: 0,
    maxConcurrent,
    maxQueueSize: 0,
  });
};

async function runCheckAllAccountsFlow({
  runCheckForAccountId,
  onEvent = null,
  shouldAbort = () => false,
  logPrefix = "[renew-adobe][check-all]",
  concurrency = resolveCheckAllConcurrency(),
}) {
  const emit = (data) => {
    if (typeof onEvent === "function") {
      onEvent(data);
    }
  };

  const rows = await db(TABLE)
    .select(COLS.ID, COLS.EMAIL)
    .where(COLS.IS_ACTIVE, true)
    .orderBy(COLS.ID, "asc");

  const total = rows.length;
  const maxConcurrent =
    total > 0 ? Math.min(resolveCheckAllConcurrency(concurrency), total) : 0;
  emit({ type: "start", total, concurrency: maxConcurrent });

  let completed = 0;
  let failed = 0;
  let nextIndex = 0;

  const runOne = async (account, workerIndex) => {
    const id = account[COLS.ID];
    const email = account[COLS.EMAIL];
    emit({
      type: "checking",
      id,
      email,
      completed,
      failed,
      total,
      worker: workerIndex,
      concurrency: maxConcurrent,
    });

    try {
      const checkResult = await runCheckForAccountId(id);
      completed += 1;
      const updated = await db(TABLE).where(COLS.ID, id).first();
      const removedFromDb =
        checkResult?.removedFromDb === true || !updated;
      emit({
        type: "done",
        id,
        email,
        completed,
        failed,
        total,
        worker: workerIndex,
        concurrency: maxConcurrent,
        removed_from_db: removedFromDb,
        org_name: updated?.[COLS.ORG_NAME] ?? null,
        user_count: updated?.[COLS.USER_COUNT] ?? 0,
        slot_used_count:
          resolveAdobeSlotsUsed({
            alertConfig: updated?.[COLS.ALERT_CONFIG],
          }) ?? 0,
        license_status: removedFromDb
          ? "expired"
          : updated?.[COLS.LICENSE_STATUS] ?? "unknown",
      });
    } catch (err) {
      completed += 1;
      failed += 1;
      logger.error("%s Account %s check failed: %s", logPrefix, id, err.message);
      emit({
        type: "error",
        id,
        email,
        error: err.message,
        completed,
        failed,
        total,
        worker: workerIndex,
        concurrency: maxConcurrent,
        license_status: "unknown",
      });
    }
  };

  const runWorker = async (workerIndex) => {
    while (!shouldAbort()) {
      const account = rows[nextIndex];
      nextIndex += 1;
      if (!account) break;
      await runOne(account, workerIndex);
    }
  };

  if (maxConcurrent > 0) {
    logger.info("%s Run check-all concurrency=%s total=%s", logPrefix, maxConcurrent, total);
    await Promise.all(
      Array.from({ length: maxConcurrent }, (_, index) => runWorker(index + 1))
    );
  }

  emit({ type: "complete", total, completed, failed, concurrency: maxConcurrent });
  return { total, completed, failed, concurrency: maxConcurrent, autoAssign: null };
}

const checkAllAccounts = async ({ req, res, runCheckForAccountId }) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let aborted = false;
  req.on("close", () => {
    aborted = true;
  });

  const sendEvent = (data) => {
    if (!aborted) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    await runCheckAllAccountsFlow({
      runCheckForAccountId,
      onEvent: sendEvent,
      shouldAbort: () => aborted,
    });
  } catch (err) {
    logger.error("[renew-adobe] Check all failed", { error: err.message });
    sendEvent({ type: "fatal", error: err.message });
  }

  return res.end();
};

module.exports = {
  adobeQueueStatus,
  checkAllAccounts,
  runCheckAllAccountsFlow,
  resolveCheckAllConcurrency,
};
