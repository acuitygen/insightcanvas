import type { Row } from "./types"

export type SheetKind = "csv" | "json" | "excel" | "sample"
export type FieldKind = "text" | "number" | "date"
export type SheetColumn = { key: string; label: string; kind: FieldKind }
export type Sheet = {
  id: string
  name: string
  kind: SheetKind
  columns: SheetColumn[]
  rows: Row[]
  note: string
}

const ROW_CAP = 800

/** Upload limits. Files over the size limit are refused; parsing stops after MAX_ROWS data rows. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_ROWS = 50_000
export const MAX_COLUMNS = 200

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"])

/** Header names come from the file. Never let one become a prototype key. */
function safeLabel(label: string, index: number): string {
  const trimmed = label.trim()
  if (!trimmed || UNSAFE_KEYS.has(trimmed)) return `Column ${index + 1}`
  return trimmed.slice(0, 120)
}

export function checkSize(bytes: number) {
  if (bytes > MAX_FILE_BYTES) {
    throw new Error(`That file is ${(bytes / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1024 / 1024} MB.`)
  }
}

function safeRecord(source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  Object.keys(source).slice(0, MAX_COLUMNS).forEach((key, index) => {
    Object.defineProperty(out, safeLabel(key, index), { value: source[key], enumerable: true, writable: true, configurable: true })
  })
  return out
}

function slug(label: string, index: number) {
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
  return key || `column_${index + 1}`
}

function kindOf(values: string[]): FieldKind {
  const filled = values.map((value) => value.trim()).filter(Boolean)
  if (!filled.length) return "text"
  if (filled.every((value) => /^-?\d+(\.\d+)?$/.test(value.replace(/[$,]/g, "")))) return "number"
  if (filled.every((value) => /^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value))) return "date"
  return "text"
}

function cell(value: unknown, kind: FieldKind): string | number | null {
  if (value == null || value === "") return null
  const text = String(value).trim()
  if (!text) return null
  if (kind === "number") {
    const number = Number(text.replace(/[$,]/g, ""))
    return Number.isFinite(number) ? number : null
  }
  return text
}

export function sheetFromRecords(name: string, kind: SheetKind, records: Record<string, unknown>[]): Sheet {
  const labels = [...new Set(records.flatMap((record) => Object.keys(record)))].slice(0, 12)
  const sliced = records.slice(0, ROW_CAP)
  const columns: SheetColumn[] = labels.map((label, index) => ({
    key: slug(label, index),
    label,
    kind: kindOf(sliced.map((record) => String(record[label] ?? ""))),
  }))
  const rows = sliced.map((record) => {
    const row: Row = {}
    columns.forEach((column, index) => {
      row[column.key] = cell(record[labels[index]], column.kind)
    })
    return row
  })
  const note =
    records.length > ROW_CAP
      ? `Showing the first ${ROW_CAP} of ${records.length} rows. A larger warehouse stays on the server and is not loaded whole into the browser.`
      : `${rows.length} rows · ${columns.length} columns`
  return { id: crypto.randomUUID(), name, kind, columns, rows, note }
}

export function parseCsv(text: string): Record<string, unknown>[] {
  checkSize(text.length)
  const rows: string[][] = []
  let cellText = ""
  let row: string[] = []
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cellText += '"'
          i += 1
        } else quoted = false
      } else cellText += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ",") {
      row.push(cellText)
      cellText = ""
    } else if (char === "\n") {
      row.push(cellText)
      rows.push(row)
      row = []
      cellText = ""
      if (rows.length > MAX_ROWS) break
    } else if (char !== "\r") cellText += char
  }
  row.push(cellText)
  if (rows.length <= MAX_ROWS && row.some((item) => item.trim())) rows.push(row)
  const [header, ...body] = rows
  if (!header) return []
  return body
    .filter((line) => line.some((item) => item.trim()))
    .map((line) => {
      const record: Record<string, unknown> = {}
      header.slice(0, MAX_COLUMNS).forEach((label, index) => {
        Object.defineProperty(record, safeLabel(label, index), { value: line[index] ?? "", enumerable: true, writable: true, configurable: true })
      })
      return record
    })
}

export function parseJson(text: string): Record<string, unknown>[] {
  checkSize(text.length)
  const parsed = JSON.parse(text) as unknown
  const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as { data?: unknown }).data) ? (parsed as { data: unknown[] }).data : null
  if (!list) throw new Error("JSON must be a list of rows, or an object with a data list.")
  return list
    .slice(0, MAX_ROWS)
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map(safeRecord)
}

export async function parseExcel(buffer: ArrayBuffer): Promise<Record<string, unknown>[]> {
  checkSize(buffer.byteLength)
  const XLSX = await import("xlsx")
  // Read only what we show: no formulas, styles or HTML, and stop after MAX_ROWS data rows.
  const book = XLSX.read(buffer, {
    type: "array",
    sheetRows: MAX_ROWS + 1,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    bookVBA: false,
  })
  const name = book.SheetNames[0]
  if (!name) return []
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[name], { defval: "" }).map(safeRecord)
}
