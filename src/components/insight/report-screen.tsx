import { Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { answer } from "@/lib/insight/pipeline"
import { practiceSheet } from "@/lib/insight/samples"
import { dropReport, dropTile, publishReport, refreshSharedReports } from "@/lib/insight/shared-client"
import { useInsight, useInsightReady } from "@/lib/insight/store"
import { resultFromTile, suggestTiles, type Tile } from "@/lib/insight/table-visual"
import { DEFAULT_CTX } from "@/lib/insight/types"
import { ChartView } from "./chart-view"

const quiet = "inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-paper px-4 text-sm font-semibold"
const primary = "inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 text-sm font-semibold text-paper"

function tileFromQuestion(question: string, source: string): Tile | null {
  const outcome = answer(question, DEFAULT_CTX)
  if (outcome.kind !== "ok") return null
  const result = outcome.result
  return {
    id: crypto.randomUUID(),
    title: result.summary,
    summary: result.summary,
    source,
    visual: result.plan.visual,
    chart: result.chart,
    columns: result.columns,
  }
}

export function ReportsHome() {
  const ready = useInsightReady()
  const reports = useInsight((state) => state.reports)
  const navigate = useNavigate()
  const [title, setTitle] = useState("Daily board")
  const [audience, setAudience] = useState("Clinic")
  const [note, setNote] = useState("")

  useEffect(() => {
    if (!ready) return
    void refreshSharedReports().then((result) => {
      if (!result.ok && result.message) setNote(result.message)
    })
  }, [ready])

  async function createBlank() {
    const result = await publishReport({ title: title.trim() || "Untitled report", audience })
    if (!result.ok) {
      setNote(result.message)
      return
    }
    void navigate({ to: "/reports/$id", params: { id: result.id } })
  }

  async function createStarter(kind: "practice" | "shop") {
    if (kind === "shop") {
      const tiles = [
        "Revenue by month, fiscal year to date",
        "Revenue by region this fiscal year",
        "Revenue mix by channel, last quarter",
      ]
        .map((question) => tileFromQuestion(question, "Lumen Outdoor extract"))
        .filter((tile): tile is Tile => tile !== null)
      const result = await publishReport({ title: "Shop month", audience: "Shop", tiles })
      if (!result.ok) {
        setNote(result.message)
        return
      }
      void navigate({ to: "/reports/$id", params: { id: result.id } })
      return
    }
    const sheet = practiceSheet()
    useInsight.getState().addSheet(sheet)
    const result = await publishReport({
      title: "Practice week",
      audience: "Law practice",
      tiles: suggestTiles(sheet),
    })
    if (!result.ok) {
      setNote(result.message)
      return
    }
    void navigate({ to: "/reports/$id", params: { id: result.id } })
  }

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <p className="text-sm font-semibold text-heat">Several visuals, one page</p>
        <h1 className="text-3xl tracking-tight md:text-5xl">Reports</h1>
        <p className="max-w-2xl text-muted">A report is one page of up to eight visuals. It is saved in the shared database, so everyone who confirmed an email on this link sees the same page.</p>
      </header>
      <section className="grid gap-3 rounded-[1.25rem] bg-canvas p-4" aria-labelledby="how-reports">
        <h2 id="how-reports" className="text-xl tracking-tight">How to create a report</h2>
        <ol className="grid gap-2 text-sm">
          <li><span className="font-semibold">1. Start the page.</span> Name it, choose who it is for, and press Create empty page. Or use a starter: Practice week or Shop month. A starter places several visuals on the page. You do not arrange them.</li>
          <li><span className="font-semibold">2. Pin from Ask.</span> Run a question. Pick the report, or leave it on New report, and press Pin to report.</li>
          <li><span className="font-semibold">3. Pin from Sources.</span> Upload a file or run a database query, shape the chart, then press Pin this visual or Pin result.</li>
          <li><span className="font-semibold">4. Open the page.</span> Remove any visual you do not want. Eight is the limit.</li>
        </ol>
      </section>
      <section className="grid gap-3 rounded-[1.25rem] bg-canvas p-4 md:grid-cols-[1fr_auto] md:items-end">
        <label className="grid gap-1 text-sm font-semibold">
          Report name
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-11 rounded-full border border-line bg-paper px-4 font-normal" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          For
          <select value={audience} onChange={(event) => setAudience(event.target.value)} className="min-h-11 rounded-full border border-line bg-paper px-4 font-normal">
            <option>Clinic</option>
            <option>Law practice</option>
            <option>Shop</option>
            <option>Other</option>
          </select>
        </label>
        <button type="button" className={primary} onClick={() => void createBlank()}>Create empty page</button>
      </section>
      {note ? <p className="text-sm">{note}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={quiet} onClick={() => void createStarter("practice")}>Practice week starter</button>
        <button type="button" className={quiet} onClick={() => void createStarter("shop")}>Shop month starter</button>
      </div>
      {!ready ? <p className="text-sm text-muted">Loading saved pages…</p> : null}
      <ul className="grid gap-3 md:grid-cols-2">
        {reports.map((report) => (
          <li key={report.id} className="rounded-[1.25rem] border border-line bg-paper p-4">
            <p className="text-sm font-semibold text-muted">{report.audience}</p>
            <h2 className="text-2xl tracking-tight">{report.title}</h2>
            <p className="mt-1 text-sm text-muted">{report.tiles.length} visuals</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/reports/$id" params={{ id: report.id }} className={primary}>Open</Link>
              <button type="button" className={quiet} onClick={() => void dropReport(report.id)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ReportCanvas({ id }: { id: string }) {
  const ready = useInsightReady()
  const report = useInsight((state) => state.reports.find((item) => item.id === id))
  useEffect(() => {
    if (ready) void refreshSharedReports()
  }, [ready])
  if (!ready) return <p className="text-sm text-muted">Loading the page…</p>
  if (!report) {
    return (
      <div className="grid gap-3">
        <h1 className="text-3xl tracking-tight">This report is not on this browser</h1>
        <Link to="/reports" className={primary}>Back to reports</Link>
      </div>
    )
  }
  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-heat">{report.audience}</p>
          <h1 className="text-3xl tracking-tight md:text-5xl">{report.title}</h1>
          <p className="text-sm text-muted">{report.tiles.length} of 8 visuals. Saved in the shared database for everyone on the email list.</p>
        </div>
        <Link to="/reports" className={quiet}>All reports</Link>
      </header>
      {report.tiles.length === 0 ? (
        <p className="rounded-[1.25rem] bg-canvas p-4">This page is empty. On Ask, run a question and press Pin to report. On Sources, pin a chart from a file or a query.</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {report.tiles.map((tile) => (
            <li key={tile.id} className="grid gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-muted">{tile.source}</p>
                  <h2 className="text-xl tracking-tight">{tile.title}</h2>
                </div>
                <button type="button" className={quiet} onClick={() => void dropTile(report.id, tile.id)}>Remove</button>
              </div>
              <ChartView result={resultFromTile(tile)} visual={tile.visual} summary={tile.summary} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
