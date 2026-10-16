import { Link } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { SUGGESTED } from "@/lib/insight/catalog"
import { currentVisitor } from "@/components/insight/door"
import { askClinic } from "@/lib/insight/clinic-insight"
import { CLINIC_QUESTIONS, clinicOutcome } from "@/lib/insight/clinic-view"
import { exportHtml } from "@/lib/insight/export-html"
import { formatBy } from "@/lib/insight/format"
import { answer } from "@/lib/insight/pipeline"
import { publishReport, refreshSharedReports } from "@/lib/insight/shared-client"
import { useInsight, useInsightReady } from "@/lib/insight/store"
import type { Tile } from "@/lib/insight/table-visual"
import { AS_OF, DEFAULT_CTX, OPENING_QUESTION, type EngineCtx, type Outcome, type QueryResult, type VisualFamily } from "@/lib/insight/types"
import { validateSql } from "@/lib/insight/validate"
import { ChartView, VISUAL_LABEL, compatibleVisuals } from "./chart-view"

const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold"
const primary = `${btn} bg-ink text-paper hover:bg-primary-hover`
const quiet = `${btn} border border-line bg-paper text-ink hover:border-ink`
const chips = ["bg-blush text-ink", "bg-amber text-ink", "bg-sage text-ink", "bg-teal text-teal-fg"]

function Readouts({ result }: { result: QueryResult }) {
  const series = result.chart.series[0]
  const points = series
    ? result.rows.flatMap((row) => {
        const value = row[series.key]
        return typeof value === "number" ? [{ label: String(row.label), value }] : []
      })
    : []
  const peak = points.reduce<{ label: string; value: number } | null>((best, row) => (!best || row.value > best.value ? row : best), null)
  const latest = points.at(-1) ?? null
  const tiles = [
    { label: "Window", value: result.plan.range.label, tone: "bg-blush text-ink" },
    { label: "Rows", value: String(result.rowCount), tone: "bg-amber text-ink" },
    peak && series
      ? { label: `High ${series.label.toLowerCase()}`, value: formatBy(series.format, peak.value), hint: peak.label, tone: "bg-sage text-ink" }
      : null,
    latest && series
      ? { label: "Latest point", value: formatBy(series.format, latest.value), hint: latest.label, tone: "bg-teal text-teal-fg" }
      : null,
  ].filter((tile) => tile !== null)

  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-1">
      {tiles.map((tile) => (
        <li key={tile.label} className={`rounded-[1.25rem] p-4 ${tile.tone}`}>
          <p className="text-sm font-semibold">{tile.label}</p>
          <p className="mt-2 text-2xl font-bold leading-none tracking-tight tabular-nums">{tile.value}</p>
          {"hint" in tile && tile.hint ? <p className="mt-2 text-sm">{tile.hint}</p> : null}
        </li>
      ))}
    </ul>
  )
}

function logOutcome(question: string, outcome: Outcome) {
  const id = crypto.randomUUID()
  const at = new Date().toISOString()
  if (outcome.kind === "ok") {
    useInsight.getState().log({
      id,
      at,
      question,
      status: "executed",
      summary: outcome.result.summary,
      sql: outcome.result.sql,
      rows: outcome.result.rowCount,
      planHash: outcome.result.planHash,
    })
    return
  }
  useInsight.getState().log({
    id,
    at,
    question,
    status: outcome.kind === "clarify" ? "clarified" : "blocked",
    summary: outcome.message,
  })
}

