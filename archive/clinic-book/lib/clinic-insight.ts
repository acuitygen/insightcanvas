import { createServerFn } from "@tanstack/react-start"
import type { Tile } from "./table-visual"
import type { VisualFamily } from "./types"

function cleanEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Confirm your email first.")
  return email
}

async function gate(email: string) {
  const { getSql } = await import("@/lib/db")
  const { ensureClinic } = await import("./clinic-seed")
  const sql = await getSql()
  const allowed = await sql<{ email: string }>`select email from allowed_email where email = ${email}`
  if (!allowed.length) return { sql, error: "Confirm an email on the list before opening the clinic book." }
  await ensureClinic(sql)
  return { sql, error: "" }
}

function tile(title: string, visual: VisualFamily, points: { label: string; value: number }[]): Tile {
  return {
    id: crypto.randomUUID(),
    title,
    summary: title,
    source: "Jaskirat Mithai Clinic",
    visual,
    chart: {
      xKey: "label",
      rows: points,
      series: [{ key: "value", label: title, format: "number" }],
      horizontalBars: visual === "bar" && points.length > 4,
    },
    columns: [
      { key: "label", label: "Label", format: "text" },
      { key: "value", label: "Value", format: "number" },
    ],
  }
}

const MONTHS = `select to_char(visit_date, 'YYYY-MM') as label, count(*)::int as value from clinic_visit group by 1 order by 1`
const CLINICIANS = `select clinician as label, sum(consult_fee)::int as value from clinic_visit group by clinician order by value desc`
const CONDITIONS = `select condition as label, count(*)::int as value from clinic_visit group by condition order by value desc`
const MEDICINES = `select m.name as label, coalesce(sum(d.quantity * d.unit_price), 0)::int as value from clinic_medicine m left join clinic_dispense d on d.medicine_id = m.id group by m.name order by value desc`
const WEEKDAYS = `select to_char(visit_date, 'Dy') as label, count(*)::int as value from clinic_visit group by 1, extract(dow from visit_date) order by extract(dow from visit_date)`
const STATUS = `select status as label, count(*)::int as value from clinic_visit group by status order by value desc`

async function points(sql: Awaited<ReturnType<typeof gate>>["sql"], text: string) {
  const rows = await sql.query<{ label: string; value: number }>(text)
  return rows.map((row) => ({ label: String(row.label), value: Number(row.value) }))
}

export const clinicOutline = createServerFn({ method: "POST" })
  .validator((input: { by: string }) => ({ by: cleanEmail(input.by) }))
  .handler(async ({ data }) => {
    const { sql, error } = await gate(data.by)
    if (error) return { ok: false as const, message: error, tiles: [] as Tile[] }
    const [months, clinicians, conditions, medicines, weekdays, status] = await Promise.all([
      points(sql, MONTHS),
      points(sql, CLINICIANS),
      points(sql, CONDITIONS),
      points(sql, MEDICINES),
      points(sql, WEEKDAYS),
      points(sql, STATUS),
    ])
    return {
      ok: true as const,
      message: "",
      tiles: [
        tile("Visits by month", "line", months),
        tile("Consult fees by clinician", "bar", clinicians),
        tile("Kept and cancelled visits", "donut", status),
        tile("Busiest weekdays", "bar", weekdays),
        tile("Conditions seen", "donut", conditions),
        tile("Medicine sales", "bar", medicines),
      ],
    }
  })

