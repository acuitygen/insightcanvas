import type { CatDim, ColumnFormat, FormulaId, MetricId } from "./types"

export type Product = {
  id: string
  name: string
  category: string
  price: number
  margin: number
  weight: number
}

export type Named = { id: string; name: string; weight: number }

export const REGIONS: Named[] = [
  { id: "west", name: "West", weight: 1.35 },
  { id: "north", name: "North", weight: 1.05 },
  { id: "south", name: "South", weight: 1.15 },
  { id: "east", name: "East", weight: 0.82 },
  { id: "central", name: "Central", weight: 0.72 },
]

export const CHANNELS: Named[] = [
  { id: "store", name: "Store", weight: 1.05 },
  { id: "web", name: "Web", weight: 1.28 },
  { id: "wholesale", name: "Wholesale", weight: 0.74 },
]

export const PRODUCTS: Product[] = [
  { id: "p01", name: "Trail Pack 28L", category: "Packs", price: 148, margin: 0.58, weight: 1.15 },
  { id: "p02", name: "Summit Pack 45L", category: "Packs", price: 228, margin: 0.54, weight: 0.82 },
  { id: "p03", name: "Ridge Shell", category: "Apparel", price: 189, margin: 0.62, weight: 0.96 },
  { id: "p04", name: "Merino Base Layer", category: "Apparel", price: 72, margin: 0.6, weight: 1.25 },
  { id: "p05", name: "Field Pant", category: "Apparel", price: 118, margin: 0.57, weight: 1.05 },
  { id: "p06", name: "Merino Socks", category: "Apparel", price: 22, margin: 0.64, weight: 1.4 },
  { id: "p07", name: "Camp Stove", category: "Camp", price: 64, margin: 0.42, weight: 0.7 },
  { id: "p08", name: "Down Quilt", category: "Camp", price: 210, margin: 0.48, weight: 0.62 },
  { id: "p09", name: "Titanium Mug", category: "Camp", price: 28, margin: 0.55, weight: 0.9 },
  { id: "p10", name: "Headlamp", category: "Tools", price: 46, margin: 0.5, weight: 1.05 },
  { id: "p11", name: "Trekking Poles", category: "Tools", price: 89, margin: 0.46, weight: 0.78 },
  { id: "p12", name: "Water Filter", category: "Tools", price: 54, margin: 0.52, weight: 0.88 },
]

export const CATEGORIES = ["Packs", "Apparel", "Camp", "Tools"]

export const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map((product) => [product.id, product]))
export const REGION_BY_ID = Object.fromEntries(REGIONS.map((region) => [region.id, region]))
export const CHANNEL_BY_ID = Object.fromEntries(CHANNELS.map((channel) => [channel.id, channel]))

export type MetricMeta = {
  label: string
  format: ColumnFormat
  logic: string
  sql: string
}

export const METRICS: Record<MetricId, MetricMeta> = {
  revenue: {
    label: "Revenue",
    format: "money",
    logic: "Sum of net revenue at order-line grain. Currency is USD.",
    sql: "SUM(f.net_revenue)",
  },
  units: {
    label: "Units",
    format: "number",
    logic: "Sum of units at order-line grain.",
    sql: "SUM(f.units)",
  },
  orders: {
    label: "Orders",
    format: "number",
    logic: "Count of distinct orders after filters. Lines of the same order count once.",
    sql: "COUNT(DISTINCT f.order_id)",
  },
  cogs: {
    label: "COGS",
    format: "money",
    logic: "Sum of cost of goods at order-line grain.",
    sql: "SUM(f.cogs)",
  },
  margin_amount: {
    label: "Gross profit",
    format: "money",
    logic: "Sum of net revenue minus cost. Nulls are not coerced to zero.",
    sql: "SUM(f.net_revenue - f.cogs)",
  },
  margin_pct: {
    label: "Gross margin",
    format: "percent",
    logic:
      "Gross margin divides aggregated margin dollars by aggregated revenue. It is never an average of line-level percentages. A zero denominator is null.",
    sql: "SUM(f.net_revenue - f.cogs) / NULLIF(SUM(f.net_revenue), 0)",
  },
  aov: {
    label: "Average order value",
    format: "money2",
    logic: "Aggregated revenue divided by distinct orders. A zero order count is null.",
    sql: "SUM(f.net_revenue) / NULLIF(COUNT(DISTINCT f.order_id), 0)",
  },
  return_amount: {
    label: "Return amount",
    format: "money",
    logic: "Sum of return amounts at return grain, on return date. Not allocated to order lines.",
    sql: "SUM(r.return_amount)",
  },
  return_rate: {
    label: "Return rate",
    format: "percent",
    logic:
      "Return amount and revenue are aggregated separately to the same grain, then divided. Returns are never joined to lines before aggregation.",
    sql: "return_amount / NULLIF(revenue, 0)",
  },
  asp: {
    label: "Average selling price",
    format: "money2",
    logic: "Aggregated revenue divided by aggregated units. A zero unit total is null.",
    sql: "SUM(f.net_revenue) / NULLIF(SUM(f.units), 0)",
  },
  units_per_order: {
    label: "Units per order",
    format: "number2",
    logic: "Aggregated units divided by distinct orders. A zero order count is null.",
    sql: "SUM(f.units) / NULLIF(COUNT(DISTINCT f.order_id), 0)",
  },
}

export const FORMULAS: Record<
  FormulaId,
  { name: string; tree: string; grain: string; scope: string }
> = {
  asp: {
    name: "Average selling price",
    tree: "sum(net_revenue) / sum(units)",
    grain: "Order line",
    scope: "Divide after aggregation, never average a ratio.",
  },
  units_per_order: {
    name: "Units per order",
    tree: "sum(units) / count_distinct(order_id)",
    grain: "Order line",
    scope: "Divide after aggregation.",
  },
}

export function dimensionLabel(dim: CatDim | string): string {
  if (dim === "region") return "Region"
  if (dim === "channel") return "Channel"
  if (dim === "category") return "Category"
  if (dim === "product") return "Product"
  return dim
}

export const ALLOWED_TABLES = [
  "analytics.fact_order_line",
  "analytics.dim_product",
  "analytics.dim_region",
  "analytics.dim_channel",
  "analytics.dim_date",
  "analytics.fact_return",
]

export const SUGGESTED: { group: string; items: string[] }[] = [
  {
    group: "Start here",
    items: [
      "Revenue by month, fiscal year to date",
      "Monthly revenue versus last year",
      "Revenue by region this fiscal year",
      "Top 8 products by revenue, year to date",
      "Gross margin by category, this quarter",
      "Revenue mix by channel, last quarter",
      "Rolling 3-month revenue",
    ],
  },
  {
    group: "The gateway should stop these",
    items: [
      "What were sales by region?",
      "Revenue by date this year",
      "Revenue in euros by month",
      "Return amount by month",
      "Return amount by product",
      "Daily revenue in February 2024 versus last year",
      "Average selling price by category, this quarter",
      "Revenue waterfall by category, fiscal year to date",
      "Revenue, units and gross margin by category, last quarter",
    ],
  },
]
