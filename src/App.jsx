import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import gipLogo from "../GIP - Logo-01.png";

const STAGES = ["Data Thô", "Freeze", "Cold", "Warm", "Hot", "Win"];
const PLATFORMS = ["Facebook", "Shopee", "Tiktok", "Lazada", "Khác"];
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
const MASTER_OWNER = "GIPMANA";
const DEFAULT_OWNER_CODES = ["GIP01", "GIP02", "GIP03", "GIP04", "GIP05", "GIP06"];
const TEAM_OPTIONS = ["PKD1", "PKD2"];
const ROLE_OPTIONS = ["USER", "MANAGER", "MASTER"];
const DEFAULT_USER_ROLE = "USER";
const DEFAULT_MANAGER_ROLE = "MANAGER";
const DEFAULT_MASTER_ROLE = "MASTER";
const BANG_GIA = ["GP01", "GP02", "GP03", "Enterprise", "Custom"];
const LEAD_SOURCE_TYPE_OPTIONS = ["Cá nhân", "Công ty", "Sếp Loki"];
const LEAD_SOURCE_DETAIL_OPTIONS = ["Facebook", "Zalo", "Group", "Khách giới thiệu", "Website", "Fanpage", "Tiktok", "Khác"];

const SLA_DAYS = {
  "Data Thô": 15,
  Freeze: 10,
  Cold: 7,
  Warm: 5,
  Hot: 3,
};
const MEETING_CADENCE = { Warm: 21, Hot: 21, Win: 30 };
const DEAL_STATUS_REPORT_KEYS = [
  { label: "Interested", key: "interested", matches: ["Interested"] },
  { label: "Consultation Started", key: "consultationStarted", matches: ["Consultation Started"] },
  { label: "Meeting Scheduled", key: "meetingScheduled", matches: ["Meeting Scheduled", "Meeting"] },
  { label: "Rate Card Sent", key: "rateCardSent", matches: ["Rate Card Sent", "Follow up - Rate Card"] },
  { label: "Waiting for Test Ads", key: "waitingForTestAds", matches: ["Waiting for Test Ads"] },
  { label: "Waiting for Shipping", key: "waitingForShipping", matches: ["Waiting for Shipping"] },
  { label: "Onboarding Started", key: "onboardingStarted", matches: ["Onboarding Started"] },
  { label: "Won", key: "won", matches: ["Won", "Win"] },
  { label: "Lost", key: "lost", matches: ["Lost"] },
  { label: "Spam / Invalid Lead", key: "spamInvalidLead", matches: ["Spam / Invalid Lead"] },
  { label: "Wrong Info", key: "wrongInfo", matches: ["Wrong Info"] },
  { label: "Can't Contact", key: "cantContact", matches: ["Can't Contact"] },
];
const FOLLOWUP_HOURS_DEFAULT = {
  "Data Thô": 100,
  Freeze: 72,
  Cold: 48,
  Warm: 36,
  Hot: 24,
  Win: 0,
};

const STAGE_CFG = {
  "Data Thô": { icon: "🗂️", color: "#6b7c93", border: "#c8d4e0", badge: "#eef2f6", head: "#f5f7fa" },
  Freeze: { icon: "❄️", color: "#1a6fba", border: "#b3d4f0", badge: "#e8f3fc", head: "#f0f7ff" },
  Cold: { icon: "🌊", color: "#0e5fa3", border: "#90c0ef", badge: "#ddeefa", head: "#eaf5ff" },
  Warm: { icon: "☀️", color: "#b86e00", border: "#f0cc80", badge: "#fff8e6", head: "#fffbf0" },
  Hot: { icon: "🔥", color: "#c0392b", border: "#f0a898", badge: "#fdecea", head: "#fff5f4" },
  Win: { icon: "🏆", color: "#1a7a45", border: "#80d0a8", badge: "#e6f8ee", head: "#f0fdf6" },
};

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const fmtDT = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const daysBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
const monthKey = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (key) => {
  if (!key) return "";
  const [y, m] = key.split("-");
  return `Tháng ${parseInt(m, 10)}/${y}`;
};
const parseNotes = (notes) => {
  if (Array.isArray(notes)) return notes;
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
};
const toISODate = (ddmmyyyy) => {
  if (!ddmmyyyy) return "";
  const [d, m, y] = ddmmyyyy.split("/");
  return y && m && d ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : "";
};
const toDisplayDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};
const toDateInputValue = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const startOfDay = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};
const endOfDay = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
};
const isInDateRange = (value, from, to) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const fromDate = startOfDay(from);
  const toDate = endOfDay(to);
  if (fromDate && date < fromDate) return false;
  if (toDate && date > toDate) return false;
  return true;
};
const buildDatePresetRange = (preset) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = toDateInputValue(today);
  const fromDate = new Date(today);
  if (preset === "month") {
    fromDate.setDate(1);
  } else {
    fromDate.setDate(fromDate.getDate() - (preset - 1));
  }
  return { from: toDateInputValue(fromDate), to };
};

const getLatestTouchDate = (deal, fallbackDate = "") => {
  const notes = parseNotes(deal.notes).filter((note) => note.date);
  const latestNoteDate = notes.length ? [...notes].sort((a, b) => new Date(b.date) - new Date(a.date))[0].date : "";
  if (!latestNoteDate) return fallbackDate;
  if (!fallbackDate) return latestNoteDate;
  return new Date(latestNoteDate) > new Date(fallbackDate) ? latestNoteDate : fallbackDate;
};

const daysInStage = (deal) => {
  const hist = Array.isArray(deal.stageHistory) ? deal.stageHistory : [];
  const last = [...hist].reverse().find((h) => h.to === deal.stage);
  const since = getLatestTouchDate(deal, last ? last.date : deal.dataInputDate || deal.createdAt);
  return daysBetween(since, new Date().toISOString());
};

const slaStatus = (deal) => {
  if (deal.stage === "Win") return null;
  const max = SLA_DAYS[deal.stage];
  if (!max) return null;
  const days = daysInStage(deal);
  if (days > max) return { label: `Quá hạn ${days - max}n`, type: "overdue" };
  if (days >= max - 1) return { label: "Hết hạn hôm nay", type: "warning" };
  if (days >= max * 0.7) return { label: `Còn ${max - days}n`, type: "caution" };
  return null;
};

const meetingStatus = (deal) => {
  const cadence = MEETING_CADENCE[deal.stage];
  if (!cadence || !deal.lastMeeting) return null;
  const days = daysBetween(getLatestTouchDate(deal, deal.lastMeeting), new Date().toISOString());
  const due = cadence - days;
  if (due <= 0) return { label: `Gặp KH quá hạn ${-due}n`, type: "overdue" };
  if (due <= 3) return { label: `Gặp KH trong ${due}n`, type: "warning" };
  return null;
};

const getStageEnteredAt = (deal) => {
  const hist = Array.isArray(deal.stageHistory) ? deal.stageHistory : [];
  const last = [...hist].reverse().find((h) => h.to === deal.stage);
  return last ? last.date : deal.dataInputDate || deal.createdAt;
};

const getLatestNoteOrStageDate = (deal) => {
  return getLatestTouchDate(deal, getStageEnteredAt(deal));
};

const followupStatus = (deal, followupConfig) => {
  const limit = Number(followupConfig?.[deal.stage] || 0);
  if (!limit) return null;
  const since = getLatestNoteOrStageDate(deal);
  if (!since) return null;
  const hours = Math.max(0, Math.round((new Date().getTime() - new Date(since).getTime()) / 3600000));
  if (hours > limit) return { label: `Chưa có note ${hours}h/${limit}h`, type: "overdue", hours, limit };
  if (hours >= Math.max(1, Math.floor(limit * 0.75))) return { label: `Cần note trong ${limit - hours}h`, type: "warning", hours, limit };
  return null;
};

const getAlertPriority = (deal, followupConfig) => {
  const sla = slaStatus(deal);
  const mtg = meetingStatus(deal);
  const followup = followupStatus(deal, followupConfig);
  if ((sla && sla.type === "overdue") || (mtg && mtg.type === "overdue") || (followup && followup.type === "overdue")) return "critical";
  if ((sla && (sla.type === "warning" || sla.type === "caution")) || (mtg && mtg.type === "warning") || (followup && followup.type === "warning")) return "warning";
  return null;
};

const getOwnerFromURL = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("owner") || "";
};

const normalizeOwnerCodes = (raw) => {
  const codes = Array.isArray(raw) ? raw : DEFAULT_OWNER_CODES;
  return [...new Set(codes.map((code) => String(code || "").trim().toUpperCase()).filter((code) => code && code !== MASTER_OWNER))];
};
let ownerRowSeq = 0;
const createOwnerRow = (code = "") => ({ id: `owner-row-${ownerRowSeq++}`, code: String(code || "").trim().toUpperCase() });
const makeOwnerRows = (raw) => normalizeOwnerCodes(raw).map((code) => createOwnerRow(code));
const buildAllOwnerCodes = (ownerCodes) => [MASTER_OWNER, ...normalizeOwnerCodes(ownerCodes)];
const getDefaultTeamForOwner = (pic, ownerCodes = DEFAULT_OWNER_CODES) => {
  if (!pic || pic === MASTER_OWNER) return "";
  const normalizedOwners = normalizeOwnerCodes(ownerCodes);
  const index = normalizedOwners.indexOf(pic);
  if (index === -1) return TEAM_OPTIONS[0];
  const pivot = Math.ceil(normalizedOwners.length / TEAM_OPTIONS.length);
  return index < pivot ? "PKD1" : "PKD2";
};
const normalizeRoleValue = (value, pic) => {
  if (pic === MASTER_OWNER) return DEFAULT_MASTER_ROLE;
  return value === DEFAULT_MANAGER_ROLE ? DEFAULT_MANAGER_ROLE : DEFAULT_USER_ROLE;
};
const normalizeTeamValue = (value, pic, ownerCodes = DEFAULT_OWNER_CODES) => {
  if (pic === MASTER_OWNER) return "";
  return TEAM_OPTIONS.includes(value) ? value : getDefaultTeamForOwner(pic, ownerCodes);
};
const normalizeAuthEntry = (value, pic, ownerCodes = DEFAULT_OWNER_CODES) => {
  if (typeof value === "string") {
    return {
      password: value,
      role: normalizeRoleValue(undefined, pic),
      team: normalizeTeamValue(undefined, pic, ownerCodes),
    };
  }
  return {
    password: typeof value?.password === "string" ? value.password : "",
    role: normalizeRoleValue(value?.role, pic),
    team: normalizeTeamValue(value?.team, pic, ownerCodes),
  };
};
const makeEmptyAuthConfig = (ownerCodes = DEFAULT_OWNER_CODES) =>
  Object.fromEntries(buildAllOwnerCodes(ownerCodes).map((pic) => [pic, normalizeAuthEntry(null, pic, ownerCodes)]));
const normalizeAuthConfig = (raw, ownerCodes = DEFAULT_OWNER_CODES) => {
  const base = makeEmptyAuthConfig(ownerCodes);
  if (!raw || typeof raw !== "object") return base;
  buildAllOwnerCodes(ownerCodes).forEach((pic) => {
    base[pic] = normalizeAuthEntry(raw[pic], pic, ownerCodes);
  });
  return base;
};
const hasAnyPassword = (config, ownerCodes = DEFAULT_OWNER_CODES) => Object.values(normalizeAuthConfig(config, ownerCodes)).some((value) => value.password.trim());
const getAuthEntry = (config, owner, ownerCodes = DEFAULT_OWNER_CODES) => normalizeAuthConfig(config, ownerCodes)[owner] || normalizeAuthEntry(null, owner, ownerCodes);
const inferDealTeam = (deal, authConfig, ownerCodes = DEFAULT_OWNER_CODES) => {
  if (TEAM_OPTIONS.includes(deal?.team)) return deal.team;
  const pic = String(deal?.pic || "");
  if (pic) return getAuthEntry(authConfig, pic, ownerCodes).team || getDefaultTeamForOwner(pic, ownerCodes);
  return "";
};
const filterDealsByAccess = (deals, { owner, role, team }) => {
  if (role === DEFAULT_MASTER_ROLE) return deals;
  if (role === DEFAULT_MANAGER_ROLE) return deals.filter((deal) => deal.team === team);
  return deals.filter((deal) => deal.pic === owner);
};
const makeEmptyTelegramConfig = (ownerCodes = DEFAULT_OWNER_CODES) => Object.fromEntries(buildAllOwnerCodes(ownerCodes).map((pic) => [pic, { botToken: "", chatId: "" }]));
const normalizeTelegramConfig = (raw, ownerCodes = DEFAULT_OWNER_CODES) => {
  const base = makeEmptyTelegramConfig(ownerCodes);
  if (!raw || typeof raw !== "object") return base;
  buildAllOwnerCodes(ownerCodes).forEach((pic) => {
    const current = raw[pic];
    base[pic] = {
      botToken: typeof current?.botToken === "string" ? current.botToken : "",
      chatId: typeof current?.chatId === "string" ? current.chatId : "",
    };
  });
  return base;
};
const hasAnyTelegramConfig = (config, ownerCodes = DEFAULT_OWNER_CODES) => Object.values(normalizeTelegramConfig(config, ownerCodes)).some((item) => item.botToken.trim() || item.chatId.trim());
const normalizeFollowupConfig = (raw) => {
  const base = { ...FOLLOWUP_HOURS_DEFAULT };
  if (!raw || typeof raw !== "object") return base;
  STAGES.forEach((stage) => {
    const value = Number(raw[stage]);
    if (Number.isFinite(value) && value >= 0) base[stage] = value;
  });
  return base;
};

const DEFAULT_API_BASE =
  typeof window !== "undefined" && ["127.0.0.1", "localhost"].includes(window.location.hostname)
    ? "http://127.0.0.1:8787/api"
    : `${typeof window !== "undefined" ? window.location.origin : ""}/api`;
const API_BASE = String(import.meta.env.VITE_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
const normalizeLeadSourceType = (value) => (LEAD_SOURCE_TYPE_OPTIONS.includes(value) ? value : "");
const normalizeLeadSourceDetail = (value) => (LEAD_SOURCE_DETAIL_OPTIONS.includes(value) ? value : "");
const buildLeadSource = (type, detail) => (type && detail ? `${type} - ${detail}` : detail || type || "");
const parseLegacyLeadSource = (rawValue) => {
  const text = String(rawValue || "").trim();
  if (!text) return { lead_source_type: "", lead_source_detail: "", source: "" };
  const matched = text.match(/^(.*?)\s*-\s*(.*?)$/);
  if (matched) {
    const lead_source_type = normalizeLeadSourceType(matched[1].trim());
    const lead_source_detail = normalizeLeadSourceDetail(matched[2].trim()) || matched[2].trim();
    return {
      lead_source_type,
      lead_source_detail: LEAD_SOURCE_DETAIL_OPTIONS.includes(lead_source_detail) ? lead_source_detail : "",
      source: text,
    };
  }
  return {
    lead_source_type: "",
    lead_source_detail: normalizeLeadSourceDetail(text),
    source: text,
  };
};

const normalizeDeals = (rawDeals) =>
  Array.isArray(rawDeals)
    ? rawDeals.map((deal) => ({
        ...deal,
        ado: deal?.ado === null || deal?.ado === undefined ? "" : String(deal.ado),
        team: TEAM_OPTIONS.includes(deal?.team) ? deal.team : "",
        ...(() => {
          const legacy = parseLegacyLeadSource(deal?.lead_source || deal?.source);
          const lead_source_type = normalizeLeadSourceType(deal?.lead_source_type) || legacy.lead_source_type;
          const lead_source_detail = normalizeLeadSourceDetail(deal?.lead_source_detail) || legacy.lead_source_detail;
          return {
            lead_source_type,
            lead_source_detail,
            lead_source: buildLeadSource(lead_source_type, lead_source_detail) || legacy.source,
            source: buildLeadSource(lead_source_type, lead_source_detail) || legacy.source,
          };
        })(),
        platform: normalizePlatformList(Array.isArray(deal.platform) ? deal.platform : deal.platform ? [deal.platform] : []),
        deal_status: DEAL_STATUS_OPTIONS.includes(deal?.deal_status) ? deal.deal_status : "",
        notes: parseNotes(deal.notes),
        stageHistory: Array.isArray(deal.stageHistory) ? deal.stageHistory : [],
      }))
    : [];

const apiRequest = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) {
    throw new Error(json.error || `request_failed_${response.status}`);
  }
  return json;
};

const downloadJsonFile = (payload, fileName) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

const dropdownStyle = (value) => ({
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "10px 12px",
  color: value ? "#0f172a" : "#94a3b8",
  fontSize: "13px",
  width: "100%",
  outline: "none",
  fontFamily: "inherit",
});

const UI = {
  primary: "#2563eb",
  background: "#f8fafc",
  card: "#ffffff",
  border: "#e5e7eb",
  text: "#0f172a",
  muted: "#64748b",
  shadow: "0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.04)",
};

const cardStyle = {
  background: UI.card,
  border: `1px solid ${UI.border}`,
  borderRadius: "12px",
  boxShadow: UI.shadow,
};

