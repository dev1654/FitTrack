import { createApiClient, type Schemas } from "@fittrack/api-client";

export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const TOKEN_KEY = "fittrack.token";

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode: the session simply won't persist */
    }
  },
};

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export const api = createApiClient({
  baseUrl: API_URL,
  getToken: () => tokenStore.get(),
  onUnauthorized: () => onUnauthorized(),
});

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Turns FastAPI's error bodies into one readable sentence. */
export function errorMessage(error: unknown, status: number): string {
  if (status === 0) return "Can't reach the server. Check your connection and try again.";
  const detail = (error as { detail?: unknown } | undefined)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { loc?: unknown[]; msg?: string };
    const field = first.loc?.filter((p) => typeof p === "string" && p !== "body").pop();
    const msg = (first.msg ?? "Invalid value").replace(/^Value error, /, "");
    return field ? `${String(field).replace(/_/g, " ")}: ${msg}` : msg;
  }
  if (status >= 500) return "The server had a problem. Try again in a moment.";
  return "Something went wrong. Try again.";
}

/** Unwraps an openapi-fetch result, throwing ApiError on failure. */
export async function call<T>(
  promise: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result;
  try {
    result = await promise;
  } catch {
    throw new ApiError(errorMessage(undefined, 0), 0);
  }
  if (result.error !== undefined || !result.response.ok) {
    throw new ApiError(errorMessage(result.error, result.response.status), result.response.status);
  }
  return result.data as T;
}

export type User = Schemas["UserOut"];
export type Unit = User["unit_pref"];
export type Exercise = Schemas["ExerciseOut"];
export type ExerciseBrief = Schemas["ExerciseBrief"];
export type Equipment = Schemas["EquipmentOut"];
export type EquipmentDetail = Schemas["EquipmentDetail"];
export type TemplateSummary = Schemas["TemplateSummary"];
export type Template = Schemas["TemplateOut"];
export type SessionSummary = Schemas["SessionSummary"];
export type Session = Schemas["SessionOut"];
export type SetEntry = Schemas["SetOut"];
export type LastTime = Schemas["LastTimeOut"];
export type ExerciseStat = Schemas["ExerciseStatOut"];
export type WeeklyVolume = Schemas["WeeklyVolumeOut"];
export type PersonalRecord = Schemas["PersonalRecordOut"];
export type Plateau = Schemas["PlateauOut"];
export type BodyMetric = Schemas["BodyMetricOut"];
export type PipelineRun = Schemas["PipelineRunOut"];
