import type { Sql } from "@/lib/db"

export const CLINIC_NAME = "Jaskirat Mithai Clinic"
export const CLINICIANS = ["Dr. Jaskirat Mithai", "Dr. (Mrs.) Yalina Mithai", "Nurse Gaurav Gera"] as const
const SEED_KEY = "mithai-24m-v1"

const FIRST = ["Aarti", "Aman", "Amrita", "Ananya", "Anil", "Anju", "Arjun", "Bhavna", "Chitra", "Deepak", "Divya", "Ekta", "Garima", "Harleen", "Harpreet", "Inderjit", "Ishaan", "Jatin", "Jyoti", "Kavita", "Kiran", "Kuldeep", "Lakshmi", "Manoj", "Meera", "Mohit", "Neelam", "Neha", "Omkar", "Pooja", "Pradeep", "Priya", "Rahul", "Rajni", "Rakesh", "Renu", "Rohit", "Sangeeta", "Sanjay", "Seema", "Shreya", "Simran", "Sneha", "Suresh", "Tanvi", "Tarun", "Uma", "Varun", "Vikram", "Vinita"]
const LAST = ["Bansal", "Bhatt", "Chadha", "Chopra", "Das", "Deshmukh", "Gill", "Iyer", "Joshi", "Kulkarni", "Malhotra", "Mehra", "Nair", "Patil", "Rao", "Reddy", "Sethi", "Sharma", "Singh", "Trivedi", "Verma", "Yadav", "Kaur", "Pawar", "More", "Naik"]
const CITIES = ["Panvel", "Kharghar", "Kamothe", "Kalamboli", "New Panvel", "Vashi", "Taloja", "Ulwe"]
const ALLERGIES = ["None recorded", "None recorded", "None recorded", "None recorded", "Penicillin", "Sulfa drugs", "Aspirin", "Iodine contrast"]

type Med = { id: string; name: string; strength: string; unitPrice: number; stock: number; reorderAt: number; for: "diabetes" | "thyroid" | "both" }

const MEDS: Med[] = [
  { id: "met500", name: "Metformin", strength: "500 mg", unitPrice: 25, stock: 240, reorderAt: 40, for: "diabetes" },
  { id: "met1000", name: "Metformin SR", strength: "1000 mg", unitPrice: 48, stock: 120, reorderAt: 30, for: "diabetes" },
  { id: "gli1", name: "Glimepiride", strength: "1 mg", unitPrice: 40, stock: 90, reorderAt: 24, for: "diabetes" },
  { id: "gli2", name: "Glimepiride", strength: "2 mg", unitPrice: 55, stock: 18, reorderAt: 20, for: "diabetes" },
  { id: "sita", name: "Sitagliptin", strength: "50 mg", unitPrice: 180, stock: 70, reorderAt: 16, for: "diabetes" },
  { id: "empa", name: "Empagliflozin", strength: "10 mg", unitPrice: 220, stock: 46, reorderAt: 12, for: "diabetes" },
  { id: "glargine", name: "Insulin glargine pen", strength: "100 IU/ml", unitPrice: 650, stock: 22, reorderAt: 6, for: "diabetes" },
  { id: "levo25", name: "Levothyroxine", strength: "25 mcg", unitPrice: 40, stock: 80, reorderAt: 20, for: "thyroid" },
  { id: "levo50", name: "Levothyroxine", strength: "50 mcg", unitPrice: 55, stock: 110, reorderAt: 24, for: "thyroid" },
  { id: "levo75", name: "Levothyroxine", strength: "75 mcg", unitPrice: 62, stock: 14, reorderAt: 18, for: "thyroid" },
  { id: "levo100", name: "Levothyroxine", strength: "100 mcg", unitPrice: 70, stock: 64, reorderAt: 16, for: "thyroid" },
  { id: "carbi5", name: "Carbimazole", strength: "5 mg", unitPrice: 45, stock: 36, reorderAt: 10, for: "thyroid" },
  { id: "carbi10", name: "Carbimazole", strength: "10 mg", unitPrice: 70, stock: 28, reorderAt: 8, for: "thyroid" },
  { id: "vitd", name: "Vitamin D3", strength: "60000 IU", unitPrice: 30, stock: 150, reorderAt: 30, for: "both" },
  { id: "atorva", name: "Atorvastatin", strength: "10 mg", unitPrice: 35, stock: 88, reorderAt: 20, for: "both" },
]

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rand: () => number, list: T[]) {
  return list[Math.floor(rand() * list.length)]
}

