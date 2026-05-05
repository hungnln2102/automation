#!/usr/bin/env bash
# ============================================================================
# Automation — khởi động / cập nhật stack Docker (Postgres + Redis + API + scheduler)
#
# Chuẩn bị trên VPS (một lần):
#   npm run bootstrap
#   hoặc: cp apps/backend/env.docker.example apps/backend/.env.docker
#   chỉnh SESSION_SECRET, FRONTEND_ORIGINS, PUBLIC_BASE_URL, ...
#
# Docker: API luôn lắng nghe cổng 6000 trong container — Nginx/host map tới
# ${BACKEND_HOST_PORT:-6000}. Giá trị PORT trong stack env bị compose ghi đè = 6000.
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh                      # git pull, build frontend, build backend, migrate, start API + scheduler
#   ./deploy.sh --no-pull            # không kéo code (deploy từ working tree hiện tại)
#   ./deploy.sh --no-migrate
#   ./deploy.sh --no-frontend        # không build/copy SPA frontend
#   ./deploy.sh --down               # docker compose down
#   ./deploy.sh logs [-f] [service …] # docker compose logs (ngắn gọn)
#   ./deploy.sh ps                   # docker compose ps
#   BACKEND_HOST_PORT=7000 ./deploy.sh
# ============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT}"

# Dùng chung cho plugin `docker compose` (khuyến nghị) hoặc lệnh `docker-compose` cũ.
STACK_COMPOSE_COMMON=(
  --project-name automation-stack
  -f "${ROOT}/docker-compose.yml"
  -f "${ROOT}/docker-compose.deploy.yml"
)

STACK_COMPOSE_MODE=""

detect_compose_driver() {
  if docker compose version >/dev/null 2>&1; then
    STACK_COMPOSE_MODE="docker_compose_plugin"
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
    STACK_COMPOSE_MODE="docker_compose_binary"
    return 0
  fi

  return 1
}

stack_compose() {
  case "${STACK_COMPOSE_MODE}" in
    docker_compose_plugin)
      docker compose "${STACK_COMPOSE_COMMON[@]}" "$@"
      ;;
    docker_compose_binary)
      docker-compose "${STACK_COMPOSE_COMMON[@]}" "$@"
      ;;
    *)
      echo "[deploy] Không có Docker Compose: cần 'docker compose' (plugin v2)" >&2
      echo "        hoặc lệnh 'docker-compose'. Ví dụ Ubuntu: sudo apt install docker-compose-plugin" >&2
      exit 1
      ;;
  esac
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[deploy] Thiếu lệnh: $1." >&2
    exit 1
  fi
}

need_cmd docker
if ! detect_compose_driver; then
  echo "[deploy] Chưa cài Compose: thử 'sudo apt install docker-compose-plugin'" >&2
  echo "       hoặc cài standalone: apt install docker-compose" >&2
  exit 1
fi

SUB="${1:-}"
if [[ "${SUB}" == logs ]]; then
  shift
  stack_compose logs "$@"
  exit 0
fi

if [[ "${SUB}" == ps ]]; then
  shift
  stack_compose ps "$@"
  exit 0
fi

RUN_MIGRATE=1
GIT_PULL=1
RUN_FRONTEND=1
FRONTEND_WEB_ROOT="${FRONTEND_WEB_ROOT:-/var/www/automation-admin/dist}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-migrate)
      RUN_MIGRATE=0
      shift
      ;;
    --no-frontend)
      RUN_FRONTEND=0
      shift
      ;;
    --no-pull)
      GIT_PULL=0
      shift
      ;;
    --down|down)
      echo "[deploy] Dừng stack..."
      stack_compose down --remove-orphans
      exit 0
      ;;
    --help|-h)
      cat <<'USAGE'
deploy.sh — Docker stack Automation (PostgreSQL + Redis + API + scheduler)

  ./deploy.sh                git pull, build/copy frontend, build backend, migrate knex, start api + scheduler
  ./deploy.sh --no-pull      không git pull trước khi deploy
  ./deploy.sh --no-migrate   bỏ bước migrate
  ./deploy.sh --no-frontend  bỏ bước build/copy frontend
  ./deploy.sh --down         docker compose down
  ./deploy.sh logs -f backend   xem log backend (cùng -p / -f compose deploy)
  ./deploy.sh logs --tail 100 postgres
  ./deploy.sh ps               trạng thái các service
  FRONTEND_WEB_ROOT=/var/www/automation-admin/dist ./deploy.sh

Viết tay (nếu có plugin): docker compose --project-name automation-stack \\
  -f docker-compose.yml -f docker-compose.deploy.yml logs -f backend

