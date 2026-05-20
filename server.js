import { createServer } from "http";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "fs";
import { dirname, extname, isAbsolute, join, resolve } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { google } from "googleapis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const DIST_DIR = resolve(__dirname, "dist");
const INDEX_FILE = join(DIST_DIR, "index.html");
const DATA_DIR = resolve(__dirname, process.env.DATA_DIR || "data");
const DATA_FILE = join(DATA_DIR, "crm-state.json");
const TELEGRAM_ALERT_STATE_FILE = join(DATA_DIR, "telegram-alert-state.json");
const BACKUP_DIR = resolve(__dirname, process.env.BACKUP_DIR || "backups");
const BACKUP_VERSION = "crm-backup-v1";
const MASTER_OWNER = "GIPMANA";
const DEFAULT_OWNER_CODES = ["GIP01", "GIP02", "GIP03", "GIP04", "GIP05", "GIP06"];
const TEAM_OPTIONS = ["PKD1", "PKD2"];
const USER_ROLE = "USER";
const MANAGER_ROLE = "MANAGER";
const MASTER_ROLE = "MASTER";
const STAGES = ["Data Thô", "Freeze", "Cold", "Warm", "Hot", "Win"];
const DEAL_STATUS_OPTIONS = [
  "Đã liên hệ",
  "New Lead",
  "Interested",
  "Consultation Started",
  "Meeting",
  "Follow up - Rate Card",
  "Waiting for Test Ads",
  "Waiting for Shipping",
  "Onboarding Started",
  "Win",
  "Lost",
  "Spam / Invalid Lead",
  "Wrong Info",
  "Can't Contact",
];
const PLATFORMS = ["Facebook", "Shopee", "Tiktok", "Lazada", "Khác"];
const LEAD_SOURCE_TYPE_OPTIONS = ["Cá nhân", "Công ty", "Sếp Loki"];
const LEAD_SOURCE_DETAIL_OPTIONS = ["Facebook", "Zalo", "Group", "Khách giới thiệu", "Website", "Fanpage", "Tiktok", "Khác"];
const MARKET_REGION_OPTIONS = ["Philippines", "Thái Lan", "Malaysia", "Indonesia", "Việt Nam", "Đa quốc gia"];
const PLATFORM_ALIASES = {
  facebook: "Facebook",
  fb: "Facebook",
  shopee: "Shopee",
  tiktok: "Tiktok",
  tiktokshop: "Tiktok",
  lazada: "Lazada",
  khac: "Khác",
  other: "Khác",
  website: "Khác",
};
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLA_DAYS = { "Data Thô": 15, Freeze: 10, Cold: 7, Warm: 5, Hot: 3 };
const MEETING_CADENCE = { Warm: 21, Hot: 21, Win: 30 };
const FOLLOWUP_HOURS_DEFAULT = { "Data Thô": 100, Freeze: 72, Cold: 48, Warm: 36, Hot: 24, Win: 0 };
const FOLLOWUP_HOURS_MAX = 8760;
const ALERT_REPEAT_HOURS = 2;
const TELEGRAM_MAX_MESSAGE_LENGTH = 3500;
const TELEGRAM_LOCK_TTL_MS = 2 * 60 * 1000;
const AUTO_BACKUP_INTERVAL_MS = 60 * 60 * 1000;
const MAX_BACKUP_FILES = 24;
const ENABLE_LOCAL_BACKUP = String(process.env.ENABLE_LOCAL_BACKUP || "true").toLowerCase() !== "false";
const ENABLE_DRIVE_UPLOAD = String(process.env.ENABLE_DRIVE_UPLOAD || "false").toLowerCase() === "true";
const ONLINE_CRM_BASE_URL = String(process.env.ONLINE_CRM_BASE_URL || "https://gip-crm.onrender.com").replace(/\/+$/, "");
const GOOGLE_DRIVE_SYNC_DIR = (process.env.GOOGLE_DRIVE_SYNC_DIR || "").trim();
const DEFAULT_SERVICE_ACCOUNT_KEY_PATH = join(__dirname, "config", "google-service-account.json");
const GOOGLE_DRIVE_FOLDER_ID = (process.env.GOOGLE_DRIVE_FOLDER_ID || "").trim();
const GOOGLE_SERVICE_ACCOUNT_KEY = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").trim();
const GOOGLE_SERVICE_ACCOUNT_JSON = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
const GOOGLE_DRIVE_FOLDER_NAME = "CRM Backups";
const BACKUP_WARN_AFTER_FAILS = Math.max(1, Number(process.env.BACKUP_WARN_AFTER_FAILS || 2));
const BACKUP_STALE_MINUTES = Math.max(5, Number(process.env.BACKUP_STALE_MINUTES || 90));
const backupRuntime = {
  startedAt: new Date().toISOString(),
  lastBackupAt: null,
  lastBackupFile: null,
  lastBackupReason: null,
  lastBackupError: null,
  consecutiveBackupFailures: 0,
  lastDriveUploadAt: null,
  lastDriveUploadFile: null,
  lastDriveUploadError: null,
  consecutiveDriveUploadFailures: 0,
};
let driveClientPromise = null;
let resolvedDriveFolderId = GOOGLE_DRIVE_FOLDER_ID;
const STATIC_MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
const UNICODE_REPLACEMENT_CHAR = "\uFFFD";
const UNICODE_GUARD_TEXT_FIELDS = ["brand", "contact", "source", "lead_source", "lead_source_detail", "marketRegion"];

function hasUnicodeReplacement(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.includes(UNICODE_REPLACEMENT_CHAR);
  if (Array.isArray(value)) return value.some((item) => hasUnicodeReplacement(item));
  if (typeof value === "object") return Object.values(value).some((item) => hasUnicodeReplacement(item));
  return false;
}

function logUnicodeCorruption(flow, deal, field, value) {
  if (!hasUnicodeReplacement(value)) return;
  console.warn("[unicode-detect]", {
    flow,
    dealId: String(deal?.id || ""),
    pic: String(deal?.pic || ""),
    team: String(deal?.team || ""),
    field,
  });
}

function protectDealFromCorruptedOverwrite(existingDeal, incomingDeal, flow) {
  if (!existingDeal || !incomingDeal || typeof existingDeal !== "object" || typeof incomingDeal !== "object") {
    return incomingDeal;
  }
  const nextDeal = { ...incomingDeal };
  UNICODE_GUARD_TEXT_FIELDS.forEach((field) => {
    const incomingValue = nextDeal[field];
    const currentValue = existingDeal[field];
    if (hasUnicodeReplacement(incomingValue) && !hasUnicodeReplacement(currentValue) && currentValue !== undefined) {
      nextDeal[field] = currentValue;
      console.warn("[unicode-guard] blocked corrupted text overwrite", {
        flow,
        dealId: String(existingDeal?.id || incomingDeal?.id || ""),
        field,
      });
    }
  });
  if (Array.isArray(nextDeal.notes) && Array.isArray(existingDeal.notes)) {
    const incomingBroken = nextDeal.notes.some((note) => hasUnicodeReplacement(note?.text));
    const existingClean = existingDeal.notes.every((note) => !hasUnicodeReplacement(note?.text));
    if (incomingBroken && existingClean) {
      nextDeal.notes = existingDeal.notes;
      console.warn("[unicode-guard] blocked corrupted text overwrite", {
        flow,
        dealId: String(existingDeal?.id || incomingDeal?.id || ""),
        field: "notes",
      });
    }
  }
  return nextDeal;
}

function ensureStore() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) writeFileSync(DATA_FILE, JSON.stringify(makeDefaultState(), null, 2));
}

function loadTelegramAlertState() {
  try {
    if (!existsSync(TELEGRAM_ALERT_STATE_FILE)) return { alerts: {}, batchDedup: {}, locks: {} };
    const raw = JSON.parse(readFileSync(TELEGRAM_ALERT_STATE_FILE, "utf8"));
    const alerts = raw?.alerts && typeof raw.alerts === "object" ? raw.alerts : {};
    const batchDedup = raw?.batchDedup && typeof raw.batchDedup === "object" ? raw.batchDedup : {};
    const locks = raw?.locks && typeof raw.locks === "object" ? raw.locks : {};
    return { alerts, batchDedup, locks };
  } catch {
    return { alerts: {}, batchDedup: {}, locks: {} };
  }
}

function saveTelegramAlertState(nextState) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const alerts = nextState?.alerts && typeof nextState.alerts === "object" ? nextState.alerts : {};
  const batchDedup = nextState?.batchDedup && typeof nextState.batchDedup === "object" ? nextState.batchDedup : {};
  const locks = nextState?.locks && typeof nextState.locks === "object" ? nextState.locks : {};
  writeFileSync(
    TELEGRAM_ALERT_STATE_FILE,
    JSON.stringify({ alerts, batchDedup, locks, updatedAt: new Date().toISOString() }, null, 2),
  );
}

function ensureBackupDir() {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
}

function ensureGoogleDriveSyncDir() {
  if (GOOGLE_DRIVE_SYNC_DIR && !existsSync(GOOGLE_DRIVE_SYNC_DIR)) {
    mkdirSync(GOOGLE_DRIVE_SYNC_DIR, { recursive: true });
  }
}

function formatBackupStamp(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join("-");
}

function buildBackupPayload(state, metadata = {}) {
  return {
    exportedAt: new Date().toISOString(),
    version: BACKUP_VERSION,
    metadata: {
      source: "local-crm-backend",
      dataFile: DATA_FILE,
      ...metadata,
    },
    data: normalizeState(state),
  };
}

function writeBackupFile(payload, prefix = "backup") {
  ensureBackupDir();
  const fileName = `${prefix}-${formatBackupStamp()}.json`;
  const filePath = join(BACKUP_DIR, fileName);
  writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return { fileName, filePath };
}