export const clinicPulse = createServerFn({ method: "POST" })
  .validator((input: { by: string }) => ({ by: cleanEmail(input.by) }))
  .handler(async ({ data }) => {
    const { sql, error } = await gate(data.by)
    if (error) return { ok: false as const, message: error, pulse: null }
    const rows = await sql<{ as_of: string; this_visits: number; last_visits: number; this_fees: number; last_fees: number; this_cancelled: number }>`
      with b as (select max(visit_date) as as_of from clinic_visit)
      select (select as_of::text from b) as as_of,
        count(*) filter (where visit_date > (select as_of from b) - 7 and visit_date <= (select as_of from b))::int as this_visits,
        count(*) filter (where visit_date > (select as_of from b) - 14 and visit_date <= (select as_of from b) - 7)::int as last_visits,
        coalesce(sum(consult_fee) filter (where visit_date > (select as_of from b) - 7 and visit_date <= (select as_of from b)), 0)::int as this_fees,
        coalesce(sum(consult_fee) filter (where visit_date > (select as_of from b) - 14 and visit_date <= (select as_of from b) - 7), 0)::int as last_fees,
        count(*) filter (where status = 'cancelled' and visit_date > (select as_of from b) - 7 and visit_date <= (select as_of from b))::int as this_cancelled
      from clinic_visit
    `
    return { ok: true as const, message: "", pulse: rows[0] ?? null }
  })

export const askClinic = createServerFn({ method: "POST" })
  .validator((input: { by: string; question: string }) => ({
    by: cleanEmail(input.by),
    question: String(input.question ?? "").trim().slice(0, 300),
  }))
  .handler(async ({ data }) => {
    const q = data.question.toLowerCase()
    const clinicish = /patient|clinic|practitioner|clinician|doctor|nurse|thyroid|diabetes|medicine|appointment|consult|cancel|no-show|noshow|mithai|shelf|weekday/
    const retail = /region|channel|fiscal|outdoor|category|product/
    const empty = { matched: false as const, title: "", sql: "", visual: "bar" as VisualFamily, points: [] as { label: string; value: number }[] }
    if (!clinicish.test(q) || (retail.test(q) && !clinicish.test(q))) return empty
    const { sql, error } = await gate(data.by)
    if (error) return { ...empty, matched: false }
    let text = MONTHS
    let title = "Visits by month"
    let visual: VisualFamily = "line"
    if (/cancel|no-show|noshow/.test(q)) {
      text = STATUS
      title = "Kept and cancelled visits"
      visual = "donut"
    } else if (/weekday|busiest|peak|hour/.test(q)) {
      text = WEEKDAYS
      title = "Busiest weekdays"
      visual = "bar"
    } else if (/practitioner|clinician|doctor|nurse|brought in|revenue/.test(q)) {
      text = CLINICIANS
      title = "Consult fees by clinician"
      visual = "bar"
    } else if (/medicine|drug|shelf/.test(q)) {
      text = MEDICINES
      title = "Medicine sales"
      visual = "bar"
    } else if (/condition|thyroid|diabetes/.test(q)) {
      text = CONDITIONS
      title = "Conditions seen"
      visual = "donut"
    }
    return { matched: true as const, title, sql: text, visual, points: await points(sql, text) }
  })

export const revealNames = createServerFn({ method: "POST" })
  .validator((input: { by: string; subject: string }) => ({
    by: cleanEmail(input.by),
    subject: String(input.subject ?? "patient names").trim().slice(0, 120) || "patient names",
  }))
  .handler(async ({ data }) => {
    const { sql, error } = await gate(data.by)
    if (error) return { ok: false as const, message: error }
    await sql`
      insert into clinic_access (id, email, action, subject)
      values (${crypto.randomUUID()}, ${data.by}, 'reveal-names', ${data.subject})
    `
    return { ok: true as const, message: "" }
  })

export const listReveals = createServerFn({ method: "POST" })
  .validator((input: { by: string }) => ({ by: cleanEmail(input.by) }))
  .handler(async ({ data }) => {
    const { sql, error } = await gate(data.by)
    if (error) return { ok: false as const, message: error, rows: [] }
    const rows = await sql<{ email: string; action: string; subject: string; at: string }>`
      select email, action, subject, at::text as at from clinic_access order by at desc limit 12
    `
    return { ok: true as const, message: "", rows }
  })