function weekdays(start: string, end: string) {
  const days: string[] = []
  const cursor = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (cursor <= last) {
    if (cursor.getUTCDay() !== 0) days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

async function insertChunk(sql: Sql, table: string, columns: string[], rows: unknown[][]) {
  const width = columns.length
  for (let offset = 0; offset < rows.length; offset += 120) {
    const slice = rows.slice(offset, offset + 120)
    const params: unknown[] = []
    const values = slice
      .map((row) => {
        const marks = row.map((value) => {
          params.push(value)
          return `$${params.length}`
        })
        if (marks.length !== width) throw new Error(`Bad ${table} row`)
        return `(${marks.join(",")})`
      })
      .join(",")
    await sql.query(`insert into ${table} (${columns.join(",")}) values ${values}`, params)
  }
}

export async function ensureClinic(sql: Sql) {
  const existing = await sql<{ value: string }>`select value from clinic_meta where key = 'seed'`
  if (existing[0]?.value === SEED_KEY) {
    await markCancellations(sql)
    return { seeded: false }
  }

  await sql.query("delete from clinic_dispense")
  await sql.query("delete from clinic_visit")
  await sql.query("delete from clinic_patient")
  await sql.query("delete from clinic_medicine")

  const rand = rng(20241101)
  const patients = FIRST.flatMap((first, i) =>
    LAST.slice(0, 8).map((last, j) => {
      const n = i * 8 + j
      const condition = n % 5 === 0 ? "both" : n % 2 === 0 ? "diabetes" : "thyroid"
      const sex = n % 3 === 0 ? "Female" : n % 3 === 1 ? "Male" : "Female"
      const age = condition === "thyroid" && sex === "Female" && n % 11 === 0 ? 24 + (n % 10) : 34 + (n % 42)
      const history =
        condition === "both"
          ? "Type 2 diabetes and hypothyroidism. Family history of diabetes."
          : condition === "diabetes"
            ? age < 40
              ? "Prediabetes. Weight gain over two years. No known heart disease."
              : "Type 2 diabetes. Checking sugars at home."
            : "Hypothyroidism on follow-up. No neck swelling reported at registration."
      return {
        id: `p${String(n + 1).padStart(4, "0")}`,
        name: `${first} ${last}`,
        sex,
        age,
        phone: `98${String(10000000 + ((n * 7919) % 90000000)).slice(0, 8)}`,
        city: CITIES[n % CITIES.length],
        history,
        allergies: ALLERGIES[n % ALLERGIES.length],
        createdOn: "2024-11-01",
        condition,
      }
    }),
  ).slice(0, 360)

  await insertChunk(
    sql,
    "clinic_patient",
    ["id", "name", "sex", "age", "phone", "city", "history", "allergies", "created_on"],
    patients.map((patient) => [patient.id, patient.name, patient.sex, patient.age, patient.phone, patient.city, patient.history, patient.allergies, patient.createdOn]),
  )
  await insertChunk(
    sql,
    "clinic_medicine",
    ["id", "name", "strength", "unit_price", "stock", "reorder_at"],
    MEDS.map((med) => [med.id, med.name, med.strength, med.unitPrice, med.stock, med.reorderAt]),
  )

  const days = weekdays("2024-11-01", "2026-10-16")
  const visits: unknown[][] = []
  const dispenses: unknown[][] = []
  let visitNo = 1
  let lineNo = 1
  for (const day of days) {
    const slots = 3 + Math.floor(rand() * 3)
    for (let slot = 0; slot < slots; slot += 1) {
      const patient = patients[Math.floor(rand() * patients.length)]
      const clinician = slot === 0 && rand() < 0.22 ? CLINICIANS[2] : rand() < 0.5 ? CLINICIANS[0] : CLINICIANS[1]
      const nurse = clinician === CLINICIANS[2]
      const condition = patient.condition
      const complaint =
        condition === "thyroid"
          ? pick(rand, ["Fatigue and feeling cold", "Weight change", "Palpitations", "Follow-up blood test", "Hair fall and dry skin"])
          : condition === "both"
            ? pick(rand, ["Sugar and thyroid follow-up", "Tingling in the feet", "Medicine refill", "Fasting sugar high this week"])
            : pick(rand, ["Fasting sugar high", "Routine diabetes review", "Increased thirst", "Foot check", "Medicine not suiting"])
      const diagnosis =
        condition === "thyroid"
          ? pick(rand, ["Hypothyroidism, stable", "Hypothyroidism, dose review", "Hyperthyroidism, on carbimazole", "Thyroid follow-up, no new swelling"])
          : condition === "both"
            ? "Type 2 diabetes with hypothyroidism"
            : pick(rand, ["Type 2 diabetes, review", "Type 2 diabetes, sugars above target", "Prediabetes counselling", "Type 2 diabetes with neuropathy symptoms"])
      const fee = nurse ? 250 : rand() < 0.25 ? 900 : 700
      const id = `v${String(visitNo).padStart(5, "0")}`
      visits.push([id, patient.id, day, clinician, complaint, diagnosis, condition, fee, nurse ? "Nurse review and medicine counselling." : "Doctor review. Advised home sugar or thyroid test as due."])
      const pool = MEDS.filter((med) => med.for === "both" || med.for === condition || condition === "both")
      const count = nurse ? 1 : 1 + Math.floor(rand() * 2)
      const chosen = new Set<string>()
      for (let n = 0; n < count; n += 1) {
        const med = pick(rand, pool)
        if (chosen.has(med.id)) continue
        chosen.add(med.id)
        const qty = med.id === "glargine" ? 1 : 1 + Math.floor(rand() * 2)
        dispenses.push([`d${String(lineNo).padStart(6, "0")}`, id, med.id, qty, med.unitPrice])
        lineNo += 1
      }
      visitNo += 1
    }
  }

  await insertChunk(sql, "clinic_visit", ["id", "patient_id", "visit_date", "clinician", "complaint", "diagnosis", "condition", "consult_fee", "notes"], visits)
  await insertChunk(sql, "clinic_dispense", ["id", "visit_id", "medicine_id", "quantity", "unit_price"], dispenses)
  await sql.query("insert into clinic_meta (key, value) values ('seed', $1)", [SEED_KEY])
  await markCancellations(sql)
  return { seeded: true, patients: patients.length, visits: visits.length }
}

async function markCancellations(sql: Sql) {
  const flagged = await sql<{ value: string }>`select value from clinic_meta where key = 'status-v1'`
  if (flagged.length) return
  await sql.query("update clinic_visit set status = 'cancelled' where right(id, 1) = '7'")
  await sql.query("insert into clinic_meta (key, value) values ('status-v1', '1')")
}
