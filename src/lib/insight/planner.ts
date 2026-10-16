import { CATEGORIES, CHANNELS, FORMULAS, METRICS, PRODUCTS, REGIONS } from "./catalog"
import {
  AS_OF,
  type CatDim,
  type Choice,
  type Comparison,
  type DateRole,
  type Dimension,
  type EngineCtx,
  type Filter,
  type FormulaId,
  type Grain,
  type MetricId,
  type Plan,
  type Range,
  type VisualFamily,
} from "./types"
import {
  addDays,
  addMonths,
  diffDays,
  fiscalQuarterRange,
  isTimeGrain,
  leapDaysIn,
  parseMonthToken,
  priorWindow,
  rangeCalendarYear,
  rangeFull,
  rangeLastFiscalYear,
  rangeLastMonth,
  rangeLastNMonths,
  rangeLastNWeeks,
  rangeLastQuarter,
  rangeMonth,
  rangeMtd,
  rangeQtd,
  rangeYtd,
  yoyRange,
} from "./time"

export type Planned =
  | { kind: "plan"; plan: Plan }
  | { kind: "clarify"; message: string; choices: Choice[] }
  | { kind: "block"; message: string }

type TimeIntent = {
  range: Range
  clause: string
  rolling: number | null
  rollingUnit: "month" | "week" | null
  outside?: string
}

const GRAIN_WORD: Record<Grain, string> = {
  day: "day",
  week: "week",
  month: "month",
  quarter: "quarter",
  year: "year",
  fiscal_year: "fiscal year",
}

function norm(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u2019']/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9%$.\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function buildQuestion(metric: string, dim: Dimension | null, series: CatDim | null, timeClause: string, filters: Filter[], visual: string) {
  const bits = [metric]
  if (dim) bits.push("by", isTimeGrain(dim) ? GRAIN_WORD[dim] : dim)
  if (series) bits.push("and", series)
  if (filters.length) bits.push("for", filters.map((filter) => filter.label).join(" "))
  if (timeClause) bits.push(timeClause)
  if (visual) bits.push(visual)
  return bits.join(" ").replace(/\s+/g, " ").trim()
}

