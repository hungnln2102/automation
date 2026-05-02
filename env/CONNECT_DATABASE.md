# Kết nối PostgreSQL (Automation stack) từ máy cá nhân

Database chạy trong Docker; **hostname `postgres` chỉ tồn tại trong mạng nội bộ Docker** — không dùng được từ TablePlus/DBeaver trên Windows/Mac.

Trên VPS, Postgres được publish ra **cổng host `6432`**, chỉ **localhost** của VPS (`127.0.0.1:6432`) để không mở DB ra Internet.

Thông tin mặc định (đúng `docker-compose.yml`):

| Thuộc tính   | Giá trị                         |
|-------------|----------------------------------|
| User        | `automation_admin`              |
| Database    | `automation_store`              |
| Password    | `automation_admin_dev` (đổi trong compose nếu cần) |
| Sau tunnel  | Host `127.0.0.1`, Port **`6432`** |

## Cách A — SSH tunnel trong TablePlus (khuyến nghị)

1. Tab **SSH**: **On**
2. **SSH Host**: IP/domain VPS · **Port**: `22` · **User**: ví dụ `root`
3. Tab **PostgreSQL**:
   - **Host**: `127.0.0.1`
   - **Port**: `6432`
   - User / database / password như bảng trên.

## Cách B — Tunnel tay (PuTTY/OpenSSH Windows), rồi kết nối không SSH trong GUI

Giữ một terminal mở:

```bash
ssh -N -L 15432:127.0.0.1:6432 root@IP_VPS
```

TablePlus chỉ Postgres (SSH **Off**):

- **Host**: `127.0.0.1` · **Port**: `15432` (hoặc cổng local bất kỳ trống trên máy bạn).

## Áp compose mới sau khi `git pull` (bind 127.0.0.1)

Trên VPS, từ thư mục repo:

```bash
./deploy.sh --no-pull --no-migrate
```

Hoặc chỉ recreate Postgres:

```bash
docker compose --project-name automation-stack -f docker-compose.yml -f docker-compose.deploy.yml up -d postgres
```

## Gỡ lỗi

- **`ENOTFOUND postgres`**: Host DB phải là `127.0.0.1` (+ tunnel), không phải `postgres`.
- **Timeout SSH**: firewall/ISP máy bạn hoặc thử `ssh -v -N -L 15432:127.0.0.1:6432 root@IP_VPS` xem văng lỗi gì.
