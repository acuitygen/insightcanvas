import { AS_OF, EXTRACT_START, type Grain, type Range } from "./types"

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const MONTH_INDEX: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
}

export function pad(n: number): string {
  return String(n).padStart(2, "0")
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10)
}

export function addMonths(iso: string, n: number): string {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7))
  const d = Number(iso.slice(8, 10))
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const dim = daysInMonth(ny, nm)
  return `${ny}-${pad(nm)}-${pad(Math.min(d, dim))}`
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function monthEnd(iso: string): string {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7))
  return `${iso.slice(0, 7)}-${pad(daysInMonth(y, m))}`
}

export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number)
  const [by, bm, bd] = b.split("-").map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

export function shiftYear(iso: string, delta: number): { iso: string; clamped: boolean } {
  const y = Number(iso.slice(0, 4)) + delta
  const m = Number(iso.slice(5, 7))
  let d = Number(iso.slice(8, 10))
  const dim = daysInMonth(y, m)
  const clamped = d > dim
  if (clamped) d = dim
  return { iso: `${y}-${pad(m)}-${pad(d)}`, clamped }
}

export function weekStart(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const delta = dow === 0 ? -6 : 1 - dow
  return addDays(iso, delta)
}

export function longDate(iso: string): string {
  const d = Number(iso.slice(8, 10))
  const m = Number(iso.slice(5, 7))
  return `${d} ${MONTHS[m - 1]} ${iso.slice(0, 4)}`
}

export function periodKey(iso: string, grain: Grain): string {
  if (grain === "day") return iso
  if (grain === "week") return weekStart(iso)
  if (grain === "month") return `${iso.slice(0, 7)}-01`
  if (grain === "year") return `${iso.slice(0, 4)}-01-01`
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7))
  if (grain === "quarter") {
    if (m >= 4 && m <= 6) return `${y}-04-01`
    if (m >= 7 && m <= 9) return `${y}-07-01`
    if (m >= 10) return `${y}-10-01`
    return `${y}-01-01`
  }
  return `${m >= 4 ? y : y - 1}-04-01`
}

export function labelPeriod(key: string, grain: Grain): string {
  const y = Number(key.slice(0, 4))
  const m = Number(key.slice(5, 7))
  const d = Number(key.slice(8, 10))
  if (grain === "month") return `${MONTHS[m - 1]} ${y}`
  if (grain === "day") return `${d} ${MONTHS[m - 1]} ${y}`
  if (grain === "week") return `Week of ${d} ${MONTHS[m - 1]}`
  if (grain === "year") return String(y)
  if (grain === "fiscal_year") return `FY${y + 1}`
  if (m === 4) return `Q1 FY${y + 1}`
  if (m === 7) return `Q2 FY${y + 1}`
  if (m === 10) return `Q3 FY${y + 1}`
  return `Q4 FY${y}`
}

export function spine(start: string, end: string, grain: Grain): string[] {
  const first = periodKey(start, grain)
  const last = periodKey(end, grain)
  const out: string[] = []
  let cursor = first
  while (cursor <= last && out.length < 2000) {
    out.push(cursor)
    if (grain === "day") cursor = addDays(cursor, 1)
    else if (grain === "week") cursor = addDays(cursor, 7)
    else if (grain === "month") cursor = addMonths(cursor, 1)
    else if (grain === "quarter") cursor = addMonths(cursor, 3)
    else cursor = addMonths(cursor, 12)
  }
  return out
}

export function leapDaysIn(start: string, end: string): string[] {
  return ["2024-02-29", "2028-02-29"].filter((day) => day >= start && day <= end)
}

export function isFullMonth(range: Range): boolean {
  return range.start.slice(8) === "01" && range.end === monthEnd(range.start)
}

export function yoyRange(range: Range): { range: Range; clamped: boolean } {
  if (isFullMonth(range)) {
    const priorStart = shiftYear(range.start, -1).iso
    return {
      clamped: false,
      range: {
        start: priorStart,
        end: monthEnd(priorStart),
        partial: false,
        label: "Same month last year",
      },
    }
  }
  const a = shiftYear(range.start, -1)
  const b = shiftYear(range.end, -1)
  return {
    clamped: a.clamped || b.clamped,
    range: {
      start: a.iso,
      end: b.iso,
      partial: range.partial,
      label: "Same dates last year",
    },
  }
}

export function priorWindow(range: Range): Range {
  const days = diffDays(range.start, range.end)
  const end = addDays(range.start, -1)
  const start = addDays(end, -days)
  return { start, end, partial: false, label: "Prior period of the same length" }
}

export function rangeYtd(asOf = AS_OF): Range {
  const y = Number(asOf.slice(0, 4))
  const m = Number(asOf.slice(5, 7))
  const startYear = m >= 4 ? y : y - 1
  const start = `${startYear}-04-01`
  const fyEnd = `${startYear + 1}-03-31`
  return {
    start,
    end: asOf,
    partial: asOf < fyEnd,
    label: `FY${startYear + 1} to date`,
  }
}

