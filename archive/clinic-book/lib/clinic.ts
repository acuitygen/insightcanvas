import { createServerFn } from "@tanstack/react-start"
import { CLINICIANS, CLINIC_NAME } from "./clinic-seed"

function cleanEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Confirm your email first.")
  return email
}

function cleanText(value: unknown, label: string, max = 240) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ")
  if (!text || text.length > max) throw new Error(`Enter a ${label}.`)
  return text
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

export const clinicHome = createServerFn({ method: "POST" })
  .validator((input: { by: string }) => ({ by: cleanEmail(input.by) }))
  .handler(async ({ data }) => {
    const { sql, error } = await gate(data.by)
    if (error) return { ok: false as const, message: error, clinic: CLINIC_NAME, clinicians: [...CLINICIANS], totals: null, months: [], conditions: [], low: [] }
    const totals = await sql<{ patients: number; visits: number; consult: number; drugs: number }>`
      select
        (select count(*)::int from clinic_patient) as patients,
        (select count(*)::int from clinic_visit) as visits,
        (select coalesce(sum(consult_fee), 0)::int from clinic_visit) as consult,
        (select coalesce(sum(quantity * unit_price), 0)::int from clinic_dispense) as drugs
    `
    const months = await sql<{ month: string; visits: number; consult: number; drugs: number }>`
      select to_char(v.visit_date, 'YYYY-MM') as month,
        count(*)::int as visits,
        coalesce(sum(v.consult_fee), 0)::int as consult,
        coalesce(sum(d.amount), 0)::int as drugs
      from clinic_visit v
      left join (
        select visit_id, sum(quantity * unit_price)::int as amount from clinic_dispense group by visit_id
      ) d on d.visit_id = v.id
      group by 1
      order by 1
    `
    const conditions = await sql<{ name: string; count: number }>`
      select condition as name, count(*)::int as count from clinic_visit group by condition order by count desc
    `
    const low = await sql<{ id: string; name: string; strength: string; stock: number; reorder_at: number }>`
      select id, name, strength, stock, reorder_at from clinic_medicine where stock <= reorder_at order by stock
    `
    return { ok: true as const, message: "", clinic: CLINIC_NAME, clinicians: [...CLINICIANS], totals: totals[0] ?? null, months, conditions, low }
  })

export const searchPatients = createServerFn({ method: "POST" })
  .validator((input: { by: string; q: string }) => ({ by: cleanEmail(input.by), q: String(input.q ?? "").trim().slice(0, 80) }))
  .handler(async ({ data }) => {
    const { sql, error } = await gate(data.by)
    if (error) return { ok: false as const, message: error, patients: [] }
    const like = `%${data.q.replace(/[%_]/g, "")}%`
    const patients = data.q
      ? await sql<{ id: string; name: string; sex: string; age: number; phone: string; city: string; allergies: string }>`
          select id, name, sex, age, phone, city, allergies from clinic_patient
          where name ilike ${like} or phone ilike ${like} or city ilike ${like} or history ilike ${like}
          order by name limit 40
        `
      : await sql<{ id: string; name: string; sex: string; age: number; phone: string; city: string; allergies: string }>`
          select id, name, sex, age, phone, city, allergies from clinic_patient order by name limit 40
        `
    return { ok: true as const, message: "", patients }
  })

export const patientRecord = createServerFn({ method: "POST" })
  .validator((input: { by: string; id: string }) => ({ by: cleanEmail(input.by), id: cleanText(input.id, "patient", 20) }))
  .handler(async ({ data }) => {
    const { sql, error } = await gate(data.by)
    if (error) return { ok: false as const, message: error, patient: null, visits: [] }
    const rows = await sql<{ id: string; name: string; sex: string; age: number; phone: string; city: string; history: string; allergies: string; created_on: string }>`
      select id, name, sex, age, phone, city, history, allergies, created_on::text as created_on from clinic_patient where id = ${data.id}
    `
    const visits = await sql<{ id: string; visit_date: string; clinician: string; complaint: string; diagnosis: string; consult_fee: number; drug_total: number }>`
      select v.id, v.visit_date::text as visit_date, v.clinician, v.complaint, v.diagnosis, v.consult_fee,
        coalesce(sum(d.quantity * d.unit_price), 0)::int as drug_total
      from clinic_visit v
      left join clinic_dispense d on d.visit_id = v.id
      where v.patient_id = ${data.id}
      group by v.id
      order by v.visit_date desc
    `
    return { ok: true as const, message: "", patient: rows[0] ?? null, visits }
  })

