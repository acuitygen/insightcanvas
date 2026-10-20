import { describe, it, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import {
  CODE_TTL_MS, GENERIC_BAD_CODE, GENERIC_SENT, LIMITS, MAX_CODE_ATTEMPTS, RATE_LIMITED,
  endSession, hashCode, requestCode, safeEqualHex, userForToken, verifyCode, type AuthDeps, type Sql,
} from "./core"
import { pickSender } from "./mailer.server"

type Sent = { to: string; subject: string; text: string }

async function setup() {
  const pg = new PGlite()
  for (const f of ["migrations/0002_access.sql", "migrations/0004_email_otp.sql"]) await pg.exec(readFileSync(f, "utf8"))
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "")
    return (await pg.query(text, values)).rows
  }) as unknown as Sql
  await sql`insert into allowed_email (email, is_admin) values ('ada@example.com', true), ('bo@example.com', false)`
  const sent: Sent[] = []
  let clock = new Date("2026-10-21T10:00:00Z")
  const deps: AuthDeps = { sql, secret: "x".repeat(40), send: async (m) => void sent.push(m), now: () => clock }
  return { pg, sql, deps, sent, advance: (ms: number) => (clock = new Date(clock.getTime() + ms)) }
}

const codeIn = (m: Sent) => m.subject.match(/(\d{6})/)![1]

