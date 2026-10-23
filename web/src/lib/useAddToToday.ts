import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { getOrCreateTodaySession, keys } from "./queries";

/** "Log it" from the library: opens today's workout (creating one if needed) with the exercise added. */
export function useAddToToday() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addToToday(exerciseId: number) {
    setPendingId(exerciseId);
    setError(null);
    try {
      const session = await getOrCreateTodaySession();
      await qc.invalidateQueries({ queryKey: keys.sessions });
      navigate(`/workouts/${session.id}?add=${exerciseId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open today's workout.");
      setPendingId(null);
    }
  }

  return { addToToday, pendingId, error };
}
