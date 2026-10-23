import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ExercisePicker } from "../components/ExercisePicker";
import { CheckIcon, PlusIcon, TrashIcon } from "../components/icons";
import { PlateLoadout } from "../components/PlateLoadout";
import { RestTimer } from "../components/RestTimer";
import { Button, ErrorNote, Field, PageLoading, Spinner } from "../components/ui";
import type { SetEntry } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatLongDate, relativeDay } from "../lib/dates";
import {
  useDeleteSession,
  useExercise,
  useLastTime,
  useSaveAsTemplate,
  useSession,
  useSetMutations,
  useTemplate,
  useUpdateSession,
} from "../lib/queries";
import { displayToKg, formatDistance, formatDuration, formatNumber, kgToDisplay } from "../lib/units";
import { nextSetDefaults, summarizeSets, workoutExercises, type PlannedExercise } from "../lib/workout";

const REST_SECONDS = 90;

function useAddedExercises(sessionId: number) {
  const storageKey = `fittrack.added.${sessionId}`;
  const [ids, setIds] = useState<number[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) ?? "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(ids));
    } catch {
      /* ignore */
    }
  }, [ids, storageKey]);
  return [ids, setIds] as const;
}

export function WorkoutPage() {
  const sessionId = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const session = useSession(sessionId);
  const template = useTemplate(session.data?.template_id);
  const [addedIds, setAddedIds] = useAddedExercises(sessionId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [restStartedAt, setRestStartedAt] = useState<number | null>(null);

  // /workouts/12?add=34 (from the library) adds that exercise.
  useEffect(() => {
    const add = Number(params.get("add"));
    if (add) {
      setAddedIds((ids) => (ids.includes(add) ? ids : [...ids, add]));
      params.delete("add");
      setParams(params, { replace: true });
    }
  }, [params, setParams, setAddedIds]);

  const sets = session.data?.sets ?? [];
  const planned = useMemo(
    () => workoutExercises(template.data, sets, addedIds),
    [template.data, sets, addedIds],
  );

  if (session.isPending || (session.data?.template_id && template.isPending)) return <PageLoading />;
  if (session.isError) return <ErrorNote error={session.error} onRetry={() => session.refetch()} />;

  const s = session.data;
  const title = template.data?.name ?? "Freestyle workout";

  return (
    <div className={restStartedAt ? "pb-16" : ""}>
      <Link to="/" className="text-sm font-semibold text-ink-2 hover:text-ink">
        Back to today
      </Link>
      <header className="mt-3 mb-8">
        <h1 className="font-display text-[34px] leading-none font-bold tracking-tight md:text-[44px]">
          {title}
        </h1>
        <p className="mt-2 text-ink-2">
          {relativeDay(s.date)}
          {relativeDay(s.date) !== formatLongDate(s.date) ? `, ${formatLongDate(s.date)}` : ""}
        </p>
      </header>

      {planned.length === 0 ? (
        <div className="rounded-lg border border-dashed border-rule px-5 py-10 text-center">
          <p className="font-semibold">No exercises yet</p>
          <p className="mt-1 text-ink-2">Add the first exercise to start logging sets.</p>
        </div>
      ) : (
        <ol className="space-y-6">
          {planned.map((p) => (
            <li key={p.exerciseId}>
              <ExerciseBlock
                plan={p}
                sessionId={sessionId}
                sessionDate={s.date}
                logged={sets.filter((x) => x.exercise_id === p.exerciseId)}
                onLogged={() => setRestStartedAt(Date.now())}
                onRemove={() => setAddedIds((ids) => ids.filter((id) => id !== p.exerciseId))}
              />
            </li>
          ))}
        </ol>
      )}

      <div className="mt-6">
        <Button onClick={() => setPickerOpen(true)}>
          <PlusIcon />
          Add exercise
        </Button>
      </div>

      <WorkoutFooter sessionId={sessionId} notes={s.notes} hasSets={sets.length > 0} onDeleted={() => navigate("/")} />

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        exclude={planned.map((p) => p.exerciseId)}
        onPick={(ex) => {
          setAddedIds((ids) => [...ids, ex.id]);
          setPickerOpen(false);
        }}
      />

      {restStartedAt ? (
        <RestTimer startedAt={restStartedAt} seconds={REST_SECONDS} onDone={() => setRestStartedAt(null)} />
      ) : null}
    </div>
  );
}

function ExerciseBlock({
  plan,
  sessionId,
  sessionDate,
  logged,
  onLogged,
  onRemove,
}: {
  plan: PlannedExercise;
  sessionId: number;
  sessionDate: string;
  logged: SetEntry[];
  onLogged: () => void;
  onRemove: () => void;
}) {
  const { unit } = useAuth();
  const exercise = useExercise(plan.exerciseId);
  const last = useLastTime(plan.exerciseId, sessionDate, plan.target?.reps);
  const [extraRows, setExtraRows] = useState(0);

  const ex = exercise.data;
  const isCardio = ex?.category === "cardio";
  const isBarbell = ex?.equipment?.name === "Barbell";
  const suggestion = last.data?.suggestion;
  const sortedLogged = [...logged].sort((a, b) => a.set_number - b.set_number || a.id - b.id);
  // With a target, show the sets still to do; without one, always offer one more row.
  const baseRows = plan.target ? Math.max(plan.target.sets - logged.length, 0) : 1;
  const plannedRows = baseRows + extraRows;
  const defaults = nextSetDefaults(logged, last.data, plan.target, unit);

  return (
    <article className="rounded-lg border border-rule bg-panel" aria-labelledby={`ex-${plan.exerciseId}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-rule px-4 py-4 md:px-5">
        <div className="min-w-0">
          <h2 id={`ex-${plan.exerciseId}`} className="font-display text-[26px] leading-tight font-semibold">
            {ex?.name ?? <span className="text-ink-3">Loading…</span>}
          </h2>
          <p className="text-sm text-ink-2 capitalize">
            {[ex?.muscle_group, ex?.equipment?.name.toLowerCase()].filter(Boolean).join(", ")}
            {plan.target ? (
              <span className="normal-case">
                {", "}target {plan.target.sets} × {plan.target.reps}
              </span>
            ) : null}
          </p>
        </div>
        {plan.added && logged.length === 0 ? (
          <Button size="sm" variant="quiet" onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>

      {/* Last time + next target */}
      <div className="grid gap-4 border-b border-rule px-4 py-4 md:grid-cols-[1fr_auto] md:px-5">
        {last.isPending ? (
          <Spinner small />
        ) : last.data?.last_date ? (
          <div>
            <p className="text-sm text-ink-3">Last time, {relativeDay(last.data.last_date).toLowerCase()}</p>
            <p className="font-medium tabular">{summarizeSets(last.data.sets, unit)}</p>
            {suggestion ? <p className="mt-1 text-sm text-ink-2">{suggestion.reason.replace(/(\d+(?:\.\d+)?) kg/g, (_, kg) => `${formatNumber(kgToDisplay(Number(kg), unit))} ${unit}`)}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-ink-2">First time logging this. Pick a weight you can move with good form.</p>
        )}
        {isBarbell && suggestion?.weight_kg ? (
          <div>
            <p className="mb-1 text-sm text-ink-3">
              Next: {formatNumber(kgToDisplay(suggestion.weight_kg, unit))} {unit}
            </p>
            <PlateLoadout weight={kgToDisplay(suggestion.weight_kg, unit)} unit={unit} />
          </div>
        ) : null}
      </div>

      {/* Sets */}
      <table className="w-full text-left">
        <thead className="text-sm text-ink-3">
          <tr>
            <th scope="col" className="w-14 py-2 pl-4 font-medium md:pl-5">Set</th>
            <th scope="col" className="py-2 font-medium">{isCardio ? "Minutes" : unit}</th>
            <th scope="col" className="py-2 font-medium">{isCardio ? "km" : "Reps"}</th>
            <th scope="col" className="w-28 py-2 pr-4 md:pr-5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {sortedLogged.map((set, i) => (
            <LoggedRow key={set.id} set={set} index={i + 1} sessionId={sessionId} isCardio={isCardio} />
          ))}
          {Array.from({ length: plannedRows }, (_, i) => (
            <PlannedRow
              key={`${logged.length}-${i}`}
              index={logged.length + i + 1}
              exerciseId={plan.exerciseId}
              sessionId={sessionId}
              isCardio={isCardio}
              defaults={defaults}
              ready={!last.isPending && !exercise.isPending}
              onLogged={() => {
                if (i >= plannedRows - extraRows) setExtraRows((n) => Math.max(0, n - 1));
                onLogged();
              }}
            />
          ))}
        </tbody>
      </table>
      <div className="px-2 pt-1 pb-3 md:px-3">
        <Button size="sm" variant="quiet" onClick={() => setExtraRows((n) => n + 1)}>
          <PlusIcon />
          Add set
        </Button>
      </div>
    </article>
  );
}

const cellInput =
  "h-11 w-full max-w-[110px] rounded-md border border-rule bg-page px-2.5 text-[17px] font-semibold tabular focus:border-accent focus:outline-none";

function PlannedRow({
  index,
  exerciseId,
  sessionId,
  isCardio,
  defaults,
  ready,
  onLogged,
}: {
  index: number;
  exerciseId: number;
  sessionId: number;
  isCardio: boolean;
  defaults: { weight: string; reps: string };
  ready: boolean;
  onLogged: () => void;
}) {
  const { unit } = useAuth();
  const { add } = useSetMutations(sessionId);
  const [a, setA] = useState(isCardio ? "" : defaults.weight);
  const [b, setB] = useState(isCardio ? "" : defaults.reps);
  const [touched, setTouched] = useState(false);

  // Fill in suggested values once they arrive, unless the user already typed.
  useEffect(() => {
    if (!touched && !isCardio) {
      setA(defaults.weight);
      setB(defaults.reps);
    }
  }, [defaults.weight, defaults.reps, touched, isCardio, ready]);

  const valid = isCardio ? Number(a) > 0 || Number(b) > 0 : Number(b) > 0;

  function log() {
    if (!valid) return;
    const body = isCardio
      ? {
          exercise_id: exerciseId,
          set_number: index,
          duration_seconds: a ? Math.round(Number(a) * 60) : null,
          distance_m: b ? Math.round(Number(b) * 1000) : null,
        }
      : {
          exercise_id: exerciseId,
          set_number: index,
          reps: Number(b),
          weight_kg: a ? displayToKg(Number(a), unit) : null,
        };
    add.mutate(body, { onSuccess: onLogged });
  }

  return (
    <tr className="border-t border-rule">
      <td className="py-2 pl-4 text-ink-3 tabular md:pl-5">{index}</td>
      <td className="py-2 pr-2">
        <input
          aria-label={`Set ${index} ${isCardio ? "minutes" : `weight in ${unit}`}`}
          type="number"
          inputMode="decimal"
          step={isCardio ? "1" : "0.5"}
          min="0"
          placeholder={isCardio ? "min" : "—"}
          value={a}
          onChange={(e) => {
            setTouched(true);
            setA(e.target.value);
          }}
          className={cellInput}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          aria-label={`Set ${index} ${isCardio ? "distance in km" : "reps"}`}
          type="number"
          inputMode={isCardio ? "decimal" : "numeric"}
          step={isCardio ? "0.1" : "1"}
          min="0"
          value={b}
          onChange={(e) => {
            setTouched(true);
            setB(e.target.value);
          }}
          onKeyDown={(e) => e.key === "Enter" && log()}
          className={cellInput}
        />
      </td>
      <td className="py-2 pr-4 text-right md:pr-5">
        <Button size="sm" variant="primary" onClick={log} busy={add.isPending} disabled={!valid}>
          <CheckIcon />
          Log
        </Button>
        {add.isError ? <p className="mt-1 text-xs text-danger">{add.error.message}</p> : null}
      </td>
    </tr>
  );
}

function LoggedRow({
  set,
  index,
  sessionId,
  isCardio,
}: {
  set: SetEntry;
  index: number;
  sessionId: number;
  isCardio: boolean;
}) {
  const { unit } = useAuth();
  const { update, remove } = useSetMutations(sessionId);
  const [editing, setEditing] = useState(false);
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  function startEdit() {
    if (isCardio) {
      setA(set.duration_seconds ? String(Math.round(set.duration_seconds / 60)) : "");
      setB(set.distance_m ? String(set.distance_m / 1000) : "");
    } else {
      setA(set.weight_kg == null ? "" : String(kgToDisplay(set.weight_kg, unit)));
      setB(set.reps == null ? "" : String(set.reps));
    }
    setEditing(true);
  }

  function save() {
    const body = isCardio
      ? {
          id: set.id,
          duration_seconds: a ? Math.round(Number(a) * 60) : null,
          distance_m: b ? Math.round(Number(b) * 1000) : null,
        }
      : { id: set.id, reps: b ? Number(b) : null, weight_kg: a ? displayToKg(Number(a), unit) : null };
    update.mutate(body, { onSuccess: () => setEditing(false) });
  }

  if (editing) {
    return (
      <tr className="border-t border-rule bg-accent-soft/40">
        <td className="py-2 pl-4 tabular md:pl-5">{index}</td>
        <td className="py-2 pr-2">
          <input aria-label={`Set ${index} ${isCardio ? "minutes" : "weight"}`} type="number" inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} className={cellInput} />
        </td>
        <td className="py-2 pr-2">
          <input aria-label={`Set ${index} ${isCardio ? "km" : "reps"}`} type="number" inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} className={cellInput} />
        </td>
        <td className="py-2 pr-4 text-right whitespace-nowrap md:pr-5">
          <Button size="sm" variant="primary" onClick={save} busy={update.isPending}>
            Save
          </Button>
          <Button size="sm" variant="quiet" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-rule">
      <td className="py-3 pl-4 tabular md:pl-5">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-ink">
          <CheckIcon />
        </span>
        <span className="sr-only">Set {index}, logged</span>
      </td>
      <td className="py-3 text-[17px] font-semibold tabular">
        {isCardio ? formatDuration(set.duration_seconds) || "—" : set.weight_kg == null ? "Bodyweight" : formatNumber(kgToDisplay(set.weight_kg, unit))}
      </td>
      <td className="py-3 text-[17px] font-semibold tabular">
        {isCardio ? formatDistance(set.distance_m) || "—" : set.reps}
      </td>
      <td className="py-2 pr-4 text-right whitespace-nowrap md:pr-5">
        <Button size="sm" variant="quiet" onClick={startEdit}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="danger"
          aria-label={`Delete set ${index}`}
          busy={remove.isPending}
          onClick={() => remove.mutate(set.id)}
        >
          <TrashIcon />
        </Button>
      </td>
    </tr>
  );
}

function WorkoutFooter({
  sessionId,
  notes,
  hasSets,
  onDeleted,
}: {
  sessionId: number;
  notes: string | null;
  hasSets: boolean;
  onDeleted: () => void;
}) {
  const updateSession = useUpdateSession(sessionId);
  const saveAs = useSaveAsTemplate(sessionId);
  const del = useDeleteSession();
  const [draft, setDraft] = useState(notes ?? "");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="mt-12 grid gap-10 border-t border-rule pt-8 md:grid-cols-2">
      <div>
        <label htmlFor="notes" className="mb-1.5 block text-sm font-medium text-ink-2">
          Notes
        </label>
        <textarea
          id="notes"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== (notes ?? "") && updateSession.mutate({ notes: draft || null })}
          placeholder="How did it feel? Anything to change next time?"
          className="w-full rounded-md border border-rule bg-panel px-3 py-2.5 text-[16px] focus:border-accent focus:outline-none"
        />
        {updateSession.isSuccess ? <p className="text-sm text-good">Notes saved.</p> : null}
      </div>

      <div className="space-y-4">
        {hasSets ? (
          saving ? (
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) saveAs.mutate(name.trim(), { onSuccess: () => setSaving(false) });
              }}
            >
              <Field label="Name this workout" value={name} onChange={(e) => setName(e.target.value)} autoFocus className="flex-1" />
              <Button type="submit" variant="primary" busy={saveAs.isPending} disabled={!name.trim()}>
                Save
              </Button>
            </form>
          ) : (
            <div>
              <Button onClick={() => setSaving(true)}>Save as a workout to reuse</Button>
              {saveAs.isSuccess ? (
                <p className="mt-2 text-sm text-good">
                  Saved to <Link to="/programs" className="underline">your workouts</Link>.
                </p>
              ) : null}
            </div>
          )
        ) : null}
        {saveAs.isError ? <p className="text-sm text-danger">{saveAs.error.message}</p> : null}

        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Delete this workout and all its sets?</span>
            <Button size="sm" variant="danger" busy={del.isPending} onClick={() => del.mutate(sessionId, { onSuccess: onDeleted })}>
              Delete workout
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            <TrashIcon />
            Delete workout
          </Button>
        )}
      </div>
    </div>
  );
}
