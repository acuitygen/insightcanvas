import { Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { currentVisitor } from "@/components/insight/door"
import { clinicFinance, clinicHome, clinicLedger, listMedicines, patientRecord, savePatient, saveVisit, searchPatients, visitSheet } from "@/lib/insight/clinic"
import { clinicPulse, revealNames } from "@/lib/insight/clinic-insight"
import { CLINICIANS } from "@/lib/insight/clinic-seed"
import { visitXps, type VisitSheet } from "@/lib/insight/clinic-xps"
import type { QueryResult, VisualFamily } from "@/lib/insight/types"
import { ChartView } from "./chart-view"

const quiet = "inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-paper px-4 text-sm font-semibold"
const primary = "inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 text-sm font-semibold text-paper"
const field = "min-h-11 rounded-full border border-line bg-paper px-4 font-normal"

function inr(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value)
}

function email() {
  return currentVisitor()?.email ?? ""
}

function maskName(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => `${part.slice(0, 1)}.`).join(" ")
}

function useNames(subject: string) {
  const [shown, setShown] = useState(false)
  const [note, setNote] = useState("")
  async function reveal() {
    const result = await revealNames({ data: { by: email(), subject } })
    if (!result.ok) {
      setNote(result.message)
      return
    }
    setShown(true)
  }
  return { shown, note, reveal, label: (name: string) => (shown ? name : maskName(name)) }
}

const LINKS = [
  { to: "/clinic", label: "Board" },
  { to: "/clinic/patients", label: "Patients" },
  { to: "/clinic/visit", label: "New visit" },
  { to: "/clinic/medicines", label: "Medicines" },
  { to: "/clinic/finance", label: "Finance" },
] as const

