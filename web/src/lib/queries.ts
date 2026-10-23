/** All server data access, as TanStack Query hooks. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, call } from "./api";
import { todayISO } from "./dates";

export const keys = {
  templates: ["templates"] as const,
  template: (id: number) => ["templates", id] as const,
  sessions: ["sessions"] as const,
  session: (id: number) => ["sessions", id] as const,
  exercises: (params: object) => ["exercises", params] as const,
  exercise: (id: number) => ["exercise", id] as const,
  equipment: ["equipment"] as const,
  equipmentDetail: (id: number) => ["equipment", id] as const,
  last: (exerciseId: number, before?: string, target?: number) =>
    ["last", exerciseId, before, target] as const,
  stats: ["stats"] as const,
  bodyMetrics: ["body-metrics"] as const,
};

// ---------- Catalog ----------

export function useExercises(params: {
  search?: string;
  muscle_group?: string;
  category?: "strength" | "cardio";
  equipment_id?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: keys.exercises(params),
    queryFn: () => call(api.GET("/exercises", { params: { query: { limit: 60, ...params } } })),
    staleTime: 10 * 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useExercise(id: number | undefined) {
  return useQuery({
    queryKey: keys.exercise(id ?? 0),
    queryFn: () =>
      call(api.GET("/exercises/{exercise_id}", { params: { path: { exercise_id: id! } } })),
    enabled: !!id,
    staleTime: 60 * 60_000,
  });
}

export function useEquipmentList() {
  return useQuery({
    queryKey: keys.equipment,
    queryFn: () => call(api.GET("/equipment")),
    staleTime: 60 * 60_000,
  });
}

export function useEquipment(id: number) {
  return useQuery({
    queryKey: keys.equipmentDetail(id),
    queryFn: () =>
      call(api.GET("/equipment/{equipment_id}", { params: { path: { equipment_id: id } } })),
    staleTime: 60 * 60_000,
  });
}

// ---------- Templates ----------

export function useTemplates() {
  return useQuery({
    queryKey: keys.templates,
    queryFn: () => call(api.GET("/templates")),
    staleTime: 5 * 60_000,
  });
}

export function useTemplate(id: number | null | undefined) {
  return useQuery({
    queryKey: keys.template(id ?? 0),
    queryFn: () =>
      call(api.GET("/templates/{template_id}", { params: { path: { template_id: id! } } })),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      description?: string | null;
      category?: string | null;
      exercises: { exercise_id: number; target_sets: number; target_reps: number }[];
    }) => call(api.POST("/templates", { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.templates }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      call(api.DELETE("/templates/{template_id}", { params: { path: { template_id: id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.templates }),
  });
}

export function useSaveAsTemplate(sessionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      call(
        api.POST("/sessions/{session_id}/save-as-template", {
          params: { path: { session_id: sessionId } },
          body: { name },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.templates }),
  });
}

// ---------- Sessions & sets ----------

export function useSessions(limit = 30) {
  return useQuery({
    queryKey: [...keys.sessions, { limit }],
    queryFn: () => call(api.GET("/sessions", { params: { query: { limit } } })),
  });
}

export function useSession(id: number) {
  return useQuery({
    queryKey: keys.session(id),
    queryFn: () =>
      call(api.GET("/sessions/{session_id}", { params: { path: { session_id: id } } })),
  });
}

export async function createSession(templateId?: number | null, date = todayISO()) {
  return call(api.POST("/sessions", { body: { date, template_id: templateId ?? null } }));
}

/** Today's most recent session, or a new empty one. */
export async function getOrCreateTodaySession() {
  const today = todayISO();
  const existing = await call(
    api.GET("/sessions", { params: { query: { from: today, to: today, limit: 1 } } }),
  );
  return existing[0] ?? (await createSession(null, today));
}

export function useUpdateSession(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { notes?: string | null; date?: string }) =>
      call(api.PATCH("/sessions/{session_id}", { params: { path: { session_id: id } }, body })),
    onSuccess: (data) => {
      qc.setQueryData(keys.session(id), data);
      qc.invalidateQueries({ queryKey: keys.sessions, exact: false });
    },
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      call(api.DELETE("/sessions/{session_id}", { params: { path: { session_id: id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.sessions }),
  });
}

export type SetInput = {
  exercise_id: number;
  set_number: number;
  reps?: number | null;
  weight_kg?: number | null;
  duration_seconds?: number | null;
  distance_m?: number | null;
};

export function useSetMutations(sessionId: number) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.session(sessionId) });
    qc.invalidateQueries({ queryKey: ["last"] });
  };
  const add = useMutation({
    mutationFn: (body: SetInput) =>
      call(
        api.POST("/sessions/{session_id}/sets", { params: { path: { session_id: sessionId } }, body }),
      ),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: Partial<SetInput> & { id: number }) =>
      call(api.PATCH("/sets/{set_id}", { params: { path: { set_id: id } }, body })),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => call(api.DELETE("/sets/{set_id}", { params: { path: { set_id: id } } })),
    onSuccess: refresh,
  });
  return { add, update, remove };
}

export function useLastTime(exerciseId: number, before?: string, targetReps?: number) {
  return useQuery({
    queryKey: keys.last(exerciseId, before, targetReps),
    queryFn: () =>
      call(
        api.GET("/exercises/{exercise_id}/last", {
          params: {
            path: { exercise_id: exerciseId },
            query: { before: before ?? null, target_reps: targetReps ?? null },
          },
        }),
      ),
  });
}

// ---------- Progress ----------

export function useExerciseStats(exerciseId: number | undefined) {
  return useQuery({
    queryKey: [...keys.stats, "exercise", exerciseId],
    queryFn: () =>
      call(
        api.GET("/stats/exercises/{exercise_id}", {
          params: { path: { exercise_id: exerciseId! } },
        }),
      ),
    enabled: !!exerciseId,
  });
}

export function useWeeklyVolume(weeks = 12) {
  return useQuery({
    queryKey: [...keys.stats, "weekly", weeks],
    queryFn: () => call(api.GET("/stats/weekly-volume", { params: { query: { weeks } } })),
  });
}

export function usePersonalRecords() {
  return useQuery({
    queryKey: [...keys.stats, "prs"],
    queryFn: () => call(api.GET("/stats/prs")),
  });
}

export function usePlateaus() {
  return useQuery({
    queryKey: [...keys.stats, "plateaus"],
    queryFn: () => call(api.GET("/stats/plateaus")),
  });
}

export function useLastAnalyticsRun() {
  return useQuery({
    queryKey: ["pipeline", "analytics"],
    queryFn: () =>
      call(api.GET("/pipeline/runs", { params: { query: { job: "analytics", limit: 1 } } })),
    staleTime: 10 * 60_000,
  });
}

// ---------- Body metrics & account ----------

export function useBodyMetrics() {
  return useQuery({
    queryKey: keys.bodyMetrics,
    queryFn: () => call(api.GET("/body-metrics")),
  });
}

export function useLogBodyWeight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string; body_weight_kg: number }) =>
      call(api.PUT("/body-metrics", { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.bodyMetrics }),
  });
}

export function useUpdateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (unit_pref: "kg" | "lb") => call(api.PATCH("/auth/me", { body: { unit_pref } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}
