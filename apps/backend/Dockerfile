# syntax=docker/dockerfile:1.4
# BuildKit: npm run docker:build (repo root), hoặc ./deploy.sh (server), hoặc DOCKER_BUILDKIT=1 docker compose build
# → cache apt; Chromium ghi vào image (không dùng cache mount cho ms-playwright).

FROM node:20-bookworm-slim

# postgresql-client mặc định Debian 12 = PG 15; pg_dump phải >= major server (VD server 16.x → client 16+).
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates wget gnupg \
  && wget -qO /tmp/pgdg.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  && gpg --dearmor -o /usr/share/keyrings/postgresql.gpg /tmp/pgdg.asc \
  && rm /tmp/pgdg.asc \
  && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# `--with-deps`: cài gói hệ thống (apt) + Chromium.
# Chỉ cache apt: cache /root/.cache/ms-playwright làm binary KHÔNG nằm trong image layer → runtime thiếu Chrome.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    npx playwright install --with-deps chromium

COPY . .

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "index.js"]
