# Tách dịch vụ Renew Adobe

Mục tiêu: **Orderlist** chỉ ủy quyển (HTTP) tới dịch vụ Renew Adobe; sau này process này có thể chạy trên **server/region riêng** mà không cần gộp cùng API chính.

## Trạng thái hiện tại (bước 1)

- Router và logic Renew Adobe vẫn nằm trong `backend/src` (dùng lại, tránh gấp 50 file sang repo mới).
- Process tách: `services/renew-adobe-api/server.js` — `require` cùng `renewAdobeRoutes` + bảo vệ bằng `RENEW_ADOBE_INTERNAL_KEY`.
- Khi bật proxy, `backend` **không** còn mount controller Renew Adobe trong cùng process: toàn bộ `/api/renew-adobe/*` (sau khi đăng nhập) chuyển tới `RENEW_ADOBE_API_BASE_URL`.

## Tạo / xoay khóa nội bộ nhanh (repo)

- Lần đầu: `node backend/scripts/append-renew-adobe-env.js` (chỉ ghi nếu chưa có `RENEW_ADOBE_INTERNAL_KEY`).
- Xoay khóa: `node backend/scripts/append-renew-adobe-env.js --rotate`
- File mẫu (commit được): `backend/.env.renew-adobe.example`

`loadEnv` chỉ nạp `backend/.env` và `backend/.env.local` — không dùng `.env` ở thư mục gốc repo nếu không tự cấu hình thêm.

**Docker Compose:** `docker-compose.yml` dùng `backend/.env.docker` cho `backend`, `webhook`, `scheduler`. Cùng block biến Renew Adobe đã được thêm vào file đó; khi chưa có container `renew-adobe-api`, giữ `RENEW_ADOBE_API_BASE_URL` comment — API vẫn chạy Renew Adobe in-process trong container backend.

## Biến môi trường (Orderlist / API chính)

| Biến | Mô tả |
|------|--------|
| `RENEW_ADOBE_API_BASE_URL` | Ví dụ `http://127.0.0.1:4002`. Có giá trị → bật proxy. Để trống → chạy Renew Adobe in-process như cũ. |
| `RENEW_ADOBE_INTERNAL_KEY` | Khóa dùng chung giữa Orderlist (proxy) và dịch vụ `renew-adobe-api` (bắt buộc khi tách process). Nên dài, ngẫu nhiên. |

## Biến môi trường (process `renew-adobe-api`)

| Biến | Mô tả |
|------|--------|
| `RENEW_ADOBE_INTERNAL_KEY` | Trùng với bên Orderlist. |
| `RENEW_ADOBE_API_PORT` | Mặc định `4002` (tránh trùng Vite storefront thường dùng `4001` trên local). |
| (chung) `DATABASE_URL` / biến DB như `backend` | Cùng file `.env` thường dùng: `server.js` nạp `backend/.env`. |

Dịch vụ tách vẫn dùng chung cơ sở dữ liệu (schema `renew_adobe`, `system_automation`, …) như bản in-process. Khi tách hạ tầng về sau, có thể tách DB hoặc dùng API-only boundary.

## Chạy local

Terminal 1 — Orderlist (không bật proxy, dev đơn giản):

- Không set `RENEW_ADOBE_API_BASE_URL` → mọi thứ như trước.

Terminal 1 + 2 — tách process:

1. Tạo key (một lần), ví dụ PowerShell: `[guid]::NewGuid()`.
2. `backend/.env` (và cùng nội dung cho cả proxy):

   ```env
   RENEW_ADOBE_INTERNAL_KEY=<cùng một chuỗi>
   RENEW_ADOBE_API_BASE_URL=http://127.0.0.1:4002
   ```

3. Run the Renew Adobe service from the standalone Automation workspace when needed.
4. `npm run dev:backend` như bình thường. Frontend gọi vẫn ` /api/renew-adobe/...` trên cùng origin Orderlist; proxy chuyển tới `4001`.

## Chưa chuyển qua HTTP (cố ý)

- **Cron / scheduler** (`runCheckForAccountId`, v.v.): vẫn gọi trực tiếp controller trong process nơi chúng chạy (thường `scheduler.js` / API). Nếu muốn mọi thứ chỉ qua service tách, bước sau là thay bằng `fetch` nội bộ + key hoặc chạy job bên `renew-adobe-api`.
- **`/api/renew-adobe/public`**: vẫn nằm trên app Orderlist; có thể tách tương tự nếu cần.

## Bước tiếp theo (khi tách hẳn)

- Tách `services/renew-adobe` thành package/npm workspace có `package.json` riêng, ít phụ thuộc.
- Bỏ `require(../../backend/...)` trong `server.js` — cài thư viện đủ tại dịch vụ con.
- Bảo mật mạng: chỉ cho phép Orderlist nói tới `renew-adobe-api` (VPC, firewall, mTLS tùy môi trường).
