import { useMemo, useState } from "react";
import { Columns, Ranking, TrendLine, type Point } from "../components/charts";
import { AlertIcon } from "../components/icons";
import { Empty, ErrorNote, PageLoading, PageTitle, Panel, SectionTitle, Select } from "../components/ui";
import type { WeeklyVolume } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, parseISODate, todayISO } from "../lib/dates";
import {
  useBodyMetrics,
  useExerciseStats,
  useLastAnalyticsRun,
  usePersonalRecords,
  usePlateaus,
  useWeeklyVolume,
} from "../lib/queries";
import { formatNumber, kgToDisplay } from "../lib/units";

export function weeklyTotals(rows: WeeklyVolume[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.week_start, (totals.get(r.week_start) ?? 0) + r.total_volume_kg);
  return totals;
}

export function muscleBalance(rows: WeeklyVolume[], sinceISO: string): { group: string; kg: number }[] {
  const by = new Map<string, number>();
  for (const r of rows) {
    if (r.week_start < sinceISO) continue;
    by.set(r.muscle_group, (by.get(r.muscle_group) ?? 0) + r.total_volume_kg);
  }
  return [...by].map(([group, kg]) => ({ group, kg })).sort((a, b) => b.kg - a.kg);
}

export function ProgressPage() {
  const { unit } = useAuth();
  const prs = usePersonalRecords();
  const plateaus = usePlateaus();
  const weekly = useWeeklyVolume(12);
  const lastRun = useLastAnalyticsRun();

  const updated = lastRun.data?.[0]?.finished_at;

  return (
    <div className="space-y-14">
      <div>
        <PageTitle>Progress</PageTitle>
        <p className="-mt-3 text-sm text-ink-3">
          Stats are recalculated every night
          {updated ? `, last on ${new Date(updated).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}` : ""}.
          Today's sets show up tomorrow.
        </p>
      </div>

      {plateaus.data && plateaus.data.length > 0 ? (
        <section aria-labelledby="plateau-title" className="rounded-lg border border-warn/40 bg-warn-soft px-5 py-4">
          <h2 id="plateau-title" className="flex items-center gap-2 font-semibold text-warn">
            <AlertIcon />
            {plateaus.data.length === 1 ? "1 lift has stalled" : `${plateaus.data.length} lifts have stalled`}
          </h2>
          <p className="mt-1 text-sm text-ink-2">No new best estimated 1RM in your last 3 sessions.</p>
          <ul className="mt-3 space-y-1">
            {plateaus.data.map((p) => (
              <li key={p.exercise_id} className="text-sm">
                <span className="font-semibold">{p.exercise_name}</span>
                <span className="text-ink-2">
                  {" "}best {formatNumber(kgToDisplay(p.best_est_1rm_kg ?? 0, unit))} {unit}, last{" "}
                  {formatNumber(kgToDisplay(p.est_1rm_kg ?? 0, unit))} {unit} on {formatDate(p.last_session)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {prs.isPending ? (
        <PageLoading />
      ) : prs.isError ? (
        <ErrorNote error={prs.error} onRetry={() => prs.refetch()} />
      ) : prs.data.length === 0 ? (
        <Empty title="No stats yet">
          Log a few workouts. Your progress charts appear here the morning after.
        </Empty>
      ) : (
        <>
          <LiftTrend />
          <div className="grid gap-14 lg:grid-cols-2">
            <WeeklyVolumeChart rows={weekly.data ?? []} />
            <MuscleBalance rows={weekly.data ?? []} />
          </div>
          <RecordsTable />
        </>
      )}

      <BodyWeightTrend />
    </div>
  );
}

function LiftTrend() {
  const { unit } = useAuth();
  const prs = usePersonalRecords();
  const lifts = (prs.data ?? []).filter((p) => p.best_est_1rm_kg != null);
  const [picked, setPicked] = useState<number | null>(null);
  const exerciseId = picked ?? lifts[0]?.exercise_id;
  const stats = useExerciseStats(exerciseId);
  const lift = lifts.find((l) => l.exercise_id === exerciseId);

  const e1rm: Point[] = (stats.data ?? [])
    .filter((s) => s.est_1rm_kg != null)
    .map((s) => ({ label: formatDate(s.date), detail: formatDate(s.date, { year: "numeric" }), value: kgToDisplay(s.est_1rm_kg!, unit) }));
  const volume: Point[] = (stats.data ?? []).map((s) => ({
    label: formatDate(s.date),
    detail: formatDate(s.date, { year: "numeric" }),
    value: kgToDisplay(s.total_volume_kg ?? 0, unit),
  }));
  const first = e1rm[0]?.value;
  const best = lift?.best_est_1rm_kg != null ? kgToDisplay(lift.best_est_1rm_kg, unit) : undefined;

  if (lifts.length === 0) return null;

  return (
    <section aria-labelledby="lift-title">
      <SectionTitle
        aside={
          <Select
            aria-label="Exercise"
            value={exerciseId}
            onChange={(e) => setPicked(Number(e.target.value))}
            className="max-w-[60vw]"
          >
            {lifts.map((l) => (
              <option key={l.exercise_id} value={l.exercise_id}>
                {l.exercise_name}
              </option>
            ))}
          </Select>
        }
      >
        <span id="lift-title">Strength trend</span>
      </SectionTitle>

      <Panel className="px-5 py-5">
        <div className="mb-4 flex flex-wrap items-end gap-x-10 gap-y-2">
          <div>
            <p className="text-sm text-ink-2">Best estimated 1RM</p>
            <p className="font-display text-[52px] leading-none font-bold">
              {best != null ? formatNumber(best) : "—"}
              <span className="ml-1 text-2xl font-semibold text-ink-2">{unit}</span>
            </p>
          </div>
          {best != null && first != null && e1rm.length > 1 ? (
            <p className="pb-1 text-ink-2">
              {best - first >= 0 ? "Up " : "Down "}
              <span className="font-semibold text-ink tabular">
                {formatNumber(Math.abs(best - first))} {unit}
              </span>{" "}
              since {e1rm[0].label}
            </p>
          ) : null}
        </div>
        {stats.isPending ? (
          <PageLoading />
        ) : e1rm.length < 2 ? (
          <p className="text-ink-2">One more session of this lift and a trend line appears here.</p>
        ) : (
          <>
            <h3 className="text-sm font-medium text-ink-2">Estimated 1RM per session ({unit})</h3>
            <TrendLine data={e1rm} unit={unit} caption="Estimated one-rep max per session" />
            <h3 className="mt-6 text-sm font-medium text-ink-2">Volume per session ({unit} lifted)</h3>
            <Columns data={volume} unit={unit} caption="Volume per session" height={160} />
          </>
        )}
      </Panel>
    </section>
  );
}

function WeeklyVolumeChart({ rows }: { rows: WeeklyVolume[] }) {
  const { unit } = useAuth();
  const totals = weeklyTotals(rows);
  const data: Point[] = [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, kg]) => ({
      label: formatDate(week),
      detail: `Week of ${formatDate(week)}`,
      value: kgToDisplay(kg, unit),
    }));
  return (
    <section aria-labelledby="weekly-title">
      <SectionTitle>
        <span id="weekly-title">Weekly volume</span>
      </SectionTitle>
      <p className="-mt-2 mb-3 text-sm text-ink-2">Total {unit} lifted per week, last 12 weeks.</p>
      {data.length === 0 ? <p className="text-ink-2">No volume logged in the last 12 weeks.</p> : <Columns data={data} unit={unit} caption="Weekly volume" />}
    </section>
  );
}

function MuscleBalance({ rows }: { rows: WeeklyVolume[] }) {
  const { unit } = useAuth();
  const since = useMemo(() => {
    const d = parseISODate(todayISO());
    d.setDate(d.getDate() - 28);
    return todayISO(d);
  }, []);
  const data = muscleBalance(rows, since).map((m) => ({ label: m.group, value: kgToDisplay(m.kg, unit) }));
  return (
    <section aria-labelledby="balance-title">
      <SectionTitle>
        <span id="balance-title">Muscle balance</span>
      </SectionTitle>
      <p className="-mt-2 mb-3 text-sm text-ink-2">Volume by muscle group, last 4 weeks.</p>
      {data.length === 0 ? <p className="text-ink-2">Nothing logged in the last 4 weeks.</p> : <Ranking data={data} unit={unit} caption="Volume by muscle group" />}
    </section>
  );
}

function RecordsTable() {
  const { unit } = useAuth();
  const prs = usePersonalRecords();
  return (
    <section aria-labelledby="pr-title">
      <SectionTitle>
        <span id="pr-title">Personal records</span>
      </SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left">
          <thead className="text-sm text-ink-3">
            <tr className="border-b border-rule">
              <th scope="col" className="py-2 font-medium">Exercise</th>
              <th scope="col" className="py-2 text-right font-medium">Best est. 1RM</th>
              <th scope="col" className="py-2 text-right font-medium">Heaviest set</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {(prs.data ?? []).map((p) => (
              <tr key={p.exercise_id} className="border-b border-rule">
                <td className="py-3 font-semibold">{p.exercise_name}</td>
                <td className="py-3 text-right">
                  {p.best_est_1rm_kg != null ? (
                    <>
                      <span className="font-semibold">{formatNumber(kgToDisplay(p.best_est_1rm_kg, unit))} {unit}</span>
                      <span className="block text-sm text-ink-3">{p.best_est_1rm_date ? formatDate(p.best_est_1rm_date, { year: "numeric" }) : ""}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-3 text-right">
                  {p.heaviest_weight_kg != null ? (
                    <>
                      <span className="font-semibold">{formatNumber(kgToDisplay(p.heaviest_weight_kg, unit))} {unit}</span>
                      <span className="block text-sm text-ink-3">{p.heaviest_weight_date ? formatDate(p.heaviest_weight_date, { year: "numeric" }) : ""}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BodyWeightTrend() {
  const { unit } = useAuth();
  const metrics = useBodyMetrics();
  const data: Point[] = [...(metrics.data ?? [])]
    .filter((m) => m.body_weight_kg != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ label: formatDate(m.date), detail: formatDate(m.date, { year: "numeric" }), value: kgToDisplay(m.body_weight_kg!, unit) }));

  return (
    <section aria-labelledby="bwt-title">
      <SectionTitle>
        <span id="bwt-title">Body weight</span>
      </SectionTitle>
      {metrics.isPending ? (
        <PageLoading />
      ) : data.length < 2 ? (
        <p className="text-ink-2">Log your weight on the Today page on two or more days to see a trend.</p>
      ) : (
        <TrendLine data={data} unit={unit} caption="Body weight" height={200} />
      )}
    </section>
  );
}
