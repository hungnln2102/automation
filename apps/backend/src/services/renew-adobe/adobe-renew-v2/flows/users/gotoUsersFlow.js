const { extractOrgTokenFromUrl } = require("../../shared/usersListApi");

const WAIT_NETWORKIDLE = String(process.env.ADOBE_V2_GOTO_USERS_WAIT_NETWORKIDLE || "1").trim() === "1";

async function runGotoUsersFlow(page) {
  const orgToken = extractOrgTokenFromUrl(page.url());
  const usersUrl = orgToken
    ? `https://adminconsole.adobe.com/${orgToken}/users`
    : "https://adminconsole.adobe.com/users";
  await page.goto(usersUrl, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  if (WAIT_NETWORKIDLE) {
    await page.waitForLoadState("networkidle", { timeout: 25000 }).catch(() => {});
  } else {
    await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
  }
  return { success: true };
}

module.exports = {
  runGotoUsersFlow,
};
