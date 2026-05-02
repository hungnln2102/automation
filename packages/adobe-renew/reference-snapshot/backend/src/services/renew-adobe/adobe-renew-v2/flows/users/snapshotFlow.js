const { fetchUsersViaApi } = require("../../shared/usersListApi");
const { exportCookies } = require("../login");

async function runUsersSnapshotFlow(
  page,
  { adminEmail = "", pinnedCcpProductIds = [], reusableJilHeaders = null } = {}
) {
  const apiResult = await fetchUsersViaApi(page, {
    adminEmail,
    pinnedCcpProductIds,
    ...(reusableJilHeaders ? { reusableJilHeaders } : {}),
  });
  const users = apiResult.users.map((u) => ({
    id: u.id || null,
    authenticatingAccountId: u.authenticatingAccountId || null,
    name: u.name || "",
    email: String(u.email || "").trim(),
    products: Array.isArray(u.products) ? u.products : [],
    hasPackage: u.hasProduct === true,
    product: u.hasProduct === true,
  }));
  const adminNorm = String(adminEmail || "").trim().toLowerCase();
  const manageTeamMembers = users
    .filter((u) => String(u.email || "").trim().toLowerCase() !== adminNorm)
    .map((u) => ({
      id: u.id || null,
      authenticatingAccountId: u.authenticatingAccountId || null,
      name: u.name || "",
      email: String(u.email || "").trim(),
      products: Array.isArray(u.products) ? u.products : [],
      hasPackage: u.hasProduct === true,
      // Quy ước nghiệp vụ mới: chỉ product ID Pro mới tính là còn gói.
      product: u.hasProduct === true,
    }));

  return {
    userCount: manageTeamMembers.length,
    users,
    manageTeamMembers,
    capturedJilHeaders: apiResult.capturedJilHeaders || null,
  };
}

async function runPersistUsersSessionFlow(context) {
  const { cookies } = await exportCookies(context, { includeWithExpiry: false });
  return { savedCookies: cookies.length ? { cookies } : null };
}

module.exports = {
  runUsersSnapshotFlow,
  runPersistUsersSessionFlow,
};
