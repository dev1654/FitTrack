import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Button, ErrorNote, PageLoading, PageTitle } from "../components/ui";
import type { Equipment, Exercise } from "../lib/api";
import { useEquipmentList, useExercises } from "../lib/queries";
import { useAddToToday } from "../lib/useAddToToday";

const MUSCLES = [
  "chest", "back", "shoulders", "biceps", "triceps", "quads",
  "hamstrings", "glutes", "calves", "abs", "cardio",
];

const EQUIPMENT_GROUPS: { type: Equipment["type"]; label: string }[] = [
  { type: "machine", label: "Machines" },
  { type: "free_weight", label: "Free weights" },
  { type: "cable", label: "Cables" },
  { type: "bodyweight", label: "Bodyweight" },
  { type: "cardio", label: "Cardio" },
];

export function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "equipment" ? "equipment" : "exercises";

  return (
    <div>
      <PageTitle>Library</PageTitle>
      <div role="tablist" aria-label="Library" className="mb-8 flex gap-1 border-b border-rule">
        {(["exercises", "equipment"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setParams(t === "exercises" ? {} : { tab: t }, { replace: true })}
            className={`-mb-px border-b-2 px-3 py-2.5 font-semibold ${
              tab === t ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {t === "exercises" ? "Exercises" : "By machine"}
          </button>
        ))}
      </div>
      {tab === "exercises" ? <ExercisesTab /> : <EquipmentTab />}
    </div>
  );
}

function ExercisesTab() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const { addToToday, pendingId, error } = useAddToToday();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);

  const exercises = useExercises({
    search: debounced || undefined,
    muscle_group: muscle ?? undefined,
    limit: 100,
  });

  return (
    <div>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search 860+ exercises"
        aria-label="Search exercises"
        className="h-11 w-full max-w-md rounded-md border border-rule bg-panel px-3 text-[16px] focus:border-accent focus:outline-none"
      />
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by muscle group">
        {MUSCLES.map((m) => (
          <button
            key={m}
            aria-pressed={muscle === m}
            onClick={() => setMuscle(muscle === m ? null : m)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium capitalize ${
              muscle === m ? "border-accent bg-accent text-accent-ink" : "border-rule bg-panel text-ink-2 hover:border-ink-3"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

      <div className="mt-6">
        {exercises.isPending ? (
          <PageLoading />
        ) : exercises.isError ? (
          <ErrorNote error={exercises.error} onRetry={() => exercises.refetch()} />
        ) : exercises.data.length === 0 ? (
          <p className="text-ink-2">No exercises match. Try a shorter search or another muscle group.</p>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {exercises.data.map((ex) => (
              <ExerciseRow
                key={ex.id}
                ex={ex}
                expanded={open === ex.id}
                onToggle={() => setOpen(open === ex.id ? null : ex.id)}
                onLog={() => addToToday(ex.id)}
                logging={pendingId === ex.id}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ExerciseRow({
  ex,
  expanded,
  onToggle,
  onLog,
  logging,
}: {
  ex: Exercise;
  expanded: boolean;
  onToggle: () => void;
  onLog: () => void;
  logging: boolean;
}) {
  return (
    <li>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-baseline justify-between gap-4 px-1 py-3 text-left hover:bg-panel"
      >
        <span className="font-semibold">{ex.name}</span>
        <span className="shrink-0 text-sm text-ink-3 capitalize">
          {ex.muscle_group}
          {ex.equipment ? `, ${ex.equipment.name.toLowerCase()}` : ""}
        </span>
      </button>
      {expanded ? (
        <div className="px-1 pb-4">
          <p className="max-w-[70ch] text-ink-2">{ex.instructions ?? "No instructions yet."}</p>
          <Button size="sm" variant="primary" className="mt-3" busy={logging} onClick={onLog}>
            Add to today's workout
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function EquipmentTab() {
  const equipment = useEquipmentList();
  if (equipment.isPending) return <PageLoading />;
  if (equipment.isError) return <ErrorNote error={equipment.error} onRetry={() => equipment.refetch()} />;

  return (
    <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
      {EQUIPMENT_GROUPS.map(({ type, label }) => {
        const items = equipment.data.filter((e) => e.type === type);
        if (items.length === 0) return null;
        return (
          <section key={type}>
            <h2 className="font-display text-xl font-semibold">{label}</h2>
            <ul className="mt-2 divide-y divide-rule border-y border-rule">
              {items.map((e) => (
                <li key={e.id}>
                  <Link to={`/library/equipment/${e.id}`} className="flex items-baseline justify-between gap-4 px-1 py-3 hover:bg-panel">
                    <span className="font-medium">{e.name}</span>
                    <span className="text-sm text-ink-3 capitalize">{e.muscle_groups.slice(0, 3).join(", ")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
