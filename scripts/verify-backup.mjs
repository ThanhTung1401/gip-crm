import { existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";

const root = process.cwd();
const backupDir = resolve(root, process.env.BACKUP_DIR || "backups");

if (!existsSync(backupDir)) {
  console.error(`[verify-backup] backup_dir_missing: ${backupDir}`);
  process.exit(1);
}

const files = readdirSync(backupDir)
  .filter((name) => name.toLowerCase().endsWith(".json"))
  .map((name) => {
    const full = join(backupDir, name);
    const raw = JSON.parse(readFileSync(full, "utf8"));
    return { name, raw };
  })
  .sort((a, b) => String(b.raw?.exportedAt || "").localeCompare(String(a.raw?.exportedAt || "")));

if (!files.length) {
  console.error("[verify-backup] no_backup_files_found");
  process.exit(1);
}

const latest = files[0];
const payload = latest.raw;
if (!payload?.data || !Array.isArray(payload.data.deals)) {
  console.error(`[verify-backup] invalid_payload: ${latest.name}`);
  process.exit(1);
}
if (!Array.isArray(payload.data.ownerCodes) || typeof payload.data.authConfig !== "object") {
  console.error(`[verify-backup] invalid_state_shape: ${latest.name}`);
  process.exit(1);
}

console.log("[verify-backup] ok", {
  latestFile: latest.name,
  exportedAt: payload.exportedAt || null,
  deals: payload.data.deals.length,
  ownerCodes: payload.data.ownerCodes.length,
});
