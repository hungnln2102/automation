const path = require("path");
const dotenv = require("dotenv");

const backendRoot = path.join(__dirname, "..", "..");

/** File gốc (tùy chọn): biến dùng chung, không chứa secret có thể commit qua `.env.example` → copy thành `.env`. */
const FILE_SHARED = ".env";
/** Production / Docker: `docker-compose` mount `backend/.env.docker` hoặc copy từ `env.docker.example`. */
const FILE_DOCKER = ".env.docker";
/** Local dev: copy từ `env.local.example` → `backend/.env.local`. */
const FILE_LOCAL = ".env.local";

const isProductionLike = () =>
  process.env.NODE_ENV === "production" ||
  process.env.APP_ENV === "production" ||
  process.env.APP_ENV === "docker";

const configEnvFile = (fileName, options = {}) =>
  dotenv.config({
    path: path.join(backendRoot, fileName),
    quiet: true,
    ...options,
  });

/**
 * Thứ tự nạp biến môi trường:
 * - Luôn thử `.env` trước (mỏng, không bắt buộc tồn tại).
 * - Production-like: **`.env.docker`** ghi đè (ưu tiên cho Docker / server production).
 * - Còn lại (dev/test local): **`.env.local`** ghi đè.
 * - `BACKEND_ENV_FILE` hoặc `DOTENV_CONFIG_PATH`: đường dẫn file đơn lẻ, override toàn bộ logic trên.
 */
function loadBackendEnv() {
  const explicitPath = (process.env.BACKEND_ENV_FILE || process.env.DOTENV_CONFIG_PATH || "").trim();
  if (explicitPath) {
    const resolved = path.isAbsolute(explicitPath)
      ? explicitPath
      : path.resolve(backendRoot, explicitPath);
    dotenv.config({ path: resolved, override: true, quiet: true });
    return;
  }

  configEnvFile(FILE_SHARED);

  if (isProductionLike()) {
    configEnvFile(FILE_DOCKER, { override: true });
    return;
  }

  configEnvFile(FILE_LOCAL, { override: true });
}

module.exports = {
  loadBackendEnv,
  backendRoot,
  ENV_FILES: { FILE_SHARED, FILE_DOCKER, FILE_LOCAL },
};
