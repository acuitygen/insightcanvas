import type { ColumnFormat } from "./types"

const DASH = "\u2014"

export function formatMoney(value: number | null, cents = false): string {
  if (value == null || Number.isNaN(value)) return DASH
  const rounded = cents ? value : Math.round(value)
  const sign = rounded < 0 ? "-" : ""
  const body = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return `${sign}$${body}`
}

export function formatMoney2(value: number | null): string {
  if (value == null || Number.isNaN(value)) return DASH
  const sign = value < 0 ? "-" : ""
  const fixed = Math.abs(value).toFixed(2)
  const [whole, frac] = fixed.split(".")
  const body = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return `${sign}$${body}.${frac}`
}

export function formatPercent(value: number | null): string {
  if (value == null || Number.isNaN(value)) return DASH
  const pct = Math.round(value * 1000) / 10
  return `${pct.toFixed(1)}%`
}

export function formatNumber(value: number | null, digits = 0): string {
  if (value == null || Number.isNaN(value)) return DASH
  const fixed = Math.abs(value).toFixed(digits)
  const [whole, frac] = fixed.split(".")
  const body = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  const sign = value < 0 ? "-" : ""
  return digits > 0 ? `${sign}${body}.${frac}` : `${sign}${body}`
}

export function formatBy(format: ColumnFormat, value: string | number | null): string {
  if (typeof value === "string") return value
  if (format === "money") return formatMoney(value)
  if (format === "money2") return formatMoney2(value)
  if (format === "percent") return formatPercent(value)
  if (format === "number2") return formatNumber(value, 2)
  if (format === "number") return formatNumber(value, 0)
  if (value == null) return DASH
  return String(value)
}

export function formatCompact(format: ColumnFormat, value: number): string {
  if (format === "percent") return formatPercent(value)
  if (format === "money" || format === "money2") {
    const sign = value < 0 ? "-" : ""
    const abs = Math.abs(value)
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 10_000) return `${sign}$${Math.round(abs / 1000)}k`
    if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`
    return format === "money2" ? formatMoney2(value) : formatMoney(value)
  }
  return formatNumber(value, format === "number2" ? 1 : 0)
}

export function fnv(input: string): string {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

export function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
}

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&" + "amp;"
    if (char === "<") return "&" + "lt;"
    if (char === ">") return "&" + "gt;"
    if (char === '"') return "&" + "quot;"
    return "&" + "#39;"
  })
}
