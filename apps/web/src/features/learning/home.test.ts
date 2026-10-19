import { describe, expect, it } from "vitest";
import { appHref, baselineRows } from "./home";

describe("Home cards", () => {
  it("lists the Day-1 baseline per pillar", () => {
    const rows = baselineRows({ understand: 3.25, communicate: 2, own: null, stand_firm: 4.5 });
    expect(rows.map((row) => row.name)).toEqual(["Understand", "Communicate", "Own", "Stand firm"]);
    expect(rows.map((row) => row.value)).toEqual(["3.3", "2.0", "—", "4.5"]);
    expect(rows.map((row) => row.percent)).toEqual([65, 40, 0, 90]);
  });

  it("keeps feedback links inside the app", () => {
    expect(appHref("/app/day/2/quiz")).toBe("/app/day/2/quiz");
    expect(appHref("https://example.com")).toBe("/app/progress");
    expect(appHref("javascript:alert(1)")).toBe("/app/progress");
  });
});
