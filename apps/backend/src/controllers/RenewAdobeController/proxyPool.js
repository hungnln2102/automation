const logger = require("../../utils/logger");
const {
  listAdminProxies,
  createAdminProxy,
  updateAdminProxy,
  deleteAdminProxy,
  testAdminProxy,
  parseProxyLine,
} = require("../../services/proxyPoolService");

const listProxyPool = async (_req, res) => {
  try {
    return res.json(await listAdminProxies());
  } catch (error) {
    logger.error("[proxy-pool] list failed", { error: error.message });
    return res.status(500).json({ error: "Khong tai duoc danh sach proxy." });
  }
};

const createProxyPoolItem = async (req, res) => {
  try {
    const body = req.body ?? {};
    if (!parseProxyLine(body.raw_line ?? body.proxy_url)) {
      return res.status(400).json({
        error: "Proxy khong hop le. Dung user:pass@host:port hoac host:port:user:pass",
      });
    }
    const row = await createAdminProxy(body);
    return res.status(201).json(row);
  } catch (error) {
    logger.error("[proxy-pool] create failed", { error: error.message });
    return res.status(400).json({ error: error.message || "Khong them duoc proxy." });
  }
};

const updateProxyPoolItem = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "ID khong hop le." });
  }
  try {
    const row = await updateAdminProxy(id, req.body ?? {});
    if (!row) return res.status(404).json({ error: "Khong tim thay proxy." });
    return res.json(row);
  } catch (error) {
    logger.error("[proxy-pool] update failed", { id, error: error.message });
    return res.status(400).json({ error: error.message || "Cap nhat that bai." });
  }
};

const deleteProxyPoolItem = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "ID khong hop le." });
  }
  try {
    const ok = await deleteAdminProxy(id);
    if (!ok) return res.status(404).json({ error: "Khong tim thay proxy." });
    return res.json({ success: true, id });
  } catch (error) {
    logger.error("[proxy-pool] delete failed", { id, error: error.message });
    return res.status(500).json({ error: "Khong xoa duoc proxy." });
  }
};

const testProxyPoolItem = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "ID khong hop le." });
  }
  try {
    const result = await testAdminProxy(id);
    return res.json(result);
  } catch (error) {
    logger.error("[proxy-pool] test failed", { id, error: error.message });
    return res.status(400).json({ ok: false, error: error.message });
  }
};

module.exports = {
  listProxyPool,
  createProxyPoolItem,
  updateProxyPoolItem,
  deleteProxyPoolItem,
  testProxyPoolItem,
};