function listBackupFiles() {
  ensureBackupDir();
  return readdirSync(BACKUP_DIR)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => {
      const filePath = join(BACKUP_DIR, name);
      const stats = statSync(filePath);
      return {
        fileName: name,
        filePath,
        size: stats.size,
        createdAt: stats.birthtime.toISOString(),
        updatedAt: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function getLatestBackupFile() {
  return listBackupFiles()[0] || null;
}

function cleanupOldBackups() {
  const files = listBackupFiles();
  const removable = files.slice(MAX_BACKUP_FILES);
  removable.forEach((file) => {
    try {
      unlinkSync(file.filePath);
    } catch (error) {
      console.error("[crm] backup_cleanup_failed", file.filePath, error);
    }
  });
  return {
    kept: Math.min(files.length, MAX_BACKUP_FILES),
    removed: removable.map((file) => file.fileName),
  };
}

function markBackupSuccess(reason, backupFile) {
  backupRuntime.lastBackupAt = new Date().toISOString();
  backupRuntime.lastBackupFile = backupFile?.fileName || null;
  backupRuntime.lastBackupReason = reason || null;
  backupRuntime.lastBackupError = null;
  backupRuntime.consecutiveBackupFailures = 0;
}

function markBackupFailure(reason, error) {
  backupRuntime.lastBackupReason = reason || null;
  backupRuntime.lastBackupError = String(error?.message || error || "backup_failed");
  backupRuntime.consecutiveBackupFailures += 1;
  console.error("[backup] failed", {
    reason,
    consecutiveBackupFailures: backupRuntime.consecutiveBackupFailures,
    error: backupRuntime.lastBackupError,
  });
  if (backupRuntime.consecutiveBackupFailures >= BACKUP_WARN_AFTER_FAILS) {
    console.error("[backup] warning_threshold_reached", {
      consecutiveBackupFailures: backupRuntime.consecutiveBackupFailures,
      threshold: BACKUP_WARN_AFTER_FAILS,
    });
  }
}

function markDriveUploadSuccess(fileName) {
  backupRuntime.lastDriveUploadAt = new Date().toISOString();
  backupRuntime.lastDriveUploadFile = fileName || null;
  backupRuntime.lastDriveUploadError = null;
  backupRuntime.consecutiveDriveUploadFailures = 0;
}

function markDriveUploadFailure(fileName, error) {
  backupRuntime.lastDriveUploadFile = fileName || null;
  backupRuntime.lastDriveUploadError = String(error?.message || error || "drive_upload_failed");
  backupRuntime.consecutiveDriveUploadFailures += 1;
  console.error("[backup] drive_upload_failed", {
    fileName,
    consecutiveDriveUploadFailures: backupRuntime.consecutiveDriveUploadFailures,
    error: backupRuntime.lastDriveUploadError,
  });
}

function getBackupHealthSnapshot() {
  const latest = getLatestBackupFile();
  const nowMs = Date.now();
  const lastBackupMs = backupRuntime.lastBackupAt ? new Date(backupRuntime.lastBackupAt).getTime() : 0;
  const staleThresholdMs = BACKUP_STALE_MINUTES * 60_000;
  const stale = !lastBackupMs || nowMs - lastBackupMs > staleThresholdMs;
  const status = backupRuntime.consecutiveBackupFailures > 0 || stale ? "degraded" : "healthy";
  return {
    status,
    stale,
    staleThresholdMinutes: BACKUP_STALE_MINUTES,
    config: {
      enableLocalBackup: ENABLE_LOCAL_BACKUP,
      enableDriveUpload: ENABLE_DRIVE_UPLOAD,
      autoBackupIntervalMs: AUTO_BACKUP_INTERVAL_MS,
      maxBackupFiles: MAX_BACKUP_FILES,
      warnAfterFails: BACKUP_WARN_AFTER_FAILS,
    },
    runtime: { ...backupRuntime },
    latestBackupFile: latest ? { fileName: latest.fileName, updatedAt: latest.updatedAt, size: latest.size } : null,
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) {
    throw new Error(json.error || `request_failed_${response.status}`);
  }
  return json;
}

function extractBackupPayload(response) {
  if (response?.backup && typeof response.backup === "object") return response.backup;
  if (response?.data && response?.version && response?.exportedAt) {
    return {
      exportedAt: response.exportedAt,
      version: response.version,
      metadata: response.metadata,
      data: response.data,
    };
  }
  return null;
}

function createAutomaticBackup(reason = "scheduled") {
  try {
    if (!ENABLE_LOCAL_BACKUP) {
      const state = loadState();
      return {
        ...buildBackupPayload(state, { reason, skipped: "local_backup_disabled" }),
        backupFile: null,
        retention: { kept: 0, removed: [] },
      };
    }
    const state = loadState();
    const payload = buildBackupPayload(state, { reason });
    const backupFile = writeBackupFile(payload, "backup");
    const retention = cleanupOldBackups();
    if (GOOGLE_DRIVE_SYNC_DIR) {
      mirrorBackupToGoogleDriveSync(backupFile.filePath, backupFile.fileName);
    }
    if (ENABLE_DRIVE_UPLOAD) {
      uploadFileToDrive(backupFile.filePath, backupFile.fileName)
        .catch((error) => {
          markDriveUploadFailure(backupFile.fileName, error);
          console.error("Google Drive upload failed:", error.message || error);
        });
    }
    markBackupSuccess(reason, backupFile);
    console.log(`[crm] backup_created reason=${reason} file=${backupFile.fileName} kept=${retention.kept} removed=${retention.removed.length}`);
    return {
      ...payload,
      backupFile,
      retention,
    };
  } catch (error) {
    markBackupFailure(reason, error);
    throw error;
  }
}

function validateBackupPayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("backup_payload_missing");
  if (payload.version !== BACKUP_VERSION) throw new Error("backup_version_invalid");
  if (!payload.data || typeof payload.data !== "object") throw new Error("backup_data_missing");
  if (!Array.isArray(payload.data.deals)) throw new Error("backup_deals_invalid");
  if (!Array.isArray(payload.data.ownerCodes)) throw new Error("backup_owner_codes_invalid");
  if (!payload.data.authConfig || typeof payload.data.authConfig !== "object") throw new Error("backup_auth_config_invalid");
  if (!payload.data.telegramConfig || typeof payload.data.telegramConfig !== "object") throw new Error("backup_telegram_config_invalid");
  if (!payload.data.followupConfig || typeof payload.data.followupConfig !== "object") throw new Error("backup_followup_config_invalid");
}

function isValidDealStatus(value) {
  return value === null || value === undefined || value === "" || DEAL_STATUS_OPTIONS.includes(value);
}

function normalizePlatformKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizePlatformValue(value) {
  return PLATFORM_ALIASES[normalizePlatformKey(value)] || "";
}

function normalizePlatformList(values) {
  const source = Array.isArray(values) ? values : [values];
  return [...new Set(source.map((value) => normalizePlatformValue(value)).filter(Boolean))];
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return !value || EMAIL_REGEX.test(value);
}

function normalizeAdoValue(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text) return "";
  const normalized = text.replace(/,/g, ".");
  return Number.isFinite(Number(normalized)) ? normalized : text;
}

function isValidAdo(value) {
  if (value === null || value === undefined) return true;
  const text = String(value).trim();
  if (!text) return true;
  const normalized = text.replace(/,/g, ".");
  return Number.isFinite(Number(normalized));
}

function normalizeSourceKey(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const LEAD_SOURCE_TYPE_ALIASES = {
  canhan: "Cá nhân",
  personal: "Cá nhân",
  seploki: "Sếp Loki",
  bossloki: "Sếp Loki",
  congty: "Công ty",
  company: "Công ty",
};

const LEAD_SOURCE_DETAIL_ALIASES = {
  facebook: "Facebook",
  zalo: "Zalo",
  group: "Group",
  khachgioithieu: "Khách giới thiệu",
  website: "Website",
  fanpage: "Fanpage",
  tiktok: "Tiktok",
  khac: "Khác",
  other: "Khác",
};

function normalizeLeadSourceType(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (LEAD_SOURCE_TYPE_OPTIONS.includes(text)) return text;
  return LEAD_SOURCE_TYPE_ALIASES[normalizeSourceKey(text)] || "";
}

function normalizeLeadSourceDetail(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (LEAD_SOURCE_DETAIL_OPTIONS.includes(text)) return text;
  return LEAD_SOURCE_DETAIL_ALIASES[normalizeSourceKey(text)] || "";
}
function normalizeMarketRegion(value) {
  return MARKET_REGION_OPTIONS.includes(value) ? value : "";
}

function buildLeadSource(type, detail) {
  if (type && detail) return `${type} - ${detail}`;
  return detail || type || "";
}

function parseLegacyLeadSource(rawValue) {
  const text = String(rawValue || "").trim();
  if (!text) return { lead_source_type: "", lead_source_detail: "", source: "" };
  const matched = text.match(/^(.*?)\s*-\s*(.*?)$/);
  if (matched) {
    const lead_source_type = normalizeLeadSourceType(matched[1].trim());
    const lead_source_detail = normalizeLeadSourceDetail(matched[2].trim());
    return { lead_source_type, lead_source_detail, source: text };
  }
  return { lead_source_type: "", lead_source_detail: normalizeLeadSourceDetail(text), source: text };
}

function validateDealsPayload(deals) {
  if (!Array.isArray(deals)) throw new Error("deals_invalid");
  for (const deal of deals) {
    if (!deal || typeof deal !== "object") throw new Error("deal_invalid");
    if (!isValidDealStatus(deal.deal_status)) throw new Error("deal_status_invalid");
    const rawSourceType = String(deal.lead_source_type ?? "").trim();
    const rawSourceDetail = String(deal.lead_source_detail ?? "").trim();
    const legacy = parseLegacyLeadSource(deal.lead_source || deal.source);
    const normalizedType = normalizeLeadSourceType(rawSourceType) || legacy.lead_source_type;
    const normalizedDetail = normalizeLeadSourceDetail(rawSourceDetail) || legacy.lead_source_detail;
    if (rawSourceType && !normalizedType) {
      console.warn("[validation] lead_source_type_invalid", {
        dealId: String(deal.id || ""),
        rawSourceType,
      });
      throw new Error("lead_source_type_invalid");
    }
    if (rawSourceDetail && !normalizedDetail) {
      console.warn("[validation] lead_source_detail_invalid", {
        dealId: String(deal.id || ""),
        rawSourceDetail,
      });
      throw new Error("lead_source_detail_invalid");
    }
    if (deal.marketRegion !== undefined && deal.marketRegion !== null && deal.marketRegion !== "" && !normalizeMarketRegion(deal.marketRegion)) throw new Error("market_region_invalid");
    if (!isValidEmail(normalizeEmail(deal.email))) throw new Error("email_invalid");
    if (!isValidAdo(deal.ado)) throw new Error("ado_invalid");
  }
}

function normalizeFollowupConfig(raw) {
  const base = { ...FOLLOWUP_HOURS_DEFAULT };
  STAGES.forEach((stage) => {
    const value = raw?.[stage];
    if (value === undefined || value === null || value === "") return;
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue < 0) throw new Error("followup_config_invalid");
    if (numberValue > FOLLOWUP_HOURS_MAX) throw new Error("followup_config_too_large");
    base[stage] = numberValue;
  });
  return base;
}

function validateFollowupConfig(raw) {
  normalizeFollowupConfig(raw);
}

function mirrorBackupToGoogleDriveSync(filePath, fileName) {
  if (!GOOGLE_DRIVE_SYNC_DIR) return null;
  try {
    ensureGoogleDriveSyncDir();
    const targetPath = join(GOOGLE_DRIVE_SYNC_DIR, fileName);
    copyFileSync(filePath, targetPath);
    console.log(`[crm] backup_mirrored_to_google_drive_sync file=${fileName}`);
    return targetPath;
  } catch (error) {
    console.error("[crm] google_drive_sync_copy_failed", error.message || error);
    return null;
  }
}

function resolveServiceAccountKeyPath() {
  if (GOOGLE_SERVICE_ACCOUNT_JSON) {
    return "__ENV_JSON__";
  }
  if (GOOGLE_SERVICE_ACCOUNT_KEY) {
    return isAbsolute(GOOGLE_SERVICE_ACCOUNT_KEY) ? GOOGLE_SERVICE_ACCOUNT_KEY : resolve(__dirname, GOOGLE_SERVICE_ACCOUNT_KEY);
  }
  if (existsSync(DEFAULT_SERVICE_ACCOUNT_KEY_PATH)) return DEFAULT_SERVICE_ACCOUNT_KEY_PATH;
  return "";
}

async function getDriveClient() {
  const keyPath = resolveServiceAccountKeyPath();
  if (!keyPath) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY missing");
  if (keyPath !== "__ENV_JSON__" && !existsSync(keyPath)) throw new Error(`service_account_key_not_found:${keyPath}`);
  if (!driveClientPromise) {
    driveClientPromise = (async () => {
      const auth = keyPath === "__ENV_JSON__"
        ? new google.auth.GoogleAuth({
            credentials: JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON),
            scopes: ["https://www.googleapis.com/auth/drive"],
          })
        : new google.auth.GoogleAuth({
            keyFile: keyPath,
            scopes: ["https://www.googleapis.com/auth/drive"],
          });
      return google.drive({ version: "v3", auth });
    })();
  }
  return driveClientPromise;
}

