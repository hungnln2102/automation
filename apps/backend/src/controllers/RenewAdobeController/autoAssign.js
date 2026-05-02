const { db } = require("../../db");
const logger = require("../../utils/logger");
const { TABLE, COLS } = require("./accountTable");

const adobeQueueStatus = (_req, res) => {
  return res.json({
    running: 0,
    queued: 0,
    maxConcurrent: 1,
    maxQueueSize: 0,
  });
};

async function runCheckAllAccountsFlow({
  runCheckForAccountId,
  onEvent = null,
  shouldAbort = () => false,
  logPrefix = "[renew-adobe][check-all]",
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
  emit({ type: "start", total });

  let completed = 0;
  let failed = 0;

  for (const account of rows) {
    if (shouldAbort()) break;

    const id = account[COLS.ID];
    const email = account[COLS.EMAIL];
    emit({ type: "checking", id, email, completed, failed, total });

    try {
      await runCheckForAccountId(id);
      completed += 1;
      const updated = await db(TABLE).where(COLS.ID, id).first();
      emit({
        type: "done",
        id,
        email,
        completed,
        failed,
        total,
        removed_from_db: false,
        org_name: updated?.[COLS.ORG_NAME] ?? null,
        user_count: updated?.[COLS.USER_COUNT] ?? 0,
        license_status: updated?.[COLS.LICENSE_STATUS] ?? "unknown",
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
        license_status: "unknown",
      });
    }
  }

  emit({ type: "complete", total, completed, failed });
  return { total, completed, failed, autoAssign: null };
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
};
