import { escapeHtml, formatBy } from "./format"
import type { QueryResult, VisualFamily } from "./types"

function barSvg(result: QueryResult): string {
  const series = result.chart.series[0]
  if (!series) return ""
  const values = result.rows.map((row) => (typeof row[series.key] === "number" ? (row[series.key] as number) : 0))
  const max = Math.max(...values.map((value) => Math.abs(value)), 1)
  const width = 720
  const rowH = 28
  const height = Math.max(160, result.rows.length * rowH + 16)
  const labelW = 160
  const bars = result.rows
    .map((row, index) => {
      const value = typeof row[series.key] === "number" ? (row[series.key] as number) : 0
      const w = Math.max(0, (Math.abs(value) / max) * (width - labelW - 24))
      const y = 12 + index * rowH
      const label = escapeHtml(String(row.label ?? ""))
      return `<text x="0" y="${y + 16}" fill="#1c1915" font-size="13" font-family="Georgia, serif">${label}</text>
<rect x="${labelW}" y="${y}" width="${w.toFixed(1)}" height="18" rx="2" fill="#0c5f59"></rect>`
    })
    .join("\n")
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(result.summary)}">${bars}</svg>`
}

export function exportHtml(result: QueryResult, visual: VisualFamily, question: string): string {
  const head = result.columns
    .map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`)
    .join("")
  const body = result.rows
    .map((row) => {
      const cells = result.columns
        .map((column, index) => {
          const text = escapeHtml(formatBy(column.format, row[column.key] ?? null))
          return index === 0 ? `<th scope="row">${text}</th>` : `<td>${text}</td>`
        })
        .join("")
      return `<tr>${cells}</tr>`
    })
    .join("")
  const notes = result.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")
  const logic = result.logic.map((line) => `<li>${escapeHtml(line)}</li>`).join("")
  const chart = visual === "table" ? "" : barSvg(result)
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">
<title>${escapeHtml(question)} · InsightCanvas</title>
<style>
  body { margin: 0; background: #f4f0e6; color: #1c1915; font: 16px/1.5 Georgia, "Source Sans 3", sans-serif; }
  main { max-width: 880px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 1.6rem; line-height: 1.25; }
  p { color: #4e4942; }
  table { width: 100%; border-collapse: collapse; background: #fbf8f2; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e0d8cc; font-variant-numeric: tabular-nums; }
  th { font-weight: 600; }
  pre { white-space: pre-wrap; background: #241f1a; color: #f4f0e6; padding: 16px; overflow-x: auto; }
  svg { width: 100%; height: auto; background: #fbf8f2; border: 1px solid #e0d8cc; }
</style>
</head>
<body>
<main>
  <p>InsightCanvas snapshot · lumen_retail v3 · data through 16 Oct 2026 · no network</p>
  <h1>${escapeHtml(result.summary)}</h1>
  <p>Question: ${escapeHtml(question)}. Chart binding: ${escapeHtml(visual)}. Plan ${escapeHtml(result.planHash)}.</p>
  ${chart}
  <h2>Data table</h2>
  <table>
    <caption>Values behind the visual</caption>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
  <h2>Calculation</h2>
  <ul>${logic}</ul>
  <ul>${notes}</ul>
  <h2>SQL</h2>
  <pre>${escapeHtml(result.sql)}</pre>
</main>
</body>
</html>`
}