export function ClinicFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-5">
      <header className="grid gap-2">
        <p className="text-sm font-semibold text-heat">Jaskirat Mithai Clinic · simulated book</p>
        <h1 className="text-3xl tracking-tight md:text-5xl">{title}</h1>
        <p className="max-w-2xl text-sm text-muted">Diabetes and thyroid practice of Dr. Jaskirat Mithai, Dr. (Mrs.) Yalina Mithai, and Nurse Gaurav Gera. Every name in the 24-month book is made up.</p>
      </header>
      <nav aria-label="Clinic" className="flex gap-2 overflow-x-auto">
        {LINKS.map((link) => (
          <Link key={link.to} to={link.to} className={quiet}>
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}

function revenueChart(months: { month: string; consult: number; drugs: number }[]): QueryResult {
  const rows = months.map((month) => ({ label: month.month, consult: month.consult, drugs: month.drugs }))
  return {
    plan: {
      metrics: ["revenue"],
      dimension: "month",
      series: "channel",
      dateRole: "order_date",
      dateRoleReason: "certified_default",
      comparison: "none",
      range: { start: "2024-11-01", end: "2026-10-16", label: "Nov 2024 – Oct 2026", partial: false },
      priorRange: null,
      sourceStart: "2024-11-01",
      sourceEnd: "2026-10-16",
      rolling: null,
      topN: null,
      filters: [],
      visual: "line",
      visualReason: "Monthly consult fees and medicine sales.",
      notes: [],
      logic: [],
    },
    sql: "",
    params: [],
    planHash: "clinic",
    columns: [],
    rows,
    chart: {
      xKey: "label",
      rows,
      series: [
        { key: "consult", label: "Consult fees", format: "number" },
        { key: "drugs", label: "Medicines", format: "number" },
      ],
      horizontalBars: false,
    },
    summary: "Monthly revenue",
    logic: [],
    notes: [],
    rowCount: rows.length,
  }
}

export function ClinicBoard() {
  const [note, setNote] = useState("Opening the clinic book…")
  const [data, setData] = useState<Awaited<ReturnType<typeof clinicHome>> | null>(null)
  const [pulse, setPulse] = useState<Awaited<ReturnType<typeof clinicPulse>>["pulse"]>(null)
  useEffect(() => {
    void clinicHome({ data: { by: email() } }).then((result) => {
      setData(result)
      setNote(result.ok ? "" : result.message)
    })
    void clinicPulse({ data: { by: email() } }).then((result) => {
      if (result.ok) setPulse(result.pulse)
    })
  }, [])
  const totals = data?.totals
  return (
    <ClinicFrame title="Day book">
      {note ? <p className="text-sm">{note}</p> : null}
      {pulse ? (
        <p className="rounded-[1.25rem] bg-blush p-4 text-sm">
          Week ending {pulse.as_of}: {pulse.this_visits} visits, {inr(pulse.this_fees)} in consult fees, {pulse.this_cancelled} cancelled. The week before: {pulse.last_visits} visits and {inr(pulse.last_fees)}.
        </p>
      ) : null}
      {totals ? (
        <>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Patients", String(totals.patients), "bg-blush"],
              ["Visits", String(totals.visits), "bg-amber"],
              ["Consult fees", inr(totals.consult), "bg-sage"],
              ["Medicine sales", inr(totals.drugs), "bg-teal text-teal-fg"],
            ].map(([label, value, tone]) => (
              <li key={label} className={`rounded-[1.25rem] p-4 ${tone}`}>
                <p className="text-sm font-semibold">{label}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
              </li>
            ))}
          </ul>
          {data?.months?.length ? <ChartView result={revenueChart(data.months)} visual={"line" satisfies VisualFamily} summary="Consult fees and medicine sales by month" /> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-[1.25rem] border border-line p-4">
              <h2 className="text-xl">Conditions seen</h2>
              <ul className="mt-3 grid gap-2 text-sm">
                {data?.conditions.map((row) => (
                  <li key={row.name} className="flex justify-between gap-3">
                    <span className="capitalize">{row.name}</span>
                    <span className="tabular-nums">{row.count}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-[1.25rem] border border-line p-4">
              <h2 className="text-xl">Shelf to reorder</h2>
              <ul className="mt-3 grid gap-2 text-sm">
                {data?.low.length ? data.low.map((row) => (
                  <li key={row.id}>{row.name} {row.strength} · {row.stock} left</li>
                )) : <li>Nothing is at the reorder line.</li>}
              </ul>
            </section>
          </div>
        </>
      ) : null}
    </ClinicFrame>
  )
}

export function PatientBrowser() {
  const [q, setQ] = useState("")
  const [note, setNote] = useState("")
  const [patients, setPatients] = useState<Awaited<ReturnType<typeof searchPatients>>["patients"]>([])
  const [open, setOpen] = useState(false)
  const names = useNames("patient list")
  const [form, setForm] = useState({ name: "", sex: "Female", age: "45", phone: "", city: "Panvel", history: "New registration.", allergies: "None recorded" })
  const navigate = useNavigate()

  function load(query: string) {
    void searchPatients({ data: { by: email(), q: query } }).then((result) => {
      setPatients(result.patients)
      setNote(result.ok ? "" : result.message)
    })
  }

  useEffect(() => {
    load("")
  }, [])

  async function create(event: FormEvent) {
    event.preventDefault()
    const saved = await savePatient({ data: { by: email(), ...form, age: Number(form.age) } })
    if (!saved.ok) {
      setNote(saved.message)
      return
    }
    void navigate({ to: "/clinic/patients/$id", params: { id: saved.id } })
  }

  return (
    <ClinicFrame title="Patients">
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); load(q) }}>
        <label className="sr-only" htmlFor="patient-q">Search</label>
        <input id="patient-q" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Name, phone, city, or history" className={`${field} min-w-0 flex-1`} />
        <button type="submit" className={primary}>Search</button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={quiet} onClick={() => void names.reveal()} disabled={names.shown}>{names.shown ? "Names shown" : "Show names"}</button>
        <p className="text-sm text-muted">Names and phone numbers stay masked until you reveal them. A reveal is written to the audit log.</p>
      </div>
      {names.note ? <p className="text-sm">{names.note}</p> : null}
      {note ? <p className="text-sm">{note}</p> : null}
      <ul className="grid gap-2">
        {patients.map((patient) => (
          <li key={patient.id}>
            <Link to="/clinic/patients/$id" params={{ id: patient.id }} className="grid gap-1 rounded-[1.25rem] border border-line px-4 py-3 hover:border-ink">
              <span className="font-semibold">{names.label(patient.name)}</span>
              <span className="text-sm text-muted">{patient.sex} · {patient.age} years · {patient.city} · {names.shown ? patient.phone : "phone hidden"}</span>
              <span className="text-sm">Allergies: {patient.allergies}</span>
            </Link>
          </li>
        ))}
      </ul>
      <button type="button" className={quiet} onClick={() => setOpen((value) => !value)}>{open ? "Close registration" : "Register a patient"}</button>
      {open ? (
        <form className="grid gap-3 rounded-[1.25rem] bg-canvas p-4 md:grid-cols-2" onSubmit={(event) => void create(event)}>
          <label className="grid gap-1 text-sm font-semibold">Name<input className={field} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-semibold">Sex
            <select className={field} value={form.sex} onChange={(event) => setForm({ ...form, sex: event.target.value })}>
              <option>Female</option>
              <option>Male</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">Age<input className={field} type="number" min={1} max={110} required value={form.age} onChange={(event) => setForm({ ...form, age: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-semibold">Phone<input className={field} required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-semibold">City<input className={field} required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-semibold">Allergies<input className={field} required value={form.allergies} onChange={(event) => setForm({ ...form, allergies: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-semibold md:col-span-2">History<textarea className="min-h-24 rounded-2xl border border-line bg-paper px-4 py-3" value={form.history} onChange={(event) => setForm({ ...form, history: event.target.value })} /></label>
          <button type="submit" className={primary}>Save patient</button>
        </form>
      ) : null}
    </ClinicFrame>
  )
}

export function PatientFile({ id }: { id: string }) {
  const [note, setNote] = useState("Loading the file…")
  const [data, setData] = useState<Awaited<ReturnType<typeof patientRecord>> | null>(null)
  useEffect(() => {
    void patientRecord({ data: { by: email(), id } }).then((result) => {
      setData(result)
      setNote(result.ok ? "" : result.message)
    })
  }, [id])
  const patient = data?.patient
  const names = useNames(id)
  return (
    <ClinicFrame title={patient ? names.label(patient.name) : "Patient"}>
      {note ? <p className="text-sm">{note}</p> : null}
      <button type="button" className={quiet} onClick={() => void names.reveal()} disabled={names.shown}>{names.shown ? "Names shown" : "Show names"}</button>
      {names.note ? <p className="text-sm">{names.note}</p> : null}
      {patient ? (
        <>
          <section className="grid gap-2 rounded-[1.25rem] bg-blush p-4 md:grid-cols-2">
            <p>{patient.sex} · {patient.age} years · {patient.city}</p>
            <p>{names.shown ? patient.phone : "Phone hidden"}</p>
            <p className="md:col-span-2"><span className="font-semibold">History. </span>{patient.history}</p>
            <p className="md:col-span-2"><span className="font-semibold">Allergies. </span>{patient.allergies}</p>
          </section>
          <Link to="/clinic/visit" search={{ patient: patient.id }} className={primary}>New visit for {names.label(patient.name)}</Link>
          <ul className="grid gap-2">
            {data?.visits.map((visit) => (
              <li key={visit.id} className="grid gap-1 rounded-[1.25rem] border border-line px-4 py-3 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <p className="font-semibold">{visit.visit_date} · {visit.diagnosis}</p>
                  <p className="text-sm text-muted">{visit.clinician} · {visit.complaint}</p>
                  <p className="text-sm tabular-nums">Consult {inr(visit.consult_fee)} · Medicines {inr(visit.drug_total)} · Total {inr(visit.consult_fee + visit.drug_total)}</p>
                </div>
                <Link to="/clinic/preview/$id" params={{ id: visit.id }} className={quiet}>Preview</Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </ClinicFrame>
  )
}

export function VisitDesk({ patientId }: { patientId?: string }) {
  const [q, setQ] = useState("")
  const [matches, setMatches] = useState<Awaited<ReturnType<typeof searchPatients>>["patients"]>([])
  const [patient, setPatient] = useState("")
  const [patientName, setPatientName] = useState("")
  const [medicines, setMedicines] = useState<Awaited<ReturnType<typeof listMedicines>>["medicines"]>([])
  const [clinician, setClinician] = useState<(typeof CLINICIANS)[number]>(CLINICIANS[0])
  const [complaint, setComplaint] = useState("")
  const [diagnosis, setDiagnosis] = useState("")
  const [fee, setFee] = useState("700")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<{ medicineId: string; quantity: string }[]>([{ medicineId: "", quantity: "1" }])
  const [note, setNote] = useState("")
  const navigate = useNavigate()

  useEffect(() => {
    void listMedicines({ data: { by: email() } }).then((result) => setMedicines(result.medicines))
    if (!patientId) return
    void patientRecord({ data: { by: email(), id: patientId } }).then((result) => {
      if (result.patient) {
        setPatient(result.patient.id)
        setPatientName(result.patient.name)
      }
    })
  }, [patientId])

  const drugTotal = lines.reduce((sum, line) => {
    const med = medicines.find((item) => item.id === line.medicineId)
    return sum + (med ? med.unit_price * (Number(line.quantity) || 0) : 0)
  }, 0)
  const total = drugTotal + (Number(fee) || 0)

  async function save(event: FormEvent) {
    event.preventDefault()
    const saved = await saveVisit({
      data: {
        by: email(),
        patientId: patient,
        clinician,
        complaint,
        diagnosis,
        consultFee: Number(fee) || 0,
        notes,
        lines: lines.filter((line) => line.medicineId).map((line) => ({ medicineId: line.medicineId, quantity: Number(line.quantity) || 1 })),
      },
    })
    if (!saved.ok) {
      setNote(saved.message)
      return
    }
    void navigate({ to: "/clinic/preview/$id", params: { id: saved.id } })
  }

  return (
    <ClinicFrame title="New visit">
      <form className="grid gap-3" onSubmit={(event) => void save(event)}>
        <div className="grid gap-2">
          <label className="grid gap-1 text-sm font-semibold" htmlFor="find-patient">Find a returning patient</label>
          <div className="flex flex-wrap gap-2">
            <input id="find-patient" value={q} onChange={(event) => setQ(event.target.value)} className={`${field} min-w-0 flex-1`} placeholder="Name or phone" />
            <button type="button" className={quiet} onClick={() => void searchPatients({ data: { by: email(), q } }).then((result) => setMatches(result.patients))}>Search</button>
          </div>
          {patientName ? <p className="text-sm font-semibold">File open: {patientName}</p> : null}
          <ul className="grid gap-1">
            {matches.map((item) => (
              <li key={item.id}>
                <button type="button" className={quiet} onClick={() => { setPatient(item.id); setPatientName(`${item.name} · allergies ${item.allergies}`); setMatches([]) }}>
                  {item.name} · {item.phone}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <label className="grid gap-1 text-sm font-semibold">Clinician
          <select className={field} value={clinician} onChange={(event) => setClinician(event.target.value as (typeof CLINICIANS)[number])}>
            {CLINICIANS.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">Complaint<input className={field} required value={complaint} onChange={(event) => setComplaint(event.target.value)} /></label>
        <label className="grid gap-1 text-sm font-semibold">Diagnosis<input className={field} required value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} /></label>
        <label className="grid gap-1 text-sm font-semibold">Consult fee (₹)<input className={field} type="number" min={0} value={fee} onChange={(event) => setFee(event.target.value)} /></label>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">Medicines</legend>
          {lines.map((line, index) => (
            <div key={index} className="flex flex-wrap gap-2">
              <select className={`${field} min-w-0 flex-1`} value={line.medicineId} onChange={(event) => setLines(lines.map((item, i) => i === index ? { ...item, medicineId: event.target.value } : item))}>
                <option value="">None</option>
                {medicines.map((med) => <option key={med.id} value={med.id}>{med.name} {med.strength} · {inr(med.unit_price)} · {med.stock} left</option>)}
              </select>
              <input className={`${field} w-24`} type="number" min={1} value={line.quantity} onChange={(event) => setLines(lines.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item))} />
            </div>
          ))}
          <button type="button" className={quiet} onClick={() => setLines([...lines, { medicineId: "", quantity: "1" }])}>Add a medicine</button>
        </fieldset>
        <p className="text-lg font-bold tabular-nums">Medicines {inr(drugTotal)} · Visit total {inr(total)}</p>
        <label className="grid gap-1 text-sm font-semibold">Notes<textarea className="min-h-20 rounded-2xl border border-line bg-paper px-4 py-3" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        {note ? <p className="text-sm" role="alert">{note}</p> : null}
        <button type="submit" className={primary} disabled={!patient}>Save visit</button>
      </form>
    </ClinicFrame>
  )
}

export function MedicineShelf() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listMedicines>>["medicines"]>([])
  const [q, setQ] = useState("")
  const [note, setNote] = useState("Loading the shelf…")
  useEffect(() => {
    void listMedicines({ data: { by: email() } }).then((result) => {
      setRows(result.medicines)
      setNote(result.ok ? "" : result.message)
    })
  }, [])
  const shown = rows.filter((row) => `${row.name} ${row.strength}`.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <ClinicFrame title="Medicines">
      <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search the shelf" className={field} />
      {note ? <p className="text-sm">{note}</p> : null}
      <div className="max-w-full overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr>{["Medicine", "Price", "On hand", "Reorder", "Dispensed", "Sales"].map((label) => <th key={label} className="border-b border-line px-3 py-2 text-left">{label}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id} className={row.stock <= row.reorder_at ? "bg-danger-soft" : ""}>
                <td className="border-b border-line px-3 py-2">{row.name} {row.strength}</td>
                <td className="border-b border-line px-3 py-2 tabular-nums">{inr(row.unit_price)}</td>
                <td className="border-b border-line px-3 py-2 tabular-nums">{row.stock}</td>
                <td className="border-b border-line px-3 py-2 tabular-nums">{row.reorder_at}</td>
                <td className="border-b border-line px-3 py-2 tabular-nums">{row.sold}</td>
                <td className="border-b border-line px-3 py-2 tabular-nums">{inr(row.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted">On hand is today’s shelf, after restocking. Dispensed and sales cover the whole 24-month book. A new visit reduces the shelf.</p>
    </ClinicFrame>
  )
}

export function FinanceBoard() {
  const [data, setData] = useState<Awaited<ReturnType<typeof clinicFinance>> | null>(null)
  const [note, setNote] = useState("Adding up the book…")
  useEffect(() => {
    void clinicFinance({ data: { by: email() } }).then((result) => {
      setData(result)
      setNote(result.ok ? "" : result.message)
    })
  }, [])
  const consult = data?.months.reduce((sum, row) => sum + row.consult, 0) ?? 0
  const drugs = data?.months.reduce((sum, row) => sum + row.drugs, 0) ?? 0

  async function download() {
    const result = await clinicLedger({ data: { by: email() } })
    if (!result.ok) {
      setNote(result.message)
      return
    }
    const blob = new Blob([result.csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "jaskirat-mithai-clinic-ledger.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <ClinicFrame title="Finance">
      {note ? <p className="text-sm">{note}</p> : null}
      <ul className="grid grid-cols-2 gap-3">
        <li className="rounded-[1.25rem] bg-sage p-4"><p className="text-sm font-semibold">Consult fees</p><p className="mt-2 text-2xl font-bold tabular-nums">{inr(consult)}</p></li>
        <li className="rounded-[1.25rem] bg-teal p-4 text-teal-fg"><p className="text-sm font-semibold">Medicine sales</p><p className="mt-2 text-2xl font-bold tabular-nums">{inr(drugs)}</p></li>
      </ul>
      {data?.months.length ? <ChartView result={revenueChart(data.months)} visual="line" summary="Monthly consult fees and medicine sales" /> : null}
      <ul className="grid gap-2">
        {data?.clinicians.map((row) => (
          <li key={row.name} className="flex justify-between gap-3 rounded-full bg-canvas px-4 py-3 text-sm">
            <span>{row.name} · {row.visits} visits</span>
            <span className="tabular-nums">{inr(row.consult)}</span>
          </li>
        ))}
      </ul>
      <button type="button" className={primary} onClick={() => void download()}>Export cost records</button>
    </ClinicFrame>
  )
}

export function VisitPreview({ id }: { id: string }) {
  const [sheet, setSheet] = useState<VisitSheet | null>(null)
  const [zoom, setZoom] = useState(1)
  const [note, setNote] = useState("Preparing the preview…")
  const names = useNames(id)
  useEffect(() => {
    void visitSheet({ data: { by: email(), id } }).then((result) => {
      setSheet(result.sheet)
      setNote(result.ok ? "" : result.message)
    })
  }, [id])

  function saveXps() {
    if (!sheet) return
    const blob = visitXps({ ...sheet, patient: names.label(sheet.patient), phone: names.shown ? sheet.phone : "hidden" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${sheet.id}.xps`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <ClinicFrame title="Print preview">
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" className={quiet} onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))}>Zoom out</button>
        <button type="button" className={quiet} onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))}>Zoom in</button>
        <button type="button" className={quiet} onClick={() => window.print()}>Print</button>
        <button type="button" className={primary} onClick={saveXps} disabled={!sheet}>Save XPS</button>
        <button type="button" className={quiet} onClick={() => void names.reveal()} disabled={names.shown}>{names.shown ? "Names shown" : "Show names"}</button>
      </div>
      {note ? <p className="text-sm">{note}</p> : null}
      {sheet ? (
        <article id="visit-sheet" className="origin-top-left rounded-sm bg-white p-8 text-black shadow-shell" style={{ transform: `scale(${zoom})`, width: "42rem" }}>
          <p className="text-sm uppercase tracking-wide">Simulated record</p>
          <h2 className="text-3xl">{sheet.clinic}</h2>
          <p>Diabetes and thyroid</p>
          <p className="mt-4">{sheet.visit_date} · {sheet.id}</p>
          <h3 className="mt-4 text-2xl">{names.label(sheet.patient)}</h3>
          <p>{sheet.sex}, {sheet.age} years · {sheet.city} · {names.shown ? sheet.phone : "phone hidden"}</p>
          <p className="mt-3"><strong>Allergies. </strong>{sheet.allergies}</p>
          <p><strong>History. </strong>{sheet.history}</p>
          <p className="mt-3"><strong>Seen by. </strong>{sheet.clinician}</p>
          <p><strong>Complaint. </strong>{sheet.complaint}</p>
          <p><strong>Diagnosis. </strong>{sheet.diagnosis}</p>
          <p>{sheet.notes}</p>
          <table className="mt-4 w-full text-sm">
            <thead><tr><th className="text-left">Medicine</th><th className="text-right">Qty</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {sheet.lines.map((line) => (
                <tr key={`${line.name}-${line.strength}`}>
                  <td>{line.name} {line.strength}</td>
                  <td className="text-right tabular-nums">{line.quantity}</td>
                  <td className="text-right tabular-nums">{inr(line.quantity * line.unit_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4">Consult fee {inr(sheet.consult_fee)}</p>
          <p>Medicines {inr(sheet.drugs)}</p>
          <p className="text-xl font-bold">Total {inr(sheet.total)}</p>
        </article>
      ) : null}
    </ClinicFrame>
  )
}
