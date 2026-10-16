import { Link } from "@tanstack/react-router"
import { useState } from "react"

const quiet = "inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-paper px-4 text-sm font-semibold"
const jump = "inline-flex min-h-11 items-center rounded-full bg-canvas px-4 text-sm font-semibold"

const SQL = [
  {
    title: "Check that the connection works",
    sql: "select current_database() as database, current_user as role, now()::date as day",
  },
  {
    title: "Visits, consult fees, and medicine sales by month",
    sql: "select to_char(v.visit_date, 'YYYY-MM') as month, count(*) as visits, sum(v.consult_fee) as consult_fees, coalesce(sum(d.amount), 0) as medicine_sales\nfrom clinic_visit v\nleft join (\n  select visit_id, sum(quantity * unit_price) as amount\n  from clinic_dispense\n  group by visit_id\n) d on d.visit_id = v.id\ngroup by 1\norder by 1",
  },
  {
    title: "Consult fees by clinician",
    sql: "select clinician, count(*) as visits, sum(consult_fee) as consult_fees\nfrom clinic_visit\ngroup by clinician\norder by consult_fees desc",
  },
  {
    title: "Visits by condition",
    sql: "select condition, count(*) as visits\nfrom clinic_visit\ngroup by condition\norder by visits desc",
  },
  {
    title: "Medicine shelf, units dispensed, and sales",
    sql: "select m.name, m.strength, m.unit_price, m.stock, coalesce(sum(d.quantity), 0) as dispensed, coalesce(sum(d.quantity * d.unit_price), 0) as sales\nfrom clinic_medicine m\nleft join clinic_dispense d on d.medicine_id = m.id\ngroup by m.name, m.strength, m.unit_price, m.stock\norder by m.name",
  },
  {
    title: "Patients and how often they were seen",
    sql: "select p.name, p.city, count(v.id) as visits\nfrom clinic_patient p\nleft join clinic_visit v on v.patient_id = p.id\ngroup by p.name, p.city\norder by visits desc",
  },
  {
    title: "One row per visit, with the medicine total",
    sql: "select v.visit_date, p.name as patient, v.clinician, v.diagnosis, v.consult_fee, coalesce(sum(d.quantity * d.unit_price), 0) as medicines\nfrom clinic_visit v\njoin clinic_patient p on p.id = v.patient_id\nleft join clinic_dispense d on d.visit_id = v.id\ngroup by v.visit_date, p.name, v.clinician, v.diagnosis, v.consult_fee\norder by v.visit_date desc",
  },
] as const

function SqlBlock({ title, sql }: { title: string; sql: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(sql)
    setCopied(true)
  }
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{title}</h3>
        <button type="button" className={quiet} onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre className="overflow-x-auto rounded-2xl bg-ink px-4 py-3 text-sm text-paper"><code>{sql}</code></pre>
    </div>
  )
}

