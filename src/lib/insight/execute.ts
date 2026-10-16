import { CHANNEL_BY_ID, METRICS, PRODUCT_BY_ID, REGION_BY_ID } from "./catalog"
import { LINES, RETURNS, type Line } from "./dataset"
import { formatBy, formatPercent } from "./format"
import {
  type CatDim,
  type ChartModel,
  type Column,
  type ColumnFormat,
  type MetricId,
  type Plan,
  type QueryResult,
  type Row,
} from "./types"
import {
  isTimeGrain,
  labelPeriod,
  periodKey,
  shiftPeriod,
  spine,
} from "./time"

type Bucket = {
  revenue: number
  units: number
  cost: number
  orders: Set<string>
  rows: number
  returns: number
}

function blank(): Bucket {
  return { revenue: 0, units: 0, cost: 0, orders: new Set(), rows: 0, returns: 0 }
}

function merge(a: Bucket, b: Bucket): Bucket {
  const orders = new Set(a.orders)
  for (const id of b.orders) orders.add(id)
  return {
    revenue: a.revenue + b.revenue,
    units: a.units + b.units,
    cost: a.cost + b.cost,
    orders,
    rows: a.rows + b.rows,
    returns: a.returns + b.returns,
  }
}

function metricValue(bucket: Bucket, metric: MetricId): number | null {
  if (metric === "return_amount") {
    if (bucket.returns === 0 && bucket.rows === 0) return null
    if (bucket.returns === 0 && bucket.rows > 0) return null
    return Math.round(bucket.returns / 100)
  }
  if (metric === "return_rate") {
    if (bucket.returns === 0 && bucket.rows === 0) return null
    if (bucket.revenue === 0) return null
    return bucket.returns / bucket.revenue
  }
  if (bucket.rows === 0) return null
  if (metric === "revenue") return Math.round(bucket.revenue / 100)
  if (metric === "units") return bucket.units
  if (metric === "orders") return bucket.orders.size
  if (metric === "cogs") return Math.round(bucket.cost / 100)
  if (metric === "margin_amount") return Math.round((bucket.revenue - bucket.cost) / 100)
  if (metric === "margin_pct") return bucket.revenue === 0 ? null : (bucket.revenue - bucket.cost) / bucket.revenue
  if (metric === "aov") return bucket.orders.size === 0 ? null : Math.round((bucket.revenue / bucket.orders.size) ) / 100
  if (metric === "asp") return bucket.units === 0 ? null : Math.round(bucket.revenue / bucket.units) / 100
  if (metric === "units_per_order") return bucket.orders.size === 0 ? null : bucket.units / bucket.orders.size
  return null
}

function lineOk(line: Line, plan: Plan, start: string, end: string): boolean {
  const date = plan.dateRole === "ship_date" ? line.shipDate : line.orderDate
  if (date < start || date > end) return false
  for (const filter of plan.filters) {
    if (filter.dim === "region" && line.regionId !== filter.value) return false
    if (filter.dim === "channel" && line.channelId !== filter.value) return false
    if (filter.dim === "product" && line.productId !== filter.value) return false
    if (filter.dim === "category" && PRODUCT_BY_ID[line.productId]?.category !== filter.value) return false
  }
  return true
}

function catOf(line: Line, dim: CatDim): { id: string; label: string } {
  if (dim === "region") return { id: line.regionId, label: REGION_BY_ID[line.regionId].name }
  if (dim === "channel") return { id: line.channelId, label: CHANNEL_BY_ID[line.channelId].name }
  if (dim === "product") return { id: line.productId, label: PRODUCT_BY_ID[line.productId].name }
  const category = PRODUCT_BY_ID[line.productId].category
  return { id: category, label: category }
}

function addLine(bucket: Bucket, line: Line) {
  bucket.revenue += line.revenueCents
  bucket.units += line.units
  bucket.cost += line.costCents
  bucket.orders.add(line.orderId)
  bucket.rows += 1
}