export function rangeMtd(asOf = AS_OF): Range {
  const start = `${asOf.slice(0, 7)}-01`
  return {
    start,
    end: asOf,
    partial: asOf < monthEnd(asOf),
    label: `${labelPeriod(start, "month")} to date`,
  }
}

export function quarterContaining(iso: string): Range {
  const start = periodKey(iso, "quarter")
  const end = addDays(addMonths(start, 3), -1)
  return { start, end, partial: false, label: labelPeriod(start, "quarter") }
}

export function rangeQtd(asOf = AS_OF): Range {
  const cur = quarterContaining(asOf)
  return {
    start: cur.start,
    end: asOf,
    partial: asOf < cur.end,
    label: `${cur.label} to date`,
  }
}

export function rangeLastMonth(asOf = AS_OF): Range {
  const end = addDays(`${asOf.slice(0, 7)}-01`, -1)
  const start = `${end.slice(0, 7)}-01`
  return { start, end, partial: false, label: labelPeriod(start, "month") }
}

export function rangeLastQuarter(asOf = AS_OF): Range {
  const cur = quarterContaining(asOf)
  const start = addMonths(cur.start, -3)
  const end = addDays(cur.start, -1)
  return { start, end, partial: false, label: labelPeriod(start, "quarter") }
}

export function rangeLastFiscalYear(asOf = AS_OF): Range {
  const current = rangeYtd(asOf)
  const start = addMonths(current.start, -12)
  const end = addDays(current.start, -1)
  return { start, end, partial: false, label: labelPeriod(start, "fiscal_year") }
}

export function rangeCalendarYear(year: number, asOf = AS_OF): Range | null {
  const start = `${year}-01-01`
  const endFull = `${year}-12-31`
  if (start > asOf || endFull < EXTRACT_START) return null
  const end = endFull > asOf ? asOf : endFull
  return { start, end, partial: end < endFull, label: end < endFull ? `${year} to date` : String(year) }
}

export function rangeMonth(year: number, month: number, asOf = AS_OF): Range | null {
  const start = `${year}-${pad(month)}-01`
  if (start > asOf || start < EXTRACT_START) return null
  const endFull = monthEnd(start)
  const end = endFull > asOf ? asOf : endFull
  return {
    start,
    end,
    partial: end < endFull,
    label: end < endFull ? `${labelPeriod(start, "month")} to date` : labelPeriod(start, "month"),
  }
}

export function rangeLastNMonths(n: number, asOf = AS_OF): Range {
  const endKey = `${asOf.slice(0, 7)}-01`
  const start = addMonths(endKey, -(n - 1))
  return {
    start,
    end: asOf,
    partial: asOf < monthEnd(asOf),
    label: `Last ${n} months`,
  }
}

export function rangeLastNWeeks(n: number, asOf = AS_OF): Range {
  const endKey = weekStart(asOf)
  const start = addDays(endKey, -7 * (n - 1))
  return {
    start,
    end: asOf,
    partial: asOf < addDays(endKey, 6),
    label: `Last ${n} weeks`,
  }
}

export function rangeFull(asOf = AS_OF): Range {
  return { start: EXTRACT_START, end: asOf, partial: false, label: "Full extract" }
}

export function fiscalQuarterRange(fy: number, quarter: number): Range | null {
  const startYear = fy - 1
  const spans: Record<number, [string, string]> = {
    1: [`${startYear}-04-01`, `${startYear}-06-30`],
    2: [`${startYear}-07-01`, `${startYear}-09-30`],
    3: [`${startYear}-10-01`, `${startYear}-12-31`],
    4: [`${fy}-01-01`, `${fy}-03-31`],
  }
  const span = spans[quarter]
  if (!span) return null
  if (span[1] < EXTRACT_START || span[0] > AS_OF) return null
  const end = span[1] > AS_OF ? AS_OF : span[1]
  return {
    start: span[0],
    end,
    partial: end < span[1],
    label: end < span[1] ? `Q${quarter} FY${fy} to date` : `Q${quarter} FY${fy}`,
  }
}

export function parseMonthToken(token: string): number | null {
  return MONTH_INDEX[token] ?? null
}

export function isTimeGrain(value: string | null): value is Grain {
  return (
    value === "day" ||
    value === "week" ||
    value === "month" ||
    value === "quarter" ||
    value === "year" ||
    value === "fiscal_year"
  )
}

export function shiftPeriod(periodStart: string, grain: Grain): { iso: string; clamped: boolean } {
  if (grain === "week") return { iso: addDays(periodStart, -364), clamped: false }
  return shiftYear(periodStart, -1)
}
