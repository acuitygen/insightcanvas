import { useEffect, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatBy, formatCompact } from "@/lib/insight/format"
import type { ChartModel, ColumnFormat, QueryResult, Row, VisualFamily } from "@/lib/insight/types"
import { isTimeGrain } from "@/lib/insight/time"

const FILLS = ["var(--color-heat)", "var(--color-amber)", "var(--color-sage)", "var(--color-night-fg)", "var(--color-night-muted)"]

export function compatibleVisuals(result: QueryResult): VisualFamily[] {
  const dimension = result.plan.dimension
  const time = Boolean(dimension && isTimeGrain(dimension))
  const count = result.rows.length
  const multi = result.chart.series.length > 1
  const options: VisualFamily[] = ["table"]
  if (!dimension || count === 0) return options
  options.push("bar")
  if (time) options.push("line", "area", "timeline")
  if (multi) options.push("combo")
  if (!time && count >= 2 && count <= 8) options.push("donut", "waterfall", "radar")
  else if (!time && count >= 3 && count <= 8) options.push("radar")
  return options
}

export const VISUAL_LABEL: Record<VisualFamily, string> = {
  bar: "Columns",
  line: "Line",
  area: "Area",
  donut: "Donut",
  waterfall: "Waterfall",
  radar: "Radar",
  combo: "Combination",
  timeline: "Timeline",
  table: "Table",
}

type TipProps = {
  active?: boolean
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string | number; payload?: Row }[]
  label?: string
  series: ChartModel["series"]
}

function Tip({ active, payload, label, series }: TipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-night-2 px-3 py-2 text-sm text-night-fg shadow-shell">
      <p className="font-semibold">{label}</p>
      {payload.map((item) => {
        const key = String(item.dataKey ?? "")
        if (key === "base" || key === "delta") {
          const raw = item.payload?.raw
          const spec = series[0]
          return (
            <p key={key} className="tabular-nums text-night-muted">
              {spec ? formatBy(spec.format, typeof raw === "number" ? raw : null) : ""}
            </p>
          )
        }
        const spec = series.find((entry) => entry.key === key)
        const raw = item.payload?.[`raw_${key}`]
        const value = raw != null ? raw : item.value
        return (
          <p key={key} className="tabular-nums text-night-fg">
            {item.name}: {spec ? formatBy(spec.format, typeof value === "number" ? value : null) : String(value ?? "")}
          </p>
        )
      })}
    </div>
  )
}

function axisTick(format: ColumnFormat) {
  return (value: number) => formatCompact(format, value)
}

