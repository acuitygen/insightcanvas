import { compile } from "./compile"
import { execute } from "./execute"
import { planQuestion } from "./planner"
import {
  AS_OF,
  DEFAULT_CTX,
  OPENING_QUESTION,
  type EngineCtx,
  type Outcome,
  type QueryResult,
  type Stage,
  type StageName,
} from "./types"
import { validateSql } from "./validate"

const STAGE_ORDER: StageName[] = ["resolve", "plan", "compile", "validate", "execute", "present"]

function stages(stopped: StageName | null, details: Partial<Record<StageName, string>>): Stage[] {
  const stopIndex = stopped ? STAGE_ORDER.indexOf(stopped) : STAGE_ORDER.length
  return STAGE_ORDER.map((name, index) => ({
    name,
    status: stopped == null ? "done" : index < stopIndex ? "done" : index === stopIndex ? "stopped" : "pending",
    detail: details[name] ?? (index < stopIndex || stopped == null ? "Completed." : index === stopIndex ? "Stopped." : "Not run."),
  }))
}

export function answer(question: string, ctx: EngineCtx = DEFAULT_CTX): Outcome {
  const planned = planQuestion(question, ctx)
  if (planned.kind === "clarify") {
    return {
      kind: "clarify",
      message: planned.message,
      choices: planned.choices,
      stages: stages("resolve", { resolve: "Needs a choice." }),
    }
  }
  if (planned.kind === "block") {
    return {
      kind: "block",
      message: planned.message,
      stage: "resolve",
      stages: stages("resolve", { resolve: "Refused." }),
    }
  }

  const compiled = compile(planned.plan)
  const verdict = validateSql(compiled.sql, ctx)
  if (!verdict.ok) {
    return {
      kind: "block",
      message: `The compiled statement was refused by the gateway. ${verdict.message}`,
      stage: "validate",
      stages: stages("validate", {
        resolve: "Matched.",
        plan: "Typed plan.",
        compile: "SQL compiled.",
        validate: "Refused.",
      }),
    }
  }

  const executed = execute(planned.plan)
  const result: QueryResult = {
    plan: planned.plan,
    sql: compiled.sql,
    params: compiled.params,
    planHash: compiled.sql.match(/plan ([0-9a-f]+)/)?.[1] ?? "",
    ...executed,
  }
  return {
    kind: "ok",
    result,
    stages: stages(null, {
      resolve: "Matched the model.",
      plan: "Typed plan only.",
      compile: `Plan ${result.planHash}.`,
      validate: "SELECT passed.",
      execute: `${result.rowCount} rows.`,
      present: "Chart and table ready.",
    }),
  }
}

