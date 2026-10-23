/** Pure helpers for the workout screen (unit-tested). */
import type { LastTime, SetEntry, Template, Unit } from "./api";
import { formatDistance, formatDuration, formatNumber, kgToDisplay } from "./units";

export type PlannedExercise = {
  exerciseId: number;
  target?: { sets: number; reps: number };
  /** Added by hand in this workout (can be removed while it has no sets). */
  added: boolean;
};

/**
 * Exercise order for a workout: the template's exercises first, then anything logged that
 * isn't in the template (in the order it was first logged), then exercises added by hand.
 */
export function workoutExercises(
  template: Template | undefined,
  sets: SetEntry[],
  addedIds: number[],
): PlannedExercise[] {
  const out: PlannedExercise[] = [];
  const seen = new Set<number>();
  for (const te of template?.exercises ?? []) {
    if (seen.has(te.exercise.id)) continue;
    seen.add(te.exercise.id);
    out.push({
      exerciseId: te.exercise.id,
      target: { sets: te.target_sets, reps: te.target_reps },
      added: false,
    });
  }
  for (const s of [...sets].sort((a, b) => a.id - b.id)) {
    if (seen.has(s.exercise_id)) continue;
    seen.add(s.exercise_id);
    out.push({ exerciseId: s.exercise_id, added: false });
  }
  for (const id of addedIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ exerciseId: id, added: true });
  }
  return out;
}

type SetLike = Pick<SetEntry, "reps" | "weight_kg" | "duration_seconds" | "distance_m">;

/** "60 kg: 8, 8, 6" when the weight is the same, else "8 × 60 kg, 6 × 62.5 kg". */
export function summarizeSets(sets: SetLike[], unit: Unit): string {
  if (sets.length === 0) return "";
  const cardio = sets.every((s) => s.reps == null && s.weight_kg == null);
  if (cardio) {
    return sets
      .map((s) => [formatDuration(s.duration_seconds), formatDistance(s.distance_m)].filter(Boolean).join(", "))
      .join("; ");
  }
  const weights = sets.map((s) => (s.weight_kg == null ? null : kgToDisplay(s.weight_kg, unit)));
  const same = weights.every((w) => w === weights[0]);
  if (same) {
    const reps = sets.map((s) => s.reps ?? 0).join(", ");
    return weights[0] == null ? `${reps} reps` : `${formatNumber(weights[0])} ${unit}: ${reps}`;
  }
  return sets
    .map((s, i) =>
      weights[i] == null ? `${s.reps} reps` : `${s.reps} × ${formatNumber(weights[i]!)} ${unit}`,
    )
    .join(", ");
}

/** Starting values for the next set row, in the display unit. */
export function nextSetDefaults(
  logged: SetEntry[],
  last: LastTime | undefined,
  target: { reps: number } | undefined,
  unit: Unit,
): { weight: string; reps: string } {
  const prev = [...logged].sort((a, b) => a.id - b.id).at(-1);
  if (prev) {
    return {
      weight: prev.weight_kg == null ? "" : String(kgToDisplay(prev.weight_kg, unit)),
      reps: prev.reps == null ? "" : String(target?.reps ?? prev.reps),
    };
  }
  const s = last?.suggestion;
  if (s) {
    return {
      weight: s.weight_kg == null ? "" : String(kgToDisplay(s.weight_kg, unit)),
      reps: String(s.reps ?? target?.reps ?? ""),
    };
  }
  return { weight: "", reps: target ? String(target.reps) : "" };
}
