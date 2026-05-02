#!/usr/bin/env bash
# ============================================================================
# Automation — khởi động / cập nhật stack Docker (Postgres + Redis + API + scheduler)
#
# Chuẩn bị trên VPS (một lần):
#   cp env/stack.backend.env.example env/stack.backend.env
#   chỉnh SESSION_SECRET, FRONTEND_ORIGINS, PUBLIC_BASE_URL, ...
#
# Docker: API luôn lắng nghe cổng 6000 trong container — Nginx/host map tới
# ${BACKEND_HOST_PORT:-6000}. Giá trị PORT trong stack env bị compose ghi đè = 6000.
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh                      # build, migrate, start API + scheduler
#   ./deploy.sh --no-migrate
#   ./deploy.sh --down               # docker compose down
#   BACKEND_HOST_PORT=7000 ./deploy.sh
# ============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT}"

COMPOSE=(
  compose
  --project-name automation-stack
  -f docker-compose.yml
  -f docker-compose.deploy.yml
)

RUN_MIGRATE=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-migrate)
      RUN_MIGRATE=0
      shift
      ;;
    --down|down)
      echo "[deploy] Dừng stack..."
      docker "${COMPOSE[@]}" down --remove-orphans
      exit 0
      ;;
    --help|-h)
      cat <<'USAGE'
deploy.sh — Docker stack Automation (PostgreSQL + Redis + API + scheduler)

  ./deploy.sh                build, migrate knex, start api + scheduler
  ./deploy.sh --no-migrate   bỏ bước migrate
  ./deploy.sh --down         docker compose down
  BACKEND_HOST_PORT=7000 ./deploy.sh  — map cổng host 7000 → API :6000 trong container

Cần: env/stack.backend.env (copy từ .example).
USAGE
      exit 0
      ;;
    *)
      echo "[deploy] Tùy chọn không hiểu: $1  (./deploy.sh --help)" >&2
      exit 1
      ;;
  esac
done

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[deploy] Thiếu lệnh: $1 — cần Docker + Compose v2 plugin." >&2
    exit 1
  fi
}

need_cmd docker
if ! docker compose version >/dev/null 2>&1; then
  echo "[deploy] Cần 'docker compose' (plugin v2)." >&2
  exit 1
fi

STACK_ENV="${ROOT}/env/stack.backend.env"
if [[ ! -f "${STACK_ENV}" ]]; then
  echo "[deploy] Không có ${STACK_ENV}"
  echo "       -> Copy: cp env/stack.backend.env.example env/stack.backend.env rồi chỉnh (SESSION_SECRET,...)."
  exit 1
fi

export DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-1}"

echo "[deploy] Docker build..."
docker "${COMPOSE[@]}" build --pull

echo "[deploy] PostgreSQL + Redis..."
docker "${COMPOSE[@]}" up -d postgres redis

echo "[deploy] Chờ PostgreSQL sẵn sàng..."
for _ in $(seq 1 40); do
  if docker "${COMPOSE[@]}" exec -T postgres pg_isready -U automation_admin -d automation_store >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
if ! docker "${COMPOSE[@]}" exec -T postgres pg_isready -U automation_admin -d automation_store >/dev/null 2>&1; then
  echo "[deploy] Postgres chưa sẵn sàng sau khi chờ — xem docker compose logs postgres" >&2
  exit 1
fi

if [[ "${RUN_MIGRATE}" -eq 1 ]]; then
  echo "[deploy] Migrations knex..."
  docker "${COMPOSE[@]}" run --rm backend npx knex migrate:latest
fi

echo "[deploy] Backend + scheduler..."
docker "${COMPOSE[@]}" up -d backend scheduler

echo "[deploy] Hoàn thành. Trạng thái:"
docker "${COMPOSE[@]}" ps

HP="${BACKEND_HOST_PORT:-6000}"
echo ""
echo "[deploy] API từ host: http://127.0.0.1:${HP}  → container :6000"
echo "       Logs: docker ${COMPOSE[*]} logs -f backend"