export function collectProblems(): string[] {
  const problems: string[] = []
  const opening = answer(OPENING_QUESTION)
  if (opening.kind !== "ok") problems.push(`opening ${opening.kind}`)
  else {
    if (opening.result.rows.length !== 7) problems.push(`opening rows ${opening.result.rows.length}`)
    if (opening.result.rows[0]?.label !== "Apr 2026") problems.push(`opening first ${opening.result.rows[0]?.label}`)
    if (opening.result.rows[6]?.label !== "Oct 2026") problems.push(`opening last ${opening.result.rows[6]?.label}`)
    const revenue = opening.result.rows.map((row) => row.revenue)
    if (revenue.some((value) => typeof value !== "number" || value <= 0)) problems.push("opening revenue not positive")
    if (!opening.result.plan.range.partial) problems.push("opening should be partial")
    if (opening.result.plan.range.start !== "2026-04-01" || opening.result.plan.range.end !== AS_OF) {
      problems.push(`opening range ${opening.result.plan.range.start} ${opening.result.plan.range.end}`)
    }
  }

  const sales = answer("What were sales by region?")
  if (sales.kind !== "clarify") problems.push("sales should clarify")

  const euros = answer("Revenue in euros by month")
  if (euros.kind !== "block") problems.push("euros should block")

  const drop = answer("drop table orders")
  if (drop.kind !== "block") problems.push("drop should block")

  const dated = answer("Revenue by date this year")
  if (dated.kind !== "clarify") problems.push("by date should clarify")

  const returnsBlocked = answer("Return amount by month")
  if (returnsBlocked.kind !== "block") problems.push("returns should block when unconfirmed")

  const fan = answer("Return amount by product", { returnsConfirmed: true, certifiedFormulas: [] })
  if (fan.kind !== "block" || !fan.message.toLowerCase().includes("fan")) problems.push("fan-out not blocked")

  const confirmed = { returnsConfirmed: true, certifiedFormulas: [] }
  const returns = answer("Return amount by month", { ...confirmed })
  if (returns.kind !== "ok" || returns.result.rows.length < 12) problems.push("returns month failed")

  const top = answer("Top 8 products by revenue, year to date")
  if (top.kind !== "ok" || top.result.rows.length !== 8) problems.push(`top8 ${top.kind === "ok" ? top.result.rows.length : top.kind}`)

  const yoy = answer("Monthly revenue versus last year")
  if (yoy.kind !== "ok" || yoy.result.chart.series.length < 2) problems.push("yoy series")
  else if (!yoy.result.rows.some((row) => typeof row.revenue_prior === "number" && row.revenue_prior > 0)) {
    problems.push("yoy prior empty")
  }

  const margin = answer("Gross margin by category, this quarter")
  if (margin.kind !== "ok") problems.push("margin failed")
  else if (margin.result.rows.some((row) => typeof row.margin_pct === "number" && (row.margin_pct <= 0 || row.margin_pct >= 1))) {
    problems.push("margin out of range")
  }

  const leap = answer("Revenue in February 2025 versus last year")
  if (leap.kind !== "ok" || !leap.result.notes.some((note) => note.toLowerCase().includes("leap"))) problems.push("leap note missing")

  const waterfall = answer("Revenue waterfall by category, fiscal year to date")
  if (waterfall.kind !== "ok" || waterfall.result.plan.visual !== "waterfall") problems.push("waterfall")

  const mix = answer("Revenue mix by channel, last quarter")
  if (mix.kind !== "ok" || mix.result.plan.visual !== "donut") problems.push("donut")
  else if (mix.result.plan.range.start !== "2026-07-01" || mix.result.plan.range.end !== "2026-09-30") {
    problems.push(`last quarter ${mix.result.plan.range.start} ${mix.result.plan.range.end}`)
  }

  const radar = answer("Revenue, units and gross margin by category, last quarter")
  if (radar.kind !== "ok" || radar.result.plan.visual !== "radar" || radar.result.plan.metrics.length !== 3) problems.push("radar")

  const asp = answer("Average selling price by category, this quarter")
  if (asp.kind !== "block") problems.push("asp should block")
  const aspOk = answer("Average selling price by category, this quarter", {
    returnsConfirmed: false,
    certifiedFormulas: ["asp"],
  })
  if (aspOk.kind !== "ok" || aspOk.result.rows.length < 1) problems.push("asp certified failed")

  const attacks = [
    "DROP TABLE analytics.fact_order_line",
    "SELECT net_revenue FROM analytics.fact_order_line; DELETE FROM analytics.fact_order_line",
    "SELECT pg_read_file('/etc/passwd')",
    "SELECT secret FROM secret.credentials LIMIT 10",
    "SELECT * FROM analytics.fact_order_line LIMIT 10",
    "SELECT SUM(net_revenue) FROM analytics.fact_order_line",
  ]
  for (const sql of attacks) {
    const verdict = validateSql(sql, DEFAULT_CTX)
    if (verdict.ok) problems.push(`attack passed: ${sql}`)
  }
  if (opening.kind === "ok") {
    const verdict = validateSql(opening.result.sql, DEFAULT_CTX)
    if (!verdict.ok) problems.push(`opening sql refused: ${verdict.message}`)
  }

  const rolling = answer("Rolling 3-month revenue")
  if (rolling.kind !== "ok") problems.push(`rolling ${rolling.kind === "block" ? rolling.message : rolling.kind}`)
  else {
    const verdict = validateSql(rolling.result.sql, DEFAULT_CTX)
    if (!verdict.ok) problems.push(`rolling sql: ${verdict.message}`)
    if (!rolling.result.rows.some((row) => typeof row.revenue === "number" && row.revenue > 0)) problems.push("rolling empty")
  }

  return problems
}

export function assertHealthy(): void {
  const problems = collectProblems()
  if (problems.length) {
    throw new Error(`InsightCanvas checks failed:\n${problems.join("\n")}`)
  }
}
