# Kết nối PostgreSQL (Automation stack) từ máy cá nhân

## Một URL “chuẩn” cho Beekeeper / script trên máy bạn và trên VPS

Nếu bạn muốn **chỉ lưu một chuỗi** (như các project chỉ có một máy chủ DB nhìn được từ mọi nơi):

1. Chuỗi dùng chung (**thay USER / PASS / DB** theo thực tế):
   ```text
   postgresql://automation_admin:automation_admin_dev@127.0.0.1:6432/automation_store
   ```
2. **Trên VPS** (Beekeeper không cần SSH, hoặc `psql` trên máy chủ): kết nối trực tiếp tới `127.0.0.1:6432` như URL trên — Postgres chỉ bind localhost trên VPS, đủ cho cùng một host.
3. **Trên máy local**: trước khi kết nối, giữ một terminal với SSH forward **`6432` (máy bạn) → `127.0.0.1:6432` (VPS)**:
   ```bash
   # Linux/macOS/Git Bash — mặc định cổng local 6432
   ./scripts/db-tunnel.sh root@IP_HOẶC_DOMAIN_VPS
   ```
   ```powershell
   # Windows PowerShell
   .\scripts\db-tunnel.ps1 -SshTarget root@IP_HOẶC_DOMAIN_VPS
   ```
   Sau đó Beekeeper chỉ Postgres với SSH **Off**: Host **`127.0.0.1`**, Port **`6432`** — **cùng URL** như đoạn ở bước 1.

Nếu máy local đã chiếm sẵn cổng `6432`, dùng cổng local khác (ví dụ `16432`) và đổi **port trong URL cho khớp** (sẽ không còn trùng 100% với VPS nhưng vẫn một quy tắc rõ):

```bash
LOCAL_PORT=16432 ./scripts/db-tunnel.sh root@VPShost
# → Beekeeper Host 127.0.0.1 Port 16432
```

Biến môi trường chạy **trong Docker** vẫn phải dùng `@postgres:5432` — xem bảng dưới; đây là giới hạn kỹ thuật, không có một chuỗi duy nhất cho **cả container lẫn Beekeeper**.

---

## Chuỗi `postgresql://` — **ba** trường hợp (đừng nhầm)

| Bối cảnh ai đang kết nối | Host trong URL | Port | Chuỗi / ghi chú |
|--------------------------|----------------|------|-----------------|
| **API / Scheduler trong Docker** (container backend, Compose ghi đè env) | `postgres` *(tên service Docker)* | **5432** *(cổng **bên trong** container)* | `postgresql://automation_admin:automation_admin_dev@postgres:5432/automation_store` — **chỉ dùng nội bộ container**, đã có trong `docker-compose.deploy.yml`. Không nhập vào Beekeeper trên máy Windows. |
| **Beekeeper / TablePlus / DBeaver trên máy bạn → VPS** (qua SSH tunnel) | `127.0.0.1` *(localhost của **VPS** sau tunnel)* | **6432** | GUI: SSH bật, Postgres Host **`127.0.0.1`**, Port **`6432`**. |
| **Script / psql trên shell VPS** (không vào container) | `127.0.0.1` | **6432** | `postgresql://automation_admin:automation_admin_dev@127.0.0.1:6432/automation_store` |

**Beekeeper báo `ENOTFOUND postgres`** = bạn đang đặt Host **`postgres`** trên máy ngoài — Windows không có DNS đó. Dùng tunnel + **`127.0.0.1`** và port **`6432`**, không phải host `postgres`.

---

Database chạy trong Docker; **hostname `postgres` chỉ tồn tại trong mạng nội bộ Docker** — không dùng được từ Beekeeper khi không chạy bên trong cùng mạng đó.

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

## Cách B — Tunnel tay (PuTTY/Git Bash/OpenSSH Windows), một URL cố định

Để Beekeeper/tab kết nối **cùng** `127.0.0.1:6432` như trên VPS, forward **cổng local 6432** (nếu còn trống):

```bash
ssh -N -o ExitOnForwardFailure=yes -L 6432:127.0.0.1:6432 root@IP_VPS
```

Hoặc script có sẵn: `./scripts/db-tunnel.sh …` hoặc `.\scripts\db-tunnel.ps1 …` (đầu tài liệu).

Beekeeper chỉ Postgres, SSH **Off**: **Host** `127.0.0.1`, **Port** `6432`.

Nếu `6432` đã bị chiếm trên máy bạn:

```bash
ssh -N -L 15432:127.0.0.1:6432 root@IP_VPS
```

Khi đó trong URL/host GUI phải dùng port **`15432`**, không còn trùng 100% chuỗi chuẩn phía trên.

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
- **Timeout SSH**: firewall/ISP máy bạn hoặc thử `ssh -v -N -o ExitOnForwardFailure=yes -L 6432:127.0.0.1:6432 root@IP_VPS` xem văng lỗi gì.
