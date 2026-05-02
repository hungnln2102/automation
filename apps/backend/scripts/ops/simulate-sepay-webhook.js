#!/usr/bin/env node
/**
 * Giả lập Sepay POST tới webhook local (**bắt buộc** đã chạy `npm run start:webhook`,
 * không phải `npm run start` — API và webhook là hai process/port có thể khác nhau).
 *
 * Cần một trong hai biến môi trường (giống server webhook):
 *   SEPAY_WEBHOOK_SECRET (ký HMAC-SHA256 hex body JSON)
 *   SEPAY_API_KEY        (header Authorization: Apikey ...)
 *
 * Ví dụ (từ thư mục backend):
 *   node scripts/ops/simulate-sepay-webhook.js ^
 *     --content "Chuyen tien ND MAVABC123" --amount 150000 --date "2026-04-29 14:30:00"
 *
 * Xem thêm: tests/manual/run-webhook-financial-reconcile-tests.js (supertest, không cần server).
 */

const crypto = require("crypto");
const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config();

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function buildAuthHeaders(bodyString) {
  if (process.env.SEPAY_API_KEY) {
    return { Authorization: `Apikey ${process.env.SEPAY_API_KEY.trim()}` };
  }
  if (process.env.SEPAY_WEBHOOK_SECRET) {
    const sig = crypto
      .createHmac("sha256", process.env.SEPAY_WEBHOOK_SECRET)
      .update(Buffer.from(bodyString, "utf8"))
      .digest("hex");
    return { "X-SEPAY-SIGNATURE": sig };
  }
  throw new Error(
    "Thiếu SEPAY_API_KEY hoặc SEPAY_WEBHOOK_SECRET (đặt trong .env cùng server webhook)."
  );
}

function postJson(urlStr, bodyObj) {
  const bodyString = JSON.stringify(bodyObj);
  const headers = {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(bodyString, "utf8"),
    ...buildAuthHeaders(bodyString),
  };
  const u = new URL(urlStr);
  const isHttps = u.protocol === "https:";
  const lib = isHttps ? https : http;
  const opts = {
    hostname: u.hostname,
    port: u.port || (isHttps ? 443 : 80),
    path: `${u.pathname}${u.search}`,
    method: "POST",
    headers,
  };
  return new Promise((resolve, reject) => {
    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch {
          json = { _raw: raw };
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: json, raw });
      });
    });
    req.on("error", reject);
    req.write(bodyString);
    req.end();
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const url = args.url || "http://127.0.0.1:5000/api/payment/notify";
  const amount = Number(args.amount || args.transferAmount || "0");
  const content =
    args.content ||
    args.note ||
    args.transaction_content ||
    (args._.length ? args._.join(" ") : "");
  if (!content) {
    console.error("Cần --content \"...\" (nội dung CK, nên chứa mã MAV...).");
    process.exit(1);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error("Cần --amount số tiền > 0 (VND).");
    process.exit(1);
  }

  const transactionDate =
    args.date ||
    args["transaction-date"] ||
    new Date().toISOString().slice(0, 19).replace("T", " ");

  const payload = {
    transactionDate,
    accountNumber: String(args["account-number"] || "918340998"),
    transferType: "in",
    transferAmount: amount,
    content,
    description: String(args.description || `simulate-sepay ${Date.now()}`),
  };
  const tid = args.id || args["transaction-id"];
  if (tid) payload.id = String(tid);

  console.error(
    `[simulate-sepay-webhook] POST ${url}\n` +
      `  (cần process đang chạy: cd backend && npm run start:webhook — khác với npm run start / API)\n` +
      `  payload.content: ${String(content).slice(0, 80)}${String(content).length > 80 ? "…" : ""}`
  );
  const res = await postJson(url, payload);
  console.log(JSON.stringify({ url, statusCode: res.statusCode, body: res.body }, null, 2));
  if (res.statusCode >= 400) process.exit(1);
}

main().catch((err) => {
  const code = err && err.code;
  if (code === "ECONNREFUSED") {
    console.error(
      "Không kết nối được tới webhook server (ECONNREFUSED).\n" +
        "  → Trong thư mục backend chạy: npm run start:webhook\n" +
        "  → Nếu dùng port khác 5000: đặt SEPAY_PORT trong .env và gọi script với --url \"http://127.0.0.1:<port>/api/payment/notify\""
    );
  } else {
    console.error(err.message || err);
  }
  process.exit(1);
});
