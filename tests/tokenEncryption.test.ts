import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/services/tokenEncryption.js";

const previous = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
afterEach(() => { if (previous === undefined) delete process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY; else process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = previous; });

describe("YouTube token encryption", () => {
  it("round-trips refresh tokens without storing plaintext", () => {
    process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptSecret("refresh-token-secret");
    expect(encrypted).not.toContain("refresh-token-secret");
    expect(decryptSecret(encrypted)).toBe("refresh-token-secret");
  });
});
