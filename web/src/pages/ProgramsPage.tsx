import { Link } from "react-router";
import { buttonClass, Empty, ErrorNote, PageLoading, PageTitle, SectionTitle } from "../components/ui";
import { useTemplates } from "../lib/queries";
import { groupTemplates } from "./TodayPage";

export function ProgramsPage() {
  const templates = useTemplates();

  if (templates.isPending) return <PageLoading />;
  if (templates.isError) return <ErrorNote error={templates.error} onRetry={() => templates.refetch()} />;

  const { mine, programs } = groupTemplates(templates.data);

  return (
    <div className="space-y-12">
      <PageTitle
        aside={
          <Link to="/programs/new" className={buttonClass("primary")}>
            Build a workout
          </Link>
        }
      >
        Programs
      </PageTitle>

      <section aria-labelledby="mine-title">
        <SectionTitle>
          <span id="mine-title">My workouts</span>
        </SectionTitle>
        {mine.length === 0 ? (
          <Empty title="No saved workouts yet">
            Build one from scratch, or open a finished workout and choose “Save as a workout to
            reuse”.
          </Empty>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {mine.map((t) => (
              <li key={t.id}>
                <Link to={`/programs/${t.id}`} className="block px-1 py-3.5 hover:bg-panel">
                  <span className="font-semibold">{t.name}</span>
                  {t.description ? <span className="ml-3 text-sm text-ink-3">{t.description}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="builtin-title" className="space-y-8">
        <SectionTitle>
          <span id="builtin-title">Built-in programs</span>
        </SectionTitle>
        <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
          {[...programs].map(([program, days]) => (
            <div key={program}>
              <h3 className="font-display text-xl font-semibold">{program}</h3>
              <p className="mt-1 text-sm text-ink-2">{days[0]?.description}</p>
              <ul className="mt-3 divide-y divide-rule border-y border-rule">
                {days.map((d) => (
                  <li key={d.id}>
                    <Link to={`/programs/${d.id}`} className="block px-1 py-3 font-medium hover:bg-panel">
                      {d.name.replace(`${program}: `, "")}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
