import { Link, useParams } from "react-router";
import { Button, ErrorNote, PageLoading, PageTitle } from "../components/ui";
import { useEquipment } from "../lib/queries";
import { useAddToToday } from "../lib/useAddToToday";

export function EquipmentPage() {
  const id = Number(useParams().id);
  const equipment = useEquipment(id);
  const { addToToday, pendingId, error } = useAddToToday();

  if (equipment.isPending) return <PageLoading />;
  if (equipment.isError) return <ErrorNote error={equipment.error} />;
  const eq = equipment.data;
  const exercises = [...eq.exercises].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <Link to="/library?tab=equipment" className="text-sm font-semibold text-ink-2 hover:text-ink">
        All equipment
      </Link>
      <div className="mt-3">
        <PageTitle>{eq.name}</PageTitle>
      </div>
      {eq.how_to ? <p className="-mt-2 max-w-[70ch] text-ink-2">{eq.how_to}</p> : null}
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

      <h2 className="mt-10 mb-2 font-display text-2xl font-semibold">
        {exercises.length} {exercises.length === 1 ? "exercise" : "exercises"}
      </h2>
      {exercises.length === 0 ? (
        <p className="text-ink-2">No exercises use this yet.</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {exercises.map((ex) => (
            <li key={ex.id} className="flex flex-wrap items-center justify-between gap-3 px-1 py-3">
              <span>
                <span className="font-semibold">{ex.name}</span>
                <span className="ml-2 text-sm text-ink-3 capitalize">{ex.muscle_group}</span>
              </span>
              <Button size="sm" busy={pendingId === ex.id} onClick={() => addToToday(ex.id)}>
                Log it
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