const getDealStatusBadgeStyle = (status) => {
  const key = getNormalizedDealStatusForReport(status);
  const tones = {
    interested: { bg: "#dbeafe", color: "#1d4ed8" },
    consultationStarted: { bg: "#e0f2fe", color: "#0369a1" },
    meetingScheduled: { bg: "#ede9fe", color: "#6d28d9" },
    rateCardSent: { bg: "#fef3c7", color: "#b45309" },
    waitingForTestAds: { bg: "#fde68a", color: "#a16207" },
    waitingForShipping: { bg: "#ffedd5", color: "#c2410c" },
    onboardingStarted: { bg: "#dcfce7", color: "#15803d" },
    won: { bg: "#dcfce7", color: "#166534" },
    lost: { bg: "#fee2e2", color: "#b91c1c" },
    spamInvalidLead: { bg: "#f1f5f9", color: "#475569" },
    wrongInfo: { bg: "#fef2f2", color: "#991b1b" },
    cantContact: { bg: "#fff1f2", color: "#be123c" },
  };
  const tone = tones[key] || { bg: "#f1f5f9", color: "#475569" };
  return {
    background: tone.bg,
    color: tone.color,
    borderRadius: "999px",
    padding: "4px 10px",
    fontSize: "11px",
    fontWeight: "700",
    display: "inline-flex",
    alignItems: "center",
  };
};

const getNormalizedDealStatusForReport = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const matched = DEAL_STATUS_REPORT_KEYS.find((item) => item.matches.includes(raw));
  return matched ? matched.key : "";
};

const groupDealsByGipCode = (deals) =>
  deals.reduce((acc, deal) => {
    const gipCode = String(deal.pic || "").trim() || "Chưa gán GIP";
    if (!acc[gipCode]) acc[gipCode] = [];
    acc[gipCode].push(deal);
    return acc;
  }, {});

const countDealsByStatus = (deals) => {
  const counts = DEAL_STATUS_REPORT_KEYS.reduce((acc, item) => ({ ...acc, [item.key]: 0 }), { noStatus: 0 });
  deals.forEach((deal) => {
    const key = getNormalizedDealStatusForReport(deal.deal_status);
    if (!key) {
      counts.noStatus += 1;
      return;
    }
    counts[key] += 1;
  });
  return counts;
};

const calculateWinRate = (won, lost) => {
  const total = Number(won || 0) + Number(lost || 0);
  if (!total) return 0;
  return won / total;
};

const buildGipRankingReport = (deals) =>
  Object.entries(groupDealsByGipCode(deals))
    .map(([gipCode, groupedDeals]) => {
      const counts = countDealsByStatus(groupedDeals);
      return {
        gipCode,
        totalDeals: groupedDeals.length,
        interested: counts.interested,
        consultationStarted: counts.consultationStarted,
        meetingScheduled: counts.meetingScheduled,
        rateCardSent: counts.rateCardSent,
        waitingForTestAds: counts.waitingForTestAds,
        waitingForShipping: counts.waitingForShipping,
        onboardingStarted: counts.onboardingStarted,
        won: counts.won,
        lost: counts.lost,
        spamInvalidLead: counts.spamInvalidLead,
        wrongInfo: counts.wrongInfo,
        cantContact: counts.cantContact,
        noStatus: counts.noStatus,
        winRate: calculateWinRate(counts.won, counts.lost),
      };
    })
    .sort((a, b) => b.totalDeals - a.totalDeals);

const DEAL_STATUS_FILTER_OPTIONS = [
  { value: "newLead", label: "New Lead" },
  { value: "interested", label: "Interested" },
  { value: "consultationStarted", label: "Consultation Started" },
  { value: "meetingScheduled", label: "Meeting Scheduled" },
  { value: "rateCardSent", label: "Rate Card Sent" },
  { value: "waitingForTestAds", label: "Waiting for Test Ads" },
  { value: "waitingForShipping", label: "Waiting for Shipping" },
  { value: "onboardingStarted", label: "Onboarding Started" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "spamInvalidLead", label: "Spam / Invalid Lead" },
  { value: "wrongInfo", label: "Wrong Info" },
  { value: "cantContact", label: "Can't Contact" },
];
const matchDealStatusFilter = (dealStatus, filterValue) => {
  if (!filterValue) return true;
  const normalized = getNormalizedDealStatusForReport(dealStatus);
  if (filterValue === "newLead") return String(dealStatus || "").trim() === "New Lead";
  return normalized === filterValue;
};

const exportExcel = (deals, reportMonth) => {
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet([
    ["Brand", "Contact", "Phone", "ADO", "Lead Source Type", "Lead Source Detail", "Source", "Platform", "Stage", "Deal Status", "PIC", "Value", "Mã KH", "Bảng giá", "Ngày nhập data", "Gặp lần cuối", "Ghi chú gần nhất", "Ngày tạo"],
    ...deals.map((d) => {
      const notes = parseNotes(d.notes);
      return [
        d.brand,
        d.contact,
        d.phone,
        d.ado || "",
        d.lead_source_type || "",
        d.lead_source_detail || "",
        d.source || "",
        Array.isArray(d.platform) ? d.platform.join(", ") : d.platform,
        d.stage,
        d.deal_status || "",
        d.pic || "",
        Number(d.value) || 0,
        d.maKH || "",
        d.bangGia || "",
        fmtDate(d.dataInputDate),
        fmtDate(d.lastMeeting),
        notes.length ? notes[notes.length - 1].text : "",
        fmtDate(d.createdAt),
      ];
    }),
  ]);
  ws1["!cols"] = [18, 16, 14, 10, 14, 16, 20, 18, 12, 20, 10, 14, 12, 10, 14, 14, 30, 12].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws1, "Tất cả Deals");

  const ws2 = XLSX.utils.aoa_to_sheet([
    ["Brand", "PIC", "Ngày giờ", "Ghi chú"],
    ...deals.flatMap((d) => parseNotes(d.notes).map((n) => [d.brand, d.pic || "", fmtDT(n.date), n.text])),
  ]);
  ws2["!cols"] = [18, 10, 14, 50].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws2, "Nhật ký ghi chú");

  const months = [...new Set(deals.map((d) => monthKey(d.dataInputDate || d.createdAt)).filter(Boolean))].sort();
  const ws3 = XLSX.utils.aoa_to_sheet([
    ["Tháng", "Leads mới", "Win", "Revenue Win", "Tỷ lệ Win"],
    ...months.map((m) => {
      const md = deals.filter((d) => monthKey(d.dataInputDate || d.createdAt) === m);
      const won = deals.filter((d) => (Array.isArray(d.stageHistory) ? d.stageHistory : []).some((x) => x.to === "Win" && monthKey(x.date) === m));
      return [monthLabel(m), md.length, won.length, won.reduce((s, d) => s + (Number(d.value) || 0), 0), md.length ? `${Math.round((won.length / md.length) * 100)}%` : "0%"];
    }),
  ]);
  ws3["!cols"] = [16, 12, 10, 20, 12].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws3, "Tổng hợp tháng");

  XLSX.writeFile(wb, `GIP_Pipeline_${(reportMonth || "all").replace("-", "_")}.xlsx`);
};

const normalizeImportHeader = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const normalizeSearchText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizePhoneText = (value) => String(value || "").replace(/\D/g, "");
const normalizePlatformKey = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const normalizePlatformValue = (value) => PLATFORM_ALIASES[normalizePlatformKey(value)] || "";
const normalizePlatformList = (values) => {
  const source = Array.isArray(values) ? values : [values];
  return [...new Set(source.map((value) => normalizePlatformValue(value)).filter(Boolean))];
};

const parseExcelDateToISO = (value) => {
  if (!value && value !== 0) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return new Date(parsed.y, parsed.m - 1, parsed.d).toISOString();
  }
  const text = String(value).trim();
  if (!text) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return toISODate(text);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const importHeaderAliases = {
  brand: ["brand", "tenbrand", "tenkhachhang", "khachhang", "customer", "company"],
  contact: ["contact", "nguoilienhe", "tennguoilienhe", "person"],
  phone: ["phone", "sodienthoai", "mobile", "telephone"],
  ado: ["ado", "averagedailyorders", "average daily orders", "donngay", "sodonngay", "donmoingay"],
  platform: ["platform", "kenh", "san", "nen tang"],
  stage: ["stage", "giaidoan", "pipeline", "trangthai"],
  deal_status: ["dealstatus", "deal_status", "trangthaideal", "statusdeal"],
  pic: ["pic", "bdpic", "owner", "sale"],
  lead_source_type: ["leadsourcetype", "lead_source_type", "source_type", "loainguon", "loai nguon"],
  lead_source_detail: ["leadsourcedetail", "lead_source_detail", "source_detail", "nguonchitiet", "nguon chi tiet"],
  source: ["source", "nguon", "nguonlead", "leadsource", "lead source", "nguonkhach", "nguon khach"],
  value: ["value", "giatri", "doanhthu", "amount"],
  maKH: ["makh", "makhachhang", "customerid"],
  bangGia: ["banggia", "pricebook", "goi", "package"],
  dataInputDate: ["datainputdate", "ngaynhapdata", "ngaynhap", "createddate"],
  lastMeeting: ["lastmeeting", "gaplancuoi", "ngaygapcuoi", "meetingdate"],
  notes: ["notes", "ghichu", "note"],
};

const getImportValue = (normalizedRow, aliases) => {
  for (const alias of aliases) {
    if (normalizedRow[alias] !== undefined && normalizedRow[alias] !== null && normalizedRow[alias] !== "") {
      return normalizedRow[alias];
    }
  }
  return "";
};

