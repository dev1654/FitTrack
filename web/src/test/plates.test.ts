import { plateLoadout } from "../lib/plates";

const labels = (target: number, unit: "kg" | "lb") =>
  plateLoadout(target, unit)?.perSide.map((p) => p.label);

describe("plateLoadout", () => {
  it("loads the biggest plates first", () => {
    expect(labels(100, "kg")).toEqual(["25", "15"]);
    expect(labels(62.5, "kg")).toEqual(["20", "1.25"]);
    expect(labels(140, "kg")).toEqual(["25", "25", "10"]);
  });

  it("handles pounds with a 45 lb bar", () => {
    expect(labels(135, "lb")).toEqual(["45"]);
    expect(labels(225, "lb")).toEqual(["45", "45"]);
    expect(labels(185, "lb")).toEqual(["45", "25"]);
  });

  it("returns an empty bar at bar weight and nothing below it", () => {
    expect(labels(20, "kg")).toEqual([]);
    expect(plateLoadout(15, "kg")).toBeNull();
  });

  it("reports when a target can't be loaded exactly", () => {
    const l = plateLoadout(61, "kg")!;
    expect(l.exact).toBe(false);
    expect(l.total).toBe(60);
    expect(plateLoadout(62.5, "kg")!.exact).toBe(true);
  });
});