function parseTime(q: string): TimeIntent {
  const quarter = q.match(/\bq\s*([1-4])\s*fy\s*(20\d\d)\b/)
  if (quarter) {
    const range = fiscalQuarterRange(Number(quarter[2]), Number(quarter[1]))
    if (!range) return { range: rangeFull(), clause: "", rolling: null, rollingUnit: null, outside: "That fiscal quarter is outside the published extract." }
    return { range, clause: `q${quarter[1]} fy${quarter[2]}`, rolling: null, rollingUnit: null }
  }

  const month = q.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(20\d\d)\b/,
  )
  if (month) {
    const index = parseMonthToken(month[1])
    const range = index ? rangeMonth(Number(month[2]), index) : null
    if (!range) return { range: rangeFull(), clause: "", rolling: null, rollingUnit: null, outside: "That month is outside the published extract." }
    return { range, clause: `in ${month[1]} ${month[2]}`, rolling: null, rollingUnit: null }
  }

  const calendar = q.match(/\b(?:calendar year|during|in)\s+(20\d\d)\b/)
  if (calendar && !/\bfy\s*20/.test(q)) {
    const range = rangeCalendarYear(Number(calendar[1]))
    if (!range) return { range: rangeFull(), clause: "", rolling: null, rollingUnit: null, outside: "That year is outside the published extract." }
    return { range, clause: `in ${calendar[1]}`, rolling: null, rollingUnit: null }
  }

  const rolling = q.match(/\b(?:rolling|trailing)\s+(\d+)\s*-?\s*(month|week)s?\b/)
  const lastDays = q.match(/\blast\s+(\d+)\s+days?\b/)
  const lastN = q.match(/\blast\s+(\d+)\s+(weeks?|months?)\b/)

  let range = rangeFull()
  let clause = ""
  if (/\bcalendar year to date\b|\bcalendar ytd\b/.test(q)) {
    range = rangeCalendarYear(Number(AS_OF.slice(0, 4))) ?? rangeFull()
    clause = "calendar year to date"
  } else if (/\bmonth to date\b|\bmtd\b|\bthis month\b/.test(q)) {
    range = rangeMtd()
    clause = "month to date"
  } else if (/\bquarter to date\b|\bqtd\b|\bthis quarter\b/.test(q)) {
    range = rangeQtd()
    clause = "this quarter"
  } else if (/\blast month\b|\bprior month\b|\bprevious month\b/.test(q)) {
    range = rangeLastMonth()
    clause = "last month"
  } else if (/\blast quarter\b|\bprior quarter\b|\bprevious quarter\b/.test(q)) {
    range = rangeLastQuarter()
    clause = "last quarter"
  } else if (/\bfiscal year to date\b|\bfytd\b|\byear to date\b|\bytd\b|\bthis fiscal year\b|\bthis year\b/.test(q)) {
    range = rangeYtd()
    clause = "fiscal year to date"
  } else if (/\blast year\b|\bprior year\b|\bprevious year\b|\blast fiscal year\b/.test(q)) {
    range = rangeLastFiscalYear()
    clause = "last fiscal year"
  } else if (lastDays && !rolling) {
    const n = Number(lastDays[1])
    range = {
      start: addDays(AS_OF, -(n - 1)),
      end: AS_OF,
      partial: true,
      label: `Last ${n} days`,
    }
    clause = `last ${n} days`
  } else if (lastN && !rolling) {
    const n = Number(lastN[1])
    if (lastN[2].startsWith("week")) {
      range = rangeLastNWeeks(n)
      clause = `last ${n} weeks`
    } else {
      range = rangeLastNMonths(n)
      clause = `last ${n} months`
    }
  } else if (rolling) {
    const n = Number(rolling[1])
    const unit = rolling[2] === "week" ? "week" : "month"
    range = unit === "week" ? rangeLastNWeeks(12) : rangeLastNMonths(12)
    clause = `rolling ${n}-${unit}`
    return { range, clause, rolling: n, rollingUnit: unit }
  }

  if (rolling) {
    const n = Number(rolling[1])
    const unit = rolling[2] === "week" ? "week" : "month"
    return { range, clause: `${clause} rolling ${n}-${unit}`.trim(), rolling: n, rollingUnit: unit }
  }
  return { range, clause, rolling: null, rollingUnit: null }
}

function recommend(dimension: Dimension | null, metrics: MetricId[], comparison: Comparison, hint: VisualFamily | null, mix: boolean): { visual: VisualFamily; reason: string } {
  if (hint === "waterfall" && dimension && !isTimeGrain(dimension) && metrics.length === 1 && comparison === "none") {
    return { visual: "waterfall", reason: "You asked for a waterfall, and this is a single measure by category." }
  }
  if (hint === "donut" || (mix && dimension && !isTimeGrain(dimension) && metrics.length === 1)) {
    return { visual: "donut", reason: "A donut shows the mix. The table keeps the amounts." }
  }
  if (hint === "radar" && dimension && !isTimeGrain(dimension)) {
    return { visual: "radar", reason: "Radar compares the shape of categories. Axes with different units are scaled, and the table keeps the real numbers." }
  }
  if (hint === "timeline" && dimension && isTimeGrain(dimension)) {
    return { visual: "timeline", reason: "A timeline lays the periods out as bars." }
  }
  if (hint === "area" && dimension && isTimeGrain(dimension)) {
    return { visual: "area", reason: "An area chart emphasises the level over time." }
  }
  if (hint === "line" && dimension && isTimeGrain(dimension)) {
    return { visual: "line", reason: "A line reads the change from period to period." }
  }
  if (hint === "bar") {
    return { visual: "bar", reason: "Columns compare the values directly." }
  }
  if (!dimension) return { visual: "table", reason: "This is a single result, so the figure and the table are the visual." }
  if (isTimeGrain(dimension)) {
    if (comparison !== "none" || metrics.length > 1) {
      return { visual: "combo", reason: "Columns show the current measure. The comparison, or the second measure, is the line." }
    }
    return { visual: "line", reason: "A line reads change over time." }
  }
  if (metrics.length >= 3) {
    return { visual: "radar", reason: "Three measures across categories. Axes are scaled so they share a chart. Read the table for actual units." }
  }
  return { visual: "bar", reason: "Columns compare categories." }
}