export function HelpScreen() {
  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <p className="text-sm font-semibold text-heat">Using InsightCanvas</p>
        <h1 className="text-3xl tracking-tight md:text-5xl">Help</h1>
        <p className="max-w-2xl text-muted">Reports, sources, people on the link, the SQL you can paste, and an outside Postgres database.</p>
      </header>
      <section id="why" className="grid scroll-mt-6 gap-3 rounded-[1.25rem] bg-blush p-4">
        <h2 className="text-2xl tracking-tight">What InsightCanvas is for</h2>
        <p className="text-sm">It is a done-for-you report for a clinic or a small firm. You do not build a model, write a formula, or arrange a blank canvas. Ask a question, or open an outline, and the page is already filled.</p>
        <ul className="grid gap-2 text-sm">
          <li><span className="font-semibold">Ask the book.</span> Questions about practitioners, cancellations, weekdays, and medicine sales are answered from Jaskirat Mithai Clinic.</li>
          <li><span className="font-semibold">One-click outline.</span> Reports, then Clinic outline, builds visits, fees, cancellations, weekdays, conditions, and medicine sales.</li>
          <li><span className="font-semibold">Drop a file.</span> CSV, JSON, and Excel. Dates and amounts are recognized. No one has to clean the sheet by hand.</li>
          <li><span className="font-semibold">Share a link.</span> Add an email on Model. The person confirms that email and types their name. There is no Microsoft account and no password.</li>
          <li><span className="font-semibold">Names stay masked.</span> Patient names and phone numbers are hidden until you press Show names. That reveal is stored in the audit log.</li>
        </ul>
        <p className="text-sm">Not in this version: live connections to Jane, Athenahealth, QuickBooks, or Xero, a Microsoft 365 sign-in, department row-level security, or a HIPAA certification. The clinic book is simulated.</p>
      </section>
      <nav aria-label="Help sections" className="flex gap-2 overflow-x-auto">
        <a href="#create-report" className={jump}>Create a report</a>
        <a href="#update-source" className={jump}>Update a source</a>
        <a href="#add-user" className={jump}>Add a user</a>
        <a href="#sql" className={jump}>SQL</a>
        <a href="#external-db" className={jump}>External database</a>
      </nav>

      <section id="create-report" className="grid scroll-mt-6 gap-3 rounded-[1.25rem] bg-canvas p-4">
        <h2 className="text-2xl tracking-tight">How to create a report</h2>
        <ol className="grid gap-2 text-sm">
          <li><span className="font-semibold">1. Open Reports.</span> Type a name, choose Clinic, Law practice, Shop, or Other, and press Create empty page.</li>
          <li><span className="font-semibold">2. Or start from an outline.</span> Clinic outline is filled from the clinic book. Practice week and Shop month use the sample books.</li>
          <li><span className="font-semibold">3. Add from Ask.</span> Run a question, choose the report in Pin to, and press Pin to report. Leave it on New report if you want a fresh page.</li>
          <li><span className="font-semibold">4. Add from Sources.</span> Shape a file and press Pin this visual, or run a database query and press Pin result.</li>
          <li><span className="font-semibold">5. Review the page.</span> A report holds eight visuals. Press Remove on one you do not want. Everyone who confirmed an email on this link sees the same page.</li>
        </ol>
        <Link to="/reports" className={quiet}>Go to Reports</Link>
      </section>

      <section id="update-source" className="grid scroll-mt-6 gap-3 rounded-[1.25rem] bg-canvas p-4">
        <h2 className="text-2xl tracking-tight">How to update a source</h2>
        <ol className="grid gap-2 text-sm">
          <li><span className="font-semibold">1. Clinic book.</span> Open Clinic. A new patient or a new visit updates the file, the shelf, and the finance totals. Do not upload that book.</li>
          <li><span className="font-semibold">2. Replace a file.</span> On Sources, choose a newer CSV, JSON, or Excel file. A new chip appears. Press Remove file on the old chip. Only the first 800 rows stay, and only in this browser.</li>
          <li><span className="font-semibold">3. Mail.</span> Choose Gmail or Outlook, type a search such as newer_than:7d, and press Search mail. Connect that mailbox in Grok first. Messages are not stored.</li>
          <li><span className="font-semibold">4. Outside database.</span> Paste a new postgres:// string or a new SELECT, then press Run query. The previous string is not kept.</li>
        </ol>
        <Link to="/sources" className={quiet}>Go to Sources</Link>
      </section>

      <section id="add-user" className="grid scroll-mt-6 gap-3 rounded-[1.25rem] bg-canvas p-4">
        <h2 className="text-2xl tracking-tight">How to add a new user</h2>
        <ol className="grid gap-2 text-sm">
          <li><span className="font-semibold">1. First address.</span> Before anyone else opens the link, the setup screen asks who can open it. Type an email and press Add this email. Add the others, then press Continue.</li>
          <li><span className="font-semibold">2. Later addresses.</span> Open Model. Under People who can open the link, type the email and press Add email.</li>
          <li><span className="font-semibold">3. Nothing is emailed.</span> Send the person the link yourself. They type that same email. There is no password. The next screen asks for their first name and last name.</li>
          <li><span className="font-semibold">4. Remove someone.</span> On Model, press Remove next to their email. They can no longer confirm that address.</li>
        </ol>
        <Link to="/model" className={quiet}>Go to Model</Link>
      </section>

      <section id="sql" className="grid scroll-mt-6 gap-4 rounded-[1.25rem] bg-canvas p-4">
        <h2 className="text-2xl tracking-tight">Exact SQL to paste</h2>
        <p className="text-sm">Paste one of these into Sources, under Database. Do not add a semicolon. The first string works on any Postgres. The clinic strings work only when that database has the clinic tables: clinic_patient, clinic_visit, clinic_medicine, and clinic_dispense. The app returns at most 200 rows.</p>
        <ul className="grid gap-1 text-sm">
          <li>Start with select or with.</li>
          <li>One statement. No semicolon, and no second statement after it.</li>
          <li>Do not use insert, update, delete, drop, alter, create, grant, copy, or truncate.</li>
        </ul>
        {SQL.map((item) => <SqlBlock key={item.title} title={item.title} sql={item.sql} />)}
      </section>

      <section id="external-db" className="grid scroll-mt-6 gap-3 rounded-[1.25rem] bg-canvas p-4">
        <h2 className="text-2xl tracking-tight">How to connect to an external database</h2>
        <ol className="grid gap-2 text-sm">
          <li><span className="font-semibold">1. Get a read-only Postgres address.</span> It looks like postgres://user:password@host:5432/dbname. MySQL, SQL Server, and BigQuery do not use this box.</li>
          <li><span className="font-semibold">2. Open Sources</span> and find Database.</li>
          <li><span className="font-semibold">3. Paste the connection string.</span> It is used for that query and is not saved. Use a password that can only read.</li>
          <li><span className="font-semibold">4. Paste one SELECT</span> from the list above, with no semicolon.</li>
          <li><span className="font-semibold">5. Press Run query.</span> If the host is not this machine, the connection uses TLS.</li>
          <li><span className="font-semibold">6. Press Pin result</span> to put the chart on a report named Database.</li>
        </ol>
        <p className="text-sm">The Jaskirat Mithai Clinic book on the Clinic tab is already connected. You do not paste a connection string for it.</p>
        <Link to="/sources" className={quiet}>Go to Sources</Link>
      </section>
    </div>
  )
}
