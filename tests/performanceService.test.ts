import { describe, expect, it } from "vitest";
import { meteredEarned } from "../src/services/performanceService.js";

describe("metered performance earnings", () => {
  it("counts only complete eligible thousand-view blocks", () => {
    expect(meteredEarned("10999", "9000", "250000", "2000000")).toBe("250000");
  });

  it("caps earnings and returns zero below the starting threshold", () => {
    expect(meteredEarned("8000", "9000", "250000", "1000000")).toBe("0");
    expect(meteredEarned("100000", "9000", "250000", "1000000")).toBe("1000000");
  });
});
