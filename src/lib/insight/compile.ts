import { METRICS } from "./catalog"
import { fnv } from "./format"
import { MODEL_VERSION, ROW_CAP, type Grain, type MetricId, type Plan } from "./types"
import { isTimeGrain, periodKey } from "./time"

type Param = { name: string; value: string }

const INTERVAL: Record<Grain, string> = {
  day: "INTERVAL '1 day'",
  week: "INTERVAL '1 week'",
  month: "INTERVAL '1 month'",
  quarter: "INTERVAL '3 months'",
  year: "INTERVAL '1 year'",
  fiscal_year: "INTERVAL '1 year'",
}

function dateCol(plan: Plan, alias = "f"): string {
  return plan.dateRole === "ship_date" ? `${alias}.ship_date` : `${alias}.order_date`
}

function periodSql(plan: Plan): string {
  const grain = plan.dimension
  if (!grain || !isTimeGrain(grain) || grain === "day") return dateCol(plan)
  if (grain === "week") return "d.week_start"
  if (grain === "month") return "d.month_start"
  if (grain === "quarter") return "d.fiscal_quarter_start"
  if (grain === "year") return "d.calendar_year_start"
  return "d.fiscal_year_start"
}

function priorAlign(grain: Grain): string {
  if (grain === "week") return "(spine.period_start - INTERVAL '364 days')::date"
  if (grain === "day") {
    return `CASE
      WHEN spine.period_start = DATE '2024-02-29' THEN DATE '2023-02-28'
      WHEN spine.period_start = DATE '2028-02-29' THEN DATE '2027-02-28'
      ELSE (spine.period_start - INTERVAL '1 year')::date
    END`
  }
  return "(spine.period_start - INTERVAL '1 year')::date"
}

function metricExpr(metric: MetricId, fact = "f"): string {
  if (metric === "return_amount") return "SUM(r.return_amount)"
  if (metric === "return_rate") return "SUM(r.return_amount) / NULLIF(SUM(f.net_revenue), 0)"
  const sql = METRICS[metric].sql
  if (fact === "f") return sql
  return sql.replaceAll("f.", `${fact}.`)
}