async function ensureDriveFolder(drive) {
  if (resolvedDriveFolderId) {
    try {
      await drive.files.get({ fileId: resolvedDriveFolderId, fields: "id,name" });
      return resolvedDriveFolderId;
    } catch (error) {
      console.error("[crm] drive_folder_lookup_failed", error.message || error);
      resolvedDriveFolderId = "";
    }
  }

  const searchResult = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${GOOGLE_DRIVE_FOLDER_NAME.replace(/'/g, "\\'")}' and trashed=false`,
    fields: "files(id,name)",
    pageSize: 1,
  });
  const existing = searchResult.data.files?.[0];
  if (existing?.id) {
    resolvedDriveFolderId = existing.id;
    return resolvedDriveFolderId;
  }

  const created = await drive.files.create({
    requestBody: {
      name: GOOGLE_DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id,name",
  });
  resolvedDriveFolderId = created.data.id || "";
  if (!resolvedDriveFolderId) throw new Error("drive_folder_create_failed");
  return resolvedDriveFolderId;
}

async function uploadFileToDrive(filePath, fileName) {
  if (!ENABLE_DRIVE_UPLOAD) {
    console.log(`[crm] drive_upload_skipped file=${fileName} reason=drive_upload_disabled`);
    return null;
  }
  const keyPath = resolveServiceAccountKeyPath();
  if (!keyPath) {
    console.log(`[crm] drive_upload_skipped file=${fileName} reason=missing_service_account_key`);
    return null;
  }

  const drive = await getDriveClient();
  const folderId = await ensureDriveFolder(drive);
  const media = {
    mimeType: "application/json",
    body: createReadStream(filePath),
  };

  const created = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: folderId ? [folderId] : undefined,
    },
    media,
    fields: "id,name,webViewLink",
    supportsAllDrives: true,
  });

  markDriveUploadSuccess(fileName);
  console.log(`Backup uploaded to Google Drive: ${fileName}`);
  return created.data;
}

async function syncFromOnline() {
  const syncStartedAt = new Date().toISOString();
  console.log(`[crm] sync_from_online_started at=${syncStartedAt} base=${ONLINE_CRM_BASE_URL}`);

  const current = loadState();
  const preSyncPayload = buildBackupPayload(current, { reason: "pre-sync-from-online", sourceBaseUrl: ONLINE_CRM_BASE_URL });
  const preSyncFile = writeBackupFile(preSyncPayload, "pre-sync");

  let payload;
  let sourceBackupFile = null;

  const backupsIndex = await fetchJson(`${ONLINE_CRM_BASE_URL}/api/backups`).catch(() => null);
  const latestRemote = Array.isArray(backupsIndex?.backups) ? backupsIndex.backups[0] : null;

  if (latestRemote) {
    const latestPayload = await fetchJson(`${ONLINE_CRM_BASE_URL}/api/backups/latest`).catch(() => null);
    payload = extractBackupPayload(latestPayload);
    sourceBackupFile = latestPayload?.backupFile || latestRemote;
  }

  if (!payload) {
    const generatedBackup = await fetchJson(`${ONLINE_CRM_BASE_URL}/api/backup`);
    payload = extractBackupPayload(generatedBackup);
    sourceBackupFile = generatedBackup?.backupFile || sourceBackupFile || null;
  }

  validateBackupPayload(payload);
  validateDealsPayload(payload.data.deals);

  const remoteDeals = Array.isArray(payload?.data?.deals) ? payload.data.deals : [];
  const currentDealsById = new Map((current?.deals || []).map((deal) => [String(deal?.id || ""), deal]));
  const safeRemoteDeals = remoteDeals.map((deal) => {
    const existing = currentDealsById.get(String(deal?.id || ""));
    const protectedDeal = protectDealFromCorruptedOverwrite(existing, deal, "sync_from_online");
    logUnicodeCorruption("sync_from_online", protectedDeal, "brand", protectedDeal?.brand);
    logUnicodeCorruption("sync_from_online", protectedDeal, "contact", protectedDeal?.contact);
    return protectedDeal;
  });

  const mergedPayloadData = {
    ...payload.data,
    deals: safeRemoteDeals,
    deletedDealTombstones: {
      ...(payload?.data?.deletedDealTombstones && typeof payload.data.deletedDealTombstones === "object" ? payload.data.deletedDealTombstones : {}),
      ...(current?.deletedDealTombstones && typeof current.deletedDealTombstones === "object" ? current.deletedDealTombstones : {}),
    },
  };
  const restored = saveState(mergedPayloadData);
  console.log(
    `[crm] sync_from_online_success at=${new Date().toISOString()} records=${restored.deals.length} sourceBackup=${sourceBackupFile?.fileName || "live-backup"}`,
  );

  return {
    syncedAt: new Date().toISOString(),
    sourceBaseUrl: ONLINE_CRM_BASE_URL,
    sourceBackupFile,
    preSyncFile,
    records: restored.deals.length,
    state: restored,
  };
}

function normalizeOwnerCodes(raw) {
  const codes = Array.isArray(raw) ? raw : DEFAULT_OWNER_CODES;
  return [...new Set(codes.map((code) => String(code || "").trim().toUpperCase()).filter((code) => code && code !== MASTER_OWNER))];
}

function buildAllOwnerCodes(ownerCodes) {
  return [MASTER_OWNER, ...normalizeOwnerCodes(ownerCodes)];
}

function getDefaultTeamForOwner(pic, ownerCodes = DEFAULT_OWNER_CODES) {
  if (!pic || pic === MASTER_OWNER) return "";
  const normalizedOwners = normalizeOwnerCodes(ownerCodes);
  const index = normalizedOwners.indexOf(pic);
  if (index === -1) return TEAM_OPTIONS[0];
  const pivot = Math.ceil(normalizedOwners.length / TEAM_OPTIONS.length);
  return index < pivot ? "PKD1" : "PKD2";
}

function normalizeRoleValue(value, pic) {
  if (pic === MASTER_OWNER) return MASTER_ROLE;
  return value === MANAGER_ROLE ? MANAGER_ROLE : USER_ROLE;
}

function normalizeTeamValue(value, pic, ownerCodes = DEFAULT_OWNER_CODES) {
  if (pic === MASTER_OWNER) return "";
  return TEAM_OPTIONS.includes(value) ? value : getDefaultTeamForOwner(pic, ownerCodes);
}

function normalizeAuthEntry(value, pic, ownerCodes = DEFAULT_OWNER_CODES) {
  const existing = typeof value === "object" && value !== null ? value : {};
  if (typeof value === "string") {
    return {
      password: value,
      role: normalizeRoleValue(undefined, pic),
      team: normalizeTeamValue(undefined, pic, ownerCodes),
      displayName: "",
      name: "",
      fullName: "",
    };
  }
  return {
    password: typeof value?.password === "string" ? value.password : "",
    role: normalizeRoleValue(value?.role, pic),
    team: normalizeTeamValue(value?.team, pic, ownerCodes),
    displayName: typeof existing.displayName === "string" ? existing.displayName : "",
    name: typeof existing.name === "string" ? existing.name : "",
    fullName: typeof existing.fullName === "string" ? existing.fullName : "",
  };
}

function getAuthEntry(authConfig, owner, ownerCodes = DEFAULT_OWNER_CODES) {
  return normalizeAuthEntry(authConfig?.[owner], owner, ownerCodes);
}

function getAccessProfile(state, owner) {
  if (!owner) {
    return { owner: MASTER_OWNER, role: MASTER_ROLE, team: "" };
  }
  const entry = getAuthEntry(state.authConfig, owner, state.ownerCodes);
  return { owner, role: entry.role, team: entry.team };
}

function filterDealsByAccess(deals, access) {
  if (access.role === MASTER_ROLE) return deals;
  if (access.role === MANAGER_ROLE) return deals.filter((deal) => deal.team === access.team);
  return deals.filter((deal) => deal.pic === access.owner);
}

function mergeDealsByAccess(currentDeals, incomingDeals, access) {
  const currentById = new Map((Array.isArray(currentDeals) ? currentDeals : []).map((deal) => [String(deal?.id || ""), deal]));
  const guardedIncoming = (Array.isArray(incomingDeals) ? incomingDeals : []).map((deal) => {
    const existing = currentById.get(String(deal?.id || ""));
    const protectedDeal = protectDealFromCorruptedOverwrite(existing, deal, "sync_merge");
    logUnicodeCorruption("sync_merge", protectedDeal, "brand", protectedDeal?.brand);
    logUnicodeCorruption("sync_merge", protectedDeal, "contact", protectedDeal?.contact);
    logUnicodeCorruption("sync_merge", protectedDeal, "notes", protectedDeal?.notes);
    return protectedDeal;
  });
  if (access.role === MASTER_ROLE) return guardedIncoming;
  const keepCurrent = currentDeals.filter((deal) => {
    if (access.role === MANAGER_ROLE) return deal.team !== access.team;
    return deal.pic !== access.owner;
  });
  const allowedIncoming = filterDealsByAccess(guardedIncoming, access);
  return [...keepCurrent, ...allowedIncoming];
}

