import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ExercisePicker } from "../components/ExercisePicker";
import { PlusIcon, TrashIcon } from "../components/icons";
import { Button, Field, PageTitle } from "../components/ui";
import type { Exercise } from "../lib/api";
import { useCreateTemplate } from "../lib/queries";

type Row = { exercise: Exercise; sets: string; reps: string };

export function NewWorkoutPage() {
  const navigate = useNavigate();
  const create = useCreateTemplate();
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Give the workout a name.");
    if (rows.length === 0) return setError("Add at least one exercise.");
    const bad = rows.find((r) => !(Number(r.sets) > 0 && Number(r.reps) > 0));
    if (bad) return setError(`Set the sets and reps for ${bad.exercise.name}.`);
    create.mutate(
      {
        name: name.trim(),
        exercises: rows.map((r) => ({
          exercise_id: r.exercise.id,
          target_sets: Number(r.sets),
          target_reps: Number(r.reps),
        })),
      },
      { onSuccess: (t) => navigate(`/programs/${t.id}`), onError: (err) => setError(err.message) },
    );
  }

  return (
    <form onSubmit={save} className="max-w-2xl">
      <Link to="/programs" className="text-sm font-semibold text-ink-2 hover:text-ink">
        All programs
      </Link>
      <div className="mt-3">
        <PageTitle>Build a workout</PageTitle>
      </div>

      <Field label="Name" placeholder="e.g. Arm day" value={name} onChange={(e) => setName(e.target.value)} />

      <h2 className="mt-8 mb-2 font-display text-2xl font-semibold">Exercises</h2>
      {rows.length === 0 ? (
        <p className="text-ink-2">No exercises yet.</p>
      ) : (
        <ol className="divide-y divide-rule border-y border-rule">
          {rows.map((r, i) => (
            <li key={r.exercise.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="min-w-0 flex-1 font-semibold">{r.exercise.name}</span>
              <label className="flex items-center gap-2 text-sm text-ink-2">
                Sets
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={r.sets}
                  onChange={(e) => update(i, { sets: e.target.value })}
                  className="h-10 w-16 rounded-md border border-rule bg-panel px-2 text-[16px] font-semibold text-ink tabular"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-2">
                Reps
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={r.reps}
                  onChange={(e) => update(i, { reps: e.target.value })}
                  className="h-10 w-16 rounded-md border border-rule bg-panel px-2 text-[16px] font-semibold text-ink tabular"
                />
              </label>
              <Button
                type="button"
                size="sm"
                variant="danger"
                aria-label={`Remove ${r.exercise.name}`}
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              >
                <TrashIcon />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <Button type="button" className="mt-4" onClick={() => setPickerOpen(true)}>
        <PlusIcon />
        Add exercise
      </Button>

      {error ? (
        <p role="alert" className="mt-6 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-8">
        <Button type="submit" variant="primary" busy={create.isPending}>
          Save workout
        </Button>
      </div>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        exclude={rows.map((r) => r.exercise.id)}
        onPick={(exercise) => {
          setRows((rs) => [...rs, { exercise, sets: "3", reps: exercise.category === "cardio" ? "1" : "10" }]);
          setPickerOpen(false);
        }}
      />
    </form>
  );
}