export function compile(plan: Plan): { sql: string; params: Param[] } {
  const params: Param[] = []
  const p = (value: string, cast: "date" | "text") => {
    const name = `$${params.length + 1}`
    params.push({ name, value })
    return `${name}::${cast}`
  }

  const usesReturn = plan.metrics.some((metric) => metric === "return_amount" || metric === "return_rate")
  const time = plan.dimension && isTimeGrain(plan.dimension) ? plan.dimension : null
  const limit = plan.topN && !time ? plan.topN : ROW_CAP
  const joins = ["JOIN analytics.dim_date AS d ON d.date_key = " + (usesReturn && plan.metrics.every((metric) => metric === "return_amount") ? "r.return_date" : dateCol(plan))]
  const wheres: string[] = []

  const needsProduct =
    plan.dimension === "product" ||
    plan.dimension === "category" ||
    plan.series === "product" ||
    plan.series === "category" ||
    plan.filters.some((filter) => filter.dim === "product" || filter.dim === "category")
  const needsRegion =
    plan.dimension === "region" || plan.series === "region" || plan.filters.some((filter) => filter.dim === "region")
  const needsChannel =
    plan.dimension === "channel" || plan.series === "channel" || plan.filters.some((filter) => filter.dim === "channel")
  if (needsProduct) joins.push("JOIN analytics.dim_product AS p ON p.product_id = f.product_id")
  if (needsRegion) joins.push("JOIN analytics.dim_region AS g ON g.region_id = f.region_id")
  if (needsChannel) joins.push("JOIN analytics.dim_channel AS c ON c.channel_id = f.channel_id")

  if (!(usesReturn && plan.metrics.every((metric) => metric === "return_amount"))) {
    wheres.push(`${dateCol(plan)} >= ${p(plan.sourceStart, "date")}`)
    wheres.push(`${dateCol(plan)} <= ${p(plan.sourceEnd, "date")}`)
  }
  for (const filter of plan.filters) {
    if (filter.dim === "region") wheres.push(`g.region_id = ${p(filter.value, "text")}`)
    if (filter.dim === "channel") wheres.push(`c.channel_id = ${p(filter.value, "text")}`)
    if (filter.dim === "product") wheres.push(`p.product_id = ${p(filter.value, "text")}`)
    if (filter.dim === "category") wheres.push(`p.category = ${p(filter.value, "text")}`)
  }

  const selectDims: string[] = []
  const group: string[] = []
  if (time) {
    selectDims.push(`${periodSql(plan)} AS period_start`)
    group.push("1")
  } else if (plan.dimension === "region") {
    selectDims.push("g.region_name")
    group.push("1")
  } else if (plan.dimension === "channel") {
    selectDims.push("c.channel_name")
    group.push("1")
  } else if (plan.dimension === "category") {
    selectDims.push("p.category")
    group.push("1")
  } else if (plan.dimension === "product") {
    selectDims.push("p.product_name")
    group.push("1")
  }
  if (plan.series === "region") {
    selectDims.push("g.region_name")
    group.push(String(selectDims.length))
  } else if (plan.series === "channel") {
    selectDims.push("c.channel_name")
    group.push(String(selectDims.length))
  } else if (plan.series === "category") {
    selectDims.push("p.category")
    group.push(String(selectDims.length))
  } else if (plan.series === "product") {
    selectDims.push("p.product_name")
    group.push(String(selectDims.length))
  }

  const metricSelect = plan.metrics
    .filter((metric) => metric !== "return_rate")
    .map((metric) => `${metricExpr(metric)} AS ${metric}`)

  const whereSql = wheres.length ? `WHERE ${wheres.join("\n    AND ")}` : ""
  const groupSql = group.length ? `GROUP BY ${group.join(", ")}` : ""
  const fromSales = `FROM analytics.fact_order_line AS f\n  ${joins.join("\n  ")}\n  ${whereSql}`

  let body: string
  if (plan.metrics.length === 1 && plan.metrics[0] === "return_amount") {
    const retWhere = [
      `r.return_date >= ${p(plan.sourceStart, "date")}`,
      `r.return_date <= ${p(plan.sourceEnd, "date")}`,
    ]
    if (time) {
      const spineStart = p(periodKey(plan.range.start, time), "date")
      const spineEnd = p(periodKey(plan.range.end, time), "date")
      body = `WITH spine AS (
  SELECT gs::date AS period_start
  FROM generate_series(${spineStart}, ${spineEnd}, ${INTERVAL[time]}) AS gs
),
agg AS (
  SELECT d.month_start AS period_start,
         SUM(r.return_amount) AS return_amount
  FROM analytics.fact_return AS r
  JOIN analytics.dim_date AS d ON d.date_key = r.return_date
  WHERE ${retWhere.join("\n    AND ")}
  GROUP BY 1
)
SELECT spine.period_start,
       agg.return_amount
FROM spine
LEFT JOIN agg ON agg.period_start = spine.period_start
ORDER BY spine.period_start
LIMIT ${limit}`
      if (time !== "month") {
        body = body.replaceAll("d.month_start", periodSql({ ...plan, dateRole: "order_date" }).replace("f.order_date", "r.return_date"))
      }
    } else {
      body = `SELECT SUM(r.return_amount) AS return_amount
FROM analytics.fact_return AS r
WHERE ${retWhere.join("\n  AND ")}
LIMIT ${limit}`
    }
  } else if (time && plan.rolling) {
    const frame = plan.rolling - 1
    const spineStart = p(periodKey(plan.sourceStart, time), "date")
    const spineEnd = p(periodKey(plan.sourceEnd, time), "date")
    const displayStart = p(periodKey(plan.range.start, time), "date")
    const window = `OVER (ORDER BY spine.period_start ROWS BETWEEN ${frame} PRECEDING AND CURRENT ROW)`
    const projected = plan.metrics
      .map((metric) => {
        const expr = metricExpr(metric)
        return `CASE
         WHEN COUNT(agg.${metric === "margin_pct" ? "revenue" : metric}) ${window} < ${plan.rolling} THEN NULL
         ELSE ${expr.replaceAll("SUM(f.net_revenue)", `SUM(agg.revenue) ${window}`).replaceAll("SUM(f.units)", `SUM(agg.units) ${window}`).replaceAll("SUM(f.cogs)", `SUM(agg.cost) ${window}`).replaceAll("SUM(f.net_revenue - f.cogs)", `SUM(agg.revenue - agg.cost) ${window}`).replaceAll("COUNT(DISTINCT f.order_id)", `SUM(agg.orders) ${window}`)}
       END AS ${metric}`
      })
      .join(",\n       ")
    body = `WITH spine AS (
  SELECT gs::date AS period_start
  FROM generate_series(${spineStart}, ${spineEnd}, ${INTERVAL[time]}) AS gs
),
agg AS (
  SELECT ${periodSql(plan)} AS period_start,
         SUM(f.net_revenue) AS revenue,
         SUM(f.units) AS units,
         SUM(f.cogs) AS cost,
         COUNT(DISTINCT f.order_id) AS orders
  ${fromSales}
  GROUP BY 1
),
filled AS (
  SELECT spine.period_start, agg.revenue, agg.units, agg.cost, agg.orders
  FROM spine
  LEFT JOIN agg ON agg.period_start = spine.period_start
)
SELECT filled.period_start,
       ${projected.replaceAll("spine.period_start", "filled.period_start").replaceAll("agg.", "filled.")}
FROM filled
WHERE filled.period_start >= ${displayStart}
ORDER BY filled.period_start
LIMIT ${limit}`
  } else if (time && plan.comparison === "yoy" && plan.priorRange) {
    const spineStart = p(periodKey(plan.range.start, time), "date")
    const spineEnd = p(periodKey(plan.range.end, time), "date")
    const priorStart = p(plan.priorRange.start, "date")
    const priorEnd = p(plan.priorRange.end, "date")
    const metricList = plan.metrics.map((metric) => `${metricExpr(metric)} AS ${metric}`).join(",\n         ")
    body = `WITH spine AS (
  SELECT gs::date AS period_start
  FROM generate_series(${spineStart}, ${spineEnd}, ${INTERVAL[time]}) AS gs
),
cur AS (
  SELECT ${periodSql(plan)} AS period_start,
         ${metricList}
  ${fromSales}
  GROUP BY 1
),
prior AS (
  SELECT ${periodSql(plan)} AS period_start,
         ${metricList}
  FROM analytics.fact_order_line AS f
  ${joins.join("\n  ")}
  WHERE ${dateCol(plan)} >= ${priorStart}
    AND ${dateCol(plan)} <= ${priorEnd}
  GROUP BY 1
)
SELECT spine.period_start,
       ${plan.metrics.map((metric) => `cur.${metric} AS ${metric},\n       prior.${metric} AS ${metric}_prior`).join(",\n       ")}
FROM spine
LEFT JOIN cur ON cur.period_start = spine.period_start
LEFT JOIN prior ON prior.period_start = ${priorAlign(time)}
ORDER BY spine.period_start
LIMIT ${limit}`
  } else if (time) {
    const spineStart = p(periodKey(plan.sourceStart, time), "date")
    const spineEnd = p(periodKey(plan.range.end, time), "date")
    body = `WITH spine AS (
  SELECT gs::date AS period_start
  FROM generate_series(${spineStart}, ${spineEnd}, ${INTERVAL[time]}) AS gs
),
agg AS (
  SELECT ${[...selectDims, ...metricSelect].join(",\n         ")}
  ${fromSales}
  ${groupSql}
)
SELECT spine.period_start,
       ${plan.metrics.map((metric) => `agg.${metric}`).join(",\n       ")}${plan.series ? ",\n       agg." + (plan.series === "region" ? "region_name" : plan.series === "channel" ? "channel_name" : plan.series === "category" ? "category" : "product_name") : ""}
FROM spine
LEFT JOIN agg ON agg.period_start = spine.period_start
ORDER BY spine.period_start
LIMIT ${limit}`
  } else {
    const order = plan.topN ? `ORDER BY ${plan.metrics[0]} DESC` : plan.dimension ? "ORDER BY 1" : ""
    body = `SELECT ${[...selectDims, ...metricSelect].join(",\n       ") || "SUM(f.net_revenue) AS revenue"}
${fromSales}
${groupSql}
${order}
LIMIT ${limit}`
  }

  const hash = fnv(`${body}\n${params.map((item) => item.value).join("|")}`)
  const header = [
    `-- InsightCanvas · lumen_retail ${MODEL_VERSION} · plan ${hash}`,
    "-- One SELECT. Execution is bound to this plan hash.",
    `-- Date role: ${plan.dateRole}. Fiscal year starts in April. Timezone Asia/Kolkata.`,
    "-- Literals are parameters. Empty spine periods stay null, not zero.",
    plan.rolling ? "-- Rolling window is calendar periods on the spine after aggregation, not last N detail rows." : "",
    plan.comparison === "yoy" ? "-- Leap day: 29 February clamps to 28 February when the prior year has no peer." : "",
  ]
    .filter(Boolean)
    .join("\n")
  const paramComments = params.map((item) => `-- ${item.name} = ${item.value}`).join("\n")
  return { sql: `${header}\n${body.trim()}\n${paramComments}\n`, params }
}
