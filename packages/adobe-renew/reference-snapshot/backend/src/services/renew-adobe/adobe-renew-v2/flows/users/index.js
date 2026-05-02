require("./contracts");

const { runGotoUsersFlow } = require("./gotoUsersFlow");
const { runCheckAdminProductFlow } = require("./checkAdminProductFlow");
const { runRemoveAdminProductFlow } = require("./removeAdminProductFlow");
const { runDeleteUsersFlow } = require("./deleteUsersFlow");
const { runAddUsersFlow } = require("./addUsersFlow");
const {
  runUsersSnapshotFlow,
  runPersistUsersSessionFlow,
} = require("./snapshotFlow");

module.exports = {
  runGotoUsersFlow,
  runCheckAdminProductFlow,
  runRemoveAdminProductFlow,
  runDeleteUsersFlow,
  runAddUsersFlow,
  runUsersSnapshotFlow,
  runPersistUsersSessionFlow,
};
