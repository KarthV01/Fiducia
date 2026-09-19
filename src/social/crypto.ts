import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type KeyEntry = { id: string; value: Buffer };

export function encryptSocialSecret(plaintext: string) {
  const active = keyRing().find((entry) => entry.id === activeKeyId());
  if (!active) throw new Error(`SOCIAL_TOKEN_ACTIVE_KEY_ID does not identify a configured key.`);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", active.value, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    keyId: active.id,
    ciphertext: ["v2", active.id, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join("."),
  };
}

export function decryptSocialSecret(envelope: string, legacyKeyId?: string | null) {
  const parts = envelope.split(".");
  if (parts[0] === "v2" && parts.length === 5) {
    const [, id, iv, tag, ciphertext] = parts;
    return decryptWith(id, iv, tag, ciphertext);
  }
  if (parts[0] === "v1" && parts.length === 4) {
    const [, iv, tag, ciphertext] = parts;
    return decryptWith(legacyKeyId ?? "legacy-youtube", iv, tag, ciphertext);
  }
  throw new Error("Invalid encrypted secret envelope.");
}

function decryptWith(id: string, iv: string, tag: string, ciphertext: string) {
  const entry = keyRing().find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Encryption key ${id} is unavailable.`);
  const decipher = createDecipheriv("aes-256-gcm", entry.value, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

function activeKeyId() {
  return process.env.SOCIAL_TOKEN_ACTIVE_KEY_ID?.trim() || (process.env.SOCIAL_TOKEN_ENCRYPTION_KEYS?.trim() ? keyRing()[0]?.id : "legacy-youtube");
}

function keyRing(): KeyEntry[] {
  const configured = process.env.SOCIAL_TOKEN_ENCRYPTION_KEYS?.trim();
  const entries: KeyEntry[] = configured
    ? configured.split(",").map((item) => {
        const separator = item.indexOf(":");
        if (separator <= 0) throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEYS must use key-id:base64-key entries.");
        return { id: item.slice(0, separator).trim(), value: Buffer.from(item.slice(separator + 1).trim(), "base64") };
      })
    : [];
  const legacy = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY?.trim();
  if (legacy && !entries.some((entry) => entry.id === "legacy-youtube")) entries.push({ id: "legacy-youtube", value: Buffer.from(legacy, "base64") });
  if (!entries.length || entries.some((entry) => entry.value.length !== 32)) {
    throw new Error("Configure SOCIAL_TOKEN_ENCRYPTION_KEYS with base64-encoded 32-byte keys.");
  }
  return entries;
}