describe("email one-time codes", () => {
  let t: Awaited<ReturnType<typeof setup>>
  beforeEach(async () => (t = await setup()))

  it("emails a 6-digit code to a listed address and stores only its HMAC", async () => {
    const r = await requestCode(t.deps, " Ada@Example.com ", "1.1.1.1")
    assert.deepEqual(r, { ok: true, message: GENERIC_SENT })
    assert.equal(t.sent.length, 1)
    const code = codeIn(t.sent[0])
    const [row] = await t.sql<{ code_hash: string }>`select code_hash from login_code where email = 'ada@example.com'`
    assert.notEqual(row.code_hash, code)
    assert.equal(row.code_hash, hashCode(t.deps.secret, "ada@example.com", code))
  })

  it("gives unknown addresses the same answer and sends nothing", async () => {
    const r = await requestCode(t.deps, "nobody@example.com", "1.1.1.1")
    assert.deepEqual(r, { ok: true, message: GENERIC_SENT })
    assert.equal(t.sent.length, 0)
  })

  it("signs in with the right code and creates a session", async () => {
    await requestCode(t.deps, "ada@example.com", "1.1.1.1")
    const v = await verifyCode(t.deps, "ada@example.com", codeIn(t.sent[0]), "1.1.1.1")
    assert.equal(v.ok, true)
    if (!v.ok) return
    const user = await userForToken(t.deps, v.token)
    assert.deepEqual(user, { email: "ada@example.com", isAdmin: true, firstName: null, lastName: null })
    const [s] = await t.sql<{ token_hash: string }>`select token_hash from app_session`
    assert.notEqual(s.token_hash, v.token, "only the token hash is stored")
  })

  it("codes are single use", async () => {
    await requestCode(t.deps, "ada@example.com", "1.1.1.1")
    const code = codeIn(t.sent[0])
    assert.equal((await verifyCode(t.deps, "ada@example.com", code, "1.1.1.1")).ok, true)
    assert.deepEqual(await verifyCode(t.deps, "ada@example.com", code, "1.1.1.1"), { ok: false, message: GENERIC_BAD_CODE })
  })

  it("codes expire after 10 minutes", async () => {
    await requestCode(t.deps, "ada@example.com", "1.1.1.1")
    t.advance(CODE_TTL_MS + 1)
    assert.equal((await verifyCode(t.deps, "ada@example.com", codeIn(t.sent[0]), "1.1.1.1")).ok, false)
  })

  it("a code dies after too many wrong guesses, even if the right one comes next", async () => {
    await requestCode(t.deps, "ada@example.com", "1.1.1.1")
    const code = codeIn(t.sent[0])
    const wrong = code === "000000" ? "111111" : "000000"
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) await verifyCode(t.deps, "ada@example.com", wrong, "1.1.1.1")
    assert.equal((await verifyCode(t.deps, "ada@example.com", code, "1.1.1.1")).ok, false)
  })

  it("a new request replaces the old code", async () => {
    await requestCode(t.deps, "ada@example.com", "1.1.1.1")
    await requestCode(t.deps, "ada@example.com", "1.1.1.1")
    const [first, second] = t.sent.map(codeIn)
    if (first !== second) assert.equal((await verifyCode(t.deps, "ada@example.com", first, "1.1.1.1")).ok, false)
    assert.equal((await verifyCode(t.deps, "ada@example.com", second, "1.1.1.1")).ok, true)
  })

  it("rate-limits code requests per email, listed or not", async () => {
    for (const email of ["ada@example.com", "ghost@example.com"]) {
      for (let i = 0; i < LIMITS.request.perEmail; i++) assert.equal((await requestCode(t.deps, email, `9.9.9.${i}`)).ok, true)
      assert.deepEqual(await requestCode(t.deps, email, "9.9.9.99"), { ok: false, message: RATE_LIMITED })
    }
  })

  it("rate-limits code requests per IP", async () => {
    for (let i = 0; i < LIMITS.request.perIp; i++) await requestCode(t.deps, `p${i}@example.com`, "2.2.2.2")
    assert.deepEqual(await requestCode(t.deps, "ada@example.com", "2.2.2.2"), { ok: false, message: RATE_LIMITED })
    t.advance(16 * 60 * 1000)
    assert.equal((await requestCode(t.deps, "ada@example.com", "2.2.2.2")).ok, true)
  })

  it("rate-limits verify attempts per email", async () => {
    for (let i = 0; i < LIMITS.verify.perEmail; i++) await verifyCode(t.deps, "bo@example.com", "123456", `3.3.3.${i}`)
    assert.deepEqual(await verifyCode(t.deps, "bo@example.com", "123456", "3.3.3.200"), { ok: false, message: RATE_LIMITED })
  })

  it("rejects malformed codes without a database lookup result leak", async () => {
    assert.deepEqual(await verifyCode(t.deps, "ada@example.com", "12ab56", "1.1.1.1"), { ok: false, message: GENERIC_BAD_CODE })
    assert.deepEqual(await verifyCode(t.deps, "ghost@example.com", "123456", "1.1.1.1"), { ok: false, message: GENERIC_BAD_CODE })
  })

  it("removing someone from the list ends their sessions", async () => {
    await requestCode(t.deps, "bo@example.com", "1.1.1.1")
    const v = await verifyCode(t.deps, "bo@example.com", codeIn(t.sent[0]), "1.1.1.1")
    assert.ok(v.ok)
    if (!v.ok) return
    await t.sql`delete from allowed_email where email = 'bo@example.com'`
    assert.equal(await userForToken(t.deps, v.token), null)
  })

  it("sessions expire and can be ended", async () => {
    await requestCode(t.deps, "ada@example.com", "1.1.1.1")
    const v = await verifyCode(t.deps, "ada@example.com", codeIn(t.sent[0]), "1.1.1.1")
    assert.ok(v.ok)
    if (!v.ok) return
    await endSession(t.deps, v.token)
    assert.equal(await userForToken(t.deps, v.token), null)
    assert.equal(await userForToken(t.deps, "made-up"), null)
    assert.equal(await userForToken(t.deps, null), null)
  })

  it("a delivery failure still returns the generic answer", async () => {
    const deps = { ...t.deps, send: async () => { throw new Error("smtp down") } }
    const orig = console.error
    console.error = () => {}
    try {
      assert.deepEqual(await requestCode(deps, "ada@example.com", "1.1.1.1"), { ok: true, message: GENERIC_SENT })
    } finally {
      console.error = orig
    }
  })
})

describe("helpers", () => {
  it("safeEqualHex", () => {
    assert.equal(safeEqualHex("ab", "ab"), true)
    assert.equal(safeEqualHex("ab", "ac"), false)
    assert.equal(safeEqualHex("ab", "abcd"), false)
    assert.equal(safeEqualHex("", ""), false)
  })
  it("mail sender selection", () => {
    assert.equal(pickSender({ RESEND_API_KEY: "k", INSIGHT_MAIL_FROM: "a@b.c" }).kind, "resend")
    assert.equal(pickSender({ SMTP_URL: "smtp://x" }).kind, "smtp")
    assert.equal(pickSender({ NODE_ENV: "development" }).kind, "console")
    assert.equal(pickSender({ NODE_ENV: "production" }).kind, "none")
  })
})