function accumulate(plan: Plan, start: string, end: string): Map<string, Bucket> {
  const map = new Map<string, Bucket>()
  const grain = plan.dimension && isTimeGrain(plan.dimension) ? plan.dimension : null
  for (const line of LINES) {
    if (!lineOk(line, plan, start, end)) continue
    const date = plan.dateRole === "ship_date" ? line.shipDate : line.orderDate
    let key = "all"
    if (grain) key = periodKey(date, grain)
    else if (plan.dimension === "region" || plan.dimension === "channel" || plan.dimension === "category" || plan.dimension === "product") {
      key = catOf(line, plan.dimension).id
    }
    if (plan.series) key = `${key}||${catOf(line, plan.series).id}`
    const bucket = map.get(key) ?? blank()
    addLine(bucket, line)
    map.set(key, bucket)
  }
  if (plan.metrics.some((metric) => metric === "return_amount" || metric === "return_rate")) {
    for (const row of RETURNS) {
      if (row.returnDate < start || row.returnDate > end) continue
      let key = "all"
      if (grain) key = periodKey(row.returnDate, grain)
      const bucket = map.get(key) ?? blank()
      bucket.returns += row.amountCents
      map.set(key, bucket)
    }
  }
  return map
}

function change(current: number | null, prior: number | null, format: ColumnFormat): number | null {
  if (current == null || prior == null) return null
  if (format === "percent") return current - prior
  if (prior === 0) return null
  return (current - prior) / Math.abs(prior)
}

function roleName(plan: Plan): string {
  return plan.dateRole === "ship_date" ? "Ship-date" : "Order-date"
}

