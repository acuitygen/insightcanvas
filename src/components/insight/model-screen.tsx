import { useEffect, useState } from "react"
import { addAllowed, listAllowed, removeAllowed, type AllowedPerson } from "@/lib/insight/access"
import { currentVisitor } from "@/components/insight/door"
import { CATEGORIES, CHANNELS, FORMULAS, METRICS, PRODUCTS, REGIONS } from "@/lib/insight/catalog"
import { DATA_STATS } from "@/lib/insight/dataset"
import { useInsight } from "@/lib/insight/store"
import type { FormulaId } from "@/lib/insight/types"
import { validateSql } from "@/lib/insight/validate"

const quiet = "inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-paper px-4 text-sm font-semibold hover:border-ink"
const primary = "inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 text-sm font-semibold text-paper hover:bg-primary-hover"

const ATTACKS = [
  { label: "Drop table", sql: "DROP TABLE analytics.fact_order_line" },
  { label: "Stacked delete", sql: "SELECT net_revenue FROM analytics.fact_order_line LIMIT 5; DELETE FROM analytics.fact_order_line" },
  { label: "Read a file", sql: "SELECT pg_read_file('/etc/passwd')" },
  { label: "Outside the model", sql: "SELECT secret FROM secret.credentials LIMIT 10" },
  { label: "Select star", sql: "SELECT * FROM analytics.fact_order_line LIMIT 10" },
  { label: "Missing limit", sql: "SELECT SUM(net_revenue) AS revenue FROM analytics.fact_order_line" },
]

