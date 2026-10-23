import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button, Empty, ErrorNote, Field, PageLoading, Panel, SectionTitle, Select } from "../components/ui";
import type { TemplateSummary } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatLongDate, relativeDay, todayISO } from "../lib/dates";
import { createSession, keys, useBodyMetrics, useLogBodyWeight, useSessions, useTemplates } from "../lib/queries";
import { displayToKg, formatWeight } from "../lib/units";

export function groupTemplates(templates: TemplateSummary[]) {
  const mine = templates.filter((t) => !t.is_builtin);
  const programs = new Map<string, TemplateSummary[]>();
  for (const t of templates.filter((t) => t.is_builtin)) {
    const key = t.category ?? "Other";
    programs.set(key, [...(programs.get(key) ?? []), t]);
  }
  return { mine, programs };
}

export function TodayPage() {
  const today = todayISO();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sessions = useSessions(12);
  const templates = useTemplates();
  const [templateId, setTemplateId] = useState("");
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const templateName = useMemo(() => {
    const map = new Map((templates.data ?? []).map((t) => [t.id, t.name]));
    return (id: number | null | undefined) => (id ? map.get(id) : undefined);
  }, [templates.data]);

  const todays = sessions.data?.find((s) => s.date === today);
  const grouped = groupTemplates(templates.data ?? []);

  async function start(which: "empty" | "template") {
    setStarting(which);
    setStartError(null);
    try {
      const session = await createSession(which === "template" ? Number(templateId) : null, today);
      await qc.invalidateQueries({ queryKey: keys.sessions });
      navigate(`/workouts/${session.id}`);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Couldn't start the workout.");
      setStarting(null);
    }
  }

  return (
    <div className="space-y-12">
      <header>
        <p className="text-ink-2">Today</p>
        <h1 className="font-display text-[40px] leading-none font-bold tracking-tight md:text-[56px]">
          {formatLongDate(today)}
        </h1>
      </header>

      <section aria-labelledby="start-title">
        {todays ? (
          <Panel className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
            <div>
              <h2 id="start-title" className="font-display text-2xl font-semibold">
                {templateName(todays.template_id) ?? "Today's workout"}
              </h2>
              <p className="text-ink-2">You started a workout today.</p>
            </div>
            <Button variant="primary" onClick={() => navigate(`/workouts/${todays.id}`)}>
              Continue workout
            </Button>
          </Panel>
        ) : (
          <Panel className="px-5 py-5">
            <h2 id="start-title" className="font-display text-2xl font-semibold">
              Start a workout
            </h2>
            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
              <label className="sr-only" htmlFor="template">
                Program or saved workout
              </label>
              <Select
                id="template"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full md:max-w-sm"
                disabled={templates.isPending}
              >
                <option value="">Choose a program day or saved workout</option>
                {grouped.mine.length ? (
                  <optgroup label="My workouts">
                    {grouped.mine.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {[...grouped.programs].map(([program, days]) => (
                  <optgroup key={program} label={program}>
                    {days.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name.replace(`${program}: `, "")}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
              <Button
                variant="primary"
                disabled={!templateId}
                busy={starting === "template"}
                onClick={() => start("template")}
              >
                Start this workout
              </Button>
              <span className="text-ink-3 md:px-1">or</span>
              <Button busy={starting === "empty"} onClick={() => start("empty")}>
                Start an empty workout
              </Button>
            </div>
            {startError ? <p className="mt-3 text-sm text-danger">{startError}</p> : null}
          </Panel>
        )}
      </section>

      <div className="grid gap-12 lg:grid-cols-[1fr_300px]">
        <section aria-labelledby="recent-title">
          <SectionTitle>
            <span id="recent-title">Recent workouts</span>
          </SectionTitle>
          {sessions.isPending ? (
            <PageLoading />
          ) : sessions.isError ? (
            <ErrorNote error={sessions.error} onRetry={() => sessions.refetch()} />
          ) : sessions.data.length === 0 ? (
            <Empty title="No workouts yet">Start one above and it will show up here.</Empty>
          ) : (
            <ul className="divide-y divide-rule border-y border-rule">
              {sessions.data.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/workouts/${s.id}`}
                    className="flex items-baseline gap-4 px-1 py-3.5 hover:bg-panel"
                  >
                    <span className="w-24 shrink-0 text-sm text-ink-2 md:w-28">{relativeDay(s.date, today)}</span>
                    <span className="font-semibold">{templateName(s.template_id) ?? "Freestyle"}</span>
                    {s.notes ? <span className="truncate text-sm text-ink-3">{s.notes}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <BodyWeight />
      </div>
    </div>
  );
}

function BodyWeight() {
  const { unit } = useAuth();
  const metrics = useBodyMetrics();
  const log = useLogBodyWeight();
  const [value, setValue] = useState("");
  const latest = metrics.data?.find((m) => m.body_weight_kg != null);
  const today = todayISO();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!n || n <= 0) return;
    log.mutate(
      { date: today, body_weight_kg: displayToKg(n, unit) },
      { onSuccess: () => setValue("") },
    );
  }

  return (
    <section aria-labelledby="bw-title">
      <SectionTitle>
        <span id="bw-title">Body weight</span>
      </SectionTitle>
      <p className="mb-4 text-ink-2">
        {latest
          ? `${formatWeight(latest.body_weight_kg, unit)}, ${relativeDay(latest.date, today).toLowerCase()}`
          : "Nothing logged yet."}
      </p>
      <form onSubmit={submit} className="flex items-end gap-2">
        <Field
          label={`Today's weight (${unit})`}
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" busy={log.isPending} disabled={!value}>
          Save
        </Button>
      </form>
      {log.isError ? <p className="mt-2 text-sm text-danger">{log.error.message}</p> : null}
      {log.isSuccess && !value ? <p className="mt-2 text-sm text-good">Saved.</p> : null}
    </section>
  );
}
