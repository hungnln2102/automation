/**
 * Dịch vụ HTTP Renew Adobe tách process — dùng cùng mã nguồn routes/controllers
 * trong `backend/src` (bước trung gian; sau này có thể gói thành package riêng).
 *
 * Chạy: `RENEW_ADOBE_INTERNAL_KEY=... RENEW_ADOBE_API_PORT=4002 node services/renew-adobe-api/server.js`
 * Hoặc: `npm run dev:renew-adobe` từ thư mục gốc project.
 */
const path = require("path");
const express = require("express");

const backendRoot = path.join(__dirname, "../../backend");
require("dotenv").config({ path: path.join(backendRoot, ".env") });

const renewAdobeInternalAuth = require(
  path.join(backendRoot, "src/middleware/renewAdobeInternalAuth")
).renewAdobeInternalAuth;
const renewAdobeRoutes = require(path.join(backendRoot, "src/routes/renewAdobeRoutes"));

const app = express();
app.set("trust proxy", 1);
app.set("etag", false);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "renew-adobe-api" });
});

app.use(
  "/api/renew-adobe",
  renewAdobeInternalAuth,
  renewAdobeRoutes
);

/** Cố ý tránh 4001 (Vite storefront Renew Adobe thường dùng cổng đó trên local). */
const port = Number(process.env.RENEW_ADOBE_API_PORT) || 4002;
app.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(
    `[renew-adobe-api] http://0.0.0.0:${port}  (Orderlist: RENEW_ADOBE_API_BASE_URL=http://127.0.0.1:${port})`
  );
});
