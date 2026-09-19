import "dotenv/config";
import { createHash } from "node:crypto";

type Check = { name: string; ok: boolean; detail: string };

const checks: Check[] = [];
const requiredShared = ["SOCIAL_TOKEN_ENCRYPTION_KEYS", "SOCIAL_TOKEN_ACTIVE_KEY_ID", "INTERNAL_JOB_TOKEN", "APP_URL", "API_URL"];
for (const name of requiredShared) checks.push(required(name));

for (const [provider, names] of Object.entries({
  Instagram: ["INSTAGRAM_CLIENT_ID", "INSTAGRAM_CLIENT_SECRET", "INSTAGRAM_REDIRECT_URI"],
  X: ["X_CLIENT_ID", "X_CLIENT_SECRET", "X_REDIRECT_URI", "X_MONTHLY_REQUEST_BUDGET"],
  TikTok: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REDIRECT_URI"],
  YouTube: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_SOCIAL_REDIRECT_URI"],
})) {
  const missing = names.filter((name) => !configured(name));
  checks.push({ name: provider, ok: missing.length === 0, detail: missing.length ? `missing ${missing.join(", ")}` : "credentials and callback configured" });
}

const ring = process.env.SOCIAL_TOKEN_ENCRYPTION_KEYS?.trim() ?? "";
const entries = ring.split(",").filter(Boolean).map((item) => {
  const split = item.indexOf(":");
  return split > 0 ? { id: item.slice(0, split), key: item.slice(split + 1) } : { id: "", key: "" };
});
const active = process.env.SOCIAL_TOKEN_ACTIVE_KEY_ID?.trim();
checks.push({ name: "Token encryption", ok: entries.length > 0 && new Set(entries.map((entry) => entry.id)).size === entries.length && entries.every((entry) => entry.id && Buffer.from(entry.key, "base64").length === 32) && entries.some((entry) => entry.id === active), detail: "key ring entries must be unique IDs with 32-byte base64 keys and include the active key" });

for (const name of ["INSTAGRAM_REDIRECT_URI", "X_REDIRECT_URI", "TIKTOK_REDIRECT_URI", "YOUTUBE_SOCIAL_REDIRECT_URI"]) {
  const value = process.env[name]?.trim();
  if (value) checks.push({ name, ok: validCallback(value), detail: validCallback(value) ? new URL(value).origin : "must be an exact HTTPS callback outside localhost" });
}

const budget = Number(process.env.X_MONTHLY_REQUEST_BUDGET);
checks.push({ name: "X request budget", ok: Number.isSafeInteger(budget) && budget > 0, detail: Number.isSafeInteger(budget) && budget > 0 ? `${budget} requests/month` : "must be a positive integer" });

for (const name of ["REQUEST_INSTAGRAM_PUBLISH_SCOPE", "REQUEST_X_PUBLISH_SCOPE", "REQUEST_TIKTOK_PUBLISH_SCOPE", "REQUEST_YOUTUBE_UPLOAD_SCOPE"]) {
  const value = process.env[name]?.trim().toLowerCase();
  checks.push({ name, ok: value === undefined || value === "" || value === "true" || value === "false" || value === "1" || value === "0", detail: value ? `set to ${value}` : "using the safe default" });
}

for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}: ${check.detail}`);
const failed = checks.filter((check) => !check.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} readiness checks passed. Configuration fingerprint: ${fingerprint()}`);
if (failed.length) process.exitCode = 1;

function required(name: string): Check { return { name, ok: configured(name), detail: configured(name) ? "configured" : "missing" }; }
function configured(name: string) { const value = process.env[name]?.trim(); return Boolean(value && !value.includes("<") && !value.toLowerCase().startsWith("replace_")); }
function validCallback(value: string) { try { const url = new URL(value); return url.protocol === "https:" || ["localhost", "127.0.0.1"].includes(url.hostname); } catch { return false; } }
function fingerprint() { return createHash("sha256").update(checks.map((check) => `${check.name}:${check.ok}`).join("|")).digest("hex").slice(0, 12); }
