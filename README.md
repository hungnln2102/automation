# Automation Workspace

Standalone workspace for the Automation admin system.

## Structure

```text
apps/
  backend/        Node/Express API, migrations, scheduler, webhook
  frontend/       Vite/React admin UI
  shared/         Cross-runtime constants used by backend and frontend
packages/
  adobe-renew/    Renew Adobe reference snapshot and notes only
scripts/          Root orchestration scripts
env/              Ghi chú / connect DB — không còn file stack env tại đây
schema/           Schema reference material
docs/             Architecture and maintenance notes
var/              Local runtime logs and generated output
```

## Common Commands

```powershell
npm install
npm run install:apps
npm run bootstrap
npm run docker:up
npm run db:setup
npm run dev
```

Frontend: `http://localhost:6001`

Backend: `http://localhost:6000`

Backend đọc `apps/backend/.env` rồi `.env.local` (dev) hoặc `.env.docker` (production / Docker).  
Frontend: `apps/frontend/.env*` — xem `.env.example` và `.env.production.example`.  
Deploy Docker + frontend: `apps/backend/.env.docker` (`npm run bootstrap`), rồi `FRONTEND_WEB_ROOT=/var/www/automation-admin/dist ./deploy.sh`.
