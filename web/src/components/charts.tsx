/**
 * Chart primitives. One series per chart, in the accent; hairline grid; 2px lines with
 * ringed 8px dots; bars capped at 24px with 4px rounded ends; tooltips on hover; every
 * chart has a table view for screen readers and exact values.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { compact, formatNumber } from "../lib/units";

export type Point = { label: string; value: number; detail?: string };

const AXIS = { fontSize: 12, fill: "var(--ink-3)" };

function ChartTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: { payload: Point }[];
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-rule bg-panel px-3 py-2 text-sm shadow-sm">
      <p className="text-ink-2">{p.detail ?? p.label}</p>
      <p className="font-semibold tabular">
        {formatNumber(p.value)} {unit}
      </p>
    </div>
  );
}

function DataTable({ data, unit, caption }: { data: Point[]; unit: string; caption: string }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-ink-3 hover:text-ink">Show as table</summary>
      <table className="mt-2 w-full max-w-md text-left">
        <caption className="sr-only">{caption}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label} className="border-b border-rule">
              <th scope="row" className="py-1.5 font-normal text-ink-2">
                {d.detail ?? d.label}
              </th>
              <td className="py-1.5 text-right font-semibold tabular">
                {formatNumber(d.value)} {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function TrendLine({
  data,
  unit,
  caption,
  height = 240,
}: {
  data: Point[];
  unit: string;
  caption: string;
  height?: number;
}) {
  const last = data.at(-1);
  return (
    <figure>
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 56, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} minTickGap={24} />
            <YAxis
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              width={44}
              domain={["auto", "auto"]}
              tickCount={5}
              tickFormatter={(v: number) => compact(v)}
            />
            <Tooltip
              content={<ChartTooltip unit={unit} />}
              cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--chart-series)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={data.length <= 24 ? { r: 4, fill: "var(--chart-series)", stroke: "var(--panel)", strokeWidth: 2 } : false}
              activeDot={{ r: 5, fill: "var(--chart-series)", stroke: "var(--panel)", strokeWidth: 2 }}
              isAnimationActive={false}
              label={(props: { index?: number; x?: number | string; y?: number | string }) =>
                props.index === data.length - 1 && last ? (
                  <text
                    key="end"
                    x={Number(props.x) + 10}
                    y={Number(props.y) + 4}
                    fontSize={13}
                    fontWeight={600}
                    fill="var(--ink)"
                  >
                    {formatNumber(last.value)}
                  </text>
                ) : (
                  <g key={props.index} />
                )
              }
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable data={data} unit={unit} caption={caption} />
    </figure>
  );
}

export function Columns({
  data,
  unit,
  caption,
  height = 220,
}: {
  data: Point[];
  unit: string;
  caption: string;
  height?: number;
}) {
  return (
    <figure>
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} minTickGap={12} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickCount={4} tickFormatter={(v: number) => compact(v)} />
            <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ fill: "var(--sunken)" }} />
            <Bar dataKey="value" fill="var(--chart-series)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable data={data} unit={unit} caption={caption} />
    </figure>
  );
}

/** Horizontal bars, sorted by the caller, with the value at each bar's tip. */
export function Ranking({ data, unit, caption }: { data: Point[]; unit: string; caption: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <figure>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row" className="w-28 py-1.5 pr-3 text-left font-medium text-ink-2 capitalize">
                {d.label}
              </th>
              <td className="py-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className="h-[18px] rounded-r-[4px] bg-[var(--chart-series)]"
                    style={{ width: `${Math.max((d.value / max) * 75, 0.5)}%` }}
                  />
                  <span className="font-semibold whitespace-nowrap tabular">
                    {compact(d.value)} {unit}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
