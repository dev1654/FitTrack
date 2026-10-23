import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button, ErrorNote, PageLoading, PageTitle } from "../components/ui";
import { todayISO } from "../lib/dates";
import { createSession, keys, useDeleteTemplate, useTemplate } from "../lib/queries";

export function ProgramPage() {
  const id = Number(useParams().id);
  const template = useTemplate(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const del = useDeleteTemplate();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (template.isPending) return <PageLoading />;
  if (template.isError) return <ErrorNote error={template.error} />;
  const t = template.data;

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const session = await createSession(t.id, todayISO());
      await qc.invalidateQueries({ queryKey: keys.sessions });
      navigate(`/workouts/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the workout.");
      setStarting(false);
    }
  }

  return (
    <div>
      <Link to="/programs" className="text-sm font-semibold text-ink-2 hover:text-ink">
        All programs
      </Link>
      <div className="mt-3">
        <PageTitle
          aside={
            <Button variant="primary" busy={starting} onClick={start}>
              Start this workout
            </Button>
          }
        >
          {t.name}
        </PageTitle>
      </div>
      {t.description ? <p className="-mt-2 mb-6 max-w-2xl text-ink-2">{t.description}</p> : null}
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      <table className="w-full max-w-2xl text-left">
        <thead className="text-sm text-ink-3">
          <tr className="border-b border-rule">
            <th scope="col" className="py-2 font-medium">Exercise</th>
            <th scope="col" className="py-2 text-right font-medium">Sets × reps</th>
          </tr>
        </thead>
        <tbody>
          {t.exercises.map((e) => (
            <tr key={e.id} className="border-b border-rule">
              <td className="py-3">
                <span className="font-semibold">{e.exercise.name}</span>
                <span className="ml-2 text-sm text-ink-3 capitalize">{e.exercise.muscle_group}</span>
              </td>
              <td className="py-3 text-right font-display text-xl font-semibold tabular">
                {e.target_sets} × {e.target_reps}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!t.is_builtin ? (
        <div className="mt-10">
          <Button
            variant="danger"
            busy={del.isPending}
            onClick={() => del.mutate(t.id, { onSuccess: () => navigate("/programs") })}
          >
            Delete this saved workout
          </Button>
          <p className="mt-1 text-sm text-ink-3">Workouts you already logged with it are kept.</p>
        </div>
      ) : null}
    </div>
  );
}
