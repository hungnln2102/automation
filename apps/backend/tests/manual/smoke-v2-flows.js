/**
 * Smoke test nhanh cho kiến trúc flow V2 (không chạy browser thật).
 *
 * Chạy:
 *   node tests/manual/smoke-v2-flows.js
 */

const assert = require("assert");

function assertFunction(obj, key) {
  assert(obj && typeof obj[key] === "function", `Thiếu function: ${key}`);
}

function main() {
  const v2 = require("../../src/services/renew-adobe/adobe-renew-v2");
  const flowRoot = v2.flows;

  assert(flowRoot, "Thiếu export flows từ adobe-renew-v2/index.js");

  assertFunction(flowRoot.login, "runCredentialsFixedOnce");
  assertFunction(flowRoot.login, "runOtpIfPresent");
  assertFunction(flowRoot.login, "detectSessionValid");
  assert(flowRoot.login.LOGIN_TIMEOUTS, "Thiếu LOGIN_TIMEOUTS");

  assertFunction(flowRoot.check, "runCheckOrgNameFlow");
  assertFunction(flowRoot.check, "runCheckProductFlow");

  assertFunction(flowRoot.users, "runGotoUsersFlow");
  assertFunction(flowRoot.users, "runCheckAdminProductFlow");
  assertFunction(flowRoot.users, "runRemoveAdminProductFlow");
  assertFunction(flowRoot.users, "runDeleteUsersFlow");
  assertFunction(flowRoot.users, "runAddUsersFlow");
  assertFunction(flowRoot.users, "runUsersSnapshotFlow");
  assertFunction(flowRoot.users, "runPersistUsersSessionFlow");

  assertFunction(flowRoot.autoAssign, "runCreateOrGetAutoAssignUrlFlow");

  console.log("[smoke-v2-flows] OK: flow exports hợp lệ.");
}

main();