export const listMedicines = createServerFn({ method: "POST" })
  .validator((input: { by: string }) => ({ by: cleanEmail(input.by) }))
  .handler(async ({ data }) => {
    const { sql, error } = await gate(data.by)
    if (error) return { ok: false as const, message: error, medicines: [] }
    const medicines = await sql<{ id: string; name: string; strength: string; unit_price: number; stock: number; reorder_at: number; sold: number; revenue: number }>`
      select m.id, m.name, m.strength, m.unit_price, m.stock, m.reorder_at,
        coalesce(sum(d.quantity), 0)::int as sold,
        coalesce(sum(d.quantity * d.unit_price), 0)::int as revenue
      from clinic_medicine m
      left join clinic_dispense d on d.medicine_id = m.id
      group by m.id
      order by m.name, m.strength
    `
    return { ok: true as const, message: "", medicines }
  })

export const clinicFinance = createServerFn({ method: "POST" })
  .validator((input: { by: string }) => ({ by: cleanEmail(input.by) }))
  .handler(async ({ data }) => {
    const { sql, error } = await gate(data.by)
    if (error) return { ok: false as const, message: error, months: [], clinicians: [] }
    const months = await sql<{ month: string; visits: number; consult: number; drugs: number }>`
      select to_char(v.visit_date, 'YYYY-MM') as month,
        count(*)::int as visits,
        coalesce(sum(v.consult_fee), 0)::int as consult,
        coalesce(sum(d.amount), 0)::int as drugs
      from clinic_visit v
      left join (
        select visit_id, sum(quantity * unit_price)::int as amount from clinic_dispense group by visit_id
      ) d on d.visit_id = v.id
      group by 1
      order by 1
    `
    const clinicians = await sql<{ name: string; visits: number; consult: number }>`
      select clinician as name, count(*)::int as visits, coalesce(sum(consult_fee), 0)::int as consult
      from clinic_visit group by clinician order by consult desc
    `
    return { ok: true as const, message: "", months, clinicians }
  })

