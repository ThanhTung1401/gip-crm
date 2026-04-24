import { createServer } from "http";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "fs";
import { dirname, extname, isAbsolute, join, resolve } from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const DIST_DIR = resolve(__dirname, "dist");
const INDEX_FILE = join(DIST_DIR, "index.html");
const DATA_DIR = resolve(__dirname, process.env.DATA_DIR || "data");
const DATA_FILE = join(DATA_DIR, "crm-state.json");
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
const SLA_DAYS = { "Data Thô": 15, Freeze: 10, Cold: 7, Warm: 5, Hot: 3 };
const MEETING_CADENCE = { Warm: 21, Hot: 21, Win: 30 };
const FOLLOWUP_HOURS_DEFAULT = { "Data Thô": 100, Freeze: 72, Cold: 48, Warm: 36, Hot: 24, Win: 0 };
const ALERT_REPEAT_HOURS = 6;
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

function ensureStore() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) writeFileSync(DATA_FILE, JSON.stringify(makeDefaultState(), null, 2));
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
    uploadFileToDrive(backupFile.filePath, backupFile.fileName).catch((error) => {
      console.error("Google Drive upload failed:", error.message || error);
    });
  }
  console.log(`[crm] backup_created reason=${reason} file=${backupFile.fileName} kept=${retention.kept} removed=${retention.removed.length}`);
  return {
    ...payload,
    backupFile,
    retention,
  };
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

function normalizeLeadSourceType(value) {
  return LEAD_SOURCE_TYPE_OPTIONS.includes(value) ? value : "";
}

function normalizeLeadSourceDetail(value) {
  return LEAD_SOURCE_DETAIL_OPTIONS.includes(value) ? value : "";
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
    if (deal.lead_source_type !== undefined && deal.lead_source_type !== null && deal.lead_source_type !== "" && !normalizeLeadSourceType(deal.lead_source_type)) throw new Error("lead_source_type_invalid");
    if (deal.lead_source_detail !== undefined && deal.lead_source_detail !== null && deal.lead_source_detail !== "" && !normalizeLeadSourceDetail(deal.lead_source_detail)) throw new Error("lead_source_detail_invalid");
  }
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

  const restored = saveState(payload.data);
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
  if (access.role === MASTER_ROLE) return incomingDeals;
  const keepCurrent = currentDeals.filter((deal) => {
    if (access.role === MANAGER_ROLE) return deal.team !== access.team;
    return deal.pic !== access.owner;
  });
  const allowedIncoming = filterDealsByAccess(incomingDeals, access);
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
    authConfig: Object.fromEntries(buildAllOwnerCodes(ownerCodes).map((pic) => [pic, normalizeAuthEntry(null, pic, ownerCodes)])),
    telegramConfig: Object.fromEntries(buildAllOwnerCodes(ownerCodes).map((pic) => [pic, { botToken: "", chatId: "" }])),
    followupConfig: { ...FOLLOWUP_HOURS_DEFAULT },
    alertLog: {},
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
  let authPatched = 0;
  let teamPatched = 0;
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
  const followupConfig = { ...base.followupConfig };
  STAGES.forEach((stage) => {
    const value = Number(raw?.followupConfig?.[stage]);
    if (Number.isFinite(value) && value >= 0) followupConfig[stage] = value;
  });
  const alertLog = raw?.alertLog && typeof raw.alertLog === "object" ? raw.alertLog : {};
  deals = deals.map((deal) => {
    if (TEAM_OPTIONS.includes(deal.team)) return deal;
    teamPatched += 1;
    return { ...deal, team: getAuthEntry(authConfig, deal.pic, ownerCodes).team };
  });
  if (options.logSource === "disk" && (authPatched > 0 || teamPatched > 0)) {
    console.info(`[state] Migration applied on load: authPatched=${authPatched}, dealTeamPatched=${teamPatched}`);
  }

  return {
    ownerCodes,
    deals,
    authConfig,
    telegramConfig,
    followupConfig,
    alertLog,
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

function normalizeDeal(deal) {
  if (!deal || typeof deal !== "object") return null;
  const legacySource = parseLegacyLeadSource(deal.lead_source || deal.source);
  const lead_source_type = normalizeLeadSourceType(deal.lead_source_type) || legacySource.lead_source_type;
  const lead_source_detail = normalizeLeadSourceDetail(deal.lead_source_detail) || legacySource.lead_source_detail;
  const source = buildLeadSource(lead_source_type, lead_source_detail) || legacySource.source;
  return {
    ...deal,
    id: String(deal.id || Date.now()),
    brand: typeof deal.brand === "string" ? deal.brand : "",
    contact: typeof deal.contact === "string" ? deal.contact : "",
    phone: typeof deal.phone === "string" ? deal.phone : "",
    ado: deal?.ado === null || deal?.ado === undefined ? "" : String(deal.ado),
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
    deal_status: DEAL_STATUS_OPTIONS.includes(deal.deal_status) ? deal.deal_status : null,
    dataInputDate: typeof deal.dataInputDate === "string" ? deal.dataInputDate : "",
    lastMeeting: typeof deal.lastMeeting === "string" ? deal.lastMeeting : "",
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
  if (days > max) return { type: "overdue", label: `Qua han ${days - max}n`, days, limit: max };
  return null;
}

function getMeetingStatus(deal) {
  const cadence = MEETING_CADENCE[deal.stage];
  if (!cadence || !deal.lastMeeting) return null;
  const days = daysBetween(getLatestTouchDate(deal, deal.lastMeeting), new Date().toISOString());
  if (days >= cadence) return { type: "overdue", label: `Gap KH qua han ${days - cadence}n`, days, limit: cadence };
  return null;
}

function getFollowupStatus(deal, followupConfig) {
  const limit = Number(followupConfig?.[deal.stage] || 0);
  if (!limit) return null;
  const since = getLatestNoteOrStageDate(deal);
  if (!since) return null;
  const hours = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 3600000));
  if (hours > limit) return { type: "overdue", label: `Chua co note ${hours}h/${limit}h`, hours, limit };
  return null;
}

