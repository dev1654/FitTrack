import { displayToKg, kgToDisplay } from "@fittrack/api-client";
import type { Unit } from "./api";

export { displayToKg, kgToDisplay };

/** "62.5 kg", "137.8 lb" */
export function formatWeight(kg: number | null | undefined, unit: Unit): string {
  if (kg === null || kg === undefined) return "Bodyweight";
  return `${formatNumber(kgToDisplay(kg, unit))} ${unit}`;
}

export function formatNumber(n: number, maxDecimals = 1): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: maxDecimals });
}

/** 12,400 -> "12.4K" for axis ticks */
export function compact(n: number): string {
  return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s ? `${m}:${String(s).padStart(2, "0")}` : `${m} min`;
}

export function formatDistance(meters: number | null | undefined): string {
  if (!meters) return "";
  return meters >= 1000 ? `${formatNumber(meters / 1000, 2)} km` : `${formatNumber(meters, 0)} m`;
}