function deriveOwnerCodes(raw) {
  if (Array.isArray(raw?.ownerCodes)) return normalizeOwnerCodes(raw.ownerCodes);
  const authOwners =
    raw?.authConfig && typeof raw.authConfig === "object"
      ? Object.keys(raw.authConfig).filter((owner) => owner && owner !== MASTER_OWNER)
      : [];
  const dealOwners = Array.isArray(raw?.deals) ? raw.deals.map((deal) => String(deal?.pic || "")).filter(Boolean) : [];
  const derived = normalizeOwnerCodes([...authOwners, ...dealOwners]);
  return derived.length ? derived : normalizeOwnerCodes(DEFAULT_OWNER_CODES);
}

function mergeAuthConfig(currentAuth, incomingAuth, ownerCodes) {
  if (!incomingAuth || typeof incomingAuth !== "object") return currentAuth;
  const next = { ...currentAuth };
  buildAllOwnerCodes(ownerCodes).forEach((owner) => {
    if (!(owner in incomingAuth)) return;
    const previous = normalizeAuthEntry(currentAuth?.[owner], owner, ownerCodes);
    const incoming = incomingAuth[owner];
    const mergedRaw =
      typeof incoming === "string"
        ? { ...previous, password: incoming }
        : typeof incoming === "object" && incoming !== null
          ? { ...previous, ...incoming }
          : previous;
    next[owner] = normalizeAuthEntry(mergedRaw, owner, ownerCodes);
  });
  return next;
}

function makeDefaultState() {
  const ownerCodes = [...DEFAULT_OWNER_CODES];
  return {
    ownerCodes,
    deals: [],
    deletedDealTombstones: {},
    authConfig: Object.fromEntries(buildAllOwnerCodes(ownerCodes).map((pic) => [pic, normalizeAuthEntry(null, pic, ownerCodes)])),
    telegramConfig: Object.fromEntries(buildAllOwnerCodes(ownerCodes).map((pic) => [pic, { botToken: "", chatId: "" }])),
    followupConfig: { ...FOLLOWUP_HOURS_DEFAULT },
    alertLog: {},
    sentAlerts: {},
    updatedAt: new Date().toISOString(),
  };
}

function loadState() {
  ensureStore();
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf8"));
    const normalized = normalizeState(raw, { logSource: "disk" });
    console.info(`[state] Loaded from disk: ${DATA_FILE} (deals=${normalized.deals.length}, owners=${normalized.ownerCodes.length})`);
    return normalized;
  } catch {
    const fallback = makeDefaultState();
    saveState(fallback);
    console.warn(`[state] Data file missing/invalid. Initialized new state at ${DATA_FILE}`);
    return fallback;
  }
}

function saveState(nextState) {
  const normalized = normalizeState(nextState, { logSource: "save" });
  normalized.updatedAt = new Date().toISOString();
  ensureStore();
  writeFileSync(DATA_FILE, JSON.stringify(normalized, null, 2));
  return normalized;
}

function normalizeState(raw, options = {}) {
  const base = makeDefaultState();
  const ownerCodes = deriveOwnerCodes(raw);
  let deals = Array.isArray(raw?.deals) ? raw.deals.map(normalizeDeal).filter(Boolean) : [];
  const rawTombstones = raw?.deletedDealTombstones && typeof raw.deletedDealTombstones === "object" ? raw.deletedDealTombstones : {};
  const deletedDealTombstones = {};
  Object.entries(rawTombstones).forEach(([dealId, meta]) => {
    if (!dealId) return;
    deletedDealTombstones[String(dealId)] = {
      deletedAt: typeof meta?.deletedAt === "string" && meta.deletedAt ? meta.deletedAt : new Date().toISOString(),
      deletedBy: typeof meta?.deletedBy === "string" ? meta.deletedBy : "",
    };
  });
  let authPatched = 0;
  let teamPatched = 0;
  let stagePatched = 0;
  const authConfig = { ...base.authConfig };
  buildAllOwnerCodes(ownerCodes).forEach((pic) => {
    const before = raw?.authConfig?.[pic];
    const normalizedEntry = normalizeAuthEntry(before, pic, ownerCodes);
    authConfig[pic] = normalizedEntry;
    const beforeObj = typeof before === "object" && before !== null ? before : {};
    if (!before || typeof before === "string" || beforeObj.role !== normalizedEntry.role || beforeObj.team !== normalizedEntry.team) {
      authPatched += 1;
    }
  });
  const telegramConfig = { ...base.telegramConfig };
  buildAllOwnerCodes(ownerCodes).forEach((pic) => {
    telegramConfig[pic] = {
      botToken: typeof raw?.telegramConfig?.[pic]?.botToken === "string" ? raw.telegramConfig[pic].botToken : "",
      chatId: typeof raw?.telegramConfig?.[pic]?.chatId === "string" ? raw.telegramConfig[pic].chatId : "",
    };
  });
  const followupConfig = normalizeFollowupConfig(raw?.followupConfig);
  const alertLog = raw?.alertLog && typeof raw.alertLog === "object" ? raw.alertLog : {};
  const sentAlerts = raw?.sentAlerts && typeof raw.sentAlerts === "object" ? raw.sentAlerts : {};
  deals = deals.map((deal) => {
    const stageRaw = String(deal.stage || "").trim();
    const stageAscii = stageRaw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    const mappedFromTiepCan = stageAscii === "tiep can" || stageAscii === "tiepcan";
    const nextStage = STAGES.includes(stageRaw) ? stageRaw : mappedFromTiepCan ? "Cold" : "Data Thô";
    const nextStatus = mappedFromTiepCan ? (deal.deal_status || "Đã liên hệ") : deal.deal_status;
    const nextTeam = TEAM_OPTIONS.includes(deal.team) ? deal.team : getAuthEntry(authConfig, deal.pic, ownerCodes).team;
    if (nextTeam !== deal.team) teamPatched += 1;
    if (nextStage !== deal.stage || nextStatus !== deal.deal_status) stagePatched += 1;
    return { ...deal, team: nextTeam, stage: nextStage, deal_status: nextStatus };
  });
  if (Object.keys(deletedDealTombstones).length) {
    const beforeCount = deals.length;
    deals = deals.filter((deal) => !deletedDealTombstones[String(deal.id)]);
    const removedByTombstone = beforeCount - deals.length;
    if (removedByTombstone > 0 && options.logSource) {
      console.info(`[state] Tombstone applied on ${options.logSource}: removedDeals=${removedByTombstone}`);
    }
  }
  if (options.logSource === "disk" && (authPatched > 0 || teamPatched > 0 || stagePatched > 0)) {
    console.info(`[state] Migration applied on load: authPatched=${authPatched}, dealTeamPatched=${teamPatched}, dealStagePatched=${stagePatched}`);
  }

  return {
    ownerCodes,
    deals,
    deletedDealTombstones,
    authConfig,
    telegramConfig,
    followupConfig,
    alertLog,
    sentAlerts,
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

function buildDeleteTombstones(current, incoming, access, actorOwner) {
  const currentVisible = filterDealsByAccess(current.deals || [], access);
  const incomingVisible = filterDealsByAccess(incoming || [], access);
  const incomingIds = new Set(incomingVisible.map((deal) => String(deal?.id || "")));
  const nowIso = new Date().toISOString();
  const next = { ...(current.deletedDealTombstones || {}) };
  const deletedIds = [];
  currentVisible.forEach((deal) => {
    const id = String(deal?.id || "");
    if (!id || incomingIds.has(id)) return;
    if (!next[id]) {
      next[id] = { deletedAt: nowIso, deletedBy: actorOwner || "" };
    }
    deletedIds.push(id);
  });
  return { tombstones: next, deletedIds };
}

function normalizeDeal(deal) {
  if (!deal || typeof deal !== "object") return null;
  logUnicodeCorruption("normalizeDeal", deal, "brand", deal.brand);
  logUnicodeCorruption("normalizeDeal", deal, "contact", deal.contact);
  logUnicodeCorruption("normalizeDeal", deal, "notes", deal.notes);
  const legacySource = parseLegacyLeadSource(deal.lead_source || deal.source);
  const lead_source_type = normalizeLeadSourceType(deal.lead_source_type) || legacySource.lead_source_type;
  const lead_source_detail = normalizeLeadSourceDetail(deal.lead_source_detail) || legacySource.lead_source_detail;
  const source = buildLeadSource(lead_source_type, lead_source_detail) || legacySource.source;
  const hist = Array.isArray(deal.stageHistory) ? deal.stageHistory : [];
  const lastWin = [...hist].reverse().find((entry) => entry?.to === "Win" && entry?.date);
  const wonAt =
    (typeof deal.wonAt === "string" && deal.wonAt)
    || (lastWin?.date || "")
    || (deal.stage === "Win" ? (deal.updatedAt || deal.dataInputDate || deal.createdAt || "") : "");
  return {
    ...deal,
    id: String(deal.id || Date.now()),
    brand: typeof deal.brand === "string" ? deal.brand : "",
    contact: typeof deal.contact === "string" ? deal.contact : "",
    phone: typeof deal.phone === "string" ? deal.phone : "",
    email: normalizeEmail(deal.email),
    ado: normalizeAdoValue(deal?.ado),
    team: TEAM_OPTIONS.includes(deal.team) ? deal.team : "",
    platform: normalizePlatformList(Array.isArray(deal.platform) ? deal.platform.filter(Boolean) : typeof deal.platform === "string" && deal.platform ? [deal.platform] : []),
    stage: STAGES.includes(deal.stage) ? deal.stage : "Data Thô",
    pic: typeof deal.pic === "string" ? deal.pic : "",
    lead_source_type,
    lead_source_detail,
    lead_source: source,
    source,
    value: Number(deal.value) || 0,
    maKH: typeof deal.maKH === "string" ? deal.maKH : "",
    bangGia: typeof deal.bangGia === "string" ? deal.bangGia : "",
    marketRegion: normalizeMarketRegion(deal.marketRegion),
    deal_status: DEAL_STATUS_OPTIONS.includes(deal.deal_status) ? deal.deal_status : null,
    dataInputDate: typeof deal.dataInputDate === "string" ? deal.dataInputDate : "",
    lastMeeting: typeof deal.lastMeeting === "string" ? deal.lastMeeting : "",
    wonAt,
    notes: parseNotes(deal.notes),
    createdAt: typeof deal.createdAt === "string" ? deal.createdAt : new Date().toISOString(),
    updatedAt: typeof deal.updatedAt === "string" ? deal.updatedAt : new Date().toISOString(),
    stageHistory: Array.isArray(deal.stageHistory) ? deal.stageHistory.map((entry) => ({
      from: entry?.from ?? null,
      to: entry?.to ?? "",
      date: typeof entry?.date === "string" ? entry.date : new Date().toISOString(),
    })) : [],
  };
}

function parseNotes(notes) {
  if (Array.isArray(notes)) {
    return notes
      .filter((note) => note && typeof note.text === "string")
      .map((note) => ({ text: note.text, date: typeof note.date === "string" ? note.date : new Date().toISOString() }));
  }
  if (typeof notes !== "string" || !notes.trim()) return [];
  return notes
    .split(" || ")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^\[(.*?)\]:\s?(.*)$/);
      if (!match) return { date: "", text: entry };
      return { date: match[1], text: match[2] };
    });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  const contentType = STATIC_MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  createReadStream(filePath).pipe(res);
}