export function execute(plan: Plan): Omit<QueryResult, "plan" | "sql" | "params" | "planHash"> {
  const notes = [...plan.notes]
  const metrics = plan.metrics
  const grain = plan.dimension && isTimeGrain(plan.dimension) ? plan.dimension : null
  const current = accumulate(plan, plan.sourceStart, plan.sourceEnd)
  const prior = plan.priorRange && plan.comparison === "yoy" ? accumulate(plan, plan.priorRange.start, plan.priorRange.end) : null

  type Draft = { label: string; sort: string; cells: Record<string, number | null> }
  const drafts: Draft[] = []
  let zeroDenom = false

  const remember = (value: number | null, metric: MetricId, bucket: Bucket) => {
    if (value != null) return
    if (metric === "margin_pct" && bucket.rows > 0 && bucket.revenue === 0) zeroDenom = true
    if ((metric === "aov" || metric === "units_per_order") && bucket.rows > 0 && bucket.orders.size === 0) zeroDenom = true
    if (metric === "asp" && bucket.rows > 0 && bucket.units === 0) zeroDenom = true
    if (metric === "return_rate" && bucket.revenue === 0 && bucket.returns > 0) zeroDenom = true
  }

  if (!plan.dimension) {
    const bucket = current.get("all") ?? blank()
    const cells: Record<string, number | null> = {}
    for (const metric of metrics) {
      const value = metricValue(bucket, metric)
      remember(value, metric, bucket)
      cells[metric] = value
    }
    if (prior && plan.priorRange) {
      const priorBucket = prior.get("all") ?? blank()
      for (const metric of metrics) {
        const value = metricValue(priorBucket, metric)
        cells[`${metric}_prior`] = value
        cells[`${metric}_change`] = change(cells[metric], value, METRICS[metric].format)
      }
    }
    drafts.push({ label: plan.range.label, sort: plan.range.start, cells })
  } else if (grain) {
    const keys = spine(plan.rolling ? plan.sourceStart : plan.range.start, plan.range.end, grain)
    const display = new Set(spine(plan.range.start, plan.range.end, grain))
    const lag = new Map<string, Bucket>()
    keys.forEach((key, index) => {
      let bucket = current.get(key) ?? blank()
      if (plan.rolling) {
        const start = index - (plan.rolling - 1)
        if (start < 0) bucket = blank()
        else {
          let merged = blank()
          let gap = false
          for (let i = start; i <= index; i++) {
            const part = current.get(keys[i]) ?? blank()
            const empty = metrics.some((metric) => metric.startsWith("return")) ? part.returns === 0 && part.rows === 0 : part.rows === 0
            if (empty) gap = true
            merged = merge(merged, part)
          }
          bucket = gap ? blank() : merged
        }
      }
      lag.set(key, bucket)
      if (!display.has(key)) return
      const cells: Record<string, number | null> = {}
      if (plan.series) {
        const members = membersOf(plan.series)
        for (const member of members) {
          const part = current.get(`${key}||${member.id}`) ?? blank()
          const value = metricValue(part, metrics[0])
          remember(value, metrics[0], part)
          cells[member.id] = value
        }
      } else {
        for (const metric of metrics) {
          const value = metricValue(bucket, metric)
          remember(value, metric, bucket)
          cells[metric] = value
          if (plan.comparison === "yoy" && prior) {
            const shifted = shiftPeriod(key, grain)
            const priorBucket = prior.get(shifted.iso) ?? blank()
            const priorValue = metricValue(priorBucket, metric)
            cells[`${metric}_prior`] = priorValue
            cells[`${metric}_change`] = change(value, priorValue, METRICS[metric].format)
          }
          if (plan.comparison === "prior_period" && index > 0) {
            const prev = lag.get(keys[index - 1]) ?? blank()
            const priorValue = metricValue(prev, metric)
            cells[`${metric}_prior`] = priorValue
            cells[`${metric}_change`] = change(value, priorValue, METRICS[metric].format)
          }
        }
      }
      drafts.push({ label: labelPeriod(key, grain), sort: key, cells })
    })
  } else if (plan.series && plan.dimension && !isTimeGrain(plan.dimension)) {
    const primaries = new Map<string, string>()
    const members = membersOf(plan.series)
    for (const [key] of current) {
      const [primary] = key.split("||")
      if (!primaries.has(primary)) primaries.set(primary, labelFor(plan.dimension, primary))
    }
    for (const [id, label] of primaries) {
      const cells: Record<string, number | null> = {}
      for (const member of members) {
        const bucket = current.get(`${id}||${member.id}`) ?? blank()
        const value = metricValue(bucket, metrics[0])
        remember(value, metrics[0], bucket)
        cells[member.id] = value
      }
      drafts.push({ label, sort: label, cells })
    }
  } else if (plan.dimension && !isTimeGrain(plan.dimension)) {
    const seen = new Map<string, string>()
    for (const key of current.keys()) seen.set(key, labelFor(plan.dimension, key))
    for (const [id, label] of seen) {
      const bucket = current.get(id) ?? blank()
      const cells: Record<string, number | null> = {}
      for (const metric of metrics) {
        const value = metricValue(bucket, metric)
        remember(value, metric, bucket)
        cells[metric] = value
      }
      drafts.push({ label, sort: label, cells })
    }
  }

  if (zeroDenom) notes.push("At least one value is null because the denominator was zero.")

  const firstFormat = METRICS[metrics[0]].format
  const ranked = grain
    ? drafts
    : [...drafts].sort((a, b) => {
        const av = a.cells[plan.series ? Object.keys(a.cells)[0] : metrics[0]]
        const bv = b.cells[plan.series ? Object.keys(b.cells)[0] : metrics[0]]
        const aNum = typeof av === "number" ? av : Number.NEGATIVE_INFINITY
        const bNum = typeof bv === "number" ? bv : Number.NEGATIVE_INFINITY
        if (bNum !== aNum) return bNum - aNum
        return a.label.localeCompare(b.label)
      })
  void firstFormat
  const limited = plan.topN && !grain ? ranked.slice(0, plan.topN) : ranked

  const columns: Column[] = [{ key: "label", label: columnHeading(plan), format: "text" }]
  const chartSeries: ChartModel["series"] = []
  if (plan.series) {
    for (const member of membersOf(plan.series)) {
      columns.push({ key: member.id, label: member.label, format: METRICS[metrics[0]].format })
      chartSeries.push({ key: member.id, label: member.label, format: METRICS[metrics[0]].format })
    }
  } else {
    for (const metric of metrics) {
      columns.push({ key: metric, label: METRICS[metric].label, format: METRICS[metric].format })
      chartSeries.push({ key: metric, label: METRICS[metric].label, format: METRICS[metric].format })
      if (plan.comparison !== "none") {
        const priorLabel = plan.comparison === "yoy" ? `${METRICS[metric].label} last year` : `Prior ${METRICS[metric].label.toLowerCase()}`
        columns.push({ key: `${metric}_prior`, label: priorLabel, format: METRICS[metric].format })
        chartSeries.push({ key: `${metric}_prior`, label: priorLabel, format: METRICS[metric].format })
        const changeFormat: ColumnFormat = METRICS[metric].format === "percent" ? "percent" : "percent"
        columns.push({
          key: `${metric}_change`,
          label: METRICS[metric].format === "percent" ? "Point change" : "Change",
          format: changeFormat,
        })
      }
    }
  }

  const rows: Row[] = limited.map((draft) => {
    const row: Row = { label: draft.label }
    for (const column of columns) {
      if (column.key === "label") continue
      row[column.key] = draft.cells[column.key] ?? null
    }
    return row
  })

  const summary = summarize(plan, rows, columns)
  const chart: ChartModel = {
    xKey: "label",
    rows,
    series: chartSeries,
    horizontalBars: plan.dimension === "product",
  }

  return {
    columns,
    rows,
    chart,
    summary,
    logic: plan.logic,
    notes,
    rowCount: rows.length,
  }
}

