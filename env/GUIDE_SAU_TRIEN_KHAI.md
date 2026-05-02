# Hướng dẫn sau khi deploy (login, frontend, Postgres)

Áp sau khi chạy `./deploy.sh` và Nginx trỏ tới SPA + `/api`.

## 1. Đăng nhập admin — vì sao báo sai mật khẩu (401)?

Backend **đã kết nối DB** nếu log có dòng kiểu “Database thành công”; điều đó **không** đảm bảo username/mật khẩu bạn nhập là đúng.

### Tự tạo user lần đầu (`ensureDefaultAdmin`)

Trong **`env/stack.backend.env`** trên VPS phải có **cả hai** (không để placeholder):

```bash
DEFAULT_ADMIN_USER=admin
DEFAULT_ADMIN_PASS=đặt_mật_khẩu_mạnh_rời_rạc_của_bạn
```

- Khi backend **khởi động**, nó chỉ **tạo** user nếu **chưa có** ai trùng `username`.
- **Nếu `admin` đã tồn tại từ trước** (mật khẩu cũ) → env **không** ghi đè mật khẩu. Bạn cần làm một trong hai:

**Cách A — Xóa user cũ rồi để backend tạo lại**

1. Sửa `DEFAULT_ADMIN_*` trong `stack.backend.env` như trên (mật khẩu mới mong muốn).
2. Vào Postgres (TablePlus SSH tunnel như **`env/CONNECT_DATABASE.md`**), chạy SQL (đổi `admin`/`schema` nếu khác):

```sql
-- Mặc định SCHEMA_ADMIN trong env không set thường là schema `admin`; xem `\dn` và `\dt *.*users*`.
DELETE FROM admin.users WHERE LOWER(username) = 'admin';
```

3. **Restart backend container** (qua `./deploy.sh` hoặc `docker compose … up -d backend` giống lúc deploy).

**Cách B — Đổi hash mật khẩu trong DB**

Trên VPS, sinh bcrypt (ví dụ mật khẩu mới là `MatKhauMoi365`):

```bash
docker exec automation-stack-backend node -e "
  require('bcrypt').hash('MatKhauMoi365', 10).then(h => console.log(h));
"
```

Copy chuỗi hash ra, rồi trong Postgres:

```sql
UPDATE admin.users SET passwordhash = 'PASTE_HASH_ĐÂY'
WHERE LOWER(username) = 'admin';
```

(Đổi `admin.` thành schema thật nếu bạn set `SCHEMA_ADMIN` / `DB_SCHEMA_ADMIN` trong env.)

Để kiểm tra schema và bảng:

```bash
docker compose --project-name automation-stack -f docker-compose.yml -f docker-compose.deploy.yml exec -T postgres \
  psql -U automation_admin -d automation_store -c "\\dt *.*users*"
```

## 2. Console vẫn gọi `localhost:3001` — không phải lỗi DB

Đó là **bản frontend build cũ** đang cố API local. Repo đã chỉnh: production với **`VITE_API_BASE_URL`** trống → gọi **`/api/...`** trên đúng host.

Việc cần làm:

1. Máy build (hoặc CI): vào **`apps/frontend`**, **`pnpm build`** / **`npm run build`** với **`.env.production`** có `VITE_API_BASE_URL=` trống.
2. Upload **`apps/frontend/dist`** lên chỗ Nginx **`root`** cho `admin.otp90.com`.
3. Trình duyệt **Ctrl+F5** / xóa cache / thử tab ẩn danh.

Sau đó chỉ nên thấy request tới **`https:// hoặc http://admin.otp90.com/api/...`**, không còn `localhost:3001`.

## 3. Chuỗi thao tác tóm tắt VPS

```bash
cd /đường/dẫn/repo/Automation
git pull                          # hoặc ./deploy.sh (có git pull)
# Sửa env/stack.backend.env: DEFAULT_ADMIN_*, FRONTEND_ORIGINS, SESSION_SECRET đã chỉnh đúng chưa
./deploy.sh --no-pull             # hoặc full ./deploy.sh
./deploy.sh logs -f backend       # đăng nhập thử, xem còn 500/CORS không
```

## 4. Postgres từ máy cá nhân

Đọc **`env/CONNECT_DATABASE.md`** — Host Postgres sau tunnel **`127.0.0.1`**, cổng **`6432`** (Automation stack).