Cần apps/backend/.env.docker khi deploy (pull/build/up). Logs/ps không bắt buộc.
USAGE
      exit 0
      ;;
    *)
      echo "[deploy] Tùy chọn không hiểu: $1  (./deploy.sh --help)" >&2
      exit 1
      ;;
  esac
done

STACK_ENV="${ROOT}/apps/backend/.env.docker"
if [[ ! -f "${STACK_ENV}" ]]; then
  echo "[deploy] Không có ${STACK_ENV}"
  echo "       -> npm run bootstrap   (hoặc cp apps/backend/env.docker.example apps/backend/.env.docker)"
  echo "          Mẫu đầy đủ: apps/backend/env.docker.production.example"
  echo "          otp90: apps/backend/env.otp90-production.example"
  echo "          rồi chỉnh SESSION_SECRET, FRONTEND_ORIGINS, ..."
  exit 1
fi

if [[ "${GIT_PULL}" -eq 1 ]]; then
  if [[ ! -d "${ROOT}/.git" ]]; then
    echo "[deploy] Bỏ qua git pull (thư mục không phải clone git)."
  else
    need_cmd git
    echo "[deploy] Git pull (fast-forward only)..."
    git -C "${ROOT}" fetch --quiet --tags --prune
    git -C "${ROOT}" pull --ff-only
  fi
fi

export DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-1}"

if [[ "${RUN_FRONTEND}" -eq 1 ]]; then
  need_cmd npm

  case "${FRONTEND_WEB_ROOT}" in
    /*) ;;
    *)
      echo "[deploy] FRONTEND_WEB_ROOT phải là đường dẫn tuyệt đối: ${FRONTEND_WEB_ROOT}" >&2
      exit 1
      ;;
  esac

  echo "[deploy] Frontend build..."
  npm --prefix "${ROOT}/apps/frontend" run build

  FRONTEND_DIST="${ROOT}/apps/frontend/dist"
  if [[ ! -f "${FRONTEND_DIST}/index.html" ]]; then
    echo "[deploy] Không thấy ${FRONTEND_DIST}/index.html sau khi build." >&2
    exit 1
  fi

  if grep -R -E "localhost:3001|127\.0\.0\.1:3001" "${FRONTEND_DIST}" >/dev/null 2>&1; then
    echo "[deploy] Frontend build còn chứa localhost:3001 — kiểm tra apps/frontend/.env.production." >&2
    exit 1
  fi

  mkdir -p "${FRONTEND_WEB_ROOT}"
  FRONTEND_WEB_ROOT_REAL="$(readlink -f "${FRONTEND_WEB_ROOT}")"
  case "${FRONTEND_WEB_ROOT_REAL}" in
    /|/var|/var/www)
      echo "[deploy] FRONTEND_WEB_ROOT quá rộng/nguy hiểm: ${FRONTEND_WEB_ROOT_REAL}" >&2
      exit 1
      ;;
  esac

  echo "[deploy] Frontend copy -> ${FRONTEND_WEB_ROOT_REAL}"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "${FRONTEND_DIST}/" "${FRONTEND_WEB_ROOT_REAL}/"
  else
    find "${FRONTEND_WEB_ROOT_REAL}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
    cp -a "${FRONTEND_DIST}/." "${FRONTEND_WEB_ROOT_REAL}/"
  fi
fi

echo "[deploy] Docker build..."
stack_compose build --pull

echo "[deploy] PostgreSQL + Redis..."
stack_compose up -d postgres redis

echo "[deploy] Chờ PostgreSQL sẵn sàng..."
for _ in $(seq 1 40); do
  if stack_compose exec -T postgres pg_isready -U automation_admin -d automation_store >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
if ! stack_compose exec -T postgres pg_isready -U automation_admin -d automation_store >/dev/null 2>&1; then
  echo "[deploy] Postgres chưa sẵn sàng sau khi chờ — thử ./deploy.sh logs postgres" >&2
  exit 1
fi

if [[ "${RUN_MIGRATE}" -eq 1 ]]; then
  echo "[deploy] Migrations knex..."
  stack_compose run --rm backend npx knex migrate:latest
fi

echo "[deploy] Backend + scheduler..."
stack_compose up -d backend scheduler

echo "[deploy] Hoàn thành. Trạng thái:"
stack_compose ps

HP="${BACKEND_HOST_PORT:-6000}"
echo ""
echo "[deploy] API từ host: http://127.0.0.1:${HP}  → container :6000"
echo "       Logs: ./deploy.sh logs -f backend"
