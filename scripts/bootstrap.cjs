const fs = require("fs");
const path = require("path");

const automationRoot = path.join(__dirname, "..");
const backendRoot = path.join(automationRoot, "apps", "backend");
const dockerTarget = path.join(backendRoot, ".env.docker");
const dockerExample = path.join(backendRoot, "env.docker.example");
const localTarget = path.join(backendRoot, ".env.local");
const localExample = path.join(backendRoot, "env.local.example");

if (!fs.existsSync(dockerExample)) {
  console.error("[bootstrap] Thiếu file:", dockerExample);
  process.exit(1);
}

if (!fs.existsSync(dockerTarget)) {
  fs.copyFileSync(dockerExample, dockerTarget);
  console.log("[bootstrap] Đã tạo apps/backend/.env.docker từ env.docker.example");
} else {
  console.log("[bootstrap] Giữ apps/backend/.env.docker (đã tồn tại)");
}

if (!fs.existsSync(localTarget) && fs.existsSync(localExample)) {
  fs.copyFileSync(localExample, localTarget);
  console.log("[bootstrap] Đã tạo apps/backend/.env.local từ env.local.example");
} else if (fs.existsSync(localTarget)) {
  console.log("[bootstrap] Giữ apps/backend/.env.local (đã tồn tại)");
}