function tryServeFrontend(pathname, res) {
  if (!existsSync(INDEX_FILE)) return false;

  const cleanPath = decodeURIComponent(pathname || "/");
  const relativePath = cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "");
  const candidate = resolve(DIST_DIR, relativePath);

  if (candidate.startsWith(DIST_DIR) && existsSync(candidate) && statSync(candidate).isFile()) {
    sendFile(res, candidate);
    return true;
  }

  if (!extname(cleanPath)) {
    sendFile(res, INDEX_FILE);
    return true;
  }

  return false;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 5_000_000) {
        reject(new Error("payload_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function listUnicodeCorruptedRecords(deals) {
  const rows = [];
  (Array.isArray(deals) ? deals : []).forEach((deal) => {
    if (!deal || typeof deal !== "object") return;
    const fields = [];
    UNICODE_GUARD_TEXT_FIELDS.forEach((field) => {
      if (hasUnicodeReplacement(deal[field])) fields.push(field);
    });
    if (Array.isArray(deal.notes) && deal.notes.some((note) => hasUnicodeReplacement(note?.text))) fields.push("notes");
    if (!fields.length) return;
    rows.push({
      id: String(deal.id || ""),
      brand: String(deal.brand || ""),
      pic: String(deal.pic || ""),
      team: String(deal.team || ""),
      createdAt: deal.createdAt || "",
      updatedAt: deal.updatedAt || "",
      fields,
    });
  });
  return rows;
}

function daysBetween(a, b) {
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
}

function getStageEnteredAt(deal) {
  const hist = Array.isArray(deal.stageHistory) ? deal.stageHistory : [];
  const last = [...hist].reverse().find((entry) => entry.to === deal.stage);
  return last ? last.date : deal.dataInputDate || deal.createdAt;
}

function getLatestTouchDate(deal, fallbackDate = "") {
  const notes = parseNotes(deal.notes).filter((note) => note.date);
  const latestNote = notes.length ? [...notes].sort((a, b) => new Date(b.date) - new Date(a.date))[0].date : "";
  if (!latestNote) return fallbackDate;
  if (!fallbackDate) return latestNote;
  return new Date(latestNote) > new Date(fallbackDate) ? latestNote : fallbackDate;
}

function getLatestNoteOrStageDate(deal) {
  return getLatestTouchDate(deal, getStageEnteredAt(deal));
}

function getSlaStatus(deal) {
  if (deal.stage === "Win") return null;
  const max = SLA_DAYS[deal.stage];
  if (!max) return null;
  const days = daysBetween(getLatestTouchDate(deal, getStageEnteredAt(deal)), new Date().toISOString());
  if (days >= max) return { type: "overdue", label: `Qua han ${Math.max(0, days - max)}n`, days, limit: max };
  if (days >= max - 1) return { type: "warning", label: "Het han hom nay", days, limit: max };
  if (days >= max * 0.7) return { type: "caution", label: `Con ${max - days}n`, days, limit: max };
  return null;
}

function getMeetingStatus(deal) {
  const cadence = MEETING_CADENCE[deal.stage];
  if (!cadence || !deal.lastMeeting) return null;
  const days = daysBetween(getLatestTouchDate(deal, deal.lastMeeting), new Date().toISOString());
  const due = cadence - days;
  if (due <= 0) return { type: "overdue", label: `Gap KH qua han ${-due}n`, days, limit: cadence };
  if (due <= 3) return { type: "warning", label: `Gap KH trong ${due}n`, days, limit: cadence };
  return null;
}

function getFollowupStatus(deal, followupConfig) {
  const limit = Number(followupConfig?.[deal.stage] || 0);
  if (!limit) return null;
  const since = getLatestNoteOrStageDate(deal);
  if (!since) return null;
  const hours = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 3600000));
  if (hours >= limit) return { type: "overdue", label: `Chua co note ${hours}h/${limit}h`, hours, limit };
  if (hours >= Math.max(1, Math.floor(limit * 0.75))) return { type: "warning", label: `Can note trong ${limit - hours}h`, hours, limit };
  return null;
}

function getAlertPriority(deal, followupConfig) {
  const sla = getSlaStatus(deal);
  const meeting = getMeetingStatus(deal);
  const followup = getFollowupStatus(deal, followupConfig);
  if ((sla && sla.type === "overdue") || (meeting && meeting.type === "overdue") || (followup && followup.type === "overdue")) return "critical";
  if ((sla && (sla.type === "warning" || sla.type === "caution")) || (meeting && meeting.type === "warning") || (followup && followup.type === "warning")) return "warning";
  return null;
}

function getCurrentAlerts(state) {
  return (state.deals || [])
    .map((deal) => {
      const sla = getSlaStatus(deal);
      const meeting = getMeetingStatus(deal);
      const followup = getFollowupStatus(deal, state.followupConfig);
      const priority = getAlertPriority(deal, state.followupConfig);
      return { deal, sla, meeting, followup, priority };
    })
    .filter((item) => item.priority)
    .sort((a, b) => {
      const score = { critical: 2, warning: 1 };
      const diff = (score[b.priority] || 0) - (score[a.priority] || 0);
      if (diff !== 0) return diff;
      return new Date(b.deal.updatedAt || b.deal.createdAt || 0) - new Date(a.deal.updatedAt || a.deal.createdAt || 0);
    });
}

function buildAlerts(state) {
  const entries = [];
  for (const deal of state.deals) {
    const sla = getSlaStatus(deal);
    const meeting = getMeetingStatus(deal);
    const followup = getFollowupStatus(deal, state.followupConfig);
    if (sla?.type === "overdue") {
      entries.push({
        key: `${deal.id}:sla:${deal.pic}`,
        dealId: deal.id,
        owner: deal.pic,
        type: "sla",
        stage: deal.stage,
        dealStatus: deal.deal_status || "",
        stateToken: String(deal.updatedAt || ""),
        text: `⚠️ SLA QUA HAN: *${deal.brand || "Khong ten"}* dang o ${deal.stage} da ${sla.days} ngay (max ${sla.limit}n)`,
      });
    }
    if (meeting?.type === "overdue") {
      entries.push({
        key: `${deal.id}:meeting:${deal.pic}`,
        dealId: deal.id,
        owner: deal.pic,
        type: "meeting",
        stage: deal.stage,
        dealStatus: deal.deal_status || "",
        stateToken: String(deal.updatedAt || ""),
        text: `📅 GAP KH: *${deal.brand || "Khong ten"}* (${deal.stage}) da ${meeting.days} ngay chua gap (can gap moi ${meeting.limit}n)`,
      });
    }
    if (followup?.type === "overdue") {
      entries.push({
        key: `${deal.id}:followup:${deal.pic}`,
        dealId: deal.id,
        owner: deal.pic,
        type: "followup",
        stage: deal.stage,
        dealStatus: deal.deal_status || "",
        stateToken: String(deal.updatedAt || ""),
        text: `📝 CHUA CO NOTE: *${deal.brand || "Khong ten"}* (${deal.stage}) da ${followup.hours}h chua duoc cap nhat ghi chu (max ${followup.limit}h)`,
      });
    }
  }
  return entries;
}

function buildAlertsV2(state) {
  const entries = [];
  const currentAlerts = getCurrentAlerts(state);
  for (const item of currentAlerts) {
    const deal = item.deal;
    const sla = item.sla;
    const meeting = item.meeting;
    const followup = item.followup;
    if (sla?.type === "overdue") {
      entries.push({
        key: `${deal.pic}_${deal.id}_overdue_stage`,
        dealId: deal.id,
        owner: deal.pic,
        alertType: "overdue_stage",
        brand: deal.brand || "Khong ten",
        stage: deal.stage,
        dealStatus: deal.deal_status || "",
        stateToken: String(deal.updatedAt || ""),
        metricValue: sla.days,
        metricLimit: sla.limit,
        metricUnit: "ngay",
        reason: `Qua han stage ${deal.stage}`,
        text: `⚠️ SLA QUA HAN: *${deal.brand || "Khong ten"}* dang o ${deal.stage} da ${sla.days} ngay (max ${sla.limit}n)`,
      });
    }
    if (sla?.type === "warning" || sla?.type === "caution") {
      entries.push({
        key: `${deal.pic}_${deal.id}_near_sla`,
        dealId: deal.id,
        owner: deal.pic,
        alertType: "near_sla",
        brand: deal.brand || "Khong ten",
        stage: deal.stage,
        dealStatus: deal.deal_status || "",
        stateToken: String(deal.updatedAt || ""),
        metricValue: sla.days,
        metricLimit: sla.limit,
        metricUnit: "ngay",
        reason: sla.label || "Sap cham han SLA",
        text: `⏳ SLA CANH BAO: *${deal.brand || "Khong ten"}* (${deal.stage}) ${sla.label || ""}`,
      });
    }
    if (meeting?.type === "overdue") {
      entries.push({
        key: `${deal.pic}_${deal.id}_overdue_meeting`,
        dealId: deal.id,
        owner: deal.pic,
        alertType: "overdue_meeting",
        brand: deal.brand || "Khong ten",
        stage: deal.stage,
        dealStatus: deal.deal_status || "",
        stateToken: String(deal.updatedAt || ""),
        metricValue: meeting.days,
        metricLimit: meeting.limit,
        metricUnit: "ngay",
        reason: "Qua han gap khach",
        text: `📅 GAP KH: *${deal.brand || "Khong ten"}* (${deal.stage}) da ${meeting.days} ngay chua gap (can gap moi ${meeting.limit}n)`,
      });
    }
    if (meeting?.type === "warning") {
      entries.push({
        key: `${deal.pic}_${deal.id}_near_meeting`,
        dealId: deal.id,
        owner: deal.pic,
        alertType: "near_meeting",
        brand: deal.brand || "Khong ten",
        stage: deal.stage,
        dealStatus: deal.deal_status || "",
        stateToken: String(deal.updatedAt || ""),
        metricValue: meeting.days,
        metricLimit: meeting.limit,
        metricUnit: "ngay",
        reason: meeting.label || "Sap den lich gap KH",
        text: `📌 NHAC GAP KH: *${deal.brand || "Khong ten"}* (${deal.stage}) ${meeting.label || ""}`,
      });
    }
    if (followup?.type === "overdue") {
      entries.push({
        key: `${deal.pic}_${deal.id}_missing_note`,
        dealId: deal.id,
        owner: deal.pic,
        alertType: "missing_note",
        brand: deal.brand || "Khong ten",
        stage: deal.stage,
        dealStatus: deal.deal_status || "",
        stateToken: String(deal.updatedAt || ""),
        metricValue: followup.hours,
        metricLimit: followup.limit,
        metricUnit: "h",
        reason: "Chua co ghi chu moi",
        text: `📝 CHUA CO NOTE: *${deal.brand || "Khong ten"}* (${deal.stage}) da ${followup.hours}h chua duoc cap nhat ghi chu (max ${followup.limit}h)`,
      });
    }
    if (followup?.type === "warning") {
      entries.push({
        key: `${deal.pic}_${deal.id}_near_note`,
        dealId: deal.id,
        owner: deal.pic,
        alertType: "near_note",
        brand: deal.brand || "Khong ten",
        stage: deal.stage,
        dealStatus: deal.deal_status || "",
        stateToken: String(deal.updatedAt || ""),
        metricValue: followup.hours,
        metricLimit: followup.limit,
        metricUnit: "h",
        reason: followup.label || "Sap can cap nhat ghi chu",
        text: `📝 NHAC NOTE: *${deal.brand || "Khong ten"}* (${deal.stage}) ${followup.label || ""}`,
      });
    }
  }
  return entries;
}

