/**
 * Helper script to replace console.log/error/warn with logger
 * 
 * Usage: node scripts/replace-console-logs.js [file_path]
 * 
 * This script helps migrate from console.* to Winston logger.
 * Run manually and review changes before committing.
 */

const fs = require("fs");
const path = require("path");

const filesToProcess = process.argv.slice(2);

if (filesToProcess.length === 0) {
  console.log("Usage: node scripts/replace-console-logs.js <file1> [file2] ...");
  console.log("Example: node scripts/replace-console-logs.js src/controllers/Order/crudRoutes.js");
  process.exit(1);
}

filesToProcess.forEach((filePath) => {
  const fullPath = path.join(__dirname, "..", filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`);
    return;
  }

  let content = fs.readFileSync(fullPath, "utf8");
  let modified = false;

  // Check if logger is already imported
  const hasLoggerImport = content.includes("require(\"../../utils/logger\")") ||
                          content.includes("require(\"../../../utils/logger\")") ||
                          content.includes("require(\"../../../../utils/logger\")") ||
                          content.includes("require(\"./../../utils/logger\")");

  // Add logger import if not present
  if (!hasLoggerImport && (content.includes("console.log") || content.includes("console.error") || content.includes("console.warn"))) {
    // Find the last require statement
    const requireMatches = content.match(/const\s+\w+\s*=\s*require\([^)]+\);/g);
    if (requireMatches && requireMatches.length > 0) {
      const lastRequire = requireMatches[requireMatches.length - 1];
      const lastRequireIndex = content.lastIndexOf(lastRequire) + lastRequire.length;
      
      // Calculate relative path to logger
      const depth = (filePath.match(/\//g) || []).length - 1; // Subtract 1 for src/
      const loggerPath = "../".repeat(depth) + "utils/logger";
      
      content = content.slice(0, lastRequireIndex) + 
                `\nconst logger = require("${loggerPath}");` +
                content.slice(lastRequireIndex);
      modified = true;
    }
  }

  // Replace console.log with logger.info (simple cases)
  // Note: This is a basic replacement. Complex cases may need manual review.
  const consoleLogRegex = /console\.log\(([^)]+)\)/g;
  content = content.replace(consoleLogRegex, (match, args) => {
    // Skip if already has logger
    if (match.includes("logger")) return match;
    
    // Simple string messages -> logger.info
    if (args.startsWith('"') || args.startsWith("'") || args.startsWith("`")) {
      modified = true;
      return `logger.info(${args})`;
    }
    // Complex objects -> logger.debug with context
    modified = true;
    return `logger.debug(${args})`;
  });

  // Replace console.error with logger.error
  const consoleErrorRegex = /console\.error\(([^)]+)\)/g;
  content = content.replace(consoleErrorRegex, (match, args) => {
    if (match.includes("logger")) return match;
    modified = true;
    // Try to extract message and error object
    if (args.includes("error:") || args.includes("err")) {
      return `logger.error(${args})`;
    }
    return `logger.error(${args})`;
  });

  // Replace console.warn with logger.warn
  const consoleWarnRegex = /console\.warn\(([^)]+)\)/g;
  content = content.replace(consoleWarnRegex, (match, args) => {
    if (match.includes("logger")) return match;
    modified = true;
    return `logger.warn(${args})`;
  });

  if (modified) {
    // Create backup
    fs.writeFileSync(fullPath + ".backup", fs.readFileSync(fullPath));
    fs.writeFileSync(fullPath, content);
    console.log(`✓ Updated: ${filePath}`);
  } else {
    console.log(`- No changes: ${filePath}`);
  }
});

console.log("\nDone! Review changes and remove .backup files when satisfied.");