export function ModelScreen() {
  const returnsConfirmed = useInsight((state) => state.returnsConfirmed)
  const drafted = useInsight((state) => state.drafted)
  const certified = useInsight((state) => state.certifiedFormulas)
  const [formulaText, setFormulaText] = useState("")
  const [formulaNote, setFormulaNote] = useState("")
  const [sql, setSql] = useState(ATTACKS[0].sql)
  const [verdict, setVerdict] = useState("")
  const [people, setPeople] = useState<AllowedPerson[]>([])
  const [invite, setInvite] = useState("")
  const [inviteNote, setInviteNote] = useState("")

  useEffect(() => {
    void listAllowed().then(setPeople).catch(() => setPeople([]))
  }, [])

  async function invitePerson(event: { preventDefault: () => void }) {
    event.preventDefault()
    const by = currentVisitor()?.email ?? ""
    try {
      await addAllowed({ data: { email: invite, by } })
      setInvite("")
      setInviteNote("Added. They type this email when they open the link, then their name.")
      setPeople(await listAllowed())
    } catch (error) {
      setInviteNote(error instanceof Error ? error.message : "Could not add that email.")
    }
  }

  async function revoke(email: string) {
    const by = currentVisitor()?.email ?? ""
    await removeAllowed({ data: { email, by } })
    setPeople(await listAllowed())
  }

  function draft() {
    const text = formulaText.toLowerCase()
    let id: FormulaId | null = null
    if (text.includes("average selling") || text.trim() === "asp") id = "asp"
    if (text.includes("units per order")) id = "units_per_order"
    if (!id) {
      setFormulaNote("I can draft a private ratio of certified aggregates. Try “average selling price” or “units per order”.")
      return
    }
    useInsight.getState().draftFormula(id)
    setFormulaNote(`${FORMULAS[id].name} is drafted and private. Certify it before a question can use it.`)
  }

  function checkSql() {
    const result = validateSql(sql, { returnsConfirmed, certifiedFormulas: certified })
    setVerdict(result.ok ? "Gateway accepted this statement. It is not executed from here." : result.message)
    useInsight.getState().log({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      question: "Gateway check",
      status: result.ok ? "validated" : "rejected",
      summary: result.ok ? "Accepted, not executed." : result.message,
      sql,
    })
  }

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <p className="text-sm font-semibold text-primary">lumen_retail v3 · pinned</p>
        <h1 className="font-display text-3xl md:text-4xl">Semantic model</h1>
        <p className="max-w-2xl text-muted">
          Foreign keys are suggestions until you confirm them. Queries pin this published version. A schema break marks a saved visual stale instead of remapping it.
        </p>
      </header>

      <section className="grid gap-3 rounded-[1.25rem] bg-blush p-4 md:p-6">
        <h2 className="text-2xl tracking-tight">People who can open the link</h2>
        <p className="max-w-2xl text-sm">Nothing is emailed. Add the address here, send them the link, and they confirm that same address before giving their name.</p>
        <form className="flex flex-wrap gap-2" onSubmit={(event) => void invitePerson(event)}>
          <label className="sr-only" htmlFor="invite-email">Email</label>
          <input id="invite-email" type="email" required value={invite} onChange={(event) => setInvite(event.target.value)} placeholder="name@company.com" className="min-h-11 min-w-0 flex-1 rounded-full border border-line bg-paper px-4" />
          <button type="submit" className={primary}>Add email</button>
        </form>
        {inviteNote ? <p className="text-sm">{inviteNote}</p> : null}
        <ul className="grid gap-2">
          {people.map((person) => (
            <li key={person.email} className="flex flex-wrap items-center justify-between gap-2 rounded-full bg-paper px-4 py-2">
              <span>
                <span className="font-semibold">{person.email}</span>
                {person.firstName ? <span className="text-sm text-muted"> · {person.firstName} {person.lastName}</span> : <span className="text-sm text-muted"> · name not entered yet</span>}
              </span>
              <button type="button" className={quiet} onClick={() => void revoke(person.email)}>Remove</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-lg border border-line bg-paper p-4">
          <h2 className="font-display text-xl">Connection</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted">Engine</dt><dd>PostgreSQL 16</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Role</dt><dd>insight_readonly</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Privilege</dt><dd>SELECT only, verified</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Secret</dt><dd>vault://client/lumen/pg</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Extract</dt><dd>{DATA_STATS.lines.toLocaleString("en-US")} lines · {DATA_STATS.orders.toLocaleString("en-US")} orders</dd></div>
          </dl>
          <p className="mt-3 text-sm text-muted">Credentials never reach the browser. This preview answers from the published extract so the question stays on the page.</p>
        </article>
        <article className="rounded-lg border border-line bg-paper p-4">
          <h2 className="font-display text-xl">Fiscal calendar</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted">Year starts</dt><dd>April</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Timezone</dt><dd>Asia/Kolkata</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Week</dt><dd>Monday</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">As of</dt><dd>16 Oct 2026</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Leap day</dt><dd>29 Feb clamps to 28 Feb</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Currency</dt><dd>USD only</dd></div>
          </dl>
        </article>
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-2xl">Tables</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <article className="rounded-lg border border-line bg-paper p-4 text-sm">
            <h3 className="font-semibold">analytics.fact_order_line</h3>
            <p className="text-muted">order_id, order_date, ship_date, product_id, region_id, channel_id, units, net_revenue, cogs</p>
          </article>
          <article className="rounded-lg border border-line bg-paper p-4 text-sm">
            <h3 className="font-semibold">analytics.dim_date</h3>
            <p className="text-muted">date_key, week_start, month_start, fiscal_quarter_start, fiscal_year_start, calendar_year_start</p>
          </article>
          <article className="rounded-lg border border-line bg-paper p-4 text-sm">
            <h3 className="font-semibold">analytics.dim_product</h3>
            <p className="text-muted">{PRODUCTS.map((item) => item.name).join(", ")}. Categories: {CATEGORIES.join(", ")}.</p>
          </article>
          <article className="rounded-lg border border-line bg-paper p-4 text-sm">
            <h3 className="font-semibold">analytics.dim_region · dim_channel</h3>
            <p className="text-muted">Regions: {REGIONS.map((item) => item.name).join(", ")}. Channels: {CHANNELS.map((item) => item.name).join(", ")}.</p>
          </article>
          <article className="rounded-lg border border-line bg-paper p-4 text-sm md:col-span-2">
            <h3 className="font-semibold">analytics.fact_return</h3>
            <p className="text-muted">{DATA_STATS.returns.toLocaleString("en-US")} returns. return_id, order_id, return_date, return_amount. No product of its own.</p>
          </article>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-2xl">Relationships</h2>
        <ul className="grid gap-2">
          {[
            ["Order line → product", "Many to one", true],
            ["Order line → region", "Many to one", true],
            ["Order line → channel", "Many to one", true],
            ["Order line → date", "Many to one, role order date (default) and ship date", true],
          ].map(([label, detail]) => (
            <li key={String(label)} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-paper px-3 py-3">
              <span>
                <span className="block font-semibold">{label}</span>
                <span className="text-sm text-muted">{detail}</span>
              </span>
              <span className="rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-primary">Confirmed</span>
            </li>
          ))}
          <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-paper px-3 py-3">
            <span>
              <span className="block font-semibold">Return → order</span>
              <span className="text-sm text-muted">Many returns to one order. Suggested by the foreign key. Not usable until confirmed. Aggregate before any join.</span>
            </span>
            <button type="button" className={returnsConfirmed ? quiet : primary} onClick={() => useInsight.getState().setReturnsConfirmed(!returnsConfirmed)}>
              {returnsConfirmed ? "Revoke confirmation" : "Confirm relationship"}
            </button>
          </li>
        </ul>
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-2xl">Certified measures</h2>
        <ul className="grid gap-2">
          {(["revenue", "units", "orders", "margin_pct", "margin_amount", "aov"] as const).map((id) => (
            <li key={id} className="rounded-md border border-line bg-paper px-3 py-3">
              <p className="font-semibold">{METRICS[id].label}</p>
              <p className="text-sm text-muted">{METRICS[id].logic}</p>
              <p className="mt-1 font-mono text-sm">{METRICS[id].sql}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-2xl">Private formulas</h2>
        <p className="max-w-2xl text-sm text-muted">Plain English becomes an expression tree. It stays private until you certify it. Only you can do that.</p>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            draft()
          }}
        >
          <label htmlFor="formula" className="sr-only">Formula</label>
          <input
            id="formula"
            value={formulaText}
            onChange={(event) => setFormulaText(event.target.value)}
            placeholder="Average selling price"
            className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-paper px-3"
          />
          <button type="submit" className={primary}>Draft formula</button>
        </form>
        {formulaNote ? <p className="text-sm">{formulaNote}</p> : null}
        <ul className="grid gap-2">
          {drafted.map((id) => {
            const spec = FORMULAS[id]
            const on = certified.includes(id)
            return (
              <li key={id} className="rounded-md border border-line bg-paper px-3 py-3">
                <p className="font-semibold">{spec.name}</p>
                <p className="font-mono text-sm">{spec.tree}</p>
                <p className="text-sm text-muted">Grain: {spec.grain}. {spec.scope} Zero denominator is null.</p>
                <button type="button" className={`${on ? quiet : primary} mt-3`} onClick={() => useInsight.getState().setCertified(id, !on)}>
                  {on ? "Make private again" : "Certify measure"}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-2xl">SQL gateway</h2>
        <p className="max-w-2xl text-sm text-muted">
          One SELECT. Approved functions and tables only. A numeric LIMIT is required. Nothing here is executed.
        </p>
        <div className="flex flex-wrap gap-2">
          {ATTACKS.map((attack) => (
            <button key={attack.label} type="button" className={quiet} onClick={() => setSql(attack.sql)}>
              {attack.label}
            </button>
          ))}
        </div>
        <label htmlFor="gateway" className="sr-only">SQL to validate</label>
        <textarea id="gateway" value={sql} onChange={(event) => setSql(event.target.value)} rows={6} spellCheck={false} className="w-full rounded-lg bg-code p-4 font-mono text-sm text-code-fg" />
        <button type="button" className={primary} onClick={checkSql}>Validate</button>
        {verdict ? <p role="status" className="text-sm">{verdict}</p> : null}
      </section>
    </div>
  )
}
