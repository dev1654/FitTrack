import { useEffect, useRef, useState } from "react";
import type { Exercise } from "../lib/api";
import { useExercises } from "../lib/queries";
import { CloseIcon } from "./icons";
import { Spinner } from "./ui";

/** Modal search over the exercise catalog. */
export function ExercisePicker({
  open,
  onClose,
  onPick,
  exclude = [],
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  exclude?: number[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      setSearch("");
      el.showModal?.();
    } else if (!open && el.open) {
      el.close?.();
    }
  }, [open]);

  const results = useExercises({ search: debounced || undefined, limit: 40 });
  const items = (results.data ?? []).filter((e) => !exclude.includes(e.id));

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      aria-labelledby="picker-title"
      className="m-auto w-[min(560px,calc(100vw-24px))] rounded-lg border border-rule bg-panel p-0 text-ink backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between border-b border-rule px-5 py-4">
        <h2 id="picker-title" className="font-display text-2xl font-semibold">
          Add an exercise
        </h2>
        <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-ink-2 hover:bg-sunken">
          <CloseIcon />
        </button>
      </div>
      <div className="px-5 pt-4">
        <input
          autoFocus
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search, e.g. squat, curl, row"
          aria-label="Search exercises"
          className="h-11 w-full rounded-md border border-rule bg-page px-3 text-[16px] focus:border-accent focus:outline-none"
        />
      </div>
      <ul className="mt-2 max-h-[55vh] overflow-y-auto px-2 pb-3" aria-live="polite">
        {results.isPending ? (
          <li className="flex justify-center py-8 text-ink-3">
            <Spinner />
          </li>
        ) : items.length === 0 ? (
          <li className="px-3 py-8 text-center text-ink-2">No exercises match “{debounced}”.</li>
        ) : (
          items.map((ex) => (
            <li key={ex.id}>
              <button
                onClick={() => onPick(ex)}
                className="flex w-full items-baseline justify-between gap-4 rounded-md px-3 py-2.5 text-left hover:bg-sunken"
              >
                <span className="font-medium">{ex.name}</span>
                <span className="shrink-0 text-sm text-ink-3 capitalize">
                  {ex.muscle_group}
                  {ex.equipment ? `, ${ex.equipment.name.toLowerCase()}` : ""}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </dialog>
  );
}
