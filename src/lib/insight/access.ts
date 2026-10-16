import { createServerFn } from "@tanstack/react-start"

export type AllowedPerson = { email: string; firstName: string | null; lastName: string | null }

function cleanEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
    throw new Error("Enter a valid email address.")
  }
  return email
}

function cleanName(value: unknown, label: string) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ")
  if (name.length < 1 || name.length > 80) throw new Error(`Enter a ${label}.`)
  return name
}

async function sql() {
  const { getSql } = await import("@/lib/db")
  return getSql()
}

export const accessCount = createServerFn({ method: "GET" }).handler(async () => {
  const db = await sql()
  const rows = await db<{ count: number }>`select count(*)::int as count from allowed_email`
  return { count: rows[0]?.count ?? 0 }
})

export const listAllowed = createServerFn({ method: "GET" }).handler(async () => {
  const db = await sql()
  const rows = await db<{ email: string; first_name: string | null; last_name: string | null }>`
    select a.email, v.first_name, v.last_name
    from allowed_email a
    left join visitor_name v on v.email = a.email
    order by a.created_at
  `
  return rows.map((row) => ({ email: row.email, firstName: row.first_name, lastName: row.last_name })) satisfies AllowedPerson[]
})

export const confirmEmail = createServerFn({ method: "POST" })
  .validator((input: { email: string }) => ({ email: cleanEmail(input.email) }))
  .handler(async ({ data }) => {
    const db = await sql()
    const rows = await db<{ email: string }>`select email from allowed_email where email = ${data.email}`
    return { allowed: rows.length > 0, email: data.email }
  })

export const addAllowed = createServerFn({ method: "POST" })
  .validator((input: { email: string; by?: string }) => ({
    email: cleanEmail(input.email),
    by: input.by ? cleanEmail(input.by) : "",
  }))
  .handler(async ({ data }) => {
    const db = await sql()
    const existing = await db<{ count: number }>`select count(*)::int as count from allowed_email`
    const count = existing[0]?.count ?? 0
    if (count > 0) {
      const sponsor = await db<{ email: string }>`select email from allowed_email where email = ${data.by}`
      if (sponsor.length === 0) throw new Error("Only someone already on the list can add another email.")
    }
    await db`insert into allowed_email (email) values (${data.email}) on conflict (email) do nothing`
    return { email: data.email }
  })

export const removeAllowed = createServerFn({ method: "POST" })
  .validator((input: { email: string; by: string }) => ({
    email: cleanEmail(input.email),
    by: cleanEmail(input.by),
  }))
  .handler(async ({ data }) => {
    const db = await sql()
    const sponsor = await db<{ email: string }>`select email from allowed_email where email = ${data.by}`
    if (sponsor.length === 0) throw new Error("Only someone on the list can change it.")
    await db`delete from visitor_name where email = ${data.email}`
    await db`delete from allowed_email where email = ${data.email}`
    return { email: data.email }
  })

export const saveName = createServerFn({ method: "POST" })
  .validator((input: { email: string; firstName: string; lastName: string }) => ({
    email: cleanEmail(input.email),
    firstName: cleanName(input.firstName, "first name"),
    lastName: cleanName(input.lastName, "last name"),
  }))
  .handler(async ({ data }) => {
    const db = await sql()
    const rows = await db<{ email: string }>`select email from allowed_email where email = ${data.email}`
    if (rows.length === 0) throw new Error("That email is not on the list for this link.")
    await db`
      insert into visitor_name (email, first_name, last_name)
      values (${data.email}, ${data.firstName}, ${data.lastName})
      on conflict (email) do update
      set first_name = excluded.first_name, last_name = excluded.last_name, updated_at = now()
    `
    return { email: data.email, firstName: data.firstName, lastName: data.lastName }
  })
