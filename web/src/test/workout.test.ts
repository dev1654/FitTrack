import type { LastTime, SetEntry, Template } from "../lib/api";
import { relativeDay, todayISO } from "../lib/dates";
import { displayToKg, formatWeight, kgToDisplay } from "../lib/units";
import { nextSetDefaults, summarizeSets, workoutExercises } from "../lib/workout";
import { muscleBalance, weeklyTotals } from "../pages/ProgressPage";

const set = (id: number, exercise_id: number, reps: number | null, weight_kg: number | null): SetEntry => ({
  id, exercise_id, set_number: id, reps, weight_kg, duration_seconds: null, distance_m: null,
});

const template = {
  id: 1, name: "Push", description: null, category: null, is_builtin: true,
  exercises: [
    { id: 1, position: 1, target_sets: 3, target_reps: 8, exercise: { id: 10, name: "Bench", muscle_group: "chest", category: "strength" } },
    { id: 2, position: 2, target_sets: 3, target_reps: 12, exercise: { id: 11, name: "Fly", muscle_group: "chest", category: "strength" } },
  ],
} as Template;

describe("workoutExercises", () => {
  it("orders template, then logged extras, then added", () => {
    const sets = [set(5, 30, 10, 20), set(6, 10, 8, 60)];
    const plan = workoutExercises(template, sets, [40, 10]);
    expect(plan.map((p) => p.exerciseId)).toEqual([10, 11, 30, 40]);
    expect(plan[0].target).toEqual({ sets: 3, reps: 8 });
    expect(plan.map((p) => p.added)).toEqual([false, false, false, true]);
  });
});

describe("summarizeSets", () => {
  it("collapses a shared weight", () => {
    expect(summarizeSets([set(1, 1, 8, 60), set(2, 1, 8, 60), set(3, 1, 6, 60)], "kg")).toBe("60 kg: 8, 8, 6");
  });
  it("lists mixed weights", () => {
    expect(summarizeSets([set(1, 1, 5, 100), set(2, 1, 3, 110)], "kg")).toBe("5 × 100 kg, 3 × 110 kg");
  });
  it("handles bodyweight and pounds", () => {
    expect(summarizeSets([set(1, 1, 10, null), set(2, 1, 8, null)], "kg")).toBe("10, 8 reps");
    expect(summarizeSets([set(1, 1, 5, 100)], "lb")).toBe("220.5 lb: 5");
  });
});

describe("nextSetDefaults", () => {
  const last = {
    exercise_id: 10, last_date: "2026-10-01", sets: [],
    suggestion: { weight_kg: 62.5, reps: 8, reason: "" },
  } as LastTime;

  it("starts from the suggestion", () => {
    expect(nextSetDefaults([], last, { reps: 8 }, "kg")).toEqual({ weight: "62.5", reps: "8" });
  });
  it("then repeats the previous set's weight", () => {
    expect(nextSetDefaults([set(1, 10, 6, 65)], last, { reps: 8 }, "kg")).toEqual({ weight: "65", reps: "8" });
  });
  it("falls back to the target with no history", () => {
    expect(nextSetDefaults([], undefined, { reps: 5 }, "kg")).toEqual({ weight: "", reps: "5" });
  });
});

describe("units and dates", () => {
  it("round-trips kg and lb", () => {
    expect(kgToDisplay(100, "lb")).toBe(220.5);
    expect(displayToKg(225, "lb")).toBe(102.06);
    expect(formatWeight(null, "kg")).toBe("Bodyweight");
  });
  it("describes recent days", () => {
    expect(relativeDay("2026-10-20", "2026-10-20")).toBe("Today");
    expect(relativeDay("2026-10-19", "2026-10-20")).toBe("Yesterday");
    expect(relativeDay("2026-10-17", "2026-10-20")).toBe("3 days ago");
    expect(todayISO(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("progress aggregations", () => {
  const rows = [
    { week_start: "2026-10-05", muscle_group: "chest", total_volume_kg: 1000 },
    { week_start: "2026-10-05", muscle_group: "back", total_volume_kg: 500 },
    { week_start: "2026-10-12", muscle_group: "chest", total_volume_kg: 200 },
    { week_start: "2026-08-03", muscle_group: "quads", total_volume_kg: 900 },
  ];
  it("totals by week", () => {
    expect(weeklyTotals(rows).get("2026-10-05")).toBe(1500);
  });
  it("ranks muscle groups since a date", () => {
    expect(muscleBalance(rows, "2026-09-22")).toEqual([
      { group: "chest", kg: 1200 },
      { group: "back", kg: 500 },
    ]);
  });
});
