import type { Unit } from "./api";

export type Plate = { weight: number; color: string; label: string; height: number };

// Standard competition colours. Heights (relative) follow real plate diameters.
const KG_PLATES: Plate[] = [
  { weight: 25, color: "var(--plate-red)", label: "25", height: 1 },
  { weight: 20, color: "var(--plate-blue)", label: "20", height: 1 },
  { weight: 15, color: "var(--plate-yellow)", label: "15", height: 1 },
  { weight: 10, color: "var(--plate-green)", label: "10", height: 1 },
  { weight: 5, color: "var(--plate-white)", label: "5", height: 0.62 },
  { weight: 2.5, color: "var(--plate-black)", label: "2.5", height: 0.52 },
  { weight: 1.25, color: "var(--plate-steel)", label: "1.25", height: 0.44 },
];

const LB_PLATES: Plate[] = [
  { weight: 45, color: "var(--plate-blue)", label: "45", height: 1 },
  { weight: 35, color: "var(--plate-yellow)", label: "35", height: 0.9 },
  { weight: 25, color: "var(--plate-green)", label: "25", height: 0.8 },
  { weight: 10, color: "var(--plate-white)", label: "10", height: 0.6 },
  { weight: 5, color: "var(--plate-black)", label: "5", height: 0.5 },
  { weight: 2.5, color: "var(--plate-steel)", label: "2.5", height: 0.42 },
];

export const BAR_WEIGHT: Record<Unit, number> = { kg: 20, lb: 45 };

export type Loadout = {
  bar: number;
  perSide: Plate[];
  /** What the loaded bar actually weighs (may be just under the target). */
  total: number;
  exact: boolean;
};

/**
 * Plates per side for a barbell `target` (in the display unit), largest first.
 * Returns null when the target is lighter than the empty bar.
 */
export function plateLoadout(target: number, unit: Unit): Loadout | null {
  const bar = BAR_WEIGHT[unit];
  if (!(target >= bar)) return null;
  const plates = unit === "kg" ? KG_PLATES : LB_PLATES;
  let remaining = Math.round(((target - bar) / 2) * 100) / 100;
  const perSide: Plate[] = [];
  for (const plate of plates) {
    while (remaining + 1e-9 >= plate.weight) {
      perSide.push(plate);
      remaining = Math.round((remaining - plate.weight) * 100) / 100;
    }
  }
  const total = bar + 2 * perSide.reduce((sum, p) => sum + p.weight, 0);
  return { bar, perSide, total, exact: Math.abs(total - target) < 1e-6 };
}
