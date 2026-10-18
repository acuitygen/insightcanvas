import type { Outcome, Plan, VisualFamily } from "./types"

export type ClinicChart = {
  matched: boolean
  title: string
  sql: string
  visual: VisualFamily
  points: { label: string; value: number }[]
}

const plan = {
  metrics: ["revenue"],
  dimension: "month",
  series: null,
  dateRole: "order_date",
  dateRoleReason: "certified_default",
  comparison: "none",
  range: { start: "2024-11-01", end: "2026-10-16", label: "Clinic book", partial: false },
  priorRange: null,
  sourceStart: "2024-11-01",
  sourceEnd: "2026-10-16",
  rolling: null,
  topN: null,
  filters: [],
  visual: "bar",
  visualReason: "Answered from the clinic book.",
  notes: ["Patient names are not on this chart."],
  logic: ["Counted from Jaskirat Mithai Clinic."],
} satisfies Plan

export function clinicOutcome(hit: ClinicChart): Outcome {
  const rows = hit.points.map((point) => ({ label: point.label, value: point.value }))
  return {
    kind: "ok",
    stages: [
      { name: "resolve", status: "done", detail: "Matched the clinic book." },
      { name: "plan", status: "done", detail: hit.title },
      { name: "compile", status: "done", detail: "Read-only SELECT." },
      { name: "validate", status: "done", detail: "Clinic tables only." },
      { name: "execute", status: "done", detail: `${rows.length} rows.` },
      { name: "present", status: "done", detail: "Chart ready." },
    ],
    result: {
      plan: { ...plan, visual: hit.visual },
      sql: hit.sql,
      params: [],
      planHash: "clinic",
      columns: [
        { key: "label", label: "Label", format: "text" },
        { key: "value", label: hit.title, format: "number" },
      ],
      rows,
      chart: {
        xKey: "label",
        rows,
        series: [{ key: "value", label: hit.title, format: "number" }],
        horizontalBars: hit.visual === "bar" && rows.length > 4,
      },
      summary: hit.title,
      logic: plan.logic,
      notes: plan.notes,
      rowCount: rows.length,
    },
  }
}

export const CLINIC_QUESTIONS = [
  "Which practitioner brought in the most consult fees?",
  "How many visits were cancelled?",
  "Which weekdays are busiest?",
  "Medicine sales from the clinic shelf",
]

