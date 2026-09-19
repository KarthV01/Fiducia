import { describe, expect, it } from "vitest";
import { AUTO_SETTLEMENT_METRICS } from "../src/accounts/constants.js";
import { confirmationsMeetThreshold } from "../src/social/measurementService.js";

describe("trusted social measurements", () => {
  it("requires two threshold observations separated by the confirmation window", () => {
    const now = new Date("2026-09-18T12:00:00.000Z");
    expect(confirmationsMeetThreshold([{ value: "100", observedAt: now }], "100")).toBe(false);
    expect(confirmationsMeetThreshold([
      { value: "100", observedAt: now },
      { value: "100", observedAt: new Date(now.getTime() - 10 * 60_000) },
    ], "100")).toBe(false);
    expect(confirmationsMeetThreshold([
      { value: "100", observedAt: now },
      { value: "99", observedAt: new Date(now.getTime() - 60 * 60_000) },
    ], "100")).toBe(false);
    expect(confirmationsMeetThreshold([
      { value: "125", observedAt: now },
      { value: "100", observedAt: new Date(now.getTime() - 60 * 60_000) },
    ], "100")).toBe(true);
  });

  it("allowlists provider metrics but excludes external conversion simulations", () => {
    expect(AUTO_SETTLEMENT_METRICS.has("instagram.media.views")).toBe(true);
    expect(AUTO_SETTLEMENT_METRICS.has("x.post.impression")).toBe(true);
    expect(AUTO_SETTLEMENT_METRICS.has("tiktok.video.views")).toBe(true);
    expect(AUTO_SETTLEMENT_METRICS.has("youtube.video.views")).toBe(true);
    expect(AUTO_SETTLEMENT_METRICS.has("shopify.referral.conversions")).toBe(false);
  });
});
