import type { ChartModel, Column, QueryResult, VisualFamily } from "./types"
import type { FieldKind, Sheet } from "./sheets"

export type Tile = {
  id: string
  title: string
  summary: string
  source: string
  visual: VisualFamily
  chart: ChartModel
  columns: Column[]
}

function numberValue(value: string | number | null) {
  return typeof value === "number" ? value : null
}

export function aggregate(sheet: Sheet, dimension: string, measure: string | null, how: "sum" | "count") {
  const buckets = new Map<string, number>()
  for (const row of sheet.rows) {
    const label = String(row[dimension] ?? "").trim() || "Unspecified"
    const amount = how === "count" || !measure ? 1 : (numberValue(row[measure]) ?? 0)
    buckets.set(label, (buckets.get(label) ?? 0) + amount)
  }
  const dimensionKind = sheet.columns.find((column) => column.key === dimension)?.kind
  let points = [...buckets.entries()].map(([label, value]) => ({ label, value }))
  if (dimensionKind === "date") points.sort((a, b) => a.label.localeCompare(b.label))
  else points.sort((a, b) => b.value - a.value)
  points = points.slice(0, 12)
  return points
}

export function tileFromSheet(input: {
  sheet: Sheet
  dimension: string
  measure: string | null
  how: "sum" | "count"
  visual: VisualFamily
}): Tile {
  const points = aggregate(input.sheet, input.dimension, input.measure, input.how)
  const measureColumn = input.sheet.columns.find((column) => column.key === input.measure)
  const dimensionColumn = input.sheet.columns.find((column) => column.key === input.dimension)
  const format = measureColumn && /fee|billed|revenue|amount|paid/i.test(measureColumn.label) ? "money" : "number"
  const label = input.how === "count" ? "Count" : (measureColumn?.label ?? "Value")
  const chart: ChartModel = {
    xKey: "label",
    rows: points.map((point) => ({ label: point.label, value: point.value })),
    series: [{ key: "value", label, format }],
    horizontalBars: (dimensionColumn?.kind ?? "text") !== "date" && points.length > 5,
  }
  return {
    id: crypto.randomUUID(),
    title: `${label} by ${dimensionColumn?.label ?? "group"}`,
    summary: `${label} by ${dimensionColumn?.label ?? "group"} · ${input.sheet.name}`,
    source: input.sheet.name,
    visual: input.visual,
    chart,
    columns: [
      { key: "label", label: dimensionColumn?.label ?? "Group", format: "text" },
      { key: "value", label, format },
    ],
  }
}

export function resultFromTile(tile: Tile): QueryResult {
  const dimension = tile.chart.horizontalBars ? "product" : tile.visual === "line" || tile.visual === "area" ? "month" : "category"
  return {
    plan: {
      metrics: ["revenue"],
      dimension,
      series: null,
      dateRole: "order_date",
      dateRoleReason: "certified_default",
      comparison: "none",
      range: { start: "2026-10-01", end: "2026-10-16", label: tile.source, partial: false },
      priorRange: null,
      sourceStart: "2026-10-01",
      sourceEnd: "2026-10-16",
      rolling: null,
      topN: null,
      filters: [],
      visual: tile.visual,
      visualReason: tile.summary,
      notes: [],
      logic: [],
    },
    sql: "",
    params: [],
    planHash: tile.id.slice(0, 8),
    columns: tile.columns,
    rows: tile.chart.rows,
    chart: tile.chart,
    summary: tile.summary,
    logic: [],
    notes: [],
    rowCount: tile.chart.rows.length,
  }
}

export function suggestTiles(sheet: Sheet): Tile[] {
  const dates = sheet.columns.filter((column) => column.kind === "date")
  const numbers = sheet.columns.filter((column) => column.kind === "number")
  const texts = sheet.columns.filter((column) => column.kind === "text")
  const tiles: Tile[] = []
  const measure = numbers[0]?.key ?? null
  if (dates[0] && measure) {
    tiles.push(tileFromSheet({ sheet, dimension: dates[0].key, measure, how: "sum", visual: "line" }))
  }
  if (texts[0]) {
    tiles.push(tileFromSheet({ sheet, dimension: texts[0].key, measure, how: measure ? "sum" : "count", visual: "bar" }))
  }
  if (texts[1]) {
    tiles.push(tileFromSheet({ sheet, dimension: texts[1].key, measure: null, how: "count", visual: "donut" }))
  }
  return tiles.slice(0, 3)
}

export function fieldKindLabel(kind: FieldKind) {
  if (kind === "date") return "Date"
  if (kind === "number") return "Number"
  return "Text"
}
