import { createServerFn } from "@tanstack/react-start"

/**
 * Who may open InsightCanvas. Identity always comes from the server session
 * (emailed one-time code), never from an email the browser sends.
 */
export type AllowedPerson = { email: string; firstName: string | null; lastName: string | null; isAdmin: boolean }
export type Me = { email: string; isAdmin: boolean; firstName: string | null; lastName: string | null }

function cleanName(value: unknown, label: string) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ")
  if (name.length < 1 || name.length > 80) throw new Error(`Enter a ${label}.`)
  return name
}

async function sql() {
  const { getSql } = await import("@/lib/db")
  return getSql()
}

async function session() {
  return import("./auth/session.server")
}

/** Public: only whether first-time setup is still needed. Reveals no addresses. */
export const accessCount = createServerFn({ method: "GET" }).handler(async () => {
  const db = await sql()
  const rows = await db<{ count: number }>`select count(*)::int as count from allowed_email`
  return { needsSetup: (rows[0]?.count ?? 0) === 0 }
})

/**
 * First-run only: while the list is empty, add the first admin. If
 * INSIGHT_BOOTSTRAP_EMAIL is set, only that address can claim it.
 */
export const claimFirstAdmin = createServerFn({ method: "POST" })
  .validator((input: { email: string }) => input)
  .handler(async ({ data }) => {
    const { normalizeEmail } = await import("./auth/core")
    const email = normalizeEmail(data.email)
    const required = process.env.INSIGHT_BOOTSTRAP_EMAIL?.trim().toLowerCase()
    if (required && required !== email) throw new Error("Setup is limited to the configured admin address.")
    const db = await sql()
    const inserted = await db<{ email: string }>`
      insert into allowed_email (email, is_admin)
      select ${email}, true
      where not exists (select 1 from allowed_email)
      returning email`
    if (!inserted.length) throw new Error("Setup is already done. Ask an admin to add you.")
    return { email }
  })

export const requestLoginCode = createServerFn({ method: "POST" })
  .validator((input: { email: string }) => input)
  .handler(async ({ data }) => {
    const s = await session()
    const { requestCode } = await import("./auth/core")
    return requestCode(await s.authDeps(), data.email, s.clientIp())
  })

export const verifyLoginCode = createServerFn({ method: "POST" })
  .validator((input: { email: string; code: string }) => input)
  .handler(async ({ data }) => {
    const s = await session()
    const { verifyCode } = await import("./auth/core")
    const result = await verifyCode(await s.authDeps(), data.email, data.code, s.clientIp())
    if (!result.ok) return { ok: false as const, message: result.message }
    s.setSessionCookie(result.token)
    const me = await s.currentUserForToken(result.token)
    return { ok: true as const, me }
  })

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const s = await session()
  await s.signOutCurrent()
  return { ok: true }
})

export const getMe = createServerFn({ method: "GET" }).handler(async (): Promise<Me | null> => {
  const s = await session()
  return s.currentUser()
})

export const listAllowed = createServerFn({ method: "GET" }).handler(async () => {
  const s = await session()
  await s.requireUser()
  const db = await sql()
  const rows = await db<{ email: string; first_name: string | null; last_name: string | null; is_admin: boolean }>`
    select a.email, v.first_name, v.last_name, a.is_admin
    from allowed_email a
    left join visitor_name v on v.email = a.email
    order by a.created_at
  `
  return rows.map((row) => ({
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    isAdmin: Boolean(row.is_admin),
  })) satisfies AllowedPerson[]
})

export const addAllowed = createServerFn({ method: "POST" })
  .validator((input: { email: string; isAdmin?: boolean }) => input)
  .handler(async ({ data }) => {
    const s = await session()
    await s.requireAdmin()
    const { normalizeEmail } = await import("./auth/core")
    const email = normalizeEmail(data.email)
    const db = await sql()
    await db`insert into allowed_email (email, is_admin) values (${email}, ${Boolean(data.isAdmin)}) on conflict (email) do nothing`
    return { email }
  })

export const removeAllowed = createServerFn({ method: "POST" })
  .validator((input: { email: string }) => input)
  .handler(async ({ data }) => {
    const s = await session()
    const me = await s.requireAdmin()
    const { normalizeEmail } = await import("./auth/core")
    const email = normalizeEmail(data.email)
    if (email === me.email) throw new Error("You can't remove yourself. Ask another admin.")
    const db = await sql()
    await db`delete from visitor_name where email = ${email}`
    // Sessions and pending codes go with the address (app_session cascades).
    await db`delete from login_code where email = ${email}`
    await db`delete from allowed_email where email = ${email}`
    return { email }
  })

export const saveName = createServerFn({ method: "POST" })
  .validator((input: { firstName: string; lastName: string }) => ({
    firstName: cleanName(input.firstName, "first name"),
    lastName: cleanName(input.lastName, "last name"),
  }))
  .handler(async ({ data }) => {
    const s = await session()
    const me = await s.requireUser()
    const db = await sql()
    await db`
      insert into visitor_name (email, first_name, last_name)
      values (${me.email}, ${data.firstName}, ${data.lastName})
      on conflict (email) do update
      set first_name = excluded.first_name, last_name = excluded.last_name, updated_at = now()
    `
    return { email: me.email, firstName: data.firstName, lastName: data.lastName }
  })