function buildAlerts(state) {
  const entries = [];
  for (const deal of state.deals) {
    const sla = getSlaStatus(deal);
    const meeting = getMeetingStatus(deal);
    const followup = getFollowupStatus(deal, state.followupConfig);
    if (sla?.type === "overdue") {
      entries.push({
        key: `${deal.pic}:${deal.id}:sla`,
        owner: deal.pic,
        type: "sla",
        signature: `${deal.stage}:${sla.days}:${sla.limit}`,
        text: `⚠️ SLA QUA HAN: *${deal.brand || "Khong ten"}* dang o ${deal.stage} da ${sla.days} ngay (max ${sla.limit}n)`,
      });
    }
    if (meeting?.type === "overdue") {
      entries.push({
        key: `${deal.pic}:${deal.id}:meeting`,
        owner: deal.pic,
        type: "meeting",
        signature: `${deal.stage}:${meeting.days}:${meeting.limit}`,
        text: `📅 GAP KH: *${deal.brand || "Khong ten"}* (${deal.stage}) da ${meeting.days} ngay chua gap (can gap moi ${meeting.limit}n)`,
      });
    }
    if (followup?.type === "overdue") {
      entries.push({
        key: `${deal.pic}:${deal.id}:followup`,
        owner: deal.pic,
        type: "followup",
        signature: `${deal.stage}:${followup.hours}:${followup.limit}`,
        text: `📝 CHUA CO NOTE: *${deal.brand || "Khong ten"}* (${deal.stage}) da ${followup.hours}h chua duoc cap nhat ghi chu (max ${followup.limit}h)`,
      });
    }
  }
  return entries;
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

async function route(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
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

  if (req.method === "POST" && url.pathname === "/api/state") {
    const body = await readBody(req);
    if (body.deals !== undefined) validateDealsPayload(body.deals);
    const current = loadState();
    const actorOwner = String(body.actorOwner || MASTER_OWNER);
    const access = getAccessProfile(current, actorOwner);
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
    const next = saveState({
      ...current,
      ownerCodes: nextOwnerCodes,
      deals: Array.isArray(body.deals) ? mergeDealsByAccess(current.deals, body.deals, access) : current.deals,
      authConfig: mergedAuthConfig,
      telegramConfig: mergedTelegramConfig,
      followupConfig: access.role === MASTER_ROLE && body.followupConfig ? body.followupConfig : current.followupConfig,
      alertLog: current.alertLog || {},
    });
    sendJson(res, 200, { ok: true, updatedAt: next.updatedAt });
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
    const result = await scanAndNotify();
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
  scanAndNotify().catch((error) => {
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
