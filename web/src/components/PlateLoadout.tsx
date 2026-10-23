import type { Unit } from "../lib/api";
import { plateLoadout } from "../lib/plates";
import { formatNumber } from "../lib/units";

const THICKNESS: Record<string, number> = {
  "25": 20, "20": 18, "15": 15, "10": 13, "5": 10, "2.5": 8, "1.25": 6,
  "45": 20, "35": 17,
};

/**
 * One side of the bar, loaded for `weight` (display unit). Plates are drawn to scale in
 * competition colours, collar side on the left as you'd see it standing at the rack.
 */
export function PlateLoadout({ weight, unit }: { weight: number; unit: Unit }) {
  const loadout = plateLoadout(weight, unit);
  if (!loadout) return null;

  const H = 84;
  const gap = 2;
  const sleeveStart = 44;
  const plates = loadout.perSide;
  const platesWidth = plates.reduce((w, p) => w + (THICKNESS[p.label] ?? 8) + gap, 0);
  const width = Math.max(sleeveStart + platesWidth + 40, 170);

  let x = sleeveStart + 6;
  const summary =
    plates.length === 0
      ? `Empty bar, ${loadout.bar} ${unit}`
      : `Per side: ${plates.map((p) => p.label).join(" + ")} ${unit}, on a ${loadout.bar} ${unit} bar`;

  return (
    <figure className="flex items-center gap-4">
      <svg
        viewBox={`0 0 ${width} ${H}`}
        width={width}
        height={H}
        role="img"
        aria-label={summary}
        className="shrink-0"
      >
        {/* shaft, collar, sleeve */}
        <rect x={0} y={H / 2 - 3.5} width={sleeveStart} height={7} rx={2} fill="var(--bar)" />
        <rect x={sleeveStart - 5} y={H / 2 - 11} width={7} height={22} rx={1.5} fill="var(--bar)" />
        <rect x={sleeveStart} y={H / 2 - 5} width={width - sleeveStart} height={12} rx={3} fill="var(--bar)" opacity={0.75} />
        {plates.map((plate, i) => {
          const w = THICKNESS[plate.label] ?? 8;
          const h = (H - 4) * plate.height;
          const rect = (
            <rect
              key={i}
              x={x}
              y={(H - h) / 2}
              width={w}
              height={h}
              rx={2.5}
              fill={plate.color}
              stroke={plate.color === "var(--plate-white)" ? "var(--ink-3)" : "none"}
              strokeWidth={1}
            />
          );
          x += w + gap;
          return rect;
        })}
      </svg>
      <figcaption className="text-sm leading-snug">
        {plates.length === 0 ? (
          <span className="text-ink-2">Empty bar</span>
        ) : (
          <>
            <span className="block font-display text-xl leading-tight font-semibold tabular">
              {plates.map((p) => p.label).join(" + ")}
            </span>
            <span className="text-ink-2">
              per side, on a {formatNumber(loadout.bar)} {unit} bar
            </span>
          </>
        )}
        {!loadout.exact ? (
          <span className="block text-ink-3">
            Closest load: {formatNumber(loadout.total, 2)} {unit}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