function membersOf(dim: CatDim): { id: string; label: string }[] {
  if (dim === "region") return Object.values(REGION_BY_ID).map((item) => ({ id: item.id, label: item.name }))
  if (dim === "channel") return Object.values(CHANNEL_BY_ID).map((item) => ({ id: item.id, label: item.name }))
  if (dim === "product") return Object.values(PRODUCT_BY_ID).map((item) => ({ id: item.id, label: item.name }))
  return ["Packs", "Apparel", "Camp", "Tools"].map((item) => ({ id: item, label: item }))
}

function labelFor(dim: CatDim, id: string): string {
  return membersOf(dim).find((item) => item.id === id)?.label ?? id
}

function columnHeading(plan: Plan): string {
  if (plan.dimension && isTimeGrain(plan.dimension)) {
    if (plan.dimension === "month") return "Month"
    if (plan.dimension === "week") return "Week"
    if (plan.dimension === "day") return "Day"
    if (plan.dimension === "quarter") return "Fiscal quarter"
    if (plan.dimension === "fiscal_year") return "Fiscal year"
    return "Year"
  }
  if (plan.dimension === "region") return "Region"
  if (plan.dimension === "channel") return "Channel"
  if (plan.dimension === "category") return "Category"
  if (plan.dimension === "product") return "Product"
  return "Window"
}

function summarize(plan: Plan, rows: Row[], columns: Column[]): string {
  const metric = plan.metrics[0]
  const meta = METRICS[metric]
  const role = roleName(plan)
  const window = plan.range.label
  const filters = plan.filters.length ? ` for ${plan.filters.map((filter) => filter.label).join(", ")}` : ""
  if (rows.length === 0) {
    return `${role} ${meta.label.toLowerCase()}, ${window}${filters}, has no recorded rows.`
  }
  if (!plan.dimension) {
    const value = rows[0][metric]
    const shown = formatBy(meta.format, typeof value === "number" ? value : null)
    const prior = rows[0][`${metric}_prior`]
    if (plan.comparison !== "none") {
      const priorShown = formatBy(meta.format, typeof prior === "number" ? prior : null)
      const delta = rows[0][`${metric}_change`]
      const deltaShown = typeof delta === "number" ? formatPercent(plan.metrics[0] && meta.format === "percent" ? delta : (delta as number)) : "no comparable base"
      return `${role} ${meta.label.toLowerCase()}, ${window}${filters}, is ${shown} against ${priorShown} (${deltaShown}).`
    }
    return `${role} ${meta.label.toLowerCase()}, ${window}${filters}, is ${shown}.`
  }
  const valueKey = plan.series ? columns.find((column) => column.key !== "label")?.key ?? metric : metric
  let best = rows[0]
  let bestValue = typeof rows[0][valueKey] === "number" ? (rows[0][valueKey] as number) : null
  for (const row of rows) {
    const value = row[valueKey]
    if (typeof value === "number" && (bestValue == null || value > bestValue)) {
      best = row
      bestValue = value
    }
  }
  const bestShown = formatBy(METRICS[metric].format, bestValue)
  const additive = metric === "revenue" || metric === "units" || metric === "orders" || metric === "cogs" || metric === "margin_amount" || metric === "return_amount"
  let totalBit = ""
  if (additive && !plan.series) {
    const total = rows.reduce((sum, row) => sum + (typeof row[metric] === "number" ? (row[metric] as number) : 0), 0)
    totalBit = ` The total is ${formatBy(meta.format, total)}.`
  }
  const partial = plan.range.partial ? " The latest period is partial." : ""
  return `${role} ${meta.label.toLowerCase()}, ${window}${filters}. ${best.label} is the high at ${bestShown}.${totalBit}${partial}`
}
