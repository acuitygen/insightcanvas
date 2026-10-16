import { useEffect, useState } from "react"
import { currentVisitor } from "@/components/insight/door"
import { listReveals } from "@/lib/insight/clinic-insight"
import { useInsight, useInsightReady } from "@/lib/insight/store"

export function AuditScreen() {
  const ready = useInsightReady()
  const audit = useInsight((state) => state.audit)
  const [reveals, setReveals] = useState<{ email: string; subject: string; at: string }[]>([])
  useEffect(() => {
    const by = currentVisitor()?.email ?? ""
    if (!by) return
    void listReveals({ data: { by } }).then((result) => {
      if (result.ok) setReveals(result.rows)
    })
  }, [])
  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl md:text-4xl">Audit log</h1>
          <p className="mt-2 max-w-2xl text-muted">Questions stay in this browser. Name reveals are stored with the clinic book.</p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-full border border-line bg-paper px-4 text-sm font-semibold"
          onClick={() => useInsight.getState().clearAudit()}
        >
          Clear log
        </button>
      </header>
      {!ready ? <p className="text-sm text-muted">Opening the log…</p> : null}
      {ready && audit.length === 0 ? (
        <p className="rounded-lg border border-line bg-paper p-4">Nothing recorded yet. Run a question, or refuse a statement on the model page.</p>
      ) : null}
      <ul className="grid gap-3">
        {ready
          ? audit.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-line bg-paper p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold">{entry.question}</h2>
                  <p className="text-sm text-muted">{entry.at.replace("T", " ").slice(0, 19)} · {entry.status}</p>
                </div>
                <p className="mt-1 text-sm">{entry.summary}</p>
                {entry.rows != null ? <p className="text-sm text-muted">{entry.rows} rows{entry.planHash ? ` · plan ${entry.planHash}` : ""}</p> : null}
                {entry.sql ? <pre className="mt-3 max-w-full overflow-x-auto rounded-md bg-code p-3 font-mono text-sm text-code-fg">{entry.sql}</pre> : null}
              </li>
            ))
          : null}
      </ul>
      <section className="grid gap-2">
        <h2 className="text-xl">Name reveals</h2>
        {reveals.length === 0 ? <p className="text-sm text-muted">No one has revealed patient names.</p> : null}
        <ul className="grid gap-2">
          {reveals.map((row) => (
            <li key={`${row.at}-${row.email}`} className="rounded-[1.25rem] border border-line px-4 py-3 text-sm">
              <span className="font-semibold">{row.email}</span> revealed {row.subject}
              <span className="text-muted"> · {row.at.replace("T", " ").slice(0, 19)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