const TELEGRAM_NEAR_ALERT_TYPES = new Set([
  "near_sla",
  "near_meeting",
  "near_note",
  "warning",
  "upcoming",
  "need_note_soon",
]);

const TELEGRAM_OVERDUE_ALERT_TYPES = new Set([
  "overdue_stage",
  "overdue_meeting",
  "missing_note",
  "overdue_note",
]);

function isTelegramOverdueAlert(alert) {
  if (!alert || !alert.alertType) return false;
  if (TELEGRAM_NEAR_ALERT_TYPES.has(alert.alertType)) return false;
  if (alert.isOverdue === true) return true;
  const metricValue = Number(alert.metricValue);
  const metricLimit = Number(alert.metricLimit);
  if (Number.isFinite(metricValue) && Number.isFinite(metricLimit) && metricValue >= metricLimit) return true;
  return TELEGRAM_OVERDUE_ALERT_TYPES.has(alert.alertType);
}

function truncateText(value, maxLen) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 3))}...`;
}

function formatAlertItemText(alert) {
  const brand = truncateText(alert.brand || "Khong ten", 80);
  const stage = truncateText(alert.stage || "-", 24);
  const reason = truncateText(alert.reason || alert.text || "-", 160);
  const unit = alert.metricUnit || "";
  const value = Number(alert.metricValue);
  const limit = Number(alert.metricLimit);
  const overdueLine = Number.isFinite(value) && Number.isFinite(limit)
    ? `Qua han: ${value}${unit} / SLA ${limit}${unit}`
    : "";
  return [
    `KH: ${brand}`,
    `Stage: ${stage}`,
    `Loi: ${reason}`,
    overdueLine,
  ].filter(Boolean).join("\n");
}

function chunkTelegramMessages(owner, alerts) {
  const header = `🔔 GIP Pipeline Alert - ${owner}\nTong canh bao: ${alerts.length}\n\n`;
  const chunks = [];
  let current = header;
  for (const alert of alerts) {
    let block = `${formatAlertItemText(alert)}\n\n`;
    if (block.length > 600) block = `${truncateText(block, 600)}\n`;
    if ((current + block).length > TELEGRAM_MAX_MESSAGE_LENGTH) {
      if (current !== header) {
        chunks.push(current.trim());
        current = header;
      }
      if ((current + block).length > TELEGRAM_MAX_MESSAGE_LENGTH) {
        const remain = TELEGRAM_MAX_MESSAGE_LENGTH - current.length - 80;
        current += `${truncateText(block, Math.max(120, remain))}\n... Noi dung da duoc rut gon. Mo CRM de xem chi tiet.`;
        chunks.push(current.trim());
        current = header;
      } else {
        current += block;
      }
    } else {
      current += block;
    }
  }
  if (current !== header) chunks.push(current.trim());
  return chunks;
}

function buildBatchDedupKey(owner, alertTypes, message) {
  const payload = `${owner}|${[...new Set(alertTypes)].sort().join(",")}|${message}`;
  return createHash("sha1").update(payload).digest("hex");
}

function acquireTelegramGlobalLock(alertState) {
  const now = Date.now();
  const locks = alertState?.locks && typeof alertState.locks === "object" ? alertState.locks : {};
  const current = locks.telegram_alert_global_lock || {};
  const lockUntilMs = current.lockUntil ? new Date(current.lockUntil).getTime() : 0;
  if (Number.isFinite(lockUntilMs) && lockUntilMs > now) {
    return { acquired: false, lockUntil: current.lockUntil || null };
  }
  const lockUntil = new Date(now + TELEGRAM_LOCK_TTL_MS).toISOString();
  locks.telegram_alert_global_lock = { lockUntil, owner: "scanAndNotifyV2", acquiredAt: new Date(now).toISOString() };
  alertState.locks = locks;
  return { acquired: true, lockUntil };
}

function releaseTelegramGlobalLock(alertState) {
  const locks = alertState?.locks && typeof alertState.locks === "object" ? alertState.locks : {};
  if (!locks.telegram_alert_global_lock) return;
  delete locks.telegram_alert_global_lock;
  alertState.locks = locks;
}

async function sendOwnerAlertBatches(owner, cfg, ownerAlerts, batchDedup, repeatMs) {
  const messages = chunkTelegramMessages(owner, ownerAlerts);
  let sentMessageCount = 0;
  let skippedByBatchDedup = 0;
  let failedMessages = 0;
  for (const msg of messages) {
    const alertTypes = ownerAlerts.map((alert) => alert.alertType || "unknown");
    const batchKey = buildBatchDedupKey(owner, alertTypes, msg);
    const now = Date.now();
    const previousBatch = batchDedup[batchKey];
    const lastBatchMs = previousBatch?.lastSentAt ? new Date(previousBatch.lastSentAt).getTime() : 0;
    if (previousBatch && Number.isFinite(lastBatchMs) && now - lastBatchMs < repeatMs) {
      skippedByBatchDedup += 1;
      console.info("[telegram] skip batch dedup", {
        owner,
        batchKey,
        lastSentAt: previousBatch.lastSentAt,
        nextAllowedAt: new Date(lastBatchMs + repeatMs).toISOString(),
      });
      continue;
    }
    batchDedup[batchKey] = {
      owner,
      alertTypes: [...new Set(alertTypes)].sort(),
      pendingAt: new Date(now).toISOString(),
      status: "pending",
    };
    let telegramOk = false;
    try {
      const telegramResp = await sendTelegram(cfg.botToken, cfg.chatId, msg);
      telegramOk = !!telegramResp?.ok;
    } catch (error) {
      console.error("[telegram-alert] send_failed", {
        owner,
        error: error?.message || "telegram_send_failed",
        length: String(msg || "").length,
        batchKey,
      });
    }
    if (!telegramOk) {
      failedMessages += 1;
      delete batchDedup[batchKey];
      continue;
    }
    batchDedup[batchKey] = {
      owner,
      alertTypes: [...new Set(alertTypes)].sort(),
      lastSentAt: new Date().toISOString(),
      status: "sent",
    };
    sentMessageCount += 1;
  }
  return { ok: sentMessageCount > 0, sentMessageCount, skippedByBatchDedup, failedMessages };
}

async function sendTelegram(botToken, chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`telegram_http_${response.status}:${errorText}`);
  }
  return response.json();
}

async function scanAndNotify() {
  const state = loadState();
  const alerts = buildAlerts(state);
  const nextLog = {};
  const dueByOwner = {};
  const now = Date.now();
  const repeatMs = ALERT_REPEAT_HOURS * 3600000;

  alerts.forEach((alert) => {
    const previous = state.alertLog?.[alert.key];
    const shouldSend = !previous || previous.signature !== alert.signature || now - new Date(previous.lastSentAt).getTime() >= repeatMs;
    nextLog[alert.key] = previous && !shouldSend ? previous : { signature: alert.signature, lastSentAt: shouldSend ? new Date().toISOString() : previous?.lastSentAt || new Date().toISOString() };
    if (!shouldSend) return;
    if (!dueByOwner[alert.owner]) dueByOwner[alert.owner] = [];
    dueByOwner[alert.owner].push(alert.text);
  });

  const sent = [];
  for (const [owner, messages] of Object.entries(dueByOwner)) {
    const cfg = state.telegramConfig?.[owner];
    if (!cfg?.botToken || !cfg?.chatId || !messages.length) continue;
    const text = `🔔 *GIP Pipeline Alert* - ${owner}\n\n${messages.join("\n\n")}`;
    await sendTelegram(cfg.botToken, cfg.chatId, text);
    sent.push({ owner, count: messages.length });
  }

  state.alertLog = nextLog;
  saveState(state);
  return { sent, totalAlerts: alerts.length };
}

async function scanAndNotifyV2() {
  const state = loadState();
  const alerts = buildAlertsV2(state);
  const groupedByOwner = alerts.reduce((acc, alert) => {
    acc[alert.owner] = (acc[alert.owner] || 0) + 1;
    return acc;
  }, {});
  console.info("[telegram] totalCurrentAlertsFromCRM=", alerts.length);
  console.info("[telegram] groupedByOwner=", groupedByOwner);
  const alertState = loadTelegramAlertState();
  const nextSentAlerts = { ...(alertState.alerts || {}) };
  const activeKeys = new Set(alerts.map((alert) => alert.key));
  const dueByOwner = {};
  const skippedByOwner = {};
  const now = Date.now();
  const repeatMs = ALERT_REPEAT_HOURS * 3600000;
  let skippedByCooldown = 0;

  alerts.forEach((alert) => {
    const previous = nextSentAlerts[alert.key];
    const lastSentAtMs = previous?.lastSentAt ? new Date(previous.lastSentAt).getTime() : 0;
    const changedByUpdate = !!previous && previous.stateToken !== alert.stateToken;
    const passedCooldown = !!previous && Number.isFinite(lastSentAtMs) && now - lastSentAtMs >= repeatMs;
    const shouldSend = !previous || changedByUpdate || passedCooldown;
    if (!shouldSend) {
      skippedByCooldown += 1;
      skippedByOwner[alert.owner] = (skippedByOwner[alert.owner] || 0) + 1;
      const nextAllowedAt = Number.isFinite(lastSentAtMs) && lastSentAtMs > 0 ? new Date(lastSentAtMs + repeatMs).toISOString() : null;
      console.info("[telegram-alert] skip", {
        alertKey: alert.key,
        reason: "cooldown_active",
        owner: alert.owner,
        dealId: alert.dealId,
        alertType: alert.alertType,
        lastSentAt: previous?.lastSentAt || null,
        nextAllowedAt,
      });
      return;
    }
    if (!dueByOwner[alert.owner]) dueByOwner[alert.owner] = [];
    dueByOwner[alert.owner].push(alert);
  });

  const sent = [];
  const eligibleAlertsAfterCooldown = Object.values(dueByOwner).reduce((sum, list) => sum + list.length, 0);
  console.info("[telegram-alert] summary", {
    totalAlertsFound: alerts.length,
    eligibleAlertsAfterCooldown,
    skippedByCooldown,
  });
  for (const [owner, ownerAlerts] of Object.entries(dueByOwner)) {
    const cfg = state.telegramConfig?.[owner];
    if (!cfg?.botToken || !cfg?.chatId || !ownerAlerts.length) {
      if (ownerAlerts.length) console.info("[telegram] skipped because telegram config missing", { owner, alerts: ownerAlerts.length });
      continue;
    }
    const text = `🔔 *GIP Pipeline Alert* - ${owner}\n\n${ownerAlerts.map((item) => item.text).join("\n\n")}`;
    console.info("[telegram] owner_scan", {
      owner,
      total: groupedByOwner[owner] || 0,
      eligible: ownerAlerts.length,
      skippedCooldown: skippedByOwner[owner] || 0,
    });
    const sendResult = await sendOwnerAlertBatches(owner, cfg, ownerAlerts);
    if (!sendResult.ok) continue;
    const sentAt = new Date().toISOString();
    ownerAlerts.forEach((alert) => {
      const previous = nextSentAlerts[alert.key];
      const mode = !previous ? "first_send" : previous.stateToken !== alert.stateToken ? "resolved_then_realert" : "resend_after_cooldown";
      nextSentAlerts[alert.key] = {
        alertKey: alert.key,
        dealId: alert.dealId,
        owner: alert.owner,
        alertType: alert.alertType,
        stage: alert.stage,
        dealStatus: alert.dealStatus,
        stateToken: alert.stateToken,
        sentAt,
        lastSentAt: sentAt,
      };
      console.info("[telegram-alert] sent", {
        alertKey: alert.key,
        mode,
        owner: alert.owner,
        dealId: alert.dealId,
        alertType: alert.alertType,
      });
    });
    sent.push({ owner, count: ownerAlerts.length, messages: sendResult.sentMessageCount });
  }

  Object.keys(nextSentAlerts).forEach((key) => {
    if (activeKeys.has(key)) return;
    console.info("[telegram-alert] resolved", { alertKey: key, reason: "not_active" });
    delete nextSentAlerts[key];
  });

  saveTelegramAlertState({ alerts: nextSentAlerts });
  state.sentAlerts = nextSentAlerts;
  state.alertLog = state.alertLog || {};
  saveState(state);
  return { sent, totalAlerts: alerts.length };
}

async function scanAndNotifyV3() {
  const state = loadState();
  const alertsRaw = buildAlertsV2(state);
  let nearSlaSkipped = 0;
  let notOverdueSkipped = 0;
  const alerts = alertsRaw.filter((alert) => {
    const isNear = TELEGRAM_NEAR_ALERT_TYPES.has(alert.alertType);
    if (isNear) {
      nearSlaSkipped += 1;
      return false;
    }
    const overdue = isTelegramOverdueAlert(alert);
    if (!overdue) {
      notOverdueSkipped += 1;
      return false;
    }
    return true;
  });
  const groupedByOwner = alerts.reduce((acc, alert) => {
    acc[alert.owner] = (acc[alert.owner] || 0) + 1;
    return acc;
  }, {});
  console.info("[telegram] totalCurrentAlertsFromCRM=", alertsRaw.length);
  console.info("[telegram] groupedByOwner=", groupedByOwner);

  const alertState = loadTelegramAlertState();
  const lock = acquireTelegramGlobalLock(alertState);
  if (!lock.acquired) {
    console.info("[telegram] skippedByGlobalLock", { lockUntil: lock.lockUntil });
    return {
      sent: [],
      totalAlerts: alerts.length,
      totalAlertsFound: alertsRaw.length,
      nearSlaSkipped,
      notOverdueSkipped,
      overdueEligible: alerts.length,
      eligibleAlertsAfterCooldown: 0,
      skippedByCooldown: 0,
      skippedByGlobalLock: 1,
      skippedByBatchDedup: 0,
      sentMessages: 0,
      failedMessages: 0,
    };
  }
  saveTelegramAlertState(alertState);

  const nextSentAlerts = { ...(alertState.alerts || {}) };
  const batchDedup = { ...(alertState.batchDedup || {}) };
  const activeKeys = new Set(alerts.map((alert) => alert.key));
  const dueByOwner = {};
  const skippedByOwner = {};
  const now = Date.now();
  const repeatMs = ALERT_REPEAT_HOURS * 3600000;
  let skippedByCooldown = 0;
  let skippedByBatchDedup = 0;
  let sentMessages = 0;
  let failedMessages = 0;

  alerts.forEach((alert) => {
    const previous = nextSentAlerts[alert.key];
    const lastSentAtMs = previous?.lastSentAt ? new Date(previous.lastSentAt).getTime() : 0;
    const changedByUpdate = !!previous && previous.stateToken !== alert.stateToken;
    const passedCooldown = !!previous && Number.isFinite(lastSentAtMs) && now - lastSentAtMs >= repeatMs;
    const shouldSend = !previous || changedByUpdate || passedCooldown;
    if (!shouldSend) {
      skippedByCooldown += 1;
      skippedByOwner[alert.owner] = (skippedByOwner[alert.owner] || 0) + 1;
      const nextAllowedAt = Number.isFinite(lastSentAtMs) && lastSentAtMs > 0 ? new Date(lastSentAtMs + repeatMs).toISOString() : null;
      console.info("[telegram-alert] skip", {
        alertKey: alert.key,
        reason: "cooldown_active",
        owner: alert.owner,
        dealId: alert.dealId,
        alertType: alert.alertType,
        lastSentAt: previous?.lastSentAt || null,
        nextAllowedAt,
      });
      return;
    }
    if (!dueByOwner[alert.owner]) dueByOwner[alert.owner] = [];
    dueByOwner[alert.owner].push(alert);
  });

  const sent = [];
  const eligibleAlertsAfterCooldown = Object.values(dueByOwner).reduce((sum, list) => sum + list.length, 0);
  for (const [owner, ownerAlerts] of Object.entries(dueByOwner)) {
    const cfg = state.telegramConfig?.[owner];
    if (!cfg?.botToken || !cfg?.chatId || !ownerAlerts.length) {
      if (ownerAlerts.length) console.info("[telegram] skipped because telegram config missing", { owner, alerts: ownerAlerts.length });
      continue;
    }
    console.info("[telegram] owner_scan", {
      owner,
      total: groupedByOwner[owner] || 0,
      eligible: ownerAlerts.length,
      skippedCooldown: skippedByOwner[owner] || 0,
    });

    const sendResult = await sendOwnerAlertBatches(owner, cfg, ownerAlerts, batchDedup, repeatMs);
    skippedByBatchDedup += sendResult.skippedByBatchDedup || 0;
    sentMessages += sendResult.sentMessageCount || 0;
    failedMessages += sendResult.failedMessages || 0;
    if (!sendResult.ok) continue;

    const sentAt = new Date().toISOString();
    ownerAlerts.forEach((alert) => {
      const previous = nextSentAlerts[alert.key];
      const mode = !previous ? "first_send" : previous.stateToken !== alert.stateToken ? "resolved_then_realert" : "resend_after_cooldown";
      nextSentAlerts[alert.key] = {
        alertKey: alert.key,
        dealId: alert.dealId,
        owner: alert.owner,
        alertType: alert.alertType,
        stage: alert.stage,
        dealStatus: alert.dealStatus,
        stateToken: alert.stateToken,
        sentAt,
        lastSentAt: sentAt,
      };
      console.info("[telegram-alert] sent", {
        alertKey: alert.key,
        mode,
        owner: alert.owner,
        dealId: alert.dealId,
        alertType: alert.alertType,
      });
    });
    sent.push({ owner, count: ownerAlerts.length, messages: sendResult.sentMessageCount });
  }

  Object.keys(nextSentAlerts).forEach((key) => {
    if (activeKeys.has(key)) return;
    console.info("[telegram-alert] resolved", { alertKey: key, reason: "not_active" });
    delete nextSentAlerts[key];
  });

  const batchDedupClean = {};
  Object.entries(batchDedup).forEach(([key, item]) => {
    const at = item?.lastSentAt || item?.pendingAt;
    const atMs = at ? new Date(at).getTime() : 0;
    if (!Number.isFinite(atMs) || now - atMs > repeatMs * 2) return;
    batchDedupClean[key] = item;
  });

  state.sentAlerts = nextSentAlerts;
  state.alertLog = state.alertLog || {};
  saveState(state);
  alertState.alerts = nextSentAlerts;
  alertState.batchDedup = batchDedupClean;
  releaseTelegramGlobalLock(alertState);
  saveTelegramAlertState(alertState);

  console.info("[telegram] job_result", {
    totalAlertsFound: alertsRaw.length,
    nearSlaSkipped,
    notOverdueSkipped,
    overdueEligible: alerts.length,
    eligibleAlertsAfterCooldown,
    skippedByCooldown,
    skippedByGlobalLock: 0,
    skippedByBatchDedup,
    sentMessages,
    failedMessages,
  });
  return {
    sent,
    totalAlerts: alerts.length,
    totalAlertsFound: alertsRaw.length,
    nearSlaSkipped,
    notOverdueSkipped,
    overdueEligible: alerts.length,
    eligibleAlertsAfterCooldown,
    skippedByCooldown,
    skippedByGlobalLock: 0,
    skippedByBatchDedup,
    sentMessages,
    failedMessages,
  };
}

async function route(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, backup: getBackupHealthSnapshot() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/backup-health") {
    const health = getBackupHealthSnapshot();
    sendJson(res, health.status === "healthy" ? 200 : 503, { ok: health.status === "healthy", backup: health });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/backup") {
    const result = createAutomaticBackup("manual-api");
    sendJson(res, 200, {
      ok: true,
      ...result,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/backups") {
    sendJson(res, 200, {
      ok: true,
      backups: listBackupFiles(),
      retentionRule: {
        type: "keep-latest",
        maxFiles: MAX_BACKUP_FILES,
      },
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/backups/latest") {
    const latest = getLatestBackupFile();
    if (!latest) {
      sendJson(res, 404, { ok: false, error: "backup_not_found" });
      return;
    }
    const payload = JSON.parse(readFileSync(latest.filePath, "utf8"));
    sendJson(res, 200, {
      ok: true,
      backupFile: latest,
      backup: payload,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    const state = loadState();
    const owner = String(url.searchParams.get("owner") || "");
    const access = getAccessProfile(state, owner);
    const telegramOwner = owner || MASTER_OWNER;
    const visibleAuthConfig = owner && owner !== MASTER_OWNER
      ? { [owner]: state.authConfig?.[owner] || normalizeAuthEntry(null, owner, state.ownerCodes) }
      : state.authConfig;
    const visibleTelegramConfig = { [telegramOwner]: state.telegramConfig?.[telegramOwner] || { botToken: "", chatId: "" } };
    sendJson(res, 200, {
      ok: true,
      ownerCodes: state.ownerCodes,
      deals: filterDealsByAccess(state.deals, access),
      authConfig: visibleAuthConfig,
      telegramConfig: visibleTelegramConfig,
      followupConfig: state.followupConfig,
      currentUser: access,
      updatedAt: state.updatedAt,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/unicode-issues") {
    const state = loadState();
    const records = listUnicodeCorruptedRecords(state.deals);
    sendJson(res, 200, {
      ok: true,
      total: records.length,
      records,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/state") {
    const body = await readBody(req);
    if (body.deals !== undefined) validateDealsPayload(body.deals);
    if (body.followupConfig !== undefined) validateFollowupConfig(body.followupConfig);
    const current = loadState();
    const currentDealIds = new Set((current.deals || []).map((deal) => String(deal?.id || "")));
    if (Array.isArray(body.deals)) {
      body.deals.forEach((deal) => {
        if (!deal || typeof deal !== "object") return;
        const dealId = String(deal?.id || "");
        const flow = !dealId || !currentDealIds.has(dealId) ? "manual_create_or_bulk_import" : "manual_edit_or_sync_merge";
        logUnicodeCorruption(flow, deal, "brand", deal.brand);
        logUnicodeCorruption(flow, deal, "contact", deal.contact);
        logUnicodeCorruption(flow, deal, "notes", deal.notes);
      });
    }
    const baseUpdatedAt = typeof body.baseUpdatedAt === "string" ? body.baseUpdatedAt : "";
    if (baseUpdatedAt && current.updatedAt && baseUpdatedAt !== current.updatedAt) {
      sendJson(res, 409, {
        ok: false,
        error: "state_conflict",
        currentUpdatedAt: current.updatedAt,
      });
      return;
    }
    const actorOwner = String(body.actorOwner || MASTER_OWNER);
    const access = getAccessProfile(current, actorOwner);
    if (Array.isArray(body.deals) && access.role !== MASTER_ROLE) {
      const unauthorizedIncoming = body.deals.find((deal) => {
        if (!deal || typeof deal !== "object") return true;
        const existing = current.deals.find((item) => item.id === deal.id);
        if (access.role === MANAGER_ROLE) {
          if (existing && existing.team !== access.team) return true;
          if (!existing && deal.team !== access.team) return true;
          return false;
        }
        if (existing && existing.pic !== access.owner) return true;
        if (!existing && deal.pic !== access.owner) return true;
        return false;
      });
      if (unauthorizedIncoming) {
        sendJson(res, 403, { ok: false, error: "forbidden_deal_update" });
        return;
      }
    }
    console.info("[state] write_request", {
      actorOwner,
      role: access.role,
      team: access.team || "",
      dealsIncoming: Array.isArray(body.deals) ? body.deals.length : 0,
      baseUpdatedAt: baseUpdatedAt || "",
      currentUpdatedAt: current.updatedAt || "",
      dataFile: DATA_FILE,
    });
    const { tombstones: nextTombstones, deletedIds } = Array.isArray(body.deals)
      ? buildDeleteTombstones(current, body.deals, access, actorOwner)
      : { tombstones: current.deletedDealTombstones || {}, deletedIds: [] };
    if (deletedIds.length > 0) {
      console.info("[delete] request", {
        actorOwner,
        role: access.role,
        deletedCount: deletedIds.length,
        deletedIds: deletedIds.slice(0, 20),
      });
    }
    const hasSensitiveStateChange = body.ownerCodes !== undefined || body.authConfig !== undefined || body.followupConfig !== undefined;
    if (hasSensitiveStateChange) {
      try {
        writeBackupFile(buildBackupPayload(current), "pre-state-write");
      } catch (error) {
        console.error(`[state] Failed to create pre-write backup: ${error?.message || "backup_failed"}`);
      }
    }
    const nextOwnerCodes = access.role === MASTER_ROLE && body.ownerCodes ? normalizeOwnerCodes(body.ownerCodes) : current.ownerCodes;
    const mergedAuthConfig = access.role === MASTER_ROLE ? mergeAuthConfig(current.authConfig, body.authConfig, nextOwnerCodes) : current.authConfig;
    const mergedTelegramConfig = body.telegramConfig
      ? {
          ...current.telegramConfig,
          ...Object.fromEntries(
            Object.entries(body.telegramConfig).map(([owner, cfg]) => [
              owner,
              {
                botToken: typeof cfg?.botToken === "string" ? cfg.botToken : current.telegramConfig?.[owner]?.botToken || "",
                chatId: typeof cfg?.chatId === "string" ? cfg.chatId : current.telegramConfig?.[owner]?.chatId || "",
              },
            ]),
          ),
        }
      : current.telegramConfig;
    const mergedDeals = Array.isArray(body.deals) ? mergeDealsByAccess(current.deals, body.deals, access) : current.deals;
    const activeDeals = mergedDeals.filter((deal) => !nextTombstones[String(deal?.id || "")]);
    const nextFollowupConfig = access.role === MASTER_ROLE && body.followupConfig ? normalizeFollowupConfig(body.followupConfig) : current.followupConfig;
    console.info("[state] config_write_request", {
      actorOwner,
      hasFollowupConfig: body.followupConfig !== undefined,
      followupConfig: body.followupConfig ? normalizeFollowupConfig(body.followupConfig) : undefined,
    });
    const next = saveState({
      ...current,
      ownerCodes: nextOwnerCodes,
      deals: activeDeals,
      deletedDealTombstones: nextTombstones,
      authConfig: mergedAuthConfig,
      telegramConfig: mergedTelegramConfig,
      followupConfig: nextFollowupConfig,
      alertLog: current.alertLog || {},
      sentAlerts: current.sentAlerts || {},
    });
    if (deletedIds.length > 0) {
      console.info("[delete] db_success", {
        actorOwner,
        deletedCount: deletedIds.length,
      });
    }
    console.info("[state] write_success", {
      actorOwner,
      role: access.role,
      updatedAt: next.updatedAt,
      dealsTotal: next.deals.length,
      dataFile: DATA_FILE,
    });
    sendJson(res, 200, { ok: true, updatedAt: next.updatedAt, deletedIds });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    const state = loadState();
    const owner = String(body.owner || "");
    const password = String(body.password || "");
    const authEntry = getAuthEntry(state.authConfig, owner, state.ownerCodes);
    sendJson(res, 200, { ok: true, success: !!owner && authEntry.password === password, role: authEntry.role, team: authEntry.team });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/restore") {
    const body = await readBody(req);
    const payload = body?.data ? body : body?.backup;
    validateBackupPayload(payload);
    validateDealsPayload(payload.data.deals);

    const current = loadState();
    const preRestorePayload = buildBackupPayload(current, { reason: "pre-restore" });
    const preRestoreFile = writeBackupFile(preRestorePayload, "pre-restore");
    if (GOOGLE_DRIVE_SYNC_DIR) {
      mirrorBackupToGoogleDriveSync(preRestoreFile.filePath, preRestoreFile.fileName);
    }
    if (ENABLE_DRIVE_UPLOAD) {
      uploadFileToDrive(preRestoreFile.filePath, preRestoreFile.fileName).catch((error) => {
        markDriveUploadFailure(preRestoreFile.fileName, error);
        console.error("Google Drive upload failed:", error.message || error);
      });
    }

    const restored = saveState(payload.data);
    console.log(`[crm] restore_success exportedAt=${payload.exportedAt || "unknown"} backupVersion=${payload.version}`);

    sendJson(res, 200, {
      ok: true,
      restoredAt: new Date().toISOString(),
      preRestoreFile,
      state: restored,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/test-telegram") {
    const body = await readBody(req);
    const state = loadState();
    const owner = String(body.owner || "");
    const overrideToken = typeof body.botToken === "string" ? body.botToken.trim() : "";
    const overrideChat = typeof body.chatId === "string" ? body.chatId.trim() : "";
    const cfg = {
      botToken: overrideToken || state.telegramConfig?.[owner]?.botToken || "",
      chatId: overrideChat || state.telegramConfig?.[owner]?.chatId || "",
    };
    if (!cfg.botToken || !cfg.chatId) {
      sendJson(res, 400, { ok: false, error: "missing_telegram_config" });
      return;
    }
    await sendTelegram(
      cfg.botToken,
      cfg.chatId,
      `🧪 *Test Telegram*\nOwner: ${owner}\nTime: ${new Date().toLocaleString("vi-VN", { hour12: false })}`,
    );
    sendJson(res, 200, { ok: true, success: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/scan") {
    const result = await scanAndNotifyV3();
    sendJson(res, 200, { ok: true, ...result });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/sync-from-online") {
    const result = await syncFromOnline();
    sendJson(res, 200, { ok: true, ...result });
    return;
  }

  if (req.method === "GET" && tryServeFrontend(url.pathname, res)) {
    return;
  }

  sendJson(res, 404, { ok: false, error: "not_found" });
}

createServer((req, res) => {
  route(req, res).catch((error) => {
    console.error(error);
    sendJson(res, 500, { ok: false, error: error.message || "server_error" });
  });
}).listen(PORT, HOST, () => {
  ensureStore();
  createAutomaticBackup("server-start");
  console.log(`CRM backend listening at http://${HOST}:${PORT}`);
  if (existsSync(INDEX_FILE)) {
    console.log(`[crm] frontend_dist_served_from=${DIST_DIR}`);
  }
});

setInterval(() => {
  scanAndNotifyV3().catch((error) => {
    console.error("scan_failed", error);
  });
}, 60_000);

setInterval(() => {
  try {
    createAutomaticBackup("scheduled");
  } catch (error) {
    console.error("auto_backup_failed", error);
  }
}, AUTO_BACKUP_INTERVAL_MS);