export function ChartView({
  result,
  visual,
  summary,
}: {
  result: QueryResult
  visual: VisualFamily
  summary: string
}) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  if (visual === "table" || result.rows.length === 0 || result.chart.series.length === 0) return null
  if (!ready) {
    return <div className="h-72 rounded-[1.25rem] bg-night" aria-hidden="true" />
  }

  const { rows, series, horizontalBars } = result.chart
  const height = visual === "timeline" || (visual === "bar" && horizontalBars) ? Math.max(280, rows.length * 36 + 24) : 320
  const format = series[0]?.format ?? "number"
  const grid = <CartesianGrid stroke="var(--color-night-line)" vertical={false} />
  const tip = <Tooltip content={<Tip series={series} />} />

  let plot = null
  if (visual === "donut") {
    const key = series[0].key
    const data = rows.filter((row) => typeof row[key] === "number" && (row[key] as number) > 0)
    plot = (
      <PieChart>
        <Pie data={data} dataKey={key} nameKey="label" innerRadius={68} outerRadius={104} stroke="var(--color-night)">
          {data.map((row, index) => (
            <Cell key={String(row.label)} fill={FILLS[index % FILLS.length]} />
          ))}
        </Pie>
        <Legend wrapperStyle={{ color: "var(--color-night-fg)" }} />
        {tip}
      </PieChart>
    )
  } else if (visual === "waterfall") {
    let acc = 0
    const data = rows.map((row) => {
      const raw = typeof row[series[0].key] === "number" ? (row[series[0].key] as number) : 0
      const base = raw >= 0 ? acc : acc + raw
      acc += raw
      return { label: row.label, base, delta: Math.abs(raw), raw, sign: raw >= 0 ? "up" : "down" }
    })
    data.push({ label: "Total", base: 0, delta: Math.abs(acc), raw: acc, sign: "total" })
    plot = (
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        {grid}
        <XAxis dataKey="label" tick={{ fill: "var(--color-night-muted)", fontSize: 12 }} interval={0} />
        <YAxis tickFormatter={axisTick(format)} tick={{ fill: "var(--color-night-muted)", fontSize: 12 }} width={56} />
        <Tooltip content={<Tip series={series} />} />
        <Bar dataKey="base" stackId="bridge" fill="transparent" />
        <Bar dataKey="delta" stackId="bridge">
          {data.map((row) => (
            <Cell
              key={String(row.label)}
              fill={row.sign === "down" ? "var(--color-amber)" : row.sign === "total" ? "var(--color-night-fg)" : "var(--color-heat)"}
            />
          ))}
        </Bar>
      </BarChart>
    )
  } else if (visual === "radar") {
    const scaled = rows.map((row) => {
      const next: Row = { label: row.label }
      for (const item of series) {
        const max = Math.max(...rows.map((entry) => Math.abs(typeof entry[item.key] === "number" ? (entry[item.key] as number) : 0)), 1)
        const raw = typeof row[item.key] === "number" ? (row[item.key] as number) : 0
        next[item.key] = (raw / max) * 100
        next[`raw_${item.key}`] = raw
      }
      return next
    })
    plot = (
      <RadarChart data={scaled} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke="var(--color-night-line)" />
        <PolarAngleAxis dataKey="label" tick={{ fill: "var(--color-night-muted)", fontSize: 12 }} />
        {series.map((item, index) => (
          <Radar
            key={item.key}
            name={item.label}
            dataKey={item.key}
            stroke={FILLS[index % FILLS.length]}
            fill={FILLS[index % FILLS.length]}
            fillOpacity={0.2}
          />
        ))}
        <Legend wrapperStyle={{ color: "var(--color-night-fg)" }} />
        <Tooltip content={<Tip series={series} />} />
      </RadarChart>
    )
  } else if (visual === "line" || visual === "area") {
    const Chart = visual === "area" ? AreaChart : LineChart
    plot = (
      <Chart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        {grid}
        <XAxis dataKey="label" tick={{ fill: "var(--color-night-muted)", fontSize: 12 }} />
        <YAxis tickFormatter={axisTick(format)} tick={{ fill: "var(--color-night-muted)", fontSize: 12 }} width={56} />
        {tip}
        {series.length > 1 ? <Legend /> : null}
        {series.map((item, index) =>
          visual === "area" ? (
            <Area
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={FILLS[index % FILLS.length]}
              fill={FILLS[index % FILLS.length]}
              fillOpacity={0.15}
              connectNulls={false}
            />
          ) : (
            <Line
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={FILLS[index % FILLS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          ),
        )}
      </Chart>
    )
  } else if (visual === "combo") {
    plot = (
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        {grid}
        <XAxis dataKey="label" tick={{ fill: "var(--color-night-muted)", fontSize: 12 }} />
        <YAxis tickFormatter={axisTick(format)} tick={{ fill: "var(--color-night-muted)", fontSize: 12 }} width={56} />
        {tip}
        <Legend wrapperStyle={{ color: "var(--color-night-fg)" }} />
        {series.map((item, index) =>
          index === 0 ? (
            <Bar key={item.key} dataKey={item.key} name={item.label} fill={FILLS[0]} />
          ) : (
            <Line key={item.key} type="monotone" dataKey={item.key} name={item.label} stroke={FILLS[index % FILLS.length]} strokeWidth={2} dot={false} />
          ),
        )}
      </ComposedChart>
    )
  } else {
    const horizontal = visual === "timeline" || horizontalBars
    plot = horizontal ? (
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        {grid}
        <XAxis type="number" tickFormatter={axisTick(format)} tick={{ fill: "var(--color-night-muted)", fontSize: 12 }} />
        <YAxis type="category" dataKey="label" width={128} tick={{ fill: "var(--color-night-fg)", fontSize: 12 }} />
        {tip}
        {series.length > 1 ? <Legend /> : null}
        {series.map((item, index) => (
          <Bar key={item.key} dataKey={item.key} name={item.label} fill={FILLS[index % FILLS.length]} />
        ))}
      </BarChart>
    ) : (
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        {grid}
        <XAxis dataKey="label" tick={{ fill: "var(--color-night-muted)", fontSize: 12 }} interval={0} />
        <YAxis tickFormatter={axisTick(format)} tick={{ fill: "var(--color-night-muted)", fontSize: 12 }} width={56} />
        {tip}
        {series.length > 1 ? <Legend /> : null}
        {series.map((item, index) => (
          <Bar key={item.key} dataKey={item.key} name={item.label} fill={FILLS[index % FILLS.length]} />
        ))}
      </BarChart>
    )
  }

  return (
    <figure className="rounded-[1.25rem] bg-night p-3 text-night-fg md:p-5">
      <figcaption className="sr-only">{summary}</figcaption>
      <div className="w-full" style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          {plot}
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
