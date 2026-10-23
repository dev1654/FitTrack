/**
 * Typed FitTrack API client shared by the web and mobile apps.
 *
 * Types in ./schema.d.ts are generated from the backend's OpenAPI schema, so a backend
 * change that breaks the apps shows up as a TypeScript error instead of a runtime bug.
 *
 *   const api = createApiClient({ baseUrl, getToken: () => token });
 *   const { data, error } = await api.GET("/templates", { params: { query: { builtin: true } } });
 */
import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

export type { components, paths };
export type Schemas = components["schemas"];

export type ApiClientOptions = {
  baseUrl: string;
  /** Returns the saved JWT, or null when logged out. */
  getToken?: () => string | null | undefined;
  /** Called on any 401, e.g. to clear the token and show the login screen. */
  onUnauthorized?: () => void;
};

export function createApiClient({ baseUrl, getToken, onUnauthorized }: ApiClientOptions) {
  // Look fetch up on every call (not once at creation) so tests and polyfills can replace it.
  const client = createClient<paths>({ baseUrl, fetch: (request) => globalThis.fetch(request) });
  client.use({
    onRequest({ request }) {
      const token = getToken?.();
      if (token) request.headers.set("Authorization", `Bearer ${token}`);
      return request;
    },
    onResponse({ response }) {
      if (response.status === 401) onUnauthorized?.();
      return response;
    },
  });
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;

// The API always uses kilograms; these convert for users who prefer pounds.
const KG_PER_LB = 0.45359237;

export function kgToDisplay(kg: number, unit: "kg" | "lb"): number {
  const value = unit === "kg" ? kg : kg / KG_PER_LB;
  return Math.round(value * 10) / 10;
}

export function displayToKg(value: number, unit: "kg" | "lb"): number {
  return unit === "kg" ? value : Math.round(value * KG_PER_LB * 100) / 100;
}
