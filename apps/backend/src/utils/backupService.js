const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, execFileSync } = require("child_process");
const { google } = require("googleapis");

/**
 * Tìm binary pg_dump (Windows thường không có trong PATH).
 * Có thể ép đường dẫn: PG_DUMP_PATH=C:\Program Files\PostgreSQL\16\bin\pg_dump.exe
 */
function resolvePgDumpExecutable() {
  const explicit = (process.env.PG_DUMP_PATH || "").trim();
  if (explicit) {
    const looksLikePath =
      explicit.includes(path.sep) ||
      (process.platform === "win32" && /\.exe$/i.test(explicit));
    if (looksLikePath) {
      if (!fs.existsSync(explicit)) {
        throw new Error(
          `PG_DUMP_PATH trỏ tới file không tồn tại: ${explicit}. Kiểm tra lại .env.`
        );
      }
      return explicit;
    }
  }

  const tryNames =
    process.platform === "win32" ? ["pg_dump.exe", "pg_dump"] : ["pg_dump"];
  for (const name of tryNames) {
    try {
      const whichBin = process.platform === "win32" ? "where.exe" : "which";
      const out = execFileSync(whichBin, [name], {
        encoding: "utf8",
        windowsHide: true,
      });
      const line = out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find((s) => s && !/^INFO:/i.test(s));
      if (line && fs.existsSync(line)) return line;
    } catch {
      /* continue */
    }
  }

  if (process.platform === "win32") {
    const versions = ["17", "16", "15", "14", "13", "12"];
    const roots = new Set(
      [
        process.env.PGBIN,
        ...versions.map((v) =>
          path.join("C:\\Program Files", "PostgreSQL", v, "bin")
        ),
        ...versions.map((v) =>
          path.join("C:\\Program Files (x86)", "PostgreSQL", v, "bin")
        ),
      ].filter(Boolean)
    );
    for (const root of roots) {
      const exe = path.join(root, "pg_dump.exe");
      if (fs.existsSync(exe)) return exe;
    }
  }

  if (explicit) return explicit;

  throw new Error(
    "Không tìm thấy pg_dump. Cài PostgreSQL (hoặc gói chỉ gồm client tools), thêm bin vào PATH, " +
      "hoặc đặt PG_DUMP_PATH trong .env (Windows: đường dẫn đầy đủ tới pg_dump.exe; Docker/Linux: thường /usr/bin/pg_dump)."
  );
}
const databaseUrl = process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL;
const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || undefined;
const retentionDays = Number.parseInt(process.env.BACKUP_RETENTION_DAYS, 10) || 7;
const oauthClientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID;
const oauthClientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET;
const oauthRefreshToken = process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN;
const logFilePath =
  process.env.BACKUP_LOG_FILE || path.join(__dirname, "../../logs/backup.log");

const appendLog = (level, message) => {
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  try {
    const dir = path.dirname(logFilePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(logFilePath, line, "utf8");
  } catch (err) {
    // Fallback to console if file logging fails
    console.error("[Backup] Failed to write log file:", err.message);
  }
};

const logInfo = (message) => {
  console.log(`[Backup] ${message}`);
  appendLog("INFO", message);
};

const logWarn = (message) => {
  console.warn(`[Backup] ${message}`);
  appendLog("WARN", message);
};

const logError = (message) => {
  console.error(`[Backup] ${message}`);
  appendLog("ERROR", message);
};

if (!databaseUrl) {
  logWarn("DATABASE_URL / BACKUP_DATABASE_URL not set. Backup will be skipped.");
}

const createDriveClient = () => {
  const scopes = ["https://www.googleapis.com/auth/drive.file"];

  // 1) OAuth refresh token (personal Google Drive)
  if (oauthClientId && oauthClientSecret && oauthRefreshToken) {
    const oauth2 = new google.auth.OAuth2(oauthClientId, oauthClientSecret);
    oauth2.setCredentials({ refresh_token: oauthRefreshToken });
    return google.drive({ version: "v3", auth: oauth2 });
  }

  // 2) Service account via key file
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes,
    });
    return google.drive({ version: "v3", auth });
  }

  // 3) Service account via env pair
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing Google Drive credentials. Provide OAuth (GOOGLE_DRIVE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN) or service account (GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY)."
    );
  }

  const auth = new google.auth.JWT(clientEmail, null, privateKey, scopes);
  return google.drive({ version: "v3", auth });
};

const execPgDump = (outPath) =>
  new Promise((resolve, reject) => {
    let pgDumpBin;
    try {
      pgDumpBin = resolvePgDumpExecutable();
    } catch (e) {
      reject(e);
      return;
    }
    const args = [`--dbname=${databaseUrl}`, "--format=custom", `--file=${outPath}`];
    execFile(
      pgDumpBin,
      args,
      { windowsHide: process.platform === "win32" },
      (error, _stdout, stderr) => {
        if (error) {
          const extra =
            error.code === "ENOENT"
              ? " (Không chạy được pg_dump — kiểm tra PG_DUMP_PATH hoặc cài PostgreSQL client.)"
              : "";
          reject(new Error(`pg_dump failed: ${stderr || error.message}${extra}`));
          return;
        }
        resolve();
      }
    );
  });

const uploadToDrive = async (filePath, fileName) => {
  const drive = createDriveClient();
  const metadata = {
    name: fileName,
    ...(driveFolderId ? { parents: [driveFolderId] } : {}),
  };
  const media = {
    mimeType: "application/octet-stream",
    body: fs.createReadStream(filePath),
  };

  const { data } = await drive.files.create({
    resource: metadata,
    media,
    fields: "id, name, createdTime",
  });
  return data;
};

const cleanupOldBackups = async () => {
  if (!driveFolderId || retentionDays <= 0) return;
  const drive = createDriveClient();
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const q = `'${driveFolderId}' in parents`;
  const { data } = await drive.files.list({
    q,
    fields: "files(id, name, createdTime)",
    pageSize: 1000,
  });

  const oldFiles =
    data.files?.filter((f) => {
      const created = f.createdTime ? Date.parse(f.createdTime) : null;
      return created && created < cutoff;
    }) || [];

  if (!oldFiles.length) return;

  await Promise.all(
    oldFiles.map((file) =>
      drive.files
        .delete({ fileId: file.id })
        .catch((err) => logWarn(`Failed to delete old backup ${file.id}: ${err.message}`))
    )
  );
  logInfo(`Deleted ${oldFiles.length} old backup file(s) from Drive (retention ${retentionDays}d).`);
};

const backupDatabaseToDrive = async () => {
  if (!databaseUrl) {
    logWarn("Skipped backup: no DATABASE_URL / BACKUP_DATABASE_URL provided.");
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `db-backup-${timestamp}.dump`;
  const outPath = path.join(os.tmpdir(), fileName);

  try {
    logInfo("Starting database backup...");
    await execPgDump(outPath);
    logInfo(`Dump created at ${outPath}`);

    const uploaded = await uploadToDrive(outPath, fileName);
    logInfo(`Uploaded to Google Drive: ${uploaded.id} (${uploaded.name})`);
  } catch (err) {
    logError(`Backup failed: ${err.message}`);
    throw err;
  } finally {
    try {
      if (fs.existsSync(outPath)) {
        fs.unlinkSync(outPath);
      }
    } catch (err) {
      logWarn(`Failed to remove local dump: ${err.message}`);
    }
  }

  await cleanupOldBackups();
  logInfo("Backup finished.");
};

module.exports = {
  backupDatabaseToDrive,
};