export function Studio() {
  const ready = useInsightReady()
  const returnsConfirmed = useInsight((state) => state.returnsConfirmed)
  const certifiedFormulas = useInsight((state) => state.certifiedFormulas)
  const saved = useInsight((state) => state.saved)
  const reports = useInsight((state) => state.reports)
  const ctx = useMemo<EngineCtx>(
    () => ({ returnsConfirmed, certifiedFormulas }),
    [returnsConfirmed, certifiedFormulas],
  )
  const [draft, setDraft] = useState(OPENING_QUESTION)
  const [question, setQuestion] = useState(OPENING_QUESTION)
  const [outcome, setOutcome] = useState<Outcome>(() => answer(OPENING_QUESTION, DEFAULT_CTX))
  const [visual, setVisual] = useState<VisualFamily | null>(null)
  const [sqlDraft, setSqlDraft] = useState<string | null>(null)
  const [sqlNote, setSqlNote] = useState("")
  const [copied, setCopied] = useState(false)
  const [savedNote, setSavedNote] = useState("")
  const [pinReport, setPinReport] = useState("")
  const heading = useRef<HTMLHeadingElement>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (!ready) return
    let cancel = false
    void askClinic({ data: { by: currentVisitor()?.email ?? "", question } }).then((hit) => {
      if (cancel) return
      setOutcome(hit.matched ? clinicOutcome(hit) : answer(question, ctx))
      setVisual(null)
      setSqlDraft(null)
    })
    return () => {
      cancel = true
    }
  }, [ready, ctx, question])

  useEffect(() => {
    if (ready) void refreshSharedReports()
  }, [ready])

  async function run(text: string) {
    const hit = await askClinic({ data: { by: currentVisitor()?.email ?? "", question: text } })
    const next = hit.matched ? clinicOutcome(hit) : answer(text, ready ? ctx : DEFAULT_CTX)
    setDraft(text)
    setQuestion(text)
    setOutcome(next)
    setVisual(null)
    setSqlDraft(null)
    setSqlNote("")
    logOutcome(text, next)
    ran.current = true
    queueMicrotask(() => heading.current?.focus())
  }

  const result = outcome.kind === "ok" ? outcome.result : null
  const shown = result ? (visual ?? result.plan.visual) : "table"
  const options = result ? compatibleVisuals(result) : []
  const sql = sqlDraft ?? result?.sql ?? ""

  function validateEdit() {
    if (!result) return
    const verdict = validateSql(sql, ctx)
    if (!verdict.ok) {
      setSqlNote(verdict.message)
      return
    }
    const same = sql.replace(/\s+/g, " ").trim() === result.sql.replace(/\s+/g, " ").trim()
    setSqlNote(
      same
        ? `Gateway accepted plan ${result.planHash}. This is the bound statement.`
        : `Gateway accepted the text, but execution stays bound to plan ${result.planHash}. A different statement is not run.`,
    )
    useInsight.getState().log({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      question: "Edited SQL",
      status: "validated",
      summary: same ? "Matched the bound plan." : "Accepted, not executed. Hash mismatch.",
      sql,
      planHash: result.planHash,
    })
  }

  function save() {
    if (!result) return
    const id = crypto.randomUUID()
    const created = new Date()
    const expires = new Date(created.getTime() + 7 * 24 * 60 * 60 * 1000)
    useInsight.getState().saveVisual({
      id,
      question,
      title: result.summary,
      summary: result.summary,
      notes: result.notes,
      logic: result.logic,
      sql: result.sql,
      planHash: result.planHash,
      columns: result.columns,
      rows: result.rows,
      chart: result.chart,
      visual: shown,
      createdAt: created.toISOString(),
      expiresAt: expires.toISOString(),
      revoked: false,
    })
    setSavedNote("Saved in this browser. The embed token lasts seven days.")
  }

  async function pin() {
    if (!result) return
    const tile: Tile = {
      id: crypto.randomUUID(),
      title: result.summary,
      summary: result.summary,
      source: "Lumen Outdoor extract",
      visual: shown,
      chart: result.chart,
      columns: result.columns,
    }
    const existing = reports.find((report) => report.id === pinReport)
    const saved = await publishReport({
      id: existing?.id,
      title: existing?.title ?? (question.slice(0, 60) || "Report"),
      audience: existing?.audience ?? "Shop",
      tiles: [tile],
    })
    if (!saved.ok) {
      setSavedNote(saved.message)
      return
    }
    setPinReport(saved.id)
    setSavedNote("Pinned into the shared database. Open Reports to see it with the others.")
  }

  function download() {
    if (!result) return
    const blob = new Blob([exportHtml(result, shown, question)], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "insightcanvas-visual.html"
    link.click()
    URL.revokeObjectURL(url)
  }

  async function copySql() {
    try {
      await navigator.clipboard.writeText(sql)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="grid gap-8">
      <section aria-labelledby="ask-label" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-heat">Published model v3</p>
            <h1 id="ask-label" className="text-3xl tracking-tight text-ink md:text-5xl">
              Ask one question
            </h1>
          </div>
          <p className="hidden max-w-sm text-sm text-muted md:block">
            The plan is typed. SQL is compiled underneath, then refused if it fails the gateway. Data through {AS_OF}.
          </p>
        </div>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            run(draft)
          }}
        >
          <label htmlFor="question" className="text-sm font-semibold">
            Question
          </label>
          <textarea
            id="question"
            value={draft}
            rows={2}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                run(draft)
              }
            }}
            className="min-h-16 w-full resize-y rounded-[1.25rem] border border-line bg-canvas px-4 py-3 text-xl font-semibold tracking-tight text-ink md:min-h-24 md:text-2xl"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={primary}>
              Run
            </button>
            <p className="text-sm text-muted">Ctrl or Cmd Enter</p>
          </div>
        </form>
      </section>

      <section aria-live="polite" className="grid gap-5">
        <h2 ref={heading} tabIndex={-1} className="sr-only">
          Result
        </h2>
        <ol className="flex gap-2 overflow-x-auto">
          {outcome.stages.map((stage, index) => (
            <li
              key={stage.name}
              className={
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-sm " +
                (stage.status === "done"
                  ? "border-line bg-paper"
                  : stage.status === "stopped"
                    ? "border-danger bg-danger-soft text-danger"
                    : "border-line text-muted")
              }
            >
              <span className="font-semibold">
                {index + 1} {stage.name}
              </span>
              <span className="hidden text-muted md:inline">{stage.detail}</span>
            </li>
          ))}
        </ol>

        {outcome.kind === "clarify" ? (
          <div className="rounded-[1.25rem] border border-warn bg-warn-soft p-4 md:p-6">
            <h3 className="text-2xl tracking-tight">Need a decision before this runs</h3>
            <p className="mt-2 max-w-2xl">{outcome.message}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {outcome.choices.map((choice) => (
                <button key={choice.question} type="button" className={primary} onClick={() => void run(choice.question)}>
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {outcome.kind === "block" ? (
          <div className="rounded-[1.25rem] border border-danger bg-danger-soft p-4 md:p-6" role="alert">
            <h3 className="text-2xl tracking-tight text-danger">Stopped</h3>
            <p className="mt-2 max-w-2xl text-ink">{outcome.message}</p>
            {outcome.message.includes("model page") ? (
              <Link to="/model" className={`${primary} mt-4`}>
                Open the model
              </Link>
            ) : null}
          </div>
        ) : null}

        {result ? (
          <div className="grid gap-5">
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_15rem]">
              {!result.plan.dimension && result.rows[0] ? (
                <div className="flex flex-wrap gap-8 rounded-[1.25rem] bg-night p-5 text-night-fg md:p-6">
                  {result.chart.series.map((series) => (
                    <p key={series.key}>
                      <span className="block text-sm text-night-muted">{series.label}</span>
                      <span className="text-5xl font-bold tabular-nums tracking-tight">
                        {formatBy(series.format, typeof result.rows[0][series.key] === "number" ? (result.rows[0][series.key] as number) : null)}
                      </span>
                    </p>
                  ))}
                </div>
              ) : (
                <ChartView result={result} visual={shown} summary={result.summary} />
              )}
              <Readouts result={result} />
            </div>
            <div className="grid gap-3">
              <p className="text-2xl font-bold tracking-tight text-ink md:text-4xl">{result.summary}</p>
              <p className="max-w-2xl text-sm text-muted">{result.plan.visualReason}</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Chart binding">
                {options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={shown === option}
                    className={shown === option ? primary : quiet}
                    onClick={() => setVisual(option)}
                  >
                    {VISUAL_LABEL[option]}
                  </button>
                ))}
              </div>
            </div>

            {result.notes.length ? (
              <ul className="grid gap-1 text-sm text-muted">
                {result.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-wrap items-end gap-2">
              <button type="button" className={quiet} onClick={save}>
                Save visual
              </button>
              <button type="button" className={quiet} onClick={download}>
                Export HTML
              </button>
              <label className="grid gap-1 text-sm font-semibold">
                Report
                <select value={pinReport} onChange={(event) => setPinReport(event.target.value)} className="min-h-11 rounded-full border border-line bg-paper px-4 font-normal">
                  <option value="">New report</option>
                  {reports.map((report) => (
                    <option key={report.id} value={report.id}>
                      {report.title}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className={primary} onClick={() => void pin()}>
                Pin to report
              </button>
              {savedNote ? <p className="self-center text-sm text-muted">{savedNote}</p> : null}
            </div>

            <section aria-labelledby="table-heading" className="grid gap-2">
              <h3 id="table-heading" className="text-xl">
                Data table
              </h3>
              <div className="max-w-full overflow-x-auto rounded-lg border border-line bg-paper">
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">Values for {result.summary}</caption>
                  <thead>
                    <tr>
                      {result.columns.map((column) => (
                        <th key={column.key} scope="col" className="border-b border-line px-3 py-2 text-left font-semibold">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row) => (
                      <tr key={String(row.label)} className="odd:bg-canvas">
                        {result.columns.map((column, index) => {
                          const text = formatBy(column.format, row[column.key] ?? null)
                          return index === 0 ? (
                            <th key={column.key} scope="row" className="border-b border-line px-3 py-2 text-left font-semibold">
                              {text}
                            </th>
                          ) : (
                            <td key={column.key} className="border-b border-line px-3 py-2 text-left tabular-nums">
                              {text}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted">{result.rowCount} rows shown. Cap is 500.</p>
            </section>

            <section aria-labelledby="logic-heading" className="grid gap-2">
              <h3 id="logic-heading" className="text-xl">
                Calculation
              </h3>
              <ul className="grid gap-2">
                {result.logic.map((line) => (
                  <li key={line} className="rounded-md border border-line bg-paper px-3 py-2 text-sm">
                    {line}
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="sql-heading" className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="sql-heading" className="text-xl">
                  SQL · plan {result.planHash}
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={quiet} onClick={() => void copySql()}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button type="button" className={quiet} onClick={validateEdit}>
                    Validate edit
                  </button>
                </div>
              </div>
              <label htmlFor="sql" className="text-sm text-muted">
                Edit the statement if you want. It is checked again. It runs only when it still matches this plan hash.
              </label>
              <textarea
                id="sql"
                value={sql}
                onChange={(event) => setSqlDraft(event.target.value)}
                spellCheck={false}
                rows={14}
                className="w-full overflow-x-auto rounded-lg bg-code p-4 font-mono text-sm leading-relaxed text-code-fg"
              />
              {result.params.length ? (
                <ul className="text-sm text-muted">
                  {result.params.map((param) => (
                    <li key={param.name}>
                      {param.name} = {param.value}
                    </li>
                  ))}
                </ul>
              ) : null}
              {sqlNote ? <p className="text-sm">{sqlNote}</p> : null}
            </section>
          </div>
        ) : null}
      </section>

      <section className="grid gap-2" aria-label="Examples">
        <h2 className="text-sm font-semibold text-muted">Clinic book</h2>
        <div className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
          {CLINIC_QUESTIONS.map((item, index) => (
            <button key={item} type="button" className={`${btn} shrink-0 border-0 ${chips[index % chips.length]}`} onClick={() => void run(item)}>
              {item}
            </button>
          ))}
        </div>
        <h2 className="text-sm font-semibold text-muted">Shop extract</h2>
        <div className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
          {SUGGESTED[0].items.map((item, index) => (
            <button key={item} type="button" className={`${btn} shrink-0 border-0 ${chips[index % chips.length]}`} onClick={() => void run(item)}>
              {item}
            </button>
          ))}
        </div>
        <details className="rounded-[1.25rem] bg-canvas px-4 py-2">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Ambiguity, time rules, and refusals</summary>
          <div className="flex flex-wrap gap-2 pb-2">
            {SUGGESTED[1].items.map((item) => (
              <button key={item} type="button" className={quiet} onClick={() => void run(item)}>
                {item}
              </button>
            ))}
          </div>
        </details>
      </section>

      {ready && saved.length ? (
        <section aria-labelledby="saved-heading" className="grid gap-3">
          <h2 id="saved-heading" className="text-xl">
            Saved visuals
          </h2>
          <ul className="grid gap-2">
            {saved.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-paper px-3 py-2">
                <div>
                  <p className="font-semibold">{item.revoked ? "Revoked" : item.question}</p>
                  <p className="text-sm text-muted">
                    Token {item.id.slice(0, 8)} · expires {item.expiresAt.slice(0, 10)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link to="/embed/$id" params={{ id: item.id }} className={quiet}>
                    Embed
                  </Link>
                  <button type="button" className={quiet} onClick={() => useInsight.getState().revokeVisual(item.id)} disabled={item.revoked}>
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