export const clinicLedger = createServerFn({ method: "POST" })
  .validator((input: { by: string }) => ({ by: cleanEmail(input.by) }))
  .handler(async ({ data }) => {
    const { sql, error } = await gate(data.by)
    if (error) return { ok: false as const, message: error, csv: "" }
    const rows = await sql<{ visit_date: string; patient: string; clinician: string; diagnosis: string; consult_fee: number; drug_total: number }>`
      select v.visit_date::text as visit_date, p.name as patient, v.clinician, v.diagnosis, v.consult_fee,
        coalesce(sum(d.quantity * d.unit_price), 0)::int as drug_total
      from clinic_visit v
      join clinic_patient p on p.id = v.patient_id
      left join clinic_dispense d on d.visit_id = v.id
      group by v.id, p.name
      order by v.visit_date, p.name
    `
    const lines = ["date,patient,clinician,diagnosis,consult_fee,drug_total,visit_total"]
    for (const row of rows) {
      const cells = [row.visit_date, row.patient, row.clinician, row.diagnosis, String(row.consult_fee), String(row.drug_total), String(row.consult_fee + row.drug_total)]
      lines.push(cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    }
    return { ok: true as const, message: "", csv: lines.join("\n") }
  })

export const savePatient = createServerFn({ method: "POST" })
  .validator((input: { by: string; name: string; sex: string; age: number; phone: string; city: string; history: string; allergies: string }) => ({
    by: cleanEmail(input.by),
    name: cleanText(input.name, "name", 80),
    sex: input.sex === "Male" ? "Male" : "Female",
    age: Math.min(110, Math.max(1, Math.round(Number(input.age) || 0))),
    phone: cleanText(input.phone, "phone", 20),
    city: cleanText(input.city, "city", 40),
    history: cleanText(input.history, "history", 400),
    allergies: cleanText(input.allergies, "allergies", 120),
  }))
  .handler(async ({ data }) => {
    const { sql, error } = await gate(data.by)
    if (error) return { ok: false as const, message: error, id: "" }
    const id = `p${crypto.randomUUID().slice(0, 8)}`
    await sql`
      insert into clinic_patient (id, name, sex, age, phone, city, history, allergies, created_on)
      values (${id}, ${data.name}, ${data.sex}, ${data.age}, ${data.phone}, ${data.city}, ${data.history}, ${data.allergies}, current_date)
    `
    return { ok: true as const, message: "", id }
  })

export const saveVisit = createServerFn({ method: "POST" })
  .validator((input: { by: string; patientId: string; clinician: string; complaint: string; diagnosis: string; consultFee: number; notes: string; lines: { medicineId: string; quantity: number }[] }) => ({
    by: cleanEmail(input.by),
    patientId: cleanText(input.patientId, "patient", 20),
    clinician: CLINICIANS.includes(input.clinician as (typeof CLINICIANS)[number]) ? input.clinician : CLINICIANS[0],
    complaint: cleanText(input.complaint, "complaint", 200),
    diagnosis: cleanText(input.diagnosis, "diagnosis", 200),
    consultFee: Math.min(20000, Math.max(0, Math.round(Number(input.consultFee) || 0))),
    notes: String(input.notes ?? "").trim().slice(0, 400) || "Recorded in the clinic book.",
    lines: (input.lines ?? []).slice(0, 8).map((line) => ({ medicineId: String(line.medicineId ?? ""), quantity: Math.min(20, Math.max(1, Math.round(Number(line.quantity) || 1))) })),
  }))
  .handler(async ({ data }) => {
    const { sql, error } = await gate(data.by)
    if (error) return { ok: false as const, message: error, id: "" }
    const patient = await sql<{ id: string }>`select id from clinic_patient where id = ${data.patientId}`
    if (!patient.length) return { ok: false as const, message: "That patient is not in the book.", id: "" }
    const meds = data.lines.filter((line) => line.medicineId)
    for (const line of meds) {
      const stock = await sql<{ stock: number; name: string }>`select stock, name from clinic_medicine where id = ${line.medicineId}`
      if (!stock.length) return { ok: false as const, message: "Choose a medicine from the shelf.", id: "" }
      if (stock[0].stock < line.quantity) return { ok: false as const, message: `${stock[0].name} has only ${stock[0].stock} on the shelf.`, id: "" }
    }
    const id = `v${crypto.randomUUID().slice(0, 8)}`
    const condition = /thyroid|levo|carbimazole/i.test(data.diagnosis) && /diabet|sugar|metformin/i.test(data.diagnosis) ? "both" : /thyroid|levo|carbimazole/i.test(data.diagnosis) ? "thyroid" : "diabetes"
    await sql`
      insert into clinic_visit (id, patient_id, visit_date, clinician, complaint, diagnosis, condition, consult_fee, notes)
      values (${id}, ${data.patientId}, current_date, ${data.clinician}, ${data.complaint}, ${data.diagnosis}, ${condition}, ${data.consultFee}, ${data.notes})
    `
    let n = 1
    for (const line of meds) {
      const price = await sql<{ unit_price: number }>`select unit_price from clinic_medicine where id = ${line.medicineId}`
      await sql`
        insert into clinic_dispense (id, visit_id, medicine_id, quantity, unit_price)
        values (${`${id}-${n}`}, ${id}, ${line.medicineId}, ${line.quantity}, ${price[0].unit_price})
      `
      await sql`update clinic_medicine set stock = stock - ${line.quantity} where id = ${line.medicineId}`
      n += 1
    }
    return { ok: true as const, message: "", id }
  })

export const visitSheet = createServerFn({ method: "POST" })
  .validator((input: { by: string; id: string }) => ({ by: cleanEmail(input.by), id: cleanText(input.id, "visit", 20) }))
  .handler(async ({ data }) => {
    const { sql, error } = await gate(data.by)
    if (error) return { ok: false as const, message: error, sheet: null }
    const rows = await sql<{
      id: string
      visit_date: string
      clinician: string
      complaint: string
      diagnosis: string
      consult_fee: number
      notes: string
      patient: string
      age: number
      sex: string
      allergies: string
      history: string
      phone: string
      city: string
    }>`
      select v.id, v.visit_date::text as visit_date, v.clinician, v.complaint, v.diagnosis, v.consult_fee, v.notes,
        p.name as patient, p.age, p.sex, p.allergies, p.history, p.phone, p.city
      from clinic_visit v join clinic_patient p on p.id = v.patient_id
      where v.id = ${data.id}
    `
    if (!rows[0]) return { ok: false as const, message: "That visit is not in the book.", sheet: null }
    const lines = await sql<{ name: string; strength: string; quantity: number; unit_price: number }>`
      select m.name, m.strength, d.quantity, d.unit_price
      from clinic_dispense d join clinic_medicine m on m.id = d.medicine_id
      where d.visit_id = ${data.id}
    `
    const drugs = lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0)
    return { ok: true as const, message: "", sheet: { ...rows[0], lines, drugs, total: rows[0].consult_fee + drugs, clinic: CLINIC_NAME } }
  })