export function planQuestion(original: string, ctx: EngineCtx): Planned {
  const raw = original.trim()
  if (!raw) {
    return {
      kind: "clarify",
      message: "Ask a question about the published Lumen Outdoor model. I will not run a query until the measure and the breakdown are clear.",
      choices: [
        { label: "Revenue by month, fiscal year to date", question: "Revenue by month, fiscal year to date" },
        { label: "Revenue by region this fiscal year", question: "Revenue by region this fiscal year" },
        { label: "Gross margin by category, this quarter", question: "Gross margin by category, this quarter" },
      ],
    }
  }

  if (/^\s*(select|with|drop|delete|insert|update|alter|truncate)\b/i.test(raw) || /\bselect\b[\s\S]+\bfrom\b/i.test(raw)) {
    return {
      kind: "block",
      message: "The question box takes plain English. SQL is checked on the model page, and even a valid statement is not executed unless it matches a bound plan.",
    }
  }

  const currency = raw.match(/\b(euros?|eur|inr|rupees?|gbp|pounds?)\b|[₹£€]/i)
  if (currency) {
    const name = currency[1] ?? currency[0]
    return {
      kind: "block",
      message: `No conversion is declared from USD to ${name}. Mixed currencies are refused rather than guessed.`,
    }
  }

  const q = norm(raw)

  if (/\b(drop|truncate|delete|insert|update|alter|grant)\b/.test(q) && /\b(table|database|schema|row|rows)\b/.test(q)) {
    return {
      kind: "block",
      message: "That is not a question against the semantic model. Writes and schema changes are refused before a plan is built.",
    }
  }

  if (/\binventory\b/.test(q)) {
    return { kind: "block", message: "Inventory is not in the published model, so I stopped before planning." }
  }
  if (/\bcustomers?\b/.test(q)) {
    return { kind: "block", message: "No customer dimension is certified in model v3, so I will not invent one." }
  }
  if (/\bforecasts?\b|\bpredict\b|\bprojection\b/.test(q)) {
    return { kind: "block", message: "Forecasting is outside this version. I can only describe recorded activity." }
  }
  if (/\bbudgets?\b|\btargets?\b/.test(q)) {
    return { kind: "block", message: "No budget or target is certified, so I will not invent a comparison." }
  }
  if (/\bemployees?\b|\bsalary\b|\bpayroll\b/.test(q)) {
    return { kind: "block", message: "People data is not in this model." }
  }

  if (/\bprofit\b/.test(q) && !/\bgross profit\b|\bmargin\b/.test(q)) {
    return {
      kind: "clarify",
      message: "Profit is not a certified name. Which measure did you mean?",
      choices: [
        { label: "Gross profit (dollars)", question: raw.replace(/profit/i, "gross profit") },
        { label: "Gross margin (percent)", question: raw.replace(/profit/i, "gross margin") },
      ],
    }
  }

  const metrics: MetricId[] = []
  if (/\baverage order value\b|\baov\b|\bbasket\b/.test(q)) metrics.push("aov")
  if (/\baverage selling price\b|\basp\b/.test(q)) metrics.push("asp")
  if (/\bunits per order\b/.test(q)) metrics.push("units_per_order")
  if (/\bgross profit\b|\bmargin dollars\b|\bmargin amount\b/.test(q)) metrics.push("margin_amount")
  else if (/\bgross margin\b|\bmargin\b/.test(q)) metrics.push("margin_pct")
  if (/\breturn rate\b|\brate of returns\b/.test(q)) metrics.push("return_rate")
  else if (/\breturns?\b/.test(q)) metrics.push("return_amount")
  if (/\brevenue\b|\bturnover\b|\bnet sales\b|\bsales revenue\b/.test(q)) metrics.push("revenue")
  if (/\bunits\b|\bquantity\b/.test(q) && !/\bunits per order\b/.test(q)) metrics.push("units")
  if (/\borders\b|\border count\b/.test(q)) metrics.push("orders")
  if (/\bcogs\b|\bcost of goods\b/.test(q)) metrics.push("cogs")

  const salesAmbiguous = /\bsales\b/.test(q) && !/\brevenue\b|\bnet sales\b|\bsales revenue\b|\bturnover\b/.test(q) && metrics.length === 0

  let dimension: Dimension | null = null
  const dims: CatDim[] = []
  if (/\bby region\b|\bregions\b/.test(q)) dims.push("region")
  if (/\bby channel\b|\bchannels\b/.test(q)) dims.push("channel")
  if (/\bby categor/.test(q) || /\bcategories\b/.test(q)) dims.push("category")
  if (/\bby products?\b|\bproducts\b|\bskus?\b/.test(q)) dims.push("product")
  const top = q.match(/\btop\s+(\d+)\b/)
  let topN = top ? Math.min(20, Math.max(1, Number(top[1]))) : null
  if (!topN && /\btop\s+products?\b/.test(q)) topN = 8

  let grain: Grain | null = null
  if (/\bby day\b|\bdaily\b/.test(q)) grain = "day"
  else if (/\bby week\b|\bweekly\b/.test(q)) grain = "week"
  else if (/\bby month\b|\bmonthly\b/.test(q)) grain = "month"
  else if (/\bby quarter\b|\bquarterly\b/.test(q)) grain = "quarter"
  else if (/\bby fiscal year\b/.test(q)) grain = "fiscal_year"
  else if (/\bby year\b|\byearly\b/.test(q)) grain = "year"
  else if (/\bover time\b|\btrend\b/.test(q)) grain = "month"

  let comparison: Comparison = "none"
  let timeQ = q
  if (/\byoy\b|\byear over year\b|\byear-over-year\b|\bvs last year\b|\bversus last year\b|\bcompared with last year\b|\bcompared to last year\b|\bagainst last year\b|\bsame period last year\b/.test(timeQ)) {
    comparison = "yoy"
    timeQ = timeQ
      .replace(/\byoy\b|\byear over year\b|\byear-over-year\b/g, " ")
      .replace(/\bvs last year\b|\bversus last year\b|\bcompared with last year\b|\bcompared to last year\b|\bagainst last year\b|\bsame period last year\b/g, " ")
  } else if (/\bprior period\b|\bprevious period\b|\bvs prior\b|\bversus prior\b/.test(timeQ)) {
    comparison = "prior_period"
    timeQ = timeQ.replace(/\bprior period\b|\bprevious period\b|\bvs prior\b|\bversus prior\b/g, " ")
  }

  const time = parseTime(timeQ)
  if (time.outside) return { kind: "block", message: time.outside }
  if (time.rollingUnit === "week" && !grain) grain = "week"
  if (time.rollingUnit === "month" && !grain) grain = "month"
  if (/\blast\s+\d+\s+days?\b/.test(timeQ) && !grain) grain = "day"
  if (/\blast\s+\d+\s+weeks?\b/.test(timeQ) && !grain) grain = "week"
  if (/\blast\s+\d+\s+months?\b/.test(timeQ) && !grain && !time.rolling) grain = "month"
  if (time.rolling && comparison !== "none") {
    return {
      kind: "block",
      message: "Choose a rolling window or a comparison with another period, not both in one visual.",
    }
  }

  let series: CatDim | null = null
  if (grain) {
    dimension = grain
    series = dims[0] ?? null
  } else if (dims[0]) {
    dimension = dims[0]
    series = dims[1] ?? null
  }
  if (dims.length > 2 || (grain && dims.length > 1)) {
    return {
      kind: "clarify",
      message: "I can break a result down by two fields, not three. Which pair should I keep?",
      choices: [
        { label: `${dims[0]} and ${dims[1] ?? "month"}`, question: buildQuestion("Revenue", dims[0], dims[1] ?? null, time.clause, [], "") },
        { label: "Just the first breakdown", question: buildQuestion("Revenue", grain ?? dims[0], null, time.clause, [], "") },
      ],
    }
  }

  const filters: Filter[] = []
  const product = [...PRODUCTS].sort((a, b) => b.name.length - a.name.length).find((item) => q.includes(item.name.toLowerCase()))
  if (product) filters.push({ dim: "product", value: product.id, label: product.name })
  if (!product) {
    const category = CATEGORIES.find((item) => new RegExp(`\\b${item.toLowerCase()}\\b`).test(q))
    if (category) filters.push({ dim: "category", value: category, label: category })
  }
  for (const region of REGIONS) {
    if (new RegExp(`\\b${region.id}\\b`).test(q)) filters.push({ dim: "region", value: region.id, label: region.name })
  }
  for (const channel of CHANNELS) {
    if (new RegExp(`\\b${channel.id}\\b`).test(q)) filters.push({ dim: "channel", value: channel.id, label: channel.name })
  }

  let hint: VisualFamily | null = null
  let visualClause = ""
  if (/\bwaterfall\b|\bbridge\b/.test(q)) {
    hint = "waterfall"
    visualClause = "as a waterfall"
  } else if (/\bdonut\b|\bpie\b|\bmix\b|\bshare of\b/.test(q)) {
    hint = "donut"
    visualClause = "as a mix"
  } else if (/\bradar\b|\bspider\b/.test(q)) {
    hint = "radar"
    visualClause = "as a radar"
  } else if (/\btimeline\b/.test(q)) {
    hint = "timeline"
    visualClause = "as a timeline"
  } else if (/\barea\b/.test(q)) {
    hint = "area"
    visualClause = "as an area chart"
  } else if (/\bline chart\b|\bas a line\b/.test(q)) {
    hint = "line"
    visualClause = "as a line"
  } else if (/\bbar chart\b|\bcolumn chart\b|\bas a bar\b/.test(q)) {
    hint = "bar"
    visualClause = "as a bar"
  }

  const mentionsOrder = /\border date\b|\bon order date\b|\bordered date\b/.test(q)
  const mentionsShip = /\bship date\b|\bshipped\b|\bshipping date\b|\bon ship date\b/.test(q)
  const dateAmbiguous = /\bby date\b|\bdate role\b/.test(q) && !mentionsOrder && !mentionsShip

  if (salesAmbiguous || (metrics.length === 0 && (dimension || time.clause || filters.length))) {
    const metricChoices = [
      ["Revenue", "revenue"],
      ["Units", "units"],
      ["Orders", "orders"],
    ] as const
    return {
      kind: "clarify",
      message: salesAmbiguous
        ? "Sales is not a certified measure. It could mean revenue, units, or orders. I need you to choose before I compile anything."
        : "I could not match a certified measure. Which one should I use?",
      choices: metricChoices.map(([label, id]) => ({
        label,
        question: buildQuestion(label, dimension, series, time.clause, filters, visualClause || (id === "revenue" ? "" : "")),
      })),
    }
  }

  if (metrics.length === 0) {
    return {
      kind: "clarify",
      message: "I could not match that to the published model. Try a certified measure such as revenue, units, orders, or gross margin.",
      choices: [
        { label: "Revenue by month, fiscal year to date", question: "Revenue by month, fiscal year to date" },
        { label: "Gross margin by category, this quarter", question: "Gross margin by category, this quarter" },
        { label: "Orders by channel, month to date", question: "Orders by channel, month to date" },
      ],
    }
  }

  if (dateAmbiguous || (mentionsOrder && mentionsShip)) {
    return {
      kind: "clarify",
      message: "This model has two date roles, order date and ship date. I will not pick one silently.",
      choices: [
        {
          label: "Order date, the certified default",
          question: buildQuestion(METRICS[metrics[0]].label, grain ?? "month", null, `${time.clause} on order date`.trim(), filters, ""),
        },
        {
          label: "Ship date",
          question: buildQuestion(METRICS[metrics[0]].label, grain ?? "month", null, `${time.clause} on ship date`.trim(), filters, ""),
        },
      ],
    }
  }

  if (grain === "day" && diffDays(time.range.start, time.range.end) > 62) {
    return {
      kind: "clarify",
      message: "Daily grain over a long window is a hard chart to read, and it is easy to confuse with a month total. Narrow it, or use months.",
      choices: [
        { label: "Last 30 days", question: buildQuestion(METRICS[metrics[0]].label, "day", null, "last 30 days", filters, "") },
        { label: "February 2025", question: buildQuestion(METRICS[metrics[0]].label, "day", null, "in february 2025", filters, "") },
        { label: "By month instead", question: buildQuestion(METRICS[metrics[0]].label, "month", null, time.clause, filters, "") },
      ],
    }
  }

  const formulaMetrics = metrics.filter((metric): metric is FormulaId => metric === "asp" || metric === "units_per_order")
  for (const formula of formulaMetrics) {
    if (!ctx.certifiedFormulas.includes(formula)) {
      const spec = FORMULAS[formula]
      return {
        kind: "block",
        message: `${spec.name} is not a certified measure. Draft it on the model page and certify it before it can be shared. The expression is ${spec.tree}.`,
      }
    }
  }

  const usesReturns = metrics.some((metric) => metric === "return_amount" || metric === "return_rate")
  if (usesReturns && (series || (dimension && !isTimeGrain(dimension)) || filters.length > 0)) {
    return {
      kind: "block",
      message:
        "Returns are stored at order grain, with no product, region, or channel of their own. Joining them onto order lines would fan the amount out. Ask for return amount by month, or certify an allocation rule first.",
    }
  }
  if (usesReturns && !ctx.returnsConfirmed) {
    return {
      kind: "block",
      message:
        "Returns are only a foreign-key suggestion today. Confirm the order-id relationship on the model page before I can use that table. I will not guess the join.",
    }
  }
  if (series && unique(metrics).length > 1) {
    return { kind: "block", message: "Use one measure when the result is also split two ways." }
  }
  if (series && comparison !== "none") {
    return { kind: "block", message: "Choose a period comparison or a second breakdown, not both." }
  }

  if (metrics.length > 1 && comparison !== "none") {
    return {
      kind: "block",
      message: "Ask for one measure when you want a period comparison. A second measure and a comparison do not fit one visual cleanly.",
    }
  }

  let resolvedDimension = dimension
  const notes: string[] = []
  if (resolvedDimension && !isTimeGrain(resolvedDimension) && filters.some((filter) => filter.dim === resolvedDimension)) {
    notes.push(`${filters.find((filter) => filter.dim === resolvedDimension)?.label} is already a filter, so it is not also used as a breakdown.`)
    resolvedDimension = series
  }

  const dateRole: DateRole = mentionsShip ? "ship_date" : "order_date"
  const dateRoleReason = mentionsShip || mentionsOrder ? "explicit" : "certified_default"
  if (dateRoleReason === "certified_default" && !usesReturns) {
    notes.push("Date role is order date, the certified default. Say ship date if you mean the other role.")
  }
  if (usesReturns) {
    notes.push("Returns use return date. Revenue in a return rate uses order date. They are aggregated separately, then aligned on the period.")
  }
  if (time.range.label === "Full extract" && !time.rolling) {
    notes.push("No time window was named, so this uses the full extract, 1 Jan 2024 through 16 Oct 2026.")
  }
  if (time.clause === "fiscal year to date" || time.range.label.startsWith("FY")) {
    notes.push("Year to date follows the fiscal calendar, which starts in April, not the calendar year.")
  }
  if (time.range.partial) {
    notes.push(`${time.range.label} is partial through 16 Oct 2026. The period is labelled so it is not read as a complete one.`)
  }

  let priorRange: Range | null = null
  let leapClamped = false
  if (comparison === "yoy") {
    const shifted = yoyRange(time.range)
    priorRange = shifted.range
    leapClamped = shifted.clamped
    notes.push("The comparison uses the same dates last year, not the whole prior year, when the current window is partial.")
  } else if (comparison === "prior_period") {
    priorRange = priorWindow(time.range)
    notes.push("The prior period is the window of the same length immediately before this one.")
  }
  const leapCurrent = leapDaysIn(time.range.start, time.range.end)
  const leapPrior = priorRange ? leapDaysIn(priorRange.start, priorRange.end) : []
  if (leapClamped || leapCurrent.length || leapPrior.length) {
    const days = unique([...leapCurrent, ...leapPrior])
    notes.push(
      days.length
        ? `Leap-day rule: 29 February clamps to 28 February when a day has no peer. This window touches ${days.map((day) => day).join(" and ")}. Month totals keep the extra day. A daily comparison shows 29 February against 28 February, and says so.`
        : "Leap-day rule: 29 February clamps to 28 February when the other year has no 29th.",
    )
  }
  if (resolvedDimension && isTimeGrain(resolvedDimension)) {
    notes.push("Empty periods stay null. Null means no source record, not a stored zero.")
  }
  if (metrics.includes("margin_pct") || metrics.includes("aov") || metrics.includes("asp") || metrics.includes("return_rate") || metrics.includes("units_per_order")) {
    notes.push("Ratios divide aggregates. A zero denominator is null, with this note, rather than zero or an error.")
  }
  if (time.rolling) {
    notes.push(
      `The rolling ${time.rolling}-${time.rollingUnit} value is summed on the calendar spine after the grain is aggregated. It is not the last ${time.rolling} detail rows. A gap in the window makes the result null.`,
    )
  }
  if (topN && resolvedDimension && isTimeGrain(resolvedDimension)) topN = null
  if (topN) {
    notes.push("Top N is applied after aggregation. It is a rank, not a scan limit. The gateway still adds its own row cap.")
  }
  notes.push("All figures are USD. The model has no conversion rule for any other currency.")

  const chosen = recommend(resolvedDimension, unique(metrics), comparison, hint, /\bmix\b|\bshare\b/.test(q))
  if (hint && hint !== chosen.visual) {
    notes.push(`The requested chart does not fit this shape, so I used ${chosen.visual} instead. You can switch to any compatible binding.`)
  }

  const logic = unique(metrics).map((metric) => `${METRICS[metric].label}: ${METRICS[metric].logic}`)
  if (dateRole === "ship_date") logic.push("Rows are filtered on ship date. Orders not yet shipped by 16 Oct 2026 are excluded.")

  let sourceStart = time.range.start
  const sourceEnd = time.range.end
  if (time.rolling && time.rollingUnit === "month") {
    sourceStart = addMonths(time.range.start, -(time.rolling - 1))
  }
  if (time.rolling && time.rollingUnit === "week") {
    sourceStart = addDays(time.range.start, -7 * (time.rolling - 1))
  }

  const plan: Plan = {
    metrics: unique(metrics),
    dimension: resolvedDimension,
    series: series ?? null,
    dateRole,
    dateRoleReason,
    comparison,
    range: time.range,
    priorRange,
    sourceStart,
    sourceEnd,
    rolling: time.rolling,
    topN,
    filters,
    visual: chosen.visual,
    visualReason: chosen.reason,
    notes,
    logic,
  }
  return { kind: "plan", plan }
}
