import { describe, expect, it } from "vitest";
import { finalOutcome } from "./final-review.js";

describe("final review decision", () => {
  it("checks Client-ready, then Ready with light support, then Another cycle", () => {
    expect(finalOutcome({ "1": 4, "2": 3, "3": 4 })).toBe("client_ready"); // 3.67, lowest 3
    expect(finalOutcome({ "1": 5, "2": 5, "3": 2 })).toBe("light_support"); // 4.0 but a 2
    expect(finalOutcome({ "1": 3, "2": 3 })).toBe("light_support");
    expect(finalOutcome({ "1": 3, "2": 2, "3": null })).toBe("another_cycle"); // 2.5
    expect(finalOutcome({ "1": null })).toBeNull();
  });
});
