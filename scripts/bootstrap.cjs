const fs = require("fs");
const path = require("path");

const automationRoot = path.join(__dirname, "..");
const backendRoot = path.join(automationRoot, "apps", "backend");
const target = path.join(backendRoot, ".env.docker");
const example = path.join(backendRoot, "env.docker.example");

if (!fs.existsSync(example)) {
  console.error("[bootstrap] Thiếu file:", example);
  process.exit(1);
}

if (!fs.existsSync(target)) {
  fs.copyFileSync(example, target);
  console.log("[bootstrap] Đã tạo apps/backend/.env.docker từ env.docker.example");
} else {
  console.log("[bootstrap] Giữ apps/backend/.env.docker (đã tồn tại)");
}
