import { formatBy } from "@/lib/insight/format"
import { useInsight, useInsightReady } from "@/lib/insight/store"
import { ChartView } from "./chart-view"

export function EmbedScreen({ id }: { id: string }) {
  const ready = useInsightReady()
  const saved = useInsight((state) => state.saved)
  if (!ready) {
    return <p className="p-6 text-sm text-muted">Checking the embed token…</p>
  }
  const visual = saved.find((item) => item.id === id)
  const expired = visual ? visual.expiresAt < new Date().toISOString() : true
  if (!visual || visual.revoked || expired) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="font-display text-3xl">No data</h1>
        <p className="mt-3 text-muted">This embed token is expired or revoked. Nothing is returned.</p>
      </main>
    )
  }
  return (
    <main className="mx-auto grid max-w-4xl gap-4 p-4 md:p-6">
      <p className="text-sm text-muted">Authenticated embed · token scoped to this visual · frame ancestors limited to the client environment</p>
      <h1 className="font-display text-2xl md:text-3xl">{visual.summary}</h1>
      <ChartView
        result={{
          plan: { ...fakePlan(visual.visual), visual: visual.visual, dimension: visual.chart.horizontalBars ? "product" : "month" },
          sql: visual.sql,
          params: [],
          planHash: visual.planHash,
          columns: visual.columns,
          rows: visual.rows,
          chart: visual.chart,
          summary: visual.summary,
          logic: visual.logic,
          notes: visual.notes,
          rowCount: visual.rows.length,
        }}
        visual={visual.visual}
        summary={visual.summary}
      />
      <div className="overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{visual.summary}</caption>
          <thead>
            <tr>
              {visual.columns.map((column) => (
                <th key={column.key} scope="col" className="border-b border-line px-3 py-2 text-left">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visual.rows.map((row) => (
              <tr key={String(row.label)}>
                {visual.columns.map((column, index) => {
                  const text = formatBy(column.format, row[column.key] ?? null)
                  return index === 0 ? (
                    <th key={column.key} scope="row" className="border-b border-line px-3 py-2 text-left">{text}</th>
                  ) : (
                    <td key={column.key} className="border-b border-line px-3 py-2 tabular-nums">{text}</td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}

function fakePlan(visual: "bar" | "line" | "area" | "donut" | "waterfall" | "radar" | "combo" | "timeline" | "table") {
  return {
    metrics: ["revenue" as const],
    dimension: "month" as const,
    series: null,
    dateRole: "order_date" as const,
    dateRoleReason: "certified_default" as const,
    comparison: "none" as const,
    range: { start: "2026-04-01", end: "2026-10-16", label: "Saved", partial: false },
    priorRange: null,
    sourceStart: "2026-04-01",
    sourceEnd: "2026-10-16",
    rolling: null,
    topN: null,
    filters: [],
    visual,
    visualReason: "Saved binding.",
    notes: [],
    logic: [],
  }
}