const buildImportedDeals = (rows, preset = {}, ownerMode = "", ownerCodes = DEFAULT_OWNER_CODES) => {
  const now = new Date().toISOString();
  let skipped = 0;
  const importedDeals = rows.map((row, index) => {
    const normalizedRow = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [normalizeImportHeader(key), value]),
    );

    const brand = String(getImportValue(normalizedRow, importHeaderAliases.brand) || "").trim();
    if (!brand) {
      skipped += 1;
      return null;
    }

    const rawStage = String(getImportValue(normalizedRow, importHeaderAliases.stage) || preset.stage || "Data Thô").trim();
    const stage = STAGES.includes(rawStage) ? rawStage : "Data Thô";
    const rawDealStatus = String(getImportValue(normalizedRow, importHeaderAliases.deal_status) || "").trim();
    const deal_status = DEAL_STATUS_OPTIONS.includes(rawDealStatus) ? rawDealStatus : "";
    const rawPic = String(getImportValue(normalizedRow, importHeaderAliases.pic) || preset.pic || "").trim().toUpperCase();
    const pic = ownerMode || (buildAllOwnerCodes(ownerCodes).includes(rawPic) ? rawPic : rawPic);
    const rawPlatform = getImportValue(normalizedRow, importHeaderAliases.platform);
    const platform = normalizePlatformList(
      String(rawPlatform || "")
        .split(/[,;|]/)
        .map((item) => item.trim())
        .filter(Boolean),
    );
    const rawLeadSourceType = String(getImportValue(normalizedRow, importHeaderAliases.lead_source_type) || "").trim();
    const rawLeadSourceDetail = String(getImportValue(normalizedRow, importHeaderAliases.lead_source_detail) || "").trim();
    const rawSource = String(getImportValue(normalizedRow, importHeaderAliases.source) || "").trim();
    const legacySource = parseLegacyLeadSource(rawSource);
    const lead_source_type = normalizeLeadSourceType(rawLeadSourceType) || legacySource.lead_source_type || "";
    const lead_source_detail = normalizeLeadSourceDetail(rawLeadSourceDetail) || legacySource.lead_source_detail || "";
    const source = buildLeadSource(lead_source_type, lead_source_detail) || legacySource.source || rawSource;
    const noteText = String(getImportValue(normalizedRow, importHeaderAliases.notes) || "").trim();
    const dataInputDate = parseExcelDateToISO(getImportValue(normalizedRow, importHeaderAliases.dataInputDate)) || now;
    const lastMeeting = parseExcelDateToISO(getImportValue(normalizedRow, importHeaderAliases.lastMeeting)) || "";

    return {
      id: `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
      brand,
      contact: String(getImportValue(normalizedRow, importHeaderAliases.contact) || "").trim(),
      phone: String(getImportValue(normalizedRow, importHeaderAliases.phone) || "").trim(),
      ado: String(getImportValue(normalizedRow, importHeaderAliases.ado) || "").trim(),
      platform,
      stage,
      deal_status,
      pic,
      lead_source_type,
      lead_source_detail,
      lead_source: source,
      source,
      value: String(getImportValue(normalizedRow, importHeaderAliases.value) || "").trim(),
      maKH: String(getImportValue(normalizedRow, importHeaderAliases.maKH) || "").trim(),
      bangGia: String(getImportValue(normalizedRow, importHeaderAliases.bangGia) || "").trim(),
      dataInputDate,
      lastMeeting,
      notes: noteText ? [{ text: noteText, date: now }] : [],
      createdAt: now,
      updatedAt: now,
      stageHistory: [{ from: null, to: stage, date: dataInputDate }],
    };
  }).filter(Boolean);

  return { importedDeals, skipped };
};

const exportImportTemplate = () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Brand", "Contact", "Phone", "ADO", "Lead Source Type", "Lead Source Detail", "Source", "Platform", "DataInputDate", "PIC", "Stage", "Deal Status", "Value", "MaKH", "BangGia", "LastMeeting", "Notes"],
    ["Cafune", "Linh", "0901234567", "120", "Cá nhân", "Facebook", "Cá nhân - Facebook", "Facebook, Shopee", "14/04/2026", "GIP01", "Data Thô", "New Lead", "50000000", "", "", "", "Khách mới, cần gọi tư vấn"],
  ]);
  ws["!cols"] = [18, 16, 14, 10, 16, 16, 20, 20, 14, 10, 12, 20, 14, 12, 12, 14, 30].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "Mau Import");

  const guide = XLSX.utils.aoa_to_sheet([
    ["Huong dan"],
    ["1. Giữ nguyên hàng tiêu đề ở sheet Mẫu Import"],
    ["2. Date dùng dd/mm/yyyy hoặc yyyy-mm-dd"],
    ["3. ADO = so don trung binh moi ngay"],
    [`4. Lead Source Type hợp lệ: ${LEAD_SOURCE_TYPE_OPTIONS.join(", ")}`],
    [`5. Lead Source Detail hợp lệ: ${LEAD_SOURCE_DETAIL_OPTIONS.join(", ")}`],
    ["6. Nếu chỉ có cột Source/Nguồn khách, hệ thống sẽ tự tách format 'Loại - Chi tiết'"],
    [`7. Platform hợp lệ: ${PLATFORMS.join(", ")}. Có thể nhập nhiều giá trị, ngăn cách bằng dấu phẩy`],
    ["8. Stage hợp lệ: Data Thô, Freeze, Cold, Warm, Hot, Win"],
    [`9. Deal Status hợp lệ: ${DEAL_STATUS_OPTIONS.join(", ")}`],
    ["10. Nếu import từ link owner, PIC sẽ tự khóa theo owner đó"],
  ]);
  guide["!cols"] = [{ wch: 70 }];
  XLSX.utils.book_append_sheet(wb, guide, "Huong Dan");

  XLSX.writeFile(wb, "GIP_CRM_Mau_Import.xlsx");
};

export default function App() {
  const initialReportRange = buildDatePresetRange("month");
  const [deals, setDeals] = useState([]);
  const [ownerCodes, setOwnerCodes] = useState(DEFAULT_OWNER_CODES);
  const [authConfig, setAuthConfig] = useState(makeEmptyAuthConfig(DEFAULT_OWNER_CODES));
  const [telegramConfig, setTelegramConfig] = useState(makeEmptyTelegramConfig(DEFAULT_OWNER_CODES));
  const [followupConfig, setFollowupConfig] = useState(FOLLOWUP_HOURS_DEFAULT);
  const [sessionProfile, setSessionProfile] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [showAddOptions, setShowAddOptions] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [addPreset, setAddPreset] = useState({ stage: "", pic: "" });
  const [modalDeal, setModalDeal] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [syncState, setSyncState] = useState("idle");
  const [search, setSearch] = useState("");
  const [filterPIC, setFilterPIC] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterDealStatus, setFilterDealStatus] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [hydratedFromBackend, setHydratedFromBackend] = useState(false);
  const [tab, setTab] = useState("pipeline");
  const [reportFrom, setReportFrom] = useState(initialReportRange.from);
  const [reportTo, setReportTo] = useState(initialReportRange.to);
  const [reportPIC, setReportPIC] = useState("all");
  const [backendReady, setBackendReady] = useState(false);

  const ownerMode = getOwnerFromURL();
  const allOwnerCodes = buildAllOwnerCodes(ownerCodes);
  const isMaster = !ownerMode;
  const currentAccount = ownerMode || MASTER_OWNER;
  const currentAuth = getAuthEntry(authConfig, currentAccount, ownerCodes);
  const effectiveRole = sessionProfile?.owner === currentAccount ? sessionProfile.role : currentAuth.role;
  const effectiveTeam = sessionProfile?.owner === currentAccount ? sessionProfile.team : currentAuth.team;
  const requiresLogin = ownerMode ? true : !!currentAuth.password.trim();
  const hasPasswordForOwner = !!currentAuth.password.trim();
  const isAuthenticated = !requiresLogin || sessionProfile?.owner === currentAccount;
  const canManageMasterSettings = isMaster && isAuthenticated;
  const canOpenSettings = isAuthenticated;

  useEffect(() => {
    try {
      const r = localStorage.getItem("gip_deals");
      if (r) setDeals(normalizeDeals(JSON.parse(r)));
    } catch {}
    try {
      const r = localStorage.getItem("gip_owner_codes");
      if (r) setOwnerCodes(normalizeOwnerCodes(JSON.parse(r)));
    } catch {}
    try {
      const r = localStorage.getItem("gip_auth_config");
      if (r) setAuthConfig(normalizeAuthConfig(JSON.parse(r), ownerCodes));
    } catch {}
    try {
      const r = localStorage.getItem("gip_telegram_config");
      if (r) setTelegramConfig(normalizeTelegramConfig(JSON.parse(r), ownerCodes));
    } catch {}
    try {
      const r = localStorage.getItem("gip_followup_config");
      if (r) setFollowupConfig(normalizeFollowupConfig(JSON.parse(r)));
    } catch {}
    try {
      const r = localStorage.getItem("gip_auth_session");
      if (r) {
        const parsed = JSON.parse(r);
        if (parsed?.owner) {
          setSessionProfile({
            owner: parsed.owner,
            role: ROLE_OPTIONS.includes(parsed.role) ? parsed.role : parsed.owner === MASTER_OWNER ? DEFAULT_MASTER_ROLE : DEFAULT_USER_ROLE,
            team: TEAM_OPTIONS.includes(parsed.team) ? parsed.team : "",
          });
        }
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    setAuthConfig((prev) => normalizeAuthConfig(prev, ownerCodes));
    setTelegramConfig((prev) => normalizeTelegramConfig(prev, ownerCodes));
  }, [ownerCodes]);

  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem("gip_deals", JSON.stringify(deals));
      } catch {}
    }
  }, [deals, loaded]);

  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem("gip_owner_codes", JSON.stringify(ownerCodes));
      } catch {}
    }
  }, [ownerCodes, loaded]);

  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem("gip_auth_config", JSON.stringify(authConfig));
      } catch {}
    }
  }, [authConfig, loaded]);

  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem("gip_telegram_config", JSON.stringify(telegramConfig));
      } catch {}
    }
  }, [telegramConfig, loaded]);

  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem("gip_followup_config", JSON.stringify(followupConfig));
      } catch {}
    }
  }, [followupConfig, loaded]);

  useEffect(() => {
    if (loaded) {
      try {
        if (sessionProfile?.owner) {
          localStorage.setItem("gip_auth_session", JSON.stringify({ ...sessionProfile, loggedAt: new Date().toISOString() }));
        } else {
          localStorage.removeItem("gip_auth_session");
        }
      } catch {}
    }
  }, [sessionProfile, loaded]);

  useEffect(() => {
    if (!loaded) return;
    let ignore = false;
    setHydratedFromBackend(false);

    const hydrateFromBackend = async () => {
      try {
        const state = await apiRequest(`/state?owner=${encodeURIComponent(currentAccount)}`);
        if (ignore) return;
        setBackendReady(true);
        setHydratedFromBackend(true);
        if (state.ownerCodes) setOwnerCodes(normalizeOwnerCodes(state.ownerCodes));
        setDeals(normalizeDeals(state.deals));
        if (state.authConfig) setAuthConfig((prev) => ({ ...prev, ...normalizeAuthConfig(state.authConfig, state.ownerCodes || ownerCodes) }));
        if (state.telegramConfig) setTelegramConfig((prev) => ({ ...prev, ...normalizeTelegramConfig(state.telegramConfig, state.ownerCodes || ownerCodes) }));
        if (state.followupConfig) setFollowupConfig(normalizeFollowupConfig(state.followupConfig));
      } catch {
        if (!ignore) setBackendReady(false);
      }
    };

    hydrateFromBackend();
    return () => {
      ignore = true;
    };
  }, [loaded, currentAccount]);

  useEffect(() => {
    if (!loaded || !hydratedFromBackend || !backendReady || !isAuthenticated) return;
    setSyncState("syncing");
    const timer = window.setTimeout(async () => {
      try {
        await apiRequest("/state", {
          method: "POST",
          body: JSON.stringify({
            actorOwner: currentAccount,
            ownerCodes: canManageMasterSettings ? ownerCodes : undefined,
            deals,
            authConfig: canManageMasterSettings ? authConfig : undefined,
            telegramConfig: { [currentAccount]: telegramConfig[currentAccount] || { botToken: "", chatId: "" } },
            followupConfig: canManageMasterSettings ? followupConfig : undefined,
          }),
        });
        setBackendReady(true);
        setSyncState("success");
      } catch {
        setBackendReady(false);
        setSyncState("error");
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [ownerCodes, deals, authConfig, telegramConfig, followupConfig, loaded, hydratedFromBackend, backendReady, isAuthenticated, currentAccount, canManageMasterSettings]);

  const applyAccessDefaultsToDeal = (deal) => {
    const nextPic = effectiveRole === DEFAULT_MASTER_ROLE ? deal.pic || "" : currentAccount;
    const nextTeam = effectiveRole === DEFAULT_MASTER_ROLE
      ? inferDealTeam({ ...deal, pic: nextPic }, authConfig, ownerCodes)
      : effectiveTeam;
    return { ...deal, pic: nextPic, team: nextTeam };
  };

  const saveDeal = (deal) => {
    const now = new Date().toISOString();
    const nextDeal = applyAccessDefaultsToDeal(deal);
    if (deal.id) {
      setDeals((p) =>
        p.map((d) => {
          if (d.id !== deal.id) return d;
          const history = Array.isArray(d.stageHistory) ? [...d.stageHistory] : [];
          if (d.stage !== nextDeal.stage) history.push({ from: d.stage, to: nextDeal.stage, date: now });
          return { ...nextDeal, stageHistory: history, updatedAt: now };
        }),
      );
    } else {
      const newDeal = {
        ...nextDeal,
        id: Date.now().toString(),
        stage: nextDeal.stage || "Data Thô",
        createdAt: now,
        updatedAt: now,
        dataInputDate: nextDeal.dataInputDate || now,
        notes: parseNotes(nextDeal.notes),
        stageHistory: [{ from: null, to: nextDeal.stage || "Data Thô", date: nextDeal.dataInputDate || now }],
      };
      if (ownerMode && !newDeal.pic) newDeal.pic = ownerMode;
      setDeals((p) => [...p, newDeal]);
    }
    setModalDeal(null);
  };

  const openAddOptions = (preset = {}) => {
    setAddPreset({ stage: preset.stage || "", pic: ownerMode || preset.pic || "" });
    setShowAddOptions(true);
  };

  const importDeals = (rows, preset = {}) => {
    const { importedDeals, skipped } = buildImportedDeals(rows, preset, ownerMode, ownerCodes);
    if (!importedDeals.length) {
      window.alert("Khong co dong hop le de import. Can it nhat cot Brand.");
      return;
    }
    setDeals((prev) => [...prev, ...importedDeals.map((deal) => applyAccessDefaultsToDeal(deal))]);
    setShowImportModal(false);
    setShowAddOptions(false);
    window.alert(`Da import ${importedDeals.length} deal${skipped ? `, bo qua ${skipped} dong khong hop le` : ""}.`);
  };

  const deleteDeal = (id) => {
    if (window.confirm("Xóa deal này?")) setDeals((p) => p.filter((d) => d.id !== id));
  };

  const moveDeal = (id, toStage) => {
    const now = new Date().toISOString();
    setDeals((p) =>
      p.map((d) => {
        if (d.id !== id || d.stage === toStage) return d;
        const h = Array.isArray(d.stageHistory) ? [...d.stageHistory] : [];
        h.push({ from: d.stage, to: toStage, date: now });
        return { ...d, stage: toStage, stageHistory: h, updatedAt: now };
      }),
    );
  };

  const doSync = async (action) => {
    setSyncState("syncing");
    try {
      if (action === "read") {
        const state = await apiRequest(`/state?owner=${encodeURIComponent(currentAccount)}`);
        setDeals(normalizeDeals(state.deals));
        setOwnerCodes(normalizeOwnerCodes(state.ownerCodes));
        setAuthConfig((prev) => ({ ...prev, ...normalizeAuthConfig(state.authConfig, state.ownerCodes || ownerCodes) }));
        setTelegramConfig((prev) => ({ ...prev, ...normalizeTelegramConfig(state.telegramConfig, state.ownerCodes || ownerCodes) }));
        setFollowupConfig(normalizeFollowupConfig(state.followupConfig));
      } else {
        await apiRequest("/state", {
          method: "POST",
          body: JSON.stringify({
            actorOwner: currentAccount,
            ownerCodes: canManageMasterSettings ? ownerCodes : undefined,
            deals,
            authConfig: canManageMasterSettings ? authConfig : undefined,
            telegramConfig: { [currentAccount]: telegramConfig[currentAccount] || { botToken: "", chatId: "" } },
            followupConfig: canManageMasterSettings ? followupConfig : undefined,
          }),
        });
      }
      setBackendReady(true);
      setSyncState("success");
    } catch {
      setBackendReady(false);
      setSyncState("error");
    }
    setTimeout(() => setSyncState("idle"), 3000);
  };

  const saveSettings = async ({ nextOwnerCodes, nextAuthConfig, nextTelegramConfig, nextFollowupConfig }) => {
    const normalizedOwners = normalizeOwnerCodes(nextOwnerCodes);
    const normalizedAuth = normalizeAuthConfig(nextAuthConfig, normalizedOwners);
    const normalizedTelegram = normalizeTelegramConfig(nextTelegramConfig, normalizedOwners);
    const normalizedFollowup = normalizeFollowupConfig(nextFollowupConfig);
    const previousOwners = normalizeOwnerCodes(ownerCodes);
    const renameMap = Object.fromEntries(
      previousOwners
        .map((code, index) => [code, normalizedOwners[index]])
        .filter(([from, to]) => from && to && from !== to),
    );
    const nextDeals = deals.map((deal) => (renameMap[deal.pic] ? { ...deal, pic: renameMap[deal.pic] } : deal));
    if (isMaster) {
      setOwnerCodes(normalizedOwners);
      setAuthConfig(normalizedAuth);
      setFollowupConfig(normalizedFollowup);
      setDeals(nextDeals);
    }
    setTelegramConfig((prev) => ({
      ...prev,
      [currentAccount]: normalizedTelegram[currentAccount] || { botToken: "", chatId: "" },
    }));

    try {
      await apiRequest("/state", {
        method: "POST",
        body: JSON.stringify({
          actorOwner: currentAccount,
          ownerCodes: isMaster ? normalizedOwners : undefined,
          deals: isMaster ? nextDeals : deals,
          authConfig: isMaster ? normalizedAuth : undefined,
          telegramConfig: { [currentAccount]: normalizedTelegram[currentAccount] || { botToken: "", chatId: "" } },
          followupConfig: isMaster ? normalizedFollowup : undefined,
        }),
      });
      setBackendReady(true);
    } catch {
      setBackendReady(false);
      window.alert("Da luu cau hinh o may nay, nhung backend local chua nhan duoc. Hay bat lai CRM bang file start-crm.ps1.");
    }

    setShowSetup(false);
  };

  const testTelegram = async (owner, overrideConfig) => {
    try {
      await apiRequest("/test-telegram", {
        method: "POST",
        body: JSON.stringify({
          owner,
          botToken: overrideConfig?.botToken || "",
          chatId: overrideConfig?.chatId || "",
        }),
      });
      setBackendReady(true);
      window.alert(`Da gui test Telegram cho ${owner}.`);
    } catch {
      setBackendReady(false);
      window.alert(`Khong gui duoc test Telegram cho ${owner}. Kiem tra bot token, chat ID, va dam bao backend local dang chay.`);
    }
  };

  const handleLogin = async (password) => {
    const localMatch = currentAuth.password && currentAuth.password === password;

    try {
      const json = await apiRequest("/login", {
        method: "POST",
        body: JSON.stringify({ owner: currentAccount, password }),
      });
      if (json.success) {
        setBackendReady(true);
        setSessionProfile({
          owner: currentAccount,
          role: ROLE_OPTIONS.includes(json.role) ? json.role : currentAuth.role,
          team: TEAM_OPTIONS.includes(json.team) ? json.team : currentAuth.team,
        });
        return true;
      }
    } catch {
      setBackendReady(false);
    }

    if (localMatch) {
      setSessionProfile({
        owner: currentAccount,
        role: currentAuth.role,
        team: currentAuth.team,
      });
      return true;
    }

    return false;
  };

  const runAlertScan = async () => {
    try {
      const result = await apiRequest("/scan", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setBackendReady(true);
      window.alert(`Da quet canh bao. Tong deal qua han: ${result.totalAlerts}. Tin vua gui: ${result.sent?.reduce((sum, item) => sum + item.count, 0) || 0}.`);
    } catch {
      setBackendReady(false);
      window.alert("Khong quet duoc canh bao. Kiem tra backend local dang chay.");
    }
  };

  const downloadBackup = async () => {
    try {
      const backup = await apiRequest("/backup");
      const fileName = backup?.backupFile?.fileName || `backup-${toDateInputValue(new Date().toISOString()) || "crm"}.json`;
      downloadJsonFile({
        exportedAt: backup.exportedAt,
        version: backup.version,
        metadata: backup.metadata,
        data: backup.data,
      }, fileName);
      setBackendReady(true);
      window.alert(`Đã tạo backup và tải file xuống.\nFile local trên máy CRM: ${backup?.backupFile?.filePath || "backups/"}`);
    } catch {
      setBackendReady(false);
      window.alert("Không tạo được backup. Kiểm tra backend local đang chạy.");
    }
  };

  const restoreBackup = async (file) => {
    if (!file) {
      window.alert("Hãy chọn file backup JSON trước.");
      return;
    }
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const result = await apiRequest("/restore", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const state = result.state || {};
      if (state.ownerCodes) setOwnerCodes(normalizeOwnerCodes(state.ownerCodes));
      setDeals(normalizeDeals(state.deals));
      if (state.authConfig) setAuthConfig(normalizeAuthConfig(state.authConfig, state.ownerCodes || ownerCodes));
      if (state.telegramConfig) setTelegramConfig(normalizeTelegramConfig(state.telegramConfig, state.ownerCodes || ownerCodes));
      if (state.followupConfig) setFollowupConfig(normalizeFollowupConfig(state.followupConfig));
      setBackendReady(true);
      window.alert(`Khôi phục dữ liệu thành công.\nBackup an toàn trước restore đã lưu tại: ${result?.preRestoreFile?.filePath || "backups/"}`);
    } catch (error) {
      setBackendReady(false);
      window.alert(`Khôi phục thất bại: ${error.message || "restore_failed"}`);
    }
  };

  const syncFromOnline = async () => {
    try {
      const result = await apiRequest("/sync-from-online");
      const state = result.state || {};
      if (state.ownerCodes) setOwnerCodes(normalizeOwnerCodes(state.ownerCodes));
      setDeals(normalizeDeals(state.deals));
      if (state.authConfig) setAuthConfig(normalizeAuthConfig(state.authConfig, state.ownerCodes || ownerCodes));
      if (state.telegramConfig) setTelegramConfig(normalizeTelegramConfig(state.telegramConfig, state.ownerCodes || ownerCodes));
      if (state.followupConfig) setFollowupConfig(normalizeFollowupConfig(state.followupConfig));
      setBackendReady(true);
      window.alert(`Đã đồng bộ dữ liệu từ hệ thống online.\nSố records: ${result.records || 0}\nBackup dùng: ${result?.sourceBackupFile?.fileName || "live-backup"}`);
    } catch (error) {
      setBackendReady(false);
      window.alert(`Không đồng bộ được dữ liệu từ online: ${error.message || "sync_failed"}`);
    }
  };

  const logout = () => setSessionProfile(null);

  const visibleDeals = filterDealsByAccess(deals, { owner: currentAccount, role: effectiveRole, team: effectiveTeam });
  const picFilterOptions = (() => {
    if (effectiveRole === DEFAULT_MASTER_ROLE) return allOwnerCodes;
    const options = [...new Set(visibleDeals.map((deal) => deal.pic).filter(Boolean))];
    if (!options.includes(currentAccount)) options.unshift(currentAccount);
    return options;
  })();
  useEffect(() => {
    if (!filterPIC) return;
    if (!picFilterOptions.includes(filterPIC)) {
      setFilterPIC("");
    }
  }, [filterPIC, picFilterOptions]);
  const filtered = visibleDeals.filter((d) => {
    const searchText = normalizeSearchText(search);
    const searchPhone = normalizePhoneText(search);
    const ms =
      !searchText ||
      normalizeSearchText(d.brand).includes(searchText) ||
      normalizeSearchText(d.contact).includes(searchText) ||
      (searchPhone && normalizePhoneText(d.phone).includes(searchPhone));
    const mst = !filterStage || d.stage === filterStage;
    const mds = matchDealStatusFilter(d.deal_status, filterDealStatus);
    const mp = !filterPIC || d.pic === filterPIC;
    return ms && mst && mds && mp;
  });
  const kpiDeals = tab === "pipeline" || tab === "alerts" ? filtered : visibleDeals;

  const overdueCount = kpiDeals.filter((d) => {
    const sla = slaStatus(d);
    const mtg = meetingStatus(d);
    const note = followupStatus(d, followupConfig);
    return (sla && sla.type === "overdue") || (mtg && mtg.type === "overdue") || (note && note.type === "overdue");
  }).length;
  const alertDeals = filtered
    .map((deal) => ({
      deal,
      sla: slaStatus(deal),
      mtg: meetingStatus(deal),
      followup: followupStatus(deal, followupConfig),
      priority: getAlertPriority(deal, followupConfig),
      notes: parseNotes(deal.notes),
    }))
    .filter((item) => item.priority)
    .sort((a, b) => {
      const score = { critical: 2, warning: 1 };
      const scoreDiff = (score[b.priority] || 0) - (score[a.priority] || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.deal.updatedAt || b.deal.createdAt || 0) - new Date(a.deal.updatedAt || a.deal.createdAt || 0);
    });

  const stats = {
    total: kpiDeals.length,
    hot: kpiDeals.filter((d) => d.stage === "Hot").length,
    win: kpiDeals.filter((d) => d.stage === "Win").length,
    rev: kpiDeals.reduce((s, d) => s + (Number(d.value) || 0), 0),
  };
  const teamStats = TEAM_OPTIONS.map((team) => {
    const teamDeals = deals.filter((deal) => deal.team === team);
    return {
      team,
      total: teamDeals.length,
      win: teamDeals.filter((deal) => deal.stage === "Win").length,
      rev: teamDeals.reduce((sum, deal) => sum + (Number(deal.value) || 0), 0),
    };
  });
  if (requiresLogin && !isAuthenticated) {
    return <LoginScreen owner={currentAccount} onLogin={handleLogin} canFallbackToLocal={hasPasswordForOwner} onOpenSetup={() => window.alert("Sau khi đăng nhập đúng link owner của mình, bạn có thể vào ⚙ để tự cấu hình Telegram cho tài khoản đó.")} />;
  }

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", background: UI.background, minHeight: "100vh", color: UI.text, width: "100%" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ display: "flex", minHeight: "100vh", width: "100%" }}>
        <aside style={{ width: "248px", background: UI.card, borderRight: `1px solid ${UI.border}`, padding: "20px 16px", display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "46px", height: "46px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <img src={gipLogo} alt="GIP Logo" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
            </div>
            <div>
              <div style={{ fontSize: "16px", fontWeight: "800", color: UI.text }}>Sales Pipeline CRM</div>
              <div style={{ fontSize: "11px", color: UI.muted, marginTop: "2px" }}>{effectiveRole === DEFAULT_MASTER_ROLE ? "Master workspace" : `${effectiveRole} workspace · ${currentAccount}${effectiveTeam ? ` · ${effectiveTeam}` : ""}`}</div>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: "8px", boxShadow: "none" }}>
            {[["pipeline", "Pipeline", "📋"], ["alerts", "Cảnh báo", "🚨"], ["report", "Báo cáo", "📊"]].map(([key, label, icon]) => (
              <button key={key} onClick={() => setTab(key)} style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", background: tab === key ? "#eff6ff" : "transparent", border: tab === key ? "1px solid #bfdbfe" : "1px solid transparent", borderRadius: "12px", padding: "12px 14px", color: tab === key ? UI.primary : UI.muted, fontWeight: tab === key ? "700" : "600", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", marginBottom: "4px", textAlign: "left" }}>
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div style={{ ...cardStyle, padding: "14px", boxShadow: "none" }}>
            <div style={{ fontSize: "11px", fontWeight: "700", color: UI.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Tài khoản</div>
            <div style={{ fontSize: "14px", fontWeight: "700", color: UI.text }}>{currentAccount}</div>
            <div style={{ fontSize: "12px", color: UI.muted, marginTop: "4px" }}>{effectiveRole === DEFAULT_MASTER_ROLE ? "Quản lý toàn bộ dữ liệu" : effectiveRole === DEFAULT_MANAGER_ROLE ? `Quản lý dữ liệu team ${effectiveTeam}` : "Chỉ xem dữ liệu của mình"}</div>
          </div>

          {isMaster && (
            <div style={{ ...cardStyle, padding: "14px", boxShadow: "none" }}>
              <div style={{ fontSize: "11px", fontWeight: "700", color: UI.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Owner links</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {allOwnerCodes.map((p) => (
                  <a key={p} href={`?owner=${p}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none", background: "#f8fafc", border: `1px solid ${UI.border}`, borderRadius: "10px", padding: "8px 10px", color: UI.primary, fontSize: "12px", fontWeight: "700" }}>
                    🔗 {p}
                  </a>
                ))}
              </div>
            </div>
          )}
        </aside>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ background: UI.card, borderBottom: `1px solid ${UI.border}`, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "22px", fontWeight: "800", color: UI.text }}>{tab === "pipeline" ? "Pipeline Dashboard" : tab === "alerts" ? "Alert Center" : "Analytics & Reports"}</div>
              <div style={{ fontSize: "13px", color: UI.muted, marginTop: "4px" }}>Modern SaaS CRM workspace with cleaner hierarchy, wider data panels, and faster scanning.</div>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              {(tab === "pipeline" || tab === "alerts") && (
                <>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo brand, contact, phone..." style={{ ...dropdownStyle(search), width: "260px" }} />
                  <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)} style={{ ...dropdownStyle(filterStage), width: "150px" }}>
                    <option value="">Tất cả giai đoạn</option>
                    {STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                  </select>
                  <select value={filterDealStatus} onChange={(e) => setFilterDealStatus(e.target.value)} style={{ ...dropdownStyle(filterDealStatus), width: "190px" }}>
                    <option value="">Tất cả trạng thái</option>
                    {DEAL_STATUS_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  {effectiveRole !== DEFAULT_USER_ROLE && (
                    <select value={filterPIC} onChange={(e) => setFilterPIC(e.target.value)} style={{ ...dropdownStyle(filterPIC), width: "160px" }}>
                      <option value="">Tất cả PIC</option>
                      {picFilterOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  )}
                  <Btn
                    onClick={() => {
                      setSearch("");
                      setFilterStage("");
                      setFilterDealStatus("");
                      setFilterPIC("");
                    }}
                  >
                    Reset
                  </Btn>
                  <Btn blue onClick={() => openAddOptions({ pic: ownerMode || "" })}>+ Deal mới</Btn>
                </>
              )}
              {tab === "report" && <Btn blue onClick={() => exportExcel(deals, `${reportFrom || "start"}_${reportTo || "end"}`)}>⬇ Xuất Excel</Btn>}
              <div style={{ background: syncState === "error" ? "#fef2f2" : "#f8fafc", border: `1px solid ${syncState === "error" ? "#fecaca" : syncState === "success" ? "#bbf7d0" : UI.border}`, borderRadius: "12px", padding: "10px 12px", color: syncState === "error" ? "#b91c1c" : syncState === "success" ? "#166534" : UI.muted, fontSize: "12px", fontWeight: "700" }}>
                {syncState === "syncing" ? "Đang lưu tự động..." : syncState === "error" ? "Mất kết nối backend" : backendReady ? "Đã lưu tự động" : "Đang chờ backend"}
              </div>
              {requiresLogin && <Btn onClick={logout}>Đăng xuất</Btn>}
              {canOpenSettings && <Btn onClick={() => setShowSetup(true)}>⚙ Cài đặt</Btn>}
            </div>
          </div>

          <div style={{ padding: "20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "16px", width: "100%", marginBottom: "20px" }}>
              {[
                { label: "TỔNG LEADS", val: stats.total, col: UI.primary },
                { label: "HOT LEADS", val: stats.hot, col: "#dc2626" },
                { label: "ĐÃ WIN", val: stats.win, col: "#16a34a" },
                { label: "TỔNG REV.", val: stats.rev ? `${(stats.rev / 1e6).toFixed(1)}M ₫` : "—", col: "#d97706" },
                { label: "⚠️ QUÁ HẠN", val: overdueCount, col: overdueCount > 0 ? "#dc2626" : UI.muted },
              ].map((s) => (
                <div key={s.label} style={{ ...cardStyle, padding: "18px", minWidth: 0, background: s.label === "⚠️ QUÁ HẠN" && overdueCount > 0 ? "#fff5f4" : UI.card }}>
                  <div style={{ fontSize: "11px", color: UI.muted, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: "700", marginBottom: "10px" }}>{s.label}</div>
                  <div style={{ fontSize: "30px", fontWeight: "800", color: s.col, lineHeight: 1.1 }}>{s.val}</div>
                </div>
              ))}
            </div>

            {effectiveRole === DEFAULT_MASTER_ROLE && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px", marginBottom: "20px" }}>
                {teamStats.map((team) => (
                  <div key={team.team} style={{ ...cardStyle, padding: "16px" }}>
                    <div style={{ fontSize: "11px", color: UI.muted, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: "700", marginBottom: "10px" }}>{team.team}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
                      <div><div style={{ fontSize: "11px", color: UI.muted }}>Deals</div><div style={{ fontSize: "22px", fontWeight: "800", color: UI.primary }}>{team.total}</div></div>
                      <div><div style={{ fontSize: "11px", color: UI.muted }}>Win</div><div style={{ fontSize: "22px", fontWeight: "800", color: "#16a34a" }}>{team.win}</div></div>
                      <div><div style={{ fontSize: "11px", color: UI.muted }}>Rev.</div><div style={{ fontSize: "22px", fontWeight: "800", color: "#d97706" }}>{team.rev ? `${(team.rev / 1e6).toFixed(1)}M` : "—"}</div></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "pipeline" && <KanbanBoard deals={filtered} dragOver={dragOver} setDragOver={setDragOver} draggingId={draggingId} setDraggingId={setDraggingId} moveDeal={moveDeal} onEdit={(d) => setModalDeal(d)} onDelete={deleteDeal} onAdd={(stage) => openAddOptions({ stage, pic: ownerMode || "" })} />}
            {tab === "alerts" && <AlertView alertDeals={alertDeals} onEdit={(deal) => setModalDeal(deal)} />}
            {tab === "report" && <ReportView deals={isMaster ? deals : visibleDeals} ownerCodes={allOwnerCodes} reportFrom={reportFrom} setReportFrom={setReportFrom} reportTo={reportTo} setReportTo={setReportTo} reportPIC={ownerMode || reportPIC} setReportPIC={setReportPIC} isMaster={isMaster} />}
          </div>
        </div>
      </div>

      {showAddOptions && <AddDealOptionsModal preset={addPreset} onSingleAdd={() => { setModalDeal({ stage: addPreset.stage || "Data Thô", pic: addPreset.pic || ownerMode || "" }); setShowAddOptions(false); }} onImport={() => { setShowImportModal(true); setShowAddOptions(false); }} onClose={() => setShowAddOptions(false)} />}
      {showImportModal && <ImportDealsModal preset={addPreset} ownerMode={ownerMode} onDownloadTemplate={exportImportTemplate} onImport={importDeals} onClose={() => setShowImportModal(false)} />}
      {modalDeal !== null && <DealModal deal={modalDeal} ownerCodes={allOwnerCodes} authConfig={authConfig} onSave={saveDeal} onClose={() => setModalDeal(null)} ownerMode={ownerMode} isMaster={isMaster} currentRole={effectiveRole} currentTeam={effectiveTeam} />}
      {canOpenSettings && showSetup && <SetupModal currentAccount={currentAccount} isMaster={isMaster} ownerCodes={ownerCodes} authConfig={authConfig} telegramConfig={telegramConfig} followupConfig={followupConfig} backendReady={backendReady} onSave={saveSettings} onTestTelegram={testTelegram} onRunScan={runAlertScan} onDownloadBackup={downloadBackup} onRestoreBackup={restoreBackup} onSyncFromOnline={syncFromOnline} onClose={() => setShowSetup(false)} />}
    </div>
  );
}

function KanbanBoard({ deals, dragOver, setDragOver, draggingId, setDraggingId, moveDeal, onEdit, onDelete, onAdd }) {
  return (
    <div style={{ width: "100%", overflowX: "auto", padding: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(156px, 1fr))", gap: "10px", width: "100%", minWidth: "960px", alignItems: "flex-start" }}>
      {STAGES.map((stage) => {
        const cfg = STAGE_CFG[stage];
        const sd = deals.filter((d) => d.stage === stage);
        const isOver = dragOver === stage;
        const rev = sd.reduce((s, d) => s + (Number(d.value) || 0), 0);
        const overdueInCol = sd.filter((d) => {
          const sl = slaStatus(d);
          return sl && sl.type === "overdue";
        }).length;
        return (
          <div
            key={stage}
            onDragOver={(e) => { e.preventDefault(); setDragOver(stage); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); }}
            onDrop={(e) => { e.preventDefault(); if (draggingId) moveDeal(draggingId, stage); setDragOver(null); setDraggingId(null); }}
            style={{ background: isOver ? "#f8fbff" : UI.card, border: `1px solid ${isOver ? cfg.border : UI.border}`, borderRadius: "12px", padding: "10px", transition: "all 0.15s", display: "flex", flexDirection: "column", gap: "8px", boxShadow: isOver ? `0 12px 30px ${cfg.border}30` : "0 1px 2px rgba(15,23,42,0.04)" }}
          >
            <div style={{ paddingBottom: "8px", borderBottom: `1px solid ${cfg.border}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                  <span style={{ fontSize: "14px", flexShrink: 0 }}>{cfg.icon}</span>
                  <span title={stage} style={{ fontWeight: "700", color: cfg.color, fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stage}</span>
                  {overdueInCol > 0 && <span title="Số deal quá hạn trong stage" style={{ background: "#fdecea", color: "#c0392b", borderRadius: "999px", padding: "1px 6px", fontSize: "9px", fontWeight: "700", flexShrink: 0 }}>⚠ {overdueInCol}</span>}
                </div>
                <span title="Số lượng deal" style={{ background: cfg.badge, color: cfg.color, borderRadius: "999px", padding: "2px 7px", fontSize: "10px", fontWeight: "700", border: `1px solid ${cfg.border}`, flexShrink: 0 }}>{sd.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px", gap: "8px" }}>
                <span title={SLA_DAYS[stage] ? `SLA tối đa ${SLA_DAYS[stage]} ngày` : "Không có SLA"} style={{ fontSize: "10px", color: UI.muted, whiteSpace: "nowrap" }}>SLA {SLA_DAYS[stage] ? `${SLA_DAYS[stage]}n` : "—"}</span>
                <span title="Tổng revenue stage" style={{ fontSize: "11px", color: cfg.color, fontWeight: "700", whiteSpace: "nowrap" }}>{sd.some((d) => d.value) ? `${(rev / 1e6).toFixed(1)}M` : "—"}</span>
              </div>
            </div>
            {sd.map((deal) => (
              <DealCard key={deal.id} deal={deal} cfg={cfg} isDragging={draggingId === deal.id} onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDraggingId(deal.id); }} onDragEnd={() => setDraggingId(null)} onEdit={() => onEdit(deal)} onDelete={() => onDelete(deal.id)} />
            ))}
            {sd.length === 0 && <div style={{ padding: "20px 0", textAlign: "center", color: isOver ? cfg.color : "#c0cfd8", fontSize: "11px" }}>{isOver ? "↓ Thả vào đây" : "Chưa có deal"}</div>}
            <button
              onClick={() => onAdd(stage)}
              style={{ background: "transparent", border: `1px dashed ${cfg.border}`, borderRadius: "8px", padding: "7px", color: "#90a8c0", fontSize: "12px", cursor: "pointer", width: "100%", fontFamily: "inherit", transition: "all 0.15s" }}
              onMouseEnter={(e) => { e.target.style.color = cfg.color; e.target.style.background = cfg.badge; }}
              onMouseLeave={(e) => { e.target.style.color = "#90a8c0"; e.target.style.background = "transparent"; }}
            >
              + Thêm deal
            </button>
          </div>
        );
      })}
      </div>
    </div>
  );
}

function DealCard({ deal, cfg, isDragging, onDragStart, onDragEnd, onEdit, onDelete }) {
  const [hover, setHover] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const platforms = Array.isArray(deal.platform) ? deal.platform : deal.platform ? [deal.platform] : [];
  const history = (Array.isArray(deal.stageHistory) ? deal.stageHistory : []).filter((h) => h.from);
  const notes = parseNotes(deal.notes);
  const sla = slaStatus(deal);
  const mtg = meetingStatus(deal);
  const slaColor = sla?.type === "overdue" ? "#c0392b" : sla?.type === "warning" ? "#b86e00" : "#6b7c93";
  const mtgColor = mtg?.type === "overdue" ? "#c0392b" : "#b86e00";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ background: hover ? "#f8fbff" : UI.card, border: `1px solid ${sla?.type === "overdue" ? "#fecaca" : hover ? cfg.border : UI.border}`, borderRadius: "12px", padding: "10px", cursor: "grab", opacity: isDragging ? 0.4 : 1, transition: "all 0.12s", boxShadow: hover ? "0 8px 24px rgba(37,99,235,0.12)" : "0 1px 2px rgba(15,23,42,0.04)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "6px" }}>
        <div title={deal.brand || "—"} style={{ fontWeight: "700", color: "#1a2a3a", fontSize: "12px", lineHeight: 1.25, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{deal.brand || "—"}</div>
        {hover && (
          <div style={{ display: "flex", gap: "3px", flexShrink: 0 }}>
            <MiniBtn onClick={onEdit} title="Sửa">✎</MiniBtn>
            <MiniBtn onClick={onDelete} title="Xóa" danger>✕</MiniBtn>
          </div>
        )}
      </div>

      {sla && <div style={{ marginTop: "4px", background: sla.type === "overdue" ? "#fdecea" : "#fff8e6", borderRadius: "8px", padding: "3px 6px", fontSize: "9px", color: slaColor, fontWeight: "700", lineHeight: 1.3 }}>⏰ {sla.label}</div>}
      {mtg && <div style={{ marginTop: "4px", background: "#fdecea", borderRadius: "8px", padding: "3px 6px", fontSize: "9px", color: mtgColor, fontWeight: "700", lineHeight: 1.3 }}>📅 {mtg.label}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
        {deal.pic && <div style={{ fontSize: "9px", color: "#fff", background: cfg.color, borderRadius: "999px", padding: "3px 8px", display: "inline-block", fontWeight: "700" }}>{deal.pic}</div>}
        {deal.deal_status && <span style={{ ...getDealStatusBadgeStyle(deal.deal_status), padding: "3px 8px", fontSize: "10px" }}>{deal.deal_status}</span>}
      </div>
      {deal.contact && <div title={deal.contact} style={{ fontSize: "10px", color: "#6080a0", marginTop: "6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>👤 {deal.contact}</div>}
      {deal.phone && <div style={{ fontSize: "10px", color: "#6080a0", marginTop: "2px" }}>📞 {deal.phone}</div>}
      {deal.maKH && <div style={{ fontSize: "10px", color: "#1a7a45", marginTop: "2px", fontWeight: "600" }}>🆔 {deal.maKH}</div>}
      {deal.bangGia && <div style={{ fontSize: "10px", color: "#1a7a45", marginTop: "1px" }}>💼 {deal.bangGia}</div>}

      {platforms.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "7px" }}>
          {platforms.map((p) => <span key={p} title={p} style={{ background: cfg.badge, border: `1px solid ${cfg.border}`, borderRadius: "999px", padding: "1px 5px", fontSize: "9px", color: cfg.color, fontWeight: "600" }}>{p}</span>)}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", alignItems: "center", gap: "8px" }}>
        {deal.value ? <span style={{ fontSize: "10px", color: "#b86e00", fontWeight: "800", whiteSpace: "nowrap" }}>{Number(deal.value) >= 1e6 ? `${(Number(deal.value) / 1e6).toFixed(0)}M` : Number(deal.value).toLocaleString()}₫</span> : <span />}
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {deal.lead_source_type && <span title={deal.lead_source_type} style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: "999px", padding: "1px 6px", fontSize: "9px", color: "#4338ca", fontWeight: "700" }}>{deal.lead_source_type}</span>}
          {deal.lead_source_detail && <span title={deal.lead_source_detail} style={{ background: "#ecfeff", border: "1px solid #a5f3fc", borderRadius: "999px", padding: "1px 6px", fontSize: "9px", color: "#155e75", fontWeight: "700" }}>{deal.lead_source_detail}</span>}
          {!deal.lead_source_type && !deal.lead_source_detail && deal.source && <span title={deal.source} style={{ fontSize: "9px", color: "#90a8c0", maxWidth: "72px", textAlign: "right", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{deal.source}</span>}
        </div>
      </div>

      {notes.length > 0 && <div style={{ marginTop: "7px", background: "#f8f9fb", borderRadius: "8px", padding: "5px 7px", fontSize: "9px", color: "#6080a0", borderLeft: `2px solid ${cfg.border}`, lineHeight: 1.35 }}>💬 {notes[notes.length - 1].text.length > 32 ? `${notes[notes.length - 1].text.slice(0, 32)}...` : notes[notes.length - 1].text}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", paddingTop: "6px", borderTop: "1px solid #eef3f8" }}>
        <span style={{ fontSize: "9px", color: "#a0b8d0" }}>📅 {fmtDate(deal.dataInputDate || deal.createdAt) || "—"}</span>
        <div style={{ display: "flex", gap: "6px" }}>
          {notes.length > 0 && <button onClick={(e) => { e.stopPropagation(); setShowNotes((v) => !v); }} style={{ background: "transparent", border: "none", fontSize: "9px", color: "#b86e00", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>💬 {notes.length}</button>}
          {history.length > 0 && <button onClick={(e) => { e.stopPropagation(); setShowHistory((v) => !v); }} style={{ background: "transparent", border: "none", fontSize: "9px", color: "#1a6fba", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>🕐 {history.length}</button>}
        </div>
      </div>

      {showNotes && notes.length > 0 && (
        <div style={{ marginTop: "8px", background: "#fffbf0", border: "1px solid #f0cc80", borderRadius: "8px", padding: "8px", maxHeight: "160px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "5px" }}>
          {[...notes].reverse().map((n, i) => (
            <div key={`${n.date}-${i}`} style={{ fontSize: "11px" }}>
              <div style={{ color: "#90a8c0", fontSize: "9px", marginBottom: "2px" }}>🕐 {fmtDT(n.date)}</div>
              <div style={{ color: "#1a2a3a", lineHeight: 1.4 }}>{n.text}</div>
              {i < notes.length - 1 && <div style={{ borderBottom: "1px solid #f0e0b0", marginTop: "5px" }} />}
            </div>
          ))}
        </div>
      )}
      {showHistory && history.length > 0 && (
        <div style={{ marginTop: "8px", background: "#f4f8fc", borderRadius: "7px", padding: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {history.map((h, i) => {
            const prev = history[i - 1]?.date || deal.dataInputDate || deal.createdAt;
            const fc = STAGE_CFG[h.from] || {};
            const tc = STAGE_CFG[h.to] || {};
            return (
              <div key={`${h.date}-${h.to}-${i}`} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px" }}>
                <span style={{ color: fc.color, fontWeight: "600" }}>{fc.icon} {h.from}</span>
                <span style={{ color: "#c0cfd8" }}>→</span>
                <span style={{ color: tc.color, fontWeight: "600" }}>{tc.icon} {h.to}</span>
                <span style={{ color: "#a0b8d0", marginLeft: "auto" }}>{daysBetween(prev, h.date) > 0 ? `${daysBetween(prev, h.date)}d · ` : ""}{fmtDate(h.date)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReportView({ deals, ownerCodes, reportFrom, setReportFrom, reportTo, setReportTo, reportPIC, setReportPIC, isMaster }) {
  const [rankingSort, setRankingSort] = useState({ key: "totalDeals", direction: "desc" });
  const picDeals = reportPIC === "all" ? deals : deals.filter((d) => d.pic === reportPIC);
  const hasInvalidRange = !!reportFrom && !!reportTo && startOfDay(reportFrom) > endOfDay(reportTo);
  const isWithinRange = (value) => !hasInvalidRange && isInDateRange(value, reportFrom, reportTo);
  const setPreset = (preset) => {
    const next = buildDatePresetRange(preset);
    setReportFrom(next.from);
    setReportTo(next.to);
  };

  const rangedDeals = picDeals.filter((d) => isWithinRange(d.dataInputDate || d.createdAt));
  const movedInRange = hasInvalidRange
    ? []
    : picDeals.flatMap((d) =>
        (Array.isArray(d.stageHistory) ? d.stageHistory : [])
          .filter((h) => h.from && isWithinRange(h.date))
          .map((h, index, arr) => {
            const currentIndex = arr.indexOf(h);
            const originalHistory = Array.isArray(d.stageHistory) ? d.stageHistory : [];
            const originalIndex = originalHistory.indexOf(h);
            const prev = originalHistory
              .slice(0, originalIndex)
              .reverse()
              .find((y) => y.to === h.from)?.date || d.dataInputDate || d.createdAt;
            return { ...h, brand: d.brand, pic: d.pic, value: Number(d.value) || 0, id: d.id, prevDate: prev, _idx: currentIndex };
          }),
      );
  const wonInRange = picDeals.filter((d) => (Array.isArray(d.stageHistory) ? d.stageHistory : []).some((x) => x.to === "Win" && isWithinRange(x.date)));
  const revenueWin = wonInRange.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const overdueDeals = picDeals.filter((d) => {
    const sl = slaStatus(d);
    const mtg = meetingStatus(d);
    const note = followupStatus(d, FOLLOWUP_HOURS_DEFAULT);
    return (sl && sl.type === "overdue") || (mtg && mtg.type === "overdue") || (note && note.type === "overdue");
  });

  const avgDays = {};
  STAGES.forEach((st, i) => {
    if (i === 0) return;
    const from = STAGES[i - 1];
    const transitions = hasInvalidRange
      ? []
      : picDeals.flatMap((d) => {
          const h = Array.isArray(d.stageHistory) ? d.stageHistory : [];
          return h
            .filter((x) => x.from === from && x.to === st && isWithinRange(x.date))
            .map((x) => {
              const prev = h.slice(0, h.indexOf(x)).reverse().find((y) => y.to === from)?.date || d.dataInputDate || d.createdAt;
              return daysBetween(prev, x.date);
            });
        });
    avgDays[`${from}→${st}`] = transitions.length ? Math.round(transitions.reduce((a, b) => a + b, 0) / transitions.length) : null;
  });

  const picStats = ownerCodes
    .map((pic) => {
      const pd = deals.filter((d) => d.pic === pic);
      const leads = pd.filter((d) => isWithinRange(d.dataInputDate || d.createdAt));
      const wins = pd.filter((d) => (Array.isArray(d.stageHistory) ? d.stageHistory : []).some((x) => x.to === "Win" && isWithinRange(x.date)));
      return {
        pic,
        total: leads.length,
        hot: leads.filter((d) => d.stage === "Hot").length,
        win: wins.length,
        rev: wins.reduce((s, d) => s + (Number(d.value) || 0), 0),
        overdue: pd.filter((d) => {
          const sl = slaStatus(d);
          const mtg = meetingStatus(d);
          const note = followupStatus(d, FOLLOWUP_HOURS_DEFAULT);
          return (sl && sl.type === "overdue") || (mtg && mtg.type === "overdue") || (note && note.type === "overdue");
        }).length,
      };
    })
    .filter((p) => p.total > 0 || p.win > 0 || p.overdue > 0);

  const stageCounts = Object.fromEntries(STAGES.map((stage) => [stage, rangedDeals.filter((d) => d.stage === stage).length]));
  const maxStageCount = Math.max(...Object.values(stageCounts), 1);
  const gipRankingRows = hasInvalidRange ? [] : buildGipRankingReport(rangedDeals);
  const sortedGipRankingRows = [...gipRankingRows].sort((a, b) => {
    const direction = rankingSort.direction === "asc" ? 1 : -1;
    const av = a[rankingSort.key];
    const bv = b[rankingSort.key];
    if (typeof av === "string" || typeof bv === "string") {
      return String(av).localeCompare(String(bv)) * direction;
    }
    return ((Number(av) || 0) - (Number(bv) || 0)) * direction;
  });
  const emptyRange = !hasInvalidRange && rangedDeals.length === 0 && movedInRange.length === 0 && wonInRange.length === 0;
  const rangeLabel = reportFrom && reportTo ? `${fmtDate(reportFrom)} - ${fmtDate(reportTo)}` : "Toàn bộ thời gian";
  const presetButtons = [
    { key: 7, label: "7 ngày" },
    { key: 10, label: "10 ngày" },
    { key: 30, label: "30 ngày" },
    { key: 90, label: "90 ngày" },
    { key: "month", label: "Tháng này" },
  ];
  const rankingColumns = [
    { key: "gipCode", label: "Mã GIP", title: "Mã GIP con", sortable: false, align: "left", width: "12%" },
    { key: "totalDeals", label: "Tổng", title: "Tổng deal", sortable: true, width: "7%" },
    { key: "interested", label: "Interest", title: "Interested", width: "6.5%" },
    { key: "consultationStarted", label: "Consult", title: "Consultation Started", width: "6.5%" },
    { key: "meetingScheduled", label: "Meeting", title: "Meeting Scheduled", width: "6.5%" },
    { key: "rateCardSent", label: "Rate Card", title: "Rate Card Sent", width: "7%" },
    { key: "waitingForTestAds", label: "Test Ads", title: "Waiting for Test Ads", width: "6.5%" },
    { key: "waitingForShipping", label: "Shipping", title: "Waiting for Shipping", width: "6.5%" },
    { key: "onboardingStarted", label: "Onboard", title: "Onboarding Started", width: "6.5%" },
    { key: "won", label: "Won", title: "Won", sortable: true, width: "6%" },
    { key: "lost", label: "Lost", title: "Lost", sortable: true, width: "6%" },
    { key: "badLead", label: "Bad lead", title: "Spam / Invalid Lead + Wrong Info + Can't Contact", width: "11%" },
    { key: "noStatus", label: "No status", title: "Chưa có trạng thái", width: "7%" },
    { key: "winRate", label: "Win rate", title: "Win rate", sortable: true, width: "8%" },
  ];
  const toggleRankingSort = (key) => {
    setRankingSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  };

  return (
    <div style={{ width: "100%", padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "'Playfair Display',serif", fontSize: "17px", color: "#1a6fba" }}>📊 Báo cáo</span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "10px", color: "#90a8c0", fontWeight: "700", marginBottom: "4px" }}>FROM</div>
            <Inp type="date" value={reportFrom} onChange={setReportFrom} />
          </div>
          <div>
            <div style={{ fontSize: "10px", color: "#90a8c0", fontWeight: "700", marginBottom: "4px" }}>TO</div>
            <Inp type="date" value={reportTo} onChange={setReportTo} />
          </div>
        </div>
        <div style={{ display: "flex", background: "#f0f4f8", borderRadius: "8px", padding: "3px", gap: "2px", flexWrap: "wrap" }}>
          {presetButtons.map((preset) => (
            <button key={preset.label} onClick={() => setPreset(preset.key)} style={{ background: "transparent", border: "none", borderRadius: "6px", padding: "5px 10px", color: "#1a6fba", fontWeight: "600", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>{preset.label}</button>
          ))}
        </div>
        {isMaster && <div style={{ display: "flex", background: "#f0f4f8", borderRadius: "8px", padding: "3px", gap: "2px", flexWrap: "wrap" }}>
          <button onClick={() => setReportPIC("all")} style={{ background: reportPIC === "all" ? "#fff" : "transparent", border: "none", borderRadius: "6px", padding: "5px 12px", color: reportPIC === "all" ? "#1a6fba" : "#90a8c0", fontWeight: reportPIC === "all" ? "700" : "400", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>Tất cả</button>
          {ownerCodes.map((p) => <button key={p} onClick={() => setReportPIC(p)} style={{ background: reportPIC === p ? "#fff" : "transparent", border: "none", borderRadius: "6px", padding: "5px 12px", color: reportPIC === p ? "#1a6fba" : "#90a8c0", fontWeight: reportPIC === p ? "700" : "400", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>{p}</button>)}
        </div>}
      </div>

      {hasInvalidRange && (
        <div style={{ background: "#fff5f4", border: "1px solid #f0a898", borderRadius: "10px", padding: "12px 14px", color: "#c0392b", fontSize: "12px", fontWeight: "600", marginBottom: "16px" }}>
          Ngày From không được lớn hơn ngày To.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "12px", width: "100%", marginBottom: "20px" }}>
        {[{ label: "Leads mới", val: rangedDeals.length, col: "#1a6fba", icon: "➕" }, { label: "Chuyển stage", val: movedInRange.length, col: "#b86e00", icon: "🔄" }, { label: "Deal Win", val: wonInRange.length, col: "#1a7a45", icon: "🏆" }, { label: "Rev. Win", val: revenueWin ? `${(revenueWin / 1e6).toFixed(0)}M₫` : "—", col: "#0e5fa3", icon: "💰" }, { label: "⚠️ Quá hạn", val: overdueDeals.length, col: overdueDeals.length > 0 ? "#c0392b" : "#90a8c0", icon: "🚨" }].map((c) => (
          <div key={c.label} style={{ background: "#fff", border: `1px solid ${c.label === "⚠️ Quá hạn" && overdueDeals.length > 0 ? "#f0a898" : "#dde6f0"}`, borderRadius: "12px", padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,80,160,0.07)" }}>
            <div style={{ fontSize: "18px", marginBottom: "4px" }}>{c.icon}</div>
            <div style={{ fontSize: "22px", fontWeight: "700", color: c.col, lineHeight: 1 }}>{hasInvalidRange ? "—" : c.val}</div>
            <div style={{ fontSize: "10px", color: "#90a8c0", marginTop: "4px" }}>{c.label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {emptyRange && (
        <div style={{ background: "#fff", border: "1px solid #dde6f0", borderRadius: "12px", padding: "24px", textAlign: "center", color: "#90a8c0", marginBottom: "18px" }}>
          Không có dữ liệu trong khoảng thời gian đã chọn.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
        {reportPIC === "all" && isMaster && picStats.length > 0 && !hasInvalidRange && (
          <div style={{ background: "#fff", border: "1px solid #dde6f0", borderRadius: "12px", padding: "16px", gridColumn: "1/-1" }}>
            <div style={{ fontWeight: "700", color: "#1a2a3a", fontSize: "13px", marginBottom: "14px" }}>👤 Hiệu suất PIC — {rangeLabel}</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead><tr style={{ borderBottom: "2px solid #dde6f0" }}>{["PIC", "Tổng leads", "Hot", "Win", "Revenue", "⚠️ Quá hạn"].map((h) => <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#6080a0", fontWeight: "600", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                <tbody>{picStats.map((p, i) => (
                  <tr key={p.pic} style={{ borderBottom: "1px solid #f0f4f8", background: i % 2 === 0 ? "#fafcff" : "#fff" }}>
                    <td style={{ padding: "8px 12px", fontWeight: "700", color: "#1a6fba" }}>{p.pic}</td>
                    <td style={{ padding: "8px 12px" }}>{p.total}</td>
                    <td style={{ padding: "8px 12px", color: "#c0392b", fontWeight: "600" }}>{p.hot}</td>
                    <td style={{ padding: "8px 12px", color: "#1a7a45", fontWeight: "600" }}>{p.win}</td>
                    <td style={{ padding: "8px 12px", color: "#b86e00", fontWeight: "600" }}>{p.rev > 0 ? `${(p.rev / 1e6).toFixed(0)}M₫` : "—"}</td>
                    <td style={{ padding: "8px 12px", color: p.overdue > 0 ? "#c0392b" : "#90a8c0", fontWeight: p.overdue > 0 ? "700" : "400" }}>{p.overdue > 0 ? `⚠️ ${p.overdue}` : "✓ OK"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

        {isMaster && !hasInvalidRange && (
          <div style={{ background: "#fff", border: "1px solid #dde6f0", borderRadius: "12px", padding: "16px", gridColumn: "1/-1" }}>
            <div style={{ fontWeight: "700", color: "#1a2a3a", fontSize: "13px", marginBottom: "6px" }}>Xếp hạng GIP con theo trạng thái deal</div>
            <div style={{ fontSize: "12px", color: "#6080a0", marginBottom: "14px" }}>Dùng đúng tập dữ liệu đã lọc theo thời gian{reportPIC !== "all" ? ` và mã ${reportPIC}` : ""}. Bấm vào dòng để lọc báo cáo theo mã GIP con.</div>
            {sortedGipRankingRows.length === 0 ? (
              <div style={{ fontSize: "12px", color: "#c0cfd8", textAlign: "center", padding: "18px 0" }}>Không có dữ liệu deal_status trong phạm vi hiện tại.</div>
            ) : (
              <div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", tableLayout: "fixed" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #dde6f0" }}>
                      {rankingColumns.map((column) => (
                        <th key={column.key} title={column.title || column.label} style={{ width: column.width, padding: "8px 6px", textAlign: column.align || "center", color: "#6080a0", fontWeight: "700", whiteSpace: "normal", lineHeight: 1.25, wordBreak: "break-word", verticalAlign: "middle" }}>
                          {column.sortable ? (
                            <button onClick={() => toggleRankingSort(column.key)} title={column.title || column.label} style={{ background: "transparent", border: "none", padding: 0, color: rankingSort.key === column.key ? "#1a6fba" : "#6080a0", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", fontSize: "11px", lineHeight: 1.25 }}>
                              {column.label} {rankingSort.key === column.key ? (rankingSort.direction === "desc" ? "↓" : "↑") : ""}
                            </button>
                          ) : column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedGipRankingRows.map((row, index) => (
                      <tr key={row.gipCode} onClick={() => setReportPIC(row.gipCode)} style={{ borderBottom: "1px solid #f0f4f8", background: index % 2 === 0 ? "#fafcff" : "#fff", cursor: "pointer" }}>
                        <td style={{ padding: "9px 8px", textAlign: "left", fontWeight: "700", color: "#1a6fba" }}>{row.gipCode}</td>
                        <td style={{ padding: "9px 6px", textAlign: "center", fontWeight: "700" }}>{row.totalDeals}</td>
                        <td style={{ padding: "9px 6px", textAlign: "center" }}>{row.interested}</td>
                        <td style={{ padding: "9px 6px", textAlign: "center" }}>{row.consultationStarted}</td>
                        <td style={{ padding: "9px 6px", textAlign: "center" }}>{row.meetingScheduled}</td>
                        <td style={{ padding: "9px 6px", textAlign: "center" }}>{row.rateCardSent}</td>
                        <td style={{ padding: "9px 6px", textAlign: "center" }}>{row.waitingForTestAds}</td>
                        <td style={{ padding: "9px 6px", textAlign: "center" }}>{row.waitingForShipping}</td>
                        <td style={{ padding: "9px 6px", textAlign: "center" }}>{row.onboardingStarted}</td>
                        <td style={{ padding: "9px 6px", textAlign: "center", color: "#1a7a45", fontWeight: "700" }}>{row.won}</td>
                        <td style={{ padding: "9px 6px", textAlign: "center", color: "#c0392b", fontWeight: "700" }}>{row.lost}</td>
                        <td title={`Spam/Invalid: ${row.spamInvalidLead} · Wrong Info: ${row.wrongInfo} · Can't Contact: ${row.cantContact}`} style={{ padding: "9px 6px", textAlign: "center", fontSize: "10px", color: "#64748b", lineHeight: 1.3 }}>
                          <span style={{ display: "block" }}>S:{row.spamInvalidLead}</span>
                          <span style={{ display: "block" }}>W:{row.wrongInfo}</span>
                          <span style={{ display: "block" }}>C:{row.cantContact}</span>
                        </td>
                        <td style={{ padding: "9px 6px", textAlign: "center", color: row.noStatus > 0 ? "#b86e00" : "#90a8c0", fontWeight: row.noStatus > 0 ? "700" : "400" }}>{row.noStatus}</td>
                        <td style={{ padding: "9px 6px", textAlign: "center", color: "#1a6fba", fontWeight: "700" }}>{`${Math.round(row.winRate * 100)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div style={{ background: "#fff", border: "1px solid #dde6f0", borderRadius: "12px", padding: "16px" }}>
          <div style={{ fontWeight: "700", color: "#1a2a3a", fontSize: "13px", marginBottom: "14px" }}>📋 Phân bổ stage</div>
          {STAGES.map((st) => {
            const cfg = STAGE_CFG[st];
            const cnt = hasInvalidRange ? 0 : stageCounts[st];
            return (
              <div key={st} style={{ marginBottom: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "12px", color: cfg.color, fontWeight: "600" }}>{cfg.icon} {st}</span>
                  <span style={{ fontSize: "12px", color: "#6080a0", fontWeight: "600" }}>{cnt}</span>
                </div>
                <div style={{ background: "#f0f4f8", borderRadius: "4px", height: "6px" }}><div style={{ background: cfg.border, width: `${maxStageCount > 0 ? (cnt / maxStageCount) * 100 : 0}%`, height: "100%", borderRadius: "4px", transition: "width 0.5s" }} /></div>
              </div>
            );
          })}
          {!hasInvalidRange && rangedDeals.length === 0 && <div style={{ fontSize: "12px", color: "#c0cfd8", textAlign: "center", padding: "12px 0 4px" }}>Không có lead trong khoảng này.</div>}
        </div>

        <div style={{ background: "#fff", border: "1px solid #dde6f0", borderRadius: "12px", padding: "16px" }}>
          <div style={{ fontWeight: "700", color: "#1a2a3a", fontSize: "13px", marginBottom: "14px" }}>⏱ Avg ngày / SLA</div>
          {Object.entries(avgDays).map(([key, val]) => {
            const [from, to] = key.split("→");
            const fc = STAGE_CFG[from] || {};
            const tc = STAGE_CFG[to] || {};
            const sla = SLA_DAYS[from];
            const overSLA = val !== null && sla && val > sla;
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", background: overSLA ? "#fdecea" : "#f4f8fc", borderRadius: "8px", padding: "8px 10px" }}>
                <span style={{ fontSize: "11px", color: fc.color, fontWeight: "600" }}>{fc.icon} {from}</span>
                <span style={{ color: "#c0cfd8", fontSize: "12px" }}>→</span>
                <span style={{ fontSize: "11px", color: tc.color, fontWeight: "600" }}>{tc.icon} {to}</span>
                <span style={{ marginLeft: "auto", fontSize: "12px", fontWeight: "700", color: overSLA ? "#c0392b" : val !== null ? "#1a6fba" : "#c0cfd8" }}>{hasInvalidRange ? "—" : val !== null ? `${val}n (SLA:${sla}n)` : "—"}</span>
              </div>
            );
          })}
        </div>

        {overdueDeals.length > 0 && (
          <div style={{ background: "#fff", border: "1.5px solid #f0a898", borderRadius: "12px", padding: "16px", gridColumn: "1/-1" }}>
            <div style={{ fontWeight: "700", color: "#c0392b", fontSize: "13px", marginBottom: "14px" }}>🚨 Danh sách KH quá hạn hiện tại</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {overdueDeals.map((d) => {
                const sl = slaStatus(d);
                const cfg = STAGE_CFG[d.stage] || {};
                return (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: "12px", background: "#fff5f4", borderRadius: "8px", padding: "8px 12px" }}>
                    <span style={{ fontWeight: "700", color: "#1a2a3a", minWidth: "120px" }}>{d.brand}</span>
                    {d.pic && <span style={{ fontSize: "10px", background: "#e8f3fc", color: "#1a6fba", borderRadius: "4px", padding: "1px 7px", fontWeight: "600" }}>{d.pic}</span>}
                    <span style={{ fontSize: "11px", color: cfg.color, fontWeight: "600" }}>{cfg.icon} {d.stage}</span>
                    <span style={{ marginLeft: "auto", fontSize: "11px", color: "#c0392b", fontWeight: "700" }}>⚠️ {sl?.label || "Quá hạn"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ background: "#fff", border: "1px solid #dde6f0", borderRadius: "12px", padding: "16px", gridColumn: "1/-1" }}>
          <div style={{ fontWeight: "700", color: "#1a2a3a", fontSize: "13px", marginBottom: "14px" }}>🔄 Lịch sử chuyển stage trong khoảng chọn</div>
          {hasInvalidRange || movedInRange.length === 0 ? <div style={{ color: "#c0cfd8", fontSize: "12px", textAlign: "center", padding: "20px 0" }}>{hasInvalidRange ? "Khoảng ngày không hợp lệ." : "Chưa có dữ liệu chuyển stage trong khoảng này."}</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {movedInRange.sort((a, b) => new Date(b.date) - new Date(a.date)).map((h, i) => {
                const fc = STAGE_CFG[h.from] || {};
                const tc = STAGE_CFG[h.to] || {};
                return (
                  <div key={`${h.id}-${h.date}-${i}`} style={{ display: "flex", alignItems: "center", gap: "10px", background: "#f4f8fc", borderRadius: "8px", padding: "8px 12px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "700", color: "#1a2a3a", minWidth: "110px" }}>{h.brand}</span>
                    {h.pic && <span style={{ fontSize: "10px", background: "#e8f3fc", color: "#1a6fba", borderRadius: "4px", padding: "1px 6px", fontWeight: "600" }}>{h.pic}</span>}
                    <span style={{ fontSize: "11px", color: fc.color, fontWeight: "600" }}>{fc.icon} {h.from}</span>
                    <span style={{ color: "#c0cfd8" }}>→</span>
                    <span style={{ fontSize: "11px", color: tc.color, fontWeight: "600" }}>{tc.icon} {h.to}</span>
                    <span style={{ marginLeft: "auto", fontSize: "11px", color: "#90a8c0" }}>{fmtDate(h.date)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AlertView({ alertDeals, onEdit }) {
  const criticalDeals = alertDeals.filter((item) => item.priority === "critical");
  const warningDeals = alertDeals.filter((item) => item.priority === "warning");

  return (
    <div style={{ width: "100%", padding: "20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "12px", marginBottom: "18px" }}>
        {[
          { label: "Tổng cảnh báo", value: alertDeals.length, color: "#1a6fba", bg: "#f0f7ff" },
          { label: "Cần xử lý ngay", value: criticalDeals.length, color: "#c0392b", bg: "#fff5f4" },
          { label: "Sắp chạm hạn", value: warningDeals.length, color: "#b86e00", bg: "#fff8e6" },
        ].map((card) => (
          <div key={card.label} style={{ background: "#fff", border: "1px solid #dde6f0", borderRadius: "12px", padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,80,160,0.07)" }}>
            <div style={{ display: "inline-block", background: card.bg, color: card.color, borderRadius: "999px", padding: "3px 9px", fontSize: "10px", fontWeight: "700", marginBottom: "8px" }}>{card.label}</div>
            <div style={{ fontSize: "28px", color: card.color, fontWeight: "700", lineHeight: 1 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {alertDeals.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #dde6f0", borderRadius: "14px", padding: "30px", textAlign: "center", color: "#90a8c0" }}>
          Hiện chưa có deal nào cần cảnh báo theo bộ lọc đang chọn.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {[
            { title: "Cần xử lý ngay", subtitle: "Deal đã quá hạn SLA hoặc quá hạn gặp khách.", items: criticalDeals, border: "#f0a898", bg: "#fff5f4", color: "#c0392b" },
            { title: "Sắp chạm hạn", subtitle: "Deal chưa quá hạn nhưng cần đẩy nhanh chăm sóc và cập nhật.", items: warningDeals, border: "#f0cc80", bg: "#fffbf0", color: "#b86e00" },
          ].filter((section) => section.items.length > 0).map((section) => (
            <div key={section.title} style={{ background: "#fff", border: `1.5px solid ${section.border}`, borderRadius: "14px", padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "16px", fontWeight: "700", color: section.color }}>{section.title}</div>
                  <div style={{ fontSize: "12px", color: "#6080a0", marginTop: "2px" }}>{section.subtitle}</div>
                </div>
                <div style={{ background: section.bg, color: section.color, borderRadius: "999px", padding: "4px 10px", fontSize: "11px", fontWeight: "700" }}>{section.items.length} deal</div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {section.items.map(({ deal, sla, mtg, followup, notes }) => {
                  const latestNote = notes.length ? notes[notes.length - 1] : null;
                  const stageCfg = STAGE_CFG[deal.stage] || {};
                  return (
                    <div key={deal.id} style={{ background: "#fff", border: "1px solid #eef3f8", borderRadius: "12px", padding: "14px", boxShadow: "0 1px 3px rgba(0,80,160,0.05)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                        <div style={{ minWidth: "220px", flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                            <span style={{ fontSize: "14px", fontWeight: "700", color: "#1a2a3a" }}>{deal.brand || "—"}</span>
                            {deal.pic && <span style={{ fontSize: "10px", background: "#e8f3fc", color: "#1a6fba", borderRadius: "999px", padding: "2px 8px", fontWeight: "700" }}>{deal.pic}</span>}
                            <span style={{ fontSize: "10px", background: stageCfg.badge || "#f4f8fc", color: stageCfg.color || "#6b7c93", borderRadius: "999px", padding: "2px 8px", fontWeight: "700" }}>{stageCfg.icon} {deal.stage}</span>
                          </div>
                          <div style={{ fontSize: "12px", color: "#6080a0", lineHeight: 1.6 }}>
                            {deal.contact ? `Liên hệ: ${deal.contact}` : "Chưa có người liên hệ"} {deal.phone ? `· ${deal.phone}` : ""}
                          </div>
                          <div style={{ fontSize: "12px", color: "#6080a0", marginTop: "4px" }}>
                            Nhập data: {fmtDate(deal.dataInputDate || deal.createdAt) || "—"} {deal.lastMeeting ? `· Gặp KH gần nhất: ${fmtDate(deal.lastMeeting)}` : ""}
                          </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "220px" }}>
                          {sla && <div style={{ background: sla.type === "overdue" ? "#fdecea" : "#fff8e6", color: sla.type === "overdue" ? "#c0392b" : "#b86e00", borderRadius: "8px", padding: "6px 10px", fontSize: "12px", fontWeight: "700" }}>⏰ {sla.label}</div>}
                          {mtg && <div style={{ background: mtg.type === "overdue" ? "#fdecea" : "#fff8e6", color: mtg.type === "overdue" ? "#c0392b" : "#b86e00", borderRadius: "8px", padding: "6px 10px", fontSize: "12px", fontWeight: "700" }}>📅 {mtg.label}</div>}
                          {followup && <div style={{ background: followup.type === "overdue" ? "#fdecea" : "#fff8e6", color: followup.type === "overdue" ? "#c0392b" : "#b86e00", borderRadius: "8px", padding: "6px 10px", fontSize: "12px", fontWeight: "700" }}>📝 {followup.label}</div>}
                          {latestNote ? (
                            <div style={{ background: "#f4f8fc", color: "#6080a0", borderRadius: "8px", padding: "8px 10px", fontSize: "11px", lineHeight: 1.5 }}>
                              <b style={{ color: "#1a2a3a" }}>Ghi chú mới nhất:</b> {latestNote.text}
                            </div>
                          ) : (
                            <div style={{ background: "#f4f8fc", color: "#90a8c0", borderRadius: "8px", padding: "8px 10px", fontSize: "11px" }}>Chưa có ghi chú gần nhất.</div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                        <Btn blue onClick={() => onEdit(deal)}>Cập nhật ngay</Btn>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Btn({ children, onClick, blue, disabled, style = {}, type = "button" }) {
  return <button type={type} onClick={onClick} disabled={disabled} style={{ background: blue ? UI.primary : "#fff", border: blue ? "1px solid transparent" : `1px solid ${UI.border}`, borderRadius: "12px", padding: "10px 14px", color: blue ? "#fff" : UI.text, fontWeight: "700", fontSize: "12px", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1, fontFamily: "inherit", boxShadow: blue ? "0 8px 20px rgba(37,99,235,0.2)" : "0 1px 2px rgba(15,23,42,0.04)", ...style }}>{children}</button>;
}

function Field({ label, children, span }) {
  return <div style={span ? { gridColumn: "1/-1" } : {}}><div style={{ fontSize: "10px", color: UI.muted, fontWeight: "700", letterSpacing: "0.06em", marginBottom: "6px" }}>{label.toUpperCase()}</div>{children}</div>;
}

function Inp({ value, onChange, placeholder, type = "text", multiline }) {
  const base = { background: "#fff", border: `1px solid ${UI.border}`, borderRadius: "12px", padding: "10px 12px", color: UI.text, fontSize: "13px", width: "100%", outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  return multiline ? <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} style={{ ...base, resize: "vertical" }} /> : <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={base} />;
}

function Modal({ children, onClose }) {
  return <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.28)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "12px", backdropFilter: "blur(6px)" }}><div style={{ background: "#fff", border: `1px solid ${UI.border}`, borderRadius: "20px", padding: "24px", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(15,23,42,0.16)" }}>{children}</div></div>;
}

function MiniBtn({ onClick, children, danger, title }) {
  return <button onClick={(e) => { e.stopPropagation(); onClick(); }} title={title} style={{ background: "transparent", border: "none", borderRadius: "4px", width: "20px", height: "20px", color: danger ? "#c0392b" : "#90a8c0", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>{children}</button>;
}

function FormBlock({ title, children, highlight = false }) {
  return (
    <div
      style={{
        gridColumn: "1 / -1",
        marginTop: "10px",
        padding: "16px",
        borderRadius: "16px",
        border: `1px solid ${highlight ? "#bfdbfe" : "#dde6f0"}`,
        background: highlight ? "#f8fbff" : "#fbfdff",
      }}
    >
      <div style={{ fontSize: "14px", fontWeight: "800", color: highlight ? UI.primary : UI.text, marginBottom: "14px" }}>{title}</div>
      {children}
    </div>
  );
}

function LoginScreen({ owner, onLogin, canFallbackToLocal, onOpenSetup }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const ok = await onLogin(password);
    setLoading(false);
    if (!ok) {
      setError("Sai mat khau hoac backend local chua co cau hinh tai khoan.");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#eef5fb,#f7fbff)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", fontFamily: "'DM Sans',sans-serif" }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: "420px", background: "#fff", border: "1px solid #dde6f0", borderRadius: "18px", padding: "28px", boxShadow: "0 12px 40px rgba(0,80,160,0.12)" }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "24px", color: "#1a6fba", marginBottom: "8px" }}>Đăng nhập CRM</div>
        <div style={{ fontSize: "13px", color: "#6080a0", lineHeight: 1.6, marginBottom: "18px" }}>
          Tài khoản đang vào: <b>{owner}</b><br />
          Username cố định là mã owner. Bạn chỉ cần nhập mật khẩu được admin cấp.
        </div>

        <Field label="Username">
          <Inp value={owner} onChange={() => {}} />
        </Field>
        <div style={{ height: "12px" }} />
        <Field label="Mật khẩu">
          <Inp value={password} onChange={setPassword} type="password" placeholder="Nhập mật khẩu" />
        </Field>

        {error && <div style={{ marginTop: "12px", background: "#fdecea", color: "#c0392b", borderRadius: "8px", padding: "10px 12px", fontSize: "12px" }}>{error}</div>}
        {!canFallbackToLocal && <div style={{ marginTop: "12px", background: "#fff8e6", color: "#b86e00", borderRadius: "8px", padding: "10px 12px", fontSize: "12px" }}>Chua thay mat khau local cho tai khoan nay. Hay dam bao admin da cau hinh trong trang tong va luu vao backend local.</div>}

        <div style={{ display: "flex", gap: "8px", marginTop: "18px" }}>
          <Btn blue type="submit" disabled={loading} style={{ flex: 1 }}>{loading ? "Đang kiểm tra..." : "Đăng nhập"}</Btn>
          <Btn onClick={onOpenSetup}>Hướng dẫn</Btn>
        </div>
      </form>
    </div>
  );
}

function AddDealOptionsModal({ preset, onSingleAdd, onImport, onClose }) {
  return (
    <Modal onClose={onClose}>
      <div style={{ width: "420px", maxWidth: "92vw" }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "18px", color: "#1a6fba", marginBottom: "10px" }}>Them data moi</div>
        <div style={{ fontSize: "13px", color: "#6080a0", lineHeight: 1.6, marginBottom: "16px" }}>
          Chon cach them deal moi. {preset.stage ? `Stage mac dinh: ${preset.stage}. ` : ""}{preset.pic ? `PIC mac dinh: ${preset.pic}.` : ""}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <button onClick={onSingleAdd} style={{ background: "#f0f7ff", border: "1px solid #b3d4f0", borderRadius: "12px", padding: "18px 14px", color: "#1a6fba", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            <div style={{ fontSize: "15px", fontWeight: "700", marginBottom: "6px" }}>Nhap tung deal</div>
            <div style={{ fontSize: "12px", color: "#6080a0", lineHeight: 1.5 }}>Mo form nhap tay dung nhu hien tai.</div>
          </button>
          <button onClick={onImport} style={{ background: "#f0fdf6", border: "1px solid #80d0a8", borderRadius: "12px", padding: "18px 14px", color: "#1a7a45", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            <div style={{ fontSize: "15px", fontWeight: "700", marginBottom: "6px" }}>Import Excel</div>
            <div style={{ fontSize: "12px", color: "#2a6a4a", lineHeight: 1.5 }}>Tai file mau, dien du lieu, roi upload mot lan.</div>
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
          <Btn onClick={onClose}>Dong</Btn>
        </div>
      </div>
    </Modal>
  );
}

function ImportDealsModal({ preset, ownerMode, onDownloadTemplate, onImport, onClose }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!file) {
      window.alert("Hay chon file Excel truoc.");
      return;
    }

    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
      onImport(rows, preset);
    } catch {
      window.alert("Khong doc duoc file Excel. Hay kiem tra dung dinh dang .xlsx hoac .xls.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div style={{ width: "500px", maxWidth: "94vw" }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "18px", color: "#1a6fba", marginBottom: "10px" }}>Import deal tu Excel</div>
        <div style={{ fontSize: "13px", color: "#6080a0", lineHeight: 1.6, marginBottom: "16px" }}>
          Tai file mau, dien du lieu theo dung cot, sau do upload lai. {preset.stage ? `Neu cot Stage de trong, he thong se uu tien stage ${preset.stage}. ` : ""}{ownerMode ? `PIC se tu khoa theo owner ${ownerMode}.` : ""}
        </div>

        <div style={{ background: "#f4f8fc", border: "1px solid #dde6f0", borderRadius: "12px", padding: "14px", marginBottom: "14px" }}>
          <div style={{ fontSize: "12px", color: "#1a2a3a", fontWeight: "700", marginBottom: "8px" }}>Buoc 1: Tai file mau</div>
          <Btn blue onClick={onDownloadTemplate}>Tai mau Excel</Btn>
        </div>

        <div style={{ background: "#fff", border: "1px solid #dde6f0", borderRadius: "12px", padding: "14px" }}>
          <div style={{ fontSize: "12px", color: "#1a2a3a", fontWeight: "700", marginBottom: "8px" }}>Buoc 2: Chon file da dien du lieu</div>
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontFamily: "inherit", fontSize: "12px" }} />
          {file && <div style={{ fontSize: "12px", color: "#6080a0", marginTop: "8px" }}>Da chon: {file.name}</div>}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
          <Btn onClick={onClose}>Dong</Btn>
          <Btn blue onClick={handleImport} disabled={loading}>{loading ? "Dang import..." : "Import du lieu"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function DealModal({ deal, ownerCodes, authConfig, onSave, onClose, ownerMode, isMaster, currentRole, currentTeam }) {
  const isNew = !deal.id;
  const initDate = deal.dataInputDate ? toDisplayDate(deal.dataInputDate) : isNew ? toDisplayDate(new Date().toISOString()) : "";
  const initMeeting = deal.lastMeeting ? toDisplayDate(deal.lastMeeting) : "";
  const sourceLegacy = parseLegacyLeadSource(deal?.lead_source || deal?.source);
  const [f, setF] = useState({ brand: "", contact: "", phone: "", ado: "", team: currentRole === DEFAULT_MASTER_ROLE ? "" : currentTeam, platform: [], stage: "Data Thô", pic: ownerMode || "", lead_source_type: sourceLegacy.lead_source_type, lead_source_detail: sourceLegacy.lead_source_detail, source: sourceLegacy.source, lead_source: sourceLegacy.source, value: "", maKH: "", bangGia: "", ...deal, deal_status: DEAL_STATUS_OPTIONS.includes(deal?.deal_status) ? deal.deal_status : "", notes: parseNotes(deal.notes) });
  const [dateInput, setDateInput] = useState(initDate);
  const [meetingInput, setMeetingInput] = useState(initMeeting);
  const [newNote, setNewNote] = useState("");
  const s = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const syncPicForMaster = (pic) => {
    const nextTeam = getAuthEntry(authConfig, pic, ownerCodes.filter((code) => code !== MASTER_OWNER)).team || "";
    setF((p) => ({ ...p, pic, team: currentRole === DEFAULT_MASTER_ROLE ? nextTeam : p.team }));
  };
  const togglePlatform = (p) => s("platform", f.platform.includes(p) ? f.platform.filter((x) => x !== p) : [...f.platform, p]);
  const addNote = () => {
    if (!newNote.trim()) return;
    s("notes", [...f.notes, { text: newNote.trim(), date: new Date().toISOString() }]);
    setNewNote("");
  };
  const isWin = f.stage === "Win";

  const handleSave = () => {
    if (!f.brand.trim()) return window.alert("Vui lòng nhập tên Brand!");
    const isoDate = toISODate(dateInput) || new Date().toISOString();
    const isoMeeting = toISODate(meetingInput) || "";
    const lead_source_type = normalizeLeadSourceType(f.lead_source_type);
    const lead_source_detail = normalizeLeadSourceDetail(f.lead_source_detail);
    const source = buildLeadSource(lead_source_type, lead_source_detail) || String(f.source || "").trim();
    onSave({ ...f, lead_source_type, lead_source_detail, lead_source: source, source, dataInputDate: isoDate, lastMeeting: isoMeeting });
  };

  return (
    <Modal onClose={onClose}>
      <div style={{ width: "640px", maxWidth: "94vw" }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "18px", color: "#1a6fba", marginBottom: "18px" }}>{isNew ? "✦ Thêm Deal Mới" : "✦ Chỉnh sửa Deal"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "13px" }}>
          <FormBlock title="Thông tin khách">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "13px" }}>
              <Field label="Tên Brand" span><Inp value={f.brand} onChange={(v) => s("brand", v)} placeholder="Ví dụ: Cafuné, Owen..." /></Field>
              <Field label="Người liên hệ"><Inp value={f.contact} onChange={(v) => s("contact", v)} placeholder="Tên người phụ trách" /></Field>
              <Field label="Số điện thoại"><Inp value={f.phone} onChange={(v) => s("phone", v)} placeholder="0901..." /></Field>
              <Field label="ADO"><Inp value={f.ado || ""} onChange={(v) => s("ado", v)} placeholder="Số đơn/ngày" type="number" /></Field>
              <Field label="Loại nguồn">
                <select
                  value={f.lead_source_type || ""}
                  onChange={(e) => {
                    const type = e.target.value;
                    s("lead_source_type", type);
                    if (!type) s("lead_source_detail", "");
                  }}
                  style={dropdownStyle(f.lead_source_type)}
                >
                  <option value="">Chọn loại nguồn...</option>
                  {LEAD_SOURCE_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </Field>
              <Field label="Nguồn chi tiết">
                <select
                  value={f.lead_source_detail || ""}
                  onChange={(e) => s("lead_source_detail", e.target.value)}
                  disabled={!f.lead_source_type}
                  style={{
                    ...dropdownStyle(f.lead_source_detail),
                    opacity: f.lead_source_type ? 1 : 0.6,
                    cursor: f.lead_source_type ? "pointer" : "not-allowed",
                  }}
                >
                  <option value="">Chọn nguồn chi tiết...</option>
                  {LEAD_SOURCE_DETAIL_OPTIONS.map((detail) => <option key={detail} value={detail}>{detail}</option>)}
                </select>
              </Field>
              <Field label="Platform">
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", minHeight: "44px", alignItems: "center" }}>
                  {PLATFORMS.map((p) => {
                    const active = f.platform.includes(p);
                    return <button key={p} onClick={() => togglePlatform(p)} style={{ background: active ? "#e8f3fc" : "#f4f8fc", border: `1.5px solid ${active ? "#90c0ef" : "#dde6f0"}`, borderRadius: "8px", padding: "5px 12px", color: active ? "#1a6fba" : "#90a8c0", fontSize: "12px", fontWeight: active ? "600" : "400", cursor: "pointer", fontFamily: "inherit" }}>{p}</button>;
                  })}
                </div>
              </Field>
              <Field label="Ngày nhập data"><Inp value={dateInput} onChange={setDateInput} placeholder="DD/MM/YYYY" /></Field>
              {(f.stage === "Warm" || f.stage === "Hot" || f.stage === "Win") && <Field label={`Gặp KH lần cuối ${MEETING_CADENCE[f.stage] ? `(cần gặp mỗi ${MEETING_CADENCE[f.stage]}n)` : ""}`}><Inp value={meetingInput} onChange={setMeetingInput} placeholder="DD/MM/YYYY" /></Field>}
            </div>
          </FormBlock>

          <FormBlock title="BD phụ trách">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "13px" }}>
              <Field label="BD P.I.C" span>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {ownerCodes.map((p) => {
                    const active = f.pic === p;
                    return <button key={p} onClick={() => (!ownerMode || isMaster) && syncPicForMaster(active ? "" : p)} style={{ background: active ? "#e8f3fc" : "#f4f8fc", border: `1.5px solid ${active ? "#90c0ef" : "#dde6f0"}`, borderRadius: "8px", padding: "5px 12px", color: active ? "#1a6fba" : "#90a8c0", fontSize: "12px", fontWeight: active ? "700" : "400", cursor: !ownerMode || isMaster ? "pointer" : "default", fontFamily: "inherit", opacity: ownerMode && !isMaster && !active ? 0.4 : 1 }}>{p}</button>;
                  })}
                </div>
              </Field>
              {currentRole === DEFAULT_MASTER_ROLE && (
                <Field label="Team">
                  <select value={f.team || ""} onChange={(e) => s("team", e.target.value)} style={dropdownStyle(f.team)}>
                    <option value="">Chọn team</option>
                    {TEAM_OPTIONS.map((team) => <option key={team} value={team}>{team}</option>)}
                  </select>
                </Field>
              )}
            </div>
          </FormBlock>

          <FormBlock title="Trạng thái deal" highlight>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "13px" }}>
              <Field label="Giai đoạn Pipeline">
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {STAGES.map((st) => {
                    const cfg = STAGE_CFG[st];
                    const active = f.stage === st;
                    const sla = SLA_DAYS[st];
                    return <button key={st} onClick={() => s("stage", st)} style={{ background: active ? cfg.badge : "#f4f8fc", border: `1.5px solid ${active ? cfg.border : "#dde6f0"}`, borderRadius: "8px", padding: "5px 12px", color: active ? cfg.color : "#90a8c0", fontSize: "12px", fontWeight: active ? "700" : "400", cursor: "pointer", fontFamily: "inherit" }}>{cfg.icon} {st}{sla ? <span style={{ fontSize: "9px", color: active ? cfg.color : "#b0c0d0", marginLeft: "3px" }}>({sla}n)</span> : null}</button>;
                  })}
                </div>
              </Field>
              <Field label="Deal Status">
                <select value={f.deal_status || ""} onChange={(e) => s("deal_status", e.target.value)} style={dropdownStyle(f.deal_status)}>
                  <option value="">Chọn trạng thái deal</option>
                  {DEAL_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </Field>
              <Field label="Giá trị dự kiến (VND)">
                <Inp value={f.value} onChange={(v) => s("value", v)} placeholder="50000000" type="number" />
              </Field>
              {isWin && (
                <>
                  <Field label="🆔 Mã Khách Hàng"><Inp value={f.maKH || ""} onChange={(v) => s("maKH", v)} placeholder="GIP-KH-001" /></Field>
                  <Field label="💼 Bảng Giá">
                    <select value={f.bangGia || ""} onChange={(e) => s("bangGia", e.target.value)} style={{ ...dropdownStyle(f.bangGia), background: "#e6f8ee", border: "1px solid #80d0a8", color: f.bangGia ? "#1a7a45" : "#90a8c0" }}>
                      <option value="">Chọn bảng giá...</option>
                      {BANG_GIA.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </Field>
                </>
              )}
            </div>
          </FormBlock>

          <FormBlock title="Ghi chú">
            <div style={{ display: "flex", gap: "6px", marginBottom: "8px", alignItems: "stretch" }}>
              <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); } }} placeholder="Nhập ghi chú → Enter để lưu..." rows={3} style={{ background: "#f4f8fc", border: "1px solid #c8ddf0", borderRadius: "8px", padding: "10px 12px", color: "#1a2a3a", fontSize: "13px", flex: 1, outline: "none", fontFamily: "inherit", resize: "vertical", minHeight: "84px" }} />
              <button onClick={addNote} style={{ background: "linear-gradient(135deg,#1a6fba,#2196f3)", border: "none", borderRadius: "8px", padding: "8px 14px", color: "#fff", fontWeight: "700", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>➕ Thêm</button>
            </div>
            {f.notes.length > 0 ? (
              <div style={{ background: "#f4f8fc", borderRadius: "10px", padding: "10px", maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
                {[...f.notes].reverse().map((n, i) => (
                  <div key={`${n.date}-${i}`} style={{ background: "#fff", borderRadius: "8px", padding: "8px 10px", border: "1px solid #dde6f0", position: "relative" }}>
                    <div style={{ fontSize: "9px", color: "#90a8c0", marginBottom: "3px" }}>🕐 {fmtDT(n.date)}</div>
                    <div style={{ fontSize: "12px", color: "#1a2a3a", lineHeight: 1.5, paddingRight: "20px" }}>{n.text}</div>
                    <button onClick={() => s("notes", f.notes.filter((_, idx) => f.notes.length - 1 - i !== idx))} style={{ position: "absolute", top: "6px", right: "6px", background: "transparent", border: "none", color: "#f0a898", cursor: "pointer", fontSize: "11px" }}>✕</button>
                  </div>
                ))}
              </div>
            ) : <div style={{ fontSize: "11px", color: "#c0cfd8", textAlign: "center", padding: "12px 0" }}>Chưa có ghi chú</div>}
          </FormBlock>
        </div>

        {!isNew && f.createdAt && <div style={{ fontSize: "11px", color: "#a0b8d0", marginTop: "12px" }}>📅 Tạo: {fmtDate(f.createdAt)} · Cập nhật: {fmtDate(f.updatedAt)}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
          <Btn onClick={onClose}>Huỷ</Btn>
          <Btn blue onClick={handleSave}>{isNew ? "Tạo Deal" : "Lưu thay đổi"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function SetupModal({ currentAccount, isMaster, ownerCodes, authConfig, telegramConfig, followupConfig, backendReady, onSave, onTestTelegram, onRunScan, onDownloadBackup, onRestoreBackup, onSyncFromOnline, onClose }) {
  const [localOwnerRows, setLocalOwnerRows] = useState(() => makeOwnerRows(ownerCodes));
  const [localAuth, setLocalAuth] = useState(() => normalizeAuthConfig(authConfig, ownerCodes));
  const [localTelegram, setLocalTelegram] = useState(() => normalizeTelegramConfig(telegramConfig, ownerCodes));
  const [localFollowup, setLocalFollowup] = useState(() => normalizeFollowupConfig(followupConfig));
  const [restoreFile, setRestoreFile] = useState(null);
  const localOwners = localOwnerRows.map((row) => row.code);
  const allLocalOwners = buildAllOwnerCodes(localOwners);
  const visibleTelegramOwners = isMaster ? [MASTER_OWNER] : [currentAccount];
  const ownerLinks = allLocalOwners.map((p) => ({
    pic: p,
    url: p === MASTER_OWNER ? `${window.location.origin}${window.location.pathname}` : `${window.location.origin}${window.location.pathname}?owner=${p}`,
  }));

  useEffect(() => {
    setLocalAuth((prev) => normalizeAuthConfig(prev, localOwners));
    setLocalTelegram((prev) => normalizeTelegramConfig(prev, localOwners));
  }, [localOwners]);

  const renameOwnerCode = (rowId, nextValue) => {
    const currentRow = localOwnerRows.find((row) => row.id === rowId);
    const previousCode = currentRow?.code || "";
    const nextCode = String(nextValue || "").toUpperCase().replace(/\s+/g, "");
    setLocalOwnerRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, code: nextCode } : row)));
    if (previousCode && nextCode && previousCode !== nextCode) {
      setLocalAuth((prev) => {
        const next = { ...prev, [nextCode]: prev[previousCode] || "" };
        delete next[previousCode];
        return next;
      });
      setLocalTelegram((prev) => {
        const next = { ...prev, [nextCode]: prev[previousCode] || { botToken: "", chatId: "" } };
        delete next[previousCode];
        return next;
      });
    }
  };

  const handleSave = () => {
    const normalizedOwners = normalizeOwnerCodes(localOwners);
    if (!normalizedOwners.length) {
      window.alert("Cần ít nhất 1 mã owner con.");
      return;
    }
    if (normalizedOwners.length !== localOwners.filter((code) => String(code || "").trim()).length) {
      window.alert("Có mã owner đang để trống. Hãy điền đầy đủ trước khi lưu.");
      return;
    }
    if (new Set(normalizedOwners).size !== normalizedOwners.length) {
      window.alert("Danh sách mã owner đang bị trùng. Hãy sửa lại trước khi lưu.");
      return;
    }

    onSave({
      nextOwnerCodes: normalizedOwners,
      nextAuthConfig: localAuth,
      nextTelegramConfig: localTelegram,
      nextFollowupConfig: localFollowup,
    });
  };

  return (
    <Modal onClose={onClose}>
      <div style={{ width: "560px", maxWidth: "93vw" }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "18px", color: "#1a6fba", marginBottom: "14px" }}>Cài đặt hệ thống</div>

        <div style={{ background: backendReady ? "#f0fdf6" : "#fff5f4", border: `1px solid ${backendReady ? "#80d0a8" : "#f0a898"}`, borderRadius: "10px", padding: "14px", marginBottom: "14px" }}>
          <div style={{ fontSize: "12px", color: backendReady ? "#1a7a45" : "#c0392b", fontWeight: "700", marginBottom: "6px" }}>{backendReady ? "Backend local đang kết nối" : "Backend local chưa kết nối"}</div>
          <div style={{ fontSize: "11px", color: backendReady ? "#2a6a4a" : "#8f4b47", lineHeight: 1.6 }}>
            {backendReady
              ? <>CRM đang kết nối backend realtime. Ở local có thể bật lại bằng <b>start-crm.ps1</b>; khi deploy online, app sẽ dùng cùng domain với backend.</>
              : <>CRM chưa kết nối được backend. Nếu đang chạy local, bật lại bằng <b>start-crm.ps1</b>. Khi deploy online, frontend sẽ tự gọi API cùng domain.</>}
          </div>
        </div>

        {isMaster && (
          <div style={{ background: "#f0f7ff", border: "1px solid #c8ddf0", borderRadius: "10px", padding: "14px", marginBottom: "14px" }}>
            <div style={{ fontSize: "11px", color: "#1a6fba", fontWeight: "600", marginBottom: "10px" }}>Link cho từng owner:</div>
            {ownerLinks.map(({ pic, url: ownerUrl }) => (
              <div key={pic} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <span style={{ fontSize: "11px", fontWeight: "700", color: "#1a6fba", minWidth: "70px" }}>{pic}:</span>
                <span style={{ fontSize: "10px", color: "#6080a0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ownerUrl}</span>
                <button onClick={() => navigator.clipboard.writeText(ownerUrl)} style={{ background: "#e8f3fc", border: "1px solid #b3d4f0", borderRadius: "5px", padding: "2px 8px", color: "#1a6fba", fontSize: "10px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Copy</button>
              </div>
            ))}
          </div>
        )}

        {isMaster && (
          <div style={{ background: "#fff8e6", border: "1px solid #f0cc80", borderRadius: "10px", padding: "14px", marginBottom: "14px" }}>
            <div style={{ fontSize: "11px", color: "#b86e00", fontWeight: "700", marginBottom: "10px" }}>Tài khoản owner, vai trò và team</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "10px" }}>
              {allLocalOwners.map((pic) => (
                <div key={pic}>
                  <div style={{ fontSize: "11px", color: "#6080a0", marginBottom: "4px", fontWeight: "600" }}>{pic}</div>
                  <div style={{ display: "grid", gap: "6px" }}>
                    <Inp type="text" value={localAuth[pic]?.password || ""} onChange={(value) => setLocalAuth((prev) => ({ ...prev, [pic]: { ...prev[pic], password: value } }))} placeholder={`Mật khẩu cho ${pic}`} />
                    <select
                      value={localAuth[pic]?.role || (pic === MASTER_OWNER ? DEFAULT_MASTER_ROLE : DEFAULT_USER_ROLE)}
                      onChange={(e) => setLocalAuth((prev) => ({ ...prev, [pic]: { ...prev[pic], role: pic === MASTER_OWNER ? DEFAULT_MASTER_ROLE : e.target.value } }))}
                      disabled={pic === MASTER_OWNER}
                      style={dropdownStyle(localAuth[pic]?.role)}
                    >
                      {(pic === MASTER_OWNER ? [DEFAULT_MASTER_ROLE] : [DEFAULT_USER_ROLE, DEFAULT_MANAGER_ROLE]).map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                    <select
                      value={localAuth[pic]?.team || ""}
                      onChange={(e) => setLocalAuth((prev) => ({ ...prev, [pic]: { ...prev[pic], team: pic === MASTER_OWNER ? "" : e.target.value } }))}
                      disabled={pic === MASTER_OWNER}
                      style={dropdownStyle(localAuth[pic]?.team)}
                    >
                      <option value="">{pic === MASTER_OWNER ? "Không áp dụng team" : "Chọn team"}</option>
                      {TEAM_OPTIONS.map((team) => <option key={team} value={team}>{team}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: "11px", color: "#8a6d1f", lineHeight: 1.6, marginTop: "10px" }}>
              Username cố định là mã owner như <b>GIP01</b>, <b>GIP02</b>. USER chỉ thấy deal của mình, MANAGER thấy deal theo team, MASTER thấy toàn bộ dữ liệu.
            </div>
          </div>
        )}

        <div style={{ background: "#f0fdf6", border: "1px solid #80d0a8", borderRadius: "10px", padding: "14px", marginBottom: "14px" }}>
          <div style={{ fontSize: "11px", color: "#1a7a45", fontWeight: "700", marginBottom: "10px" }}>{isMaster ? "Telegram của tài khoản master" : `Telegram của ${currentAccount}`}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {visibleTelegramOwners.map((pic) => (
              <div key={pic} style={{ background: "#fff", border: "1px solid #d7efe0", borderRadius: "10px", padding: "10px" }}>
                <div style={{ fontSize: "12px", color: "#1a7a45", fontWeight: "700", marginBottom: "8px" }}>{pic}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <div style={{ fontSize: "10px", color: "#6a8b78", marginBottom: "4px", fontWeight: "600" }}>Bot Token</div>
                    <Inp value={localTelegram[pic]?.botToken || ""} onChange={(value) => setLocalTelegram((prev) => ({ ...prev, [pic]: { ...prev[pic], botToken: value } }))} placeholder="123456:AA..." />
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: "#6a8b78", marginBottom: "4px", fontWeight: "600" }}>Chat ID</div>
                    <Inp value={localTelegram[pic]?.chatId || ""} onChange={(value) => setLocalTelegram((prev) => ({ ...prev, [pic]: { ...prev[pic], chatId: value } }))} placeholder="123456789 hoặc -100..." />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                    <Btn onClick={() => onTestTelegram(pic, localTelegram[pic])}>Test {pic}</Btn>
                  </div>
                </div>
              ))}
          </div>
          <div style={{ fontSize: "11px", color: "#2a6a4a", lineHeight: 1.6, marginTop: "10px" }}>
            {isMaster
              ? <>Master không xem hoặc sửa được token/chat ID của các owner con. Mỗi owner sẽ tự cấu hình Telegram trên link riêng của mình.</>
              : <>Chỉ tài khoản <b>{currentAccount}</b> mới nhìn thấy và tự sửa bot token/chat ID của chính mình. Khi deal của bạn quá hạn, backend local sẽ gửi cảnh báo vào đúng Telegram này.</>}
          </div>
        </div>

        {isMaster && (
          <div style={{ background: "#f4f8fc", border: "1px solid #dde6f0", borderRadius: "10px", padding: "14px", marginBottom: "14px" }}>
            <div style={{ fontSize: "11px", color: "#1a6fba", fontWeight: "700", marginBottom: "10px" }}>Quản lý mã owner con</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {localOwnerRows.map((row) => (
                <div key={row.id} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <Inp value={row.code} onChange={(value) => renameOwnerCode(row.id, value)} placeholder="GIP07" />
                  <Btn onClick={() => setLocalOwnerRows((prev) => prev.filter((item) => item.id !== row.id))} style={{ color: "#c0392b", borderColor: "#f0a898" }}>Xoá</Btn>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px", gap: "8px", flexWrap: "wrap" }}>
              <div style={{ fontSize: "11px", color: "#6080a0" }}>GIPMANA là tài khoản master cố định. Bạn có thể thêm, đổi tên hoặc xoá các mã con ở đây.</div>
              <Btn onClick={() => setLocalOwnerRows((prev) => [...prev, createOwnerRow(`GIP${String(prev.length + 1).padStart(2, "0")}`)])}>+ Thêm mã con</Btn>
            </div>
          </div>
        )}

        {isMaster && (
          <div style={{ background: "#fff5f4", border: "1px solid #f0a898", borderRadius: "10px", padding: "14px", marginBottom: "14px" }}>
            <div style={{ fontSize: "11px", color: "#c0392b", fontWeight: "700", marginBottom: "10px" }}>Giờ phải có ghi chú tiếp theo</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "10px" }}>
              {STAGES.map((stage) => (
                <div key={stage}>
                  <div style={{ fontSize: "11px", color: "#6080a0", marginBottom: "4px", fontWeight: "600" }}>{stage}</div>
                  <Inp type="number" value={String(localFollowup[stage] ?? 0)} onChange={(value) => setLocalFollowup((prev) => ({ ...prev, [stage]: Number(value) >= 0 ? Number(value) : 0 }))} placeholder="Số giờ" />
                </div>
              ))}
            </div>
            <div style={{ fontSize: "11px", color: "#8f4b47", lineHeight: 1.6, marginTop: "10px" }}>
              Nếu lead ở stage hiện tại quá số giờ này mà chưa có ghi chú mới, lead sẽ vào tab <b>Cảnh báo</b> và backend sẽ đưa vào luồng nhắc Telegram.
            </div>
          </div>
        )}

        <div style={{ background: "#f4f8fc", border: "1px solid #dde6f0", borderRadius: "10px", padding: "14px", marginBottom: "14px" }}>
          <div style={{ fontSize: "11px", color: "#1a6fba", fontWeight: "700", marginBottom: "8px" }}>Hướng dẫn Telegram nhanh</div>
          <div style={{ fontSize: "11px", color: "#6080a0", lineHeight: 1.6 }}>
            1. Tạo bot bằng <b>@BotFather</b> và lấy token.<br />
            2. Mỗi owner nhắn <b>/start</b> cho bot và lấy chat ID.<br />
            3. Điền token + chat ID vào đây, bấm <b>Lưu cấu hình</b>.<br />
            4. Backend local sẽ tự quét cảnh báo mỗi 1 phút và gửi Telegram khi có deal quá hạn.
          </div>
        </div>

        {isMaster && (
          <div style={{ background: "#f8fbff", border: "1px solid #c8ddf0", borderRadius: "10px", padding: "14px", marginBottom: "14px" }}>
            <div style={{ fontSize: "11px", color: "#1a6fba", fontWeight: "700", marginBottom: "10px" }}>Data Backup / Restore</div>
            <div style={{ fontSize: "11px", color: "#6080a0", lineHeight: 1.6, marginBottom: "10px" }}>
              Backup sẽ xuất toàn bộ raw data để khôi phục CRM thật sự, đồng thời backend cũng tự ghi một file local trong thư mục <b>backups/</b>.
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "10px" }}>
              <Btn blue onClick={onDownloadBackup}>Tải backup ngay</Btn>
              <Btn onClick={onSyncFromOnline}>Sync dữ liệu từ Online</Btn>
            </div>
            <div style={{ background: "#fff", border: "1px solid #dde6f0", borderRadius: "10px", padding: "12px" }}>
              <div style={{ fontSize: "11px", color: "#1a2a3a", fontWeight: "700", marginBottom: "8px" }}>Khôi phục từ file backup</div>
              <input type="file" accept=".json,application/json" onChange={(e) => setRestoreFile(e.target.files?.[0] || null)} style={{ fontFamily: "inherit", fontSize: "12px" }} />
              {restoreFile && <div style={{ fontSize: "11px", color: "#6080a0", marginTop: "8px" }}>Đã chọn: {restoreFile.name}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
                <Btn onClick={() => onRestoreBackup(restoreFile)} style={{ color: "#c0392b", borderColor: "#f0a898" }}>Khôi phục từ file backup</Btn>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
          {isMaster && <Btn onClick={onRunScan}>Quét cảnh báo</Btn>}
          <Btn onClick={onClose}>Đóng</Btn>
          <Btn blue onClick={handleSave}>Lưu cấu hình</Btn>
        </div>
      </div>
    </Modal>
  );
}


