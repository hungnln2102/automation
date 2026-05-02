const { fetchUsersViaApi } = require("../../shared/usersListApi");

async function runCheckAdminProductFlow(page, adminEmail) {
  const adminNorm = String(adminEmail || "").trim().toLowerCase();
  const apiResult = await fetchUsersViaApi(page, { adminEmail: adminNorm });
  const users = apiResult.users.map((u) => ({
    name: u.name || "",
    email: String(u.email || "").trim(),
    product: u.product === true,
  }));
  const adminRow = users.find(
    (u) => String(u?.email || "").trim().toLowerCase() === adminNorm
  );

  return {
    hasAdminProduct: !!adminRow?.product,
    productName: adminRow?.product ? "assigned" : null,
    adminRow: adminRow || null,
    users,
  };
}

module.exports = {
  runCheckAdminProductFlow,
};
