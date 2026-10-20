import { useEffect, useState } from "react"
import { queryDatabase } from "@/lib/insight/external-db"
import { searchMail, type MailMessage } from "@/lib/insight/mail"
import { parseCsv, parseExcel, parseJson, sheetFromRecords, type Sheet } from "@/lib/insight/sheets"
import { publishReport, refreshSharedReports } from "@/lib/insight/shared-client"
import { useInsight, useInsightReady } from "@/lib/insight/store"
import { fieldKindLabel, resultFromTile, tileFromSheet } from "@/lib/insight/table-visual"
import type { VisualFamily } from "@/lib/insight/types"
import { ChartView } from "./chart-view"

const quiet = "inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-paper px-4 text-sm font-semibold"
const primary = "inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 text-sm font-semibold text-paper"

export function SourcesScreen() {
  const ready = useInsightReady()
  const sheets = useInsight((state) => state.sheets)
  const reports = useInsight((state) => state.reports)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dimension, setDimension] = useState("")
  const [measure, setMeasure] = useState("")
  const [how, setHow] = useState<"sum" | "count">("sum")
  const [visual, setVisual] = useState<VisualFamily>("bar")
  const [note, setNote] = useState("")
  const [reportId, setReportId] = useState("")
  useEffect(() => {
    if (ready) void refreshSharedReports()
  }, [ready])
  const active = sheets.find((sheet) => sheet.id === activeId) ?? sheets[0] ?? null

  async function takeFile(file: File) {
    const lower = file.name.toLowerCase()
    try {
      let records
      let kind: Sheet["kind"] = "csv"
      if (lower.endsWith(".json")) {
        records = parseJson(await file.text())
        kind = "json"
      } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        records = await parseExcel(await file.arrayBuffer())
        kind = "excel"
      } else {
        records = parseCsv(await file.text())
      }
      if (!records.length) {
        setNote("That file has no rows.")
        return
      }
      const sheet = sheetFromRecords(file.name.replace(/\.[^.]+$/, ""), kind, records)
      useInsight.getState().addSheet(sheet)
      setActiveId(sheet.id)
      setDimension(sheet.columns.find((column) => column.kind !== "number")?.key ?? sheet.columns[0]?.key ?? "")
      setMeasure(sheet.columns.find((column) => column.kind === "number")?.key ?? "")
      setNote(sheet.columns.some((column) => column.kind === "date") && sheet.columns.some((column) => column.kind === "number") ? `${sheet.note} Dates and amounts were recognized.` : sheet.note)
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not read that file.")
    }
  }

  async function pin() {
    if (!active) return
    const dim = dimension || active.columns[0]?.key
    if (!dim) return
    const tile = tileFromSheet({ sheet: active, dimension: dim, measure: measure || null, how, visual })
    const existing = reports.find((report) => report.id === reportId)
    const saved = await publishReport({
      id: existing?.id,
      title: existing?.title ?? `${active.name} board`,
      audience: existing?.audience ?? "Other",
      tiles: [tile],
    })
    if (!saved.ok) {
      setNote(saved.message)
      return
    }
    setReportId(saved.id)
    setNote(`Pinned “${tile.title}” into the shared database.`)
  }

  const preview = active && (dimension || active.columns[0])
    ? tileFromSheet({
        sheet: active,
        dimension: dimension || active.columns[0].key,
        measure: measure || null,
        how,
        visual,
      })
    : null

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <p className="text-sm font-semibold text-heat">Bring the day in</p>
        <h1 className="text-3xl tracking-tight md:text-5xl">Sources</h1>
        <p className="max-w-2xl text-muted">Files, mail, and an outside Postgres database are added here, then pinned onto a report.</p>
      </header>
      <section className="grid gap-3 rounded-[1.25rem] bg-canvas p-4" aria-labelledby="how-sources">
        <h2 id="how-sources" className="text-xl tracking-tight">How to update a source</h2>
        <ol className="grid gap-2 text-sm">
          <li><span className="font-semibold">1. Replace a file.</span> Choose a newer CSV, JSON, or Excel file. The new chip appears below. Press Remove file on the old chip. Only the first 800 rows stay, and only in this browser.</li>
          <li><span className="font-semibold">2. Shape it.</span> Pick Group by, Measure, Calculation, and Visual. Pin this visual adds the chart to a report.</li>
          <li><span className="font-semibold">3. Mail.</span> Choose Gmail or Outlook, type a search such as newer_than:7d, and press Search mail. Connect that mailbox in Grok first. Messages are not stored.</li>
          <li><span className="font-semibold">4. Outside database.</span> Paste a postgres:// connection string and one SELECT, then Run query. The string is not saved. Pin result puts the chart on a report.</li>
        </ol>
      </section>
      <LiveConnections />
      <section className="grid gap-3 rounded-[1.25rem] bg-canvas p-4">
        <label className="grid gap-1 text-sm font-semibold">
          File
          <input
            type="file"
            accept=".csv,.json,.xlsx,.xls,text/csv,application/json"
            className="min-h-11 text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void takeFile(file)
            }}
          />
        </label>
        <p className="text-sm text-muted">CSV, JSON, or Excel. Uploading again adds a new chip. Remove the old one. The first 800 rows stay in this browser. Ask still uses the Lumen Outdoor extract.</p>
        {note ? <p className="text-sm">{note}</p> : null}
      </section>
      {!ready ? <p className="text-sm text-muted">Loading sources…</p> : null}
      {sheets.length ? (
        <div className="flex flex-wrap gap-2">
          {sheets.map((sheet) => (
            <button key={sheet.id} type="button" className={active?.id === sheet.id ? primary : quiet} onClick={() => setActiveId(sheet.id)}>
              {sheet.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No file yet. A practice week starter on Reports also adds a sample book here.</p>
      )}
      {active && preview ? (
        <section className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">
              Group by
              <select value={dimension || active.columns[0]?.key} onChange={(event) => setDimension(event.target.value)} className="min-h-11 rounded-full border border-line bg-paper px-4">
                {active.columns.map((column) => (
                  <option key={column.key} value={column.key}>{column.label} · {fieldKindLabel(column.kind)}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Measure
              <select value={measure} onChange={(event) => setMeasure(event.target.value)} className="min-h-11 rounded-full border border-line bg-paper px-4">
                <option value="">Count rows</option>
                {active.columns.filter((column) => column.kind === "number").map((column) => (
                  <option key={column.key} value={column.key}>{column.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Calculation
              <select value={how} onChange={(event) => setHow(event.target.value === "count" ? "count" : "sum")} className="min-h-11 rounded-full border border-line bg-paper px-4">
                <option value="sum">Sum</option>
                <option value="count">Count</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Visual
              <select value={visual} onChange={(event) => setVisual(event.target.value as VisualFamily)} className="min-h-11 rounded-full border border-line bg-paper px-4">
                <option value="bar">Columns</option>
                <option value="line">Line</option>
                <option value="area">Area</option>
                <option value="donut">Donut</option>
              </select>
            </label>
          </div>
          <ChartView result={resultFromTile(preview)} visual={preview.visual} summary={preview.summary} />
          <div className="flex flex-wrap items-center gap-2">
            <label className="grid gap-1 text-sm font-semibold">
              Pin to
              <select value={reportId} onChange={(event) => setReportId(event.target.value)} className="min-h-11 rounded-full border border-line bg-paper px-4">
                <option value="">New report</option>
                {reports.map((report) => (
                  <option key={report.id} value={report.id}>{report.title}</option>
                ))}
              </select>
            </label>
            <button type="button" className={`${primary} self-end`} onClick={() => void pin()}>Pin this visual</button>
            <button type="button" className={`${quiet} self-end`} onClick={() => useInsight.getState().removeSheet(active.id)}>Remove file</button>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function LiveConnections() {
  const [mailbox, setMailbox] = useState<"Gmail" | "Outlook">("Gmail")
  const [query, setQuery] = useState("newer_than:7d")
  const [mailNote, setMailNote] = useState("")
  const [loginUrl, setLoginUrl] = useState("")
  const [messages, setMessages] = useState<MailMessage[]>([])
  const [connectionString, setConnectionString] = useState("")
  const [sql, setSql] = useState("select current_database() as database, now()::date as day")
  const [dbNote, setDbNote] = useState("")
  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string | number | null>[]>([])
  const [busy, setBusy] = useState<"mail" | "db" | null>(null)

  async function runMail(event: { preventDefault: () => void }) {
    event.preventDefault()
    setBusy("mail")
    setMailNote("")
    setLoginUrl("")
    try {
      const result = await searchMail({ data: { mailbox, query } })
      setMessages(result.messages)
      setMailNote(result.message)
      setLoginUrl(result.loginUrl)
    } catch (error) {
      setMailNote(error instanceof Error ? error.message : "Could not reach the mailbox.")
    } finally {
      setBusy(null)
    }
  }

  async function runQuery(event: { preventDefault: () => void }) {
    event.preventDefault()
    setBusy("db")
    setDbNote("")
    try {
      const result = await queryDatabase({ data: { connectionString, sql } })
      setColumns(result.columns)
      setRows(result.rows)
      setDbNote(result.message)
    } catch (error) {
      setDbNote(error instanceof Error ? error.message : "Could not query that database.")
    } finally {
      setBusy(null)
    }
  }

  async function pinQuery() {
    if (!rows.length || !columns.length) return
    const labelKey = columns[0]
    const valueKey = columns.find((column) => column !== labelKey && rows.some((row) => typeof row[column] === "number")) ?? columns[1] ?? columns[0]
    const tile = {
      id: crypto.randomUUID(),
      title: `${valueKey} by ${labelKey}`,
      summary: `${valueKey} by ${labelKey} · database`,
      source: "Postgres",
      visual: "bar" as const,
      chart: {
        xKey: "label",
        rows: rows.slice(0, 12).map((row) => ({
          label: String(row[labelKey] ?? ""),
          value: typeof row[valueKey] === "number" ? row[valueKey] : 0,
        })),
        series: [{ key: "value", label: valueKey, format: "number" as const }],
        horizontalBars: rows.length > 5,
      },
      columns: [
        { key: "label", label: labelKey, format: "text" as const },
        { key: "value", label: valueKey, format: "number" as const },
      ],
    }
    const saved = await publishReport({ title: "Database", audience: "Other", tiles: [tile] })
    setDbNote(saved.ok ? "Pinned onto a Database report." : saved.message)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form className="grid content-start gap-3 rounded-[1.25rem] bg-canvas p-4" onSubmit={(event) => void runMail(event)}>
        <h2 className="text-2xl tracking-tight">Mailbox</h2>
        <p className="text-sm text-muted">Read-only search of the Gmail or Outlook account connected to this app. Messages are not stored.</p>
        <label className="grid gap-1 text-sm font-semibold">
          Account
          <select value={mailbox} onChange={(event) => setMailbox(event.target.value === "Outlook" ? "Outlook" : "Gmail")} className="min-h-11 rounded-full border border-line bg-paper px-4">
            <option value="Gmail">Gmail</option>
            <option value="Outlook">Outlook</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Search
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 rounded-full border border-line bg-paper px-4 font-normal" />
        </label>
        <button type="submit" className={primary} disabled={busy === "mail"}>{busy === "mail" ? "Searching…" : "Search mail"}</button>
        {mailNote ? <p className="text-sm">{mailNote}</p> : null}
        {loginUrl ? (
          <a className={quiet} href={loginUrl}>
            Continue with Grok
          </a>
        ) : null}
        {messages.length ? (
          <ul className="grid gap-2">
            {messages.map((message) => (
              <li key={message.id} className="rounded-2xl bg-paper px-3 py-2">
                <p className="font-semibold">{message.subject}</p>
                <p className="text-sm text-muted">{message.from} {message.date}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </form>
      <form className="grid content-start gap-3 rounded-[1.25rem] bg-canvas p-4" onSubmit={(event) => void runQuery(event)}>
        <h2 className="text-2xl tracking-tight">Database</h2>
        <p className="text-sm text-muted">One read-only SELECT against your Postgres. The connection string is used for this query and is not saved. Reports themselves already live in the app database.</p>
        <label className="grid gap-1 text-sm font-semibold">
          Connection string
          <input value={connectionString} onChange={(event) => setConnectionString(event.target.value)} autoComplete="off" placeholder="postgres://user:password@host:5432/dbname" className="min-h-11 rounded-full border border-line bg-paper px-4 font-normal" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          SQL
          <textarea value={sql} onChange={(event) => setSql(event.target.value)} rows={4} spellCheck={false} className="rounded-2xl border border-line bg-paper px-4 py-3 font-mono text-sm" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primary} disabled={busy === "db"}>{busy === "db" ? "Running…" : "Run query"}</button>
          <button type="button" className={quiet} onClick={() => void pinQuery()} disabled={!rows.length}>Pin result</button>
        </div>
        {dbNote ? <p className="text-sm">{dbNote}</p> : null}
        {rows.length ? (
          <div className="max-w-full overflow-x-auto rounded-lg border border-line bg-paper">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column} className="border-b border-line px-3 py-2 text-left">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 8).map((row, index) => (
                  <tr key={index}>
                    {columns.map((column) => (
                      <td key={column} className="border-b border-line px-3 py-2">{String(row[column] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </form>
    </div>
  )
}
