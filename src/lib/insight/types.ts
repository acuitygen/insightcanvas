export const MODEL_ID = "lumen_retail"
export const MODEL_VERSION = "v3"
export const AS_OF = "2026-10-16"
export const EXTRACT_START = "2024-01-01"
export const ROW_CAP = 500
export const OPENING_QUESTION = "Revenue by month, fiscal year to date"

export type DateRole = "order_date" | "ship_date"
export type Grain = "day" | "week" | "month" | "quarter" | "year" | "fiscal_year"
export type CatDim = "region" | "channel" | "category" | "product"
export type Dimension = Grain | CatDim
export type MetricId =
  | "revenue"
  | "units"
  | "orders"
  | "cogs"
  | "margin_amount"
  | "margin_pct"
  | "aov"
  | "return_amount"
  | "return_rate"
  | "asp"
  | "units_per_order"
export type FormulaId = "asp" | "units_per_order"
export type VisualFamily =
  | "bar"
  | "line"
  | "area"
  | "donut"
  | "waterfall"
  | "radar"
  | "combo"
  | "timeline"
  | "table"
export type ColumnFormat = "text" | "money" | "money2" | "percent" | "number" | "number2"
export type StageName = "resolve" | "plan" | "compile" | "validate" | "execute" | "present"
export type Comparison = "none" | "yoy" | "prior_period"

export type Filter = { dim: CatDim; value: string; label: string }

export type Range = {
  start: string
  end: string
  label: string
  partial: boolean
}

export type EngineCtx = {
  returnsConfirmed: boolean
  certifiedFormulas: FormulaId[]
}

export const DEFAULT_CTX: EngineCtx = {
  returnsConfirmed: false,
  certifiedFormulas: [],
}

export type Plan = {
  metrics: MetricId[]
  dimension: Dimension | null
  series: CatDim | null
  dateRole: DateRole
  dateRoleReason: "explicit" | "certified_default"
  comparison: Comparison
  range: Range
  priorRange: Range | null
  sourceStart: string
  sourceEnd: string
  rolling: number | null
  topN: number | null
  filters: Filter[]
  visual: VisualFamily
  visualReason: string
  notes: string[]
  logic: string[]
}

export type Column = { key: string; label: string; format: ColumnFormat }

export type Row = Record<string, string | number | null>

export type ChartModel = {
  xKey: string
  rows: Row[]
  series: { key: string; label: string; format: ColumnFormat }[]
  horizontalBars: boolean
}

export type QueryResult = {
  plan: Plan
  sql: string
  params: { name: string; value: string }[]
  planHash: string
  columns: Column[]
  rows: Row[]
  chart: ChartModel
  summary: string
  logic: string[]
  notes: string[]
  rowCount: number
}

export type Stage = {
  name: StageName
  status: "done" | "stopped" | "pending"
  detail: string
}

export type Choice = { label: string; question: string }

export type Outcome =
  | { kind: "ok"; result: QueryResult; stages: Stage[] }
  | { kind: "clarify"; message: string; choices: Choice[]; stages: Stage[] }
  | { kind: "block"; message: string; stage: StageName; stages: Stage[] }

export type SqlVerdict =
  | { ok: true }
  | { ok: false; message: string }
