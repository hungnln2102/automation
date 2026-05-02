const fs = require("fs");
const path = require("path");

const automationRoot = path.join(__dirname, "..");
const target = path.join(automationRoot, "env", "stack.backend.env");
const example = path.join(automationRoot, "env", "stack.backend.env.example");

if (!fs.existsSync(example)) {
  console.error("[bootstrap] Thiếu file:", example);
  process.exit(1);
}

if (!fs.existsSync(target)) {
  fs.copyFileSync(example, target);
  console.log("[bootstrap] Đã tạo env/stack.backend.env từ .example");
} else {
  console.log("[bootstrap] Giữ env/stack.backend.env (đã tồn tại)");
}
