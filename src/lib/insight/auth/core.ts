/**
 * Emailed one-time-code sign-in for the InsightCanvas email allow-list.
 *
 * Pure server logic with the database, clock, secret and mail sender passed in,
 * so it can be tested against an in-memory Postgres. Request handling (cookies,
 * IP) lives in session.server.ts.
 *
 * Rules:
 * - Codes are 6 random digits, stored only as an HMAC, valid 10 minutes, single use,
 *   and invalidated after 5 wrong guesses.
 * - Requests are rate-limited per email and per IP whether or not the email is on
 *   the list, and the response never says whether it is.
 * - Comparison is constant-time.
 * - Sessions are random 32-byte tokens; only their SHA-256 is stored.
 */
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto"

export interface Sql {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>
}

export type MailSender = (message: { to: string; subject: string; text: string }) => Promise<void>

export type AuthDeps = {
  sql: Sql
  secret: string
  send: MailSender
  now?: () => Date
}

export const CODE_TTL_MS = 10 * 60 * 1000
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_CODE_ATTEMPTS = 5
export const RATE_WINDOW_MS = 15 * 60 * 1000
export const LIMITS = {
  request: { perEmail: 5, perIp: 20 },
  verify: { perEmail: 10, perIp: 50 },
}

export const GENERIC_SENT =
  "If that email is on the list, a 6-digit code is on its way. It works once, for 10 minutes."
export const GENERIC_BAD_CODE = "That code is wrong or has expired. Ask for a new one."
export const RATE_LIMITED = "Too many attempts. Wait 15 minutes and try again."

export function normalizeEmail(value: unknown): string {
  const email = String(value ?? "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
    throw new Error("Enter a valid email address.")
  }
  return email
}

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

export function hashCode(secret: string, email: string, code: string): string {
  return createHmac("sha256", secret).update(`${email}\n${code}`).digest("hex")
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex")
  const y = Buffer.from(b, "hex")
  if (x.length !== y.length || x.length === 0) {
    // Still spend the same work so timing doesn't reveal the length mismatch.
    timingSafeEqual(x.length ? x : Buffer.alloc(32), x.length ? x : Buffer.alloc(32))
    return false
  }
  return timingSafeEqual(x, y)
}

async function overLimit(deps: AuthDeps, kind: "request" | "verify", email: string, ip: string) {
  const since = new Date((deps.now?.() ?? new Date()).getTime() - RATE_WINDOW_MS)
  const [byEmail] = await deps.sql<{ n: number }>`
    select count(*)::int as n from login_event where kind = ${kind} and email = ${email} and created_at > ${since}`
  const [byIp] = await deps.sql<{ n: number }>`
    select count(*)::int as n from login_event where kind = ${kind} and ip = ${ip} and created_at > ${since}`
  const limit = LIMITS[kind]
  return Number(byEmail?.n ?? 0) >= limit.perEmail || Number(byIp?.n ?? 0) >= limit.perIp
}

async function recordEvent(deps: AuthDeps, kind: string, email: string, ip: string) {
  const at = deps.now?.() ?? new Date()
  await deps.sql`insert into login_event (kind, email, ip, created_at) values (${kind}, ${email}, ${ip}, ${at})`
}

export type RequestResult = { ok: true; message: string } | { ok: false; message: string }

/** Ask for a code. Same answer for listed and unlisted emails, apart from rate limits that apply to both. */
export async function requestCode(deps: AuthDeps, rawEmail: unknown, ip: string): Promise<RequestResult> {
  const email = normalizeEmail(rawEmail)
  if (await overLimit(deps, "request", email, ip)) return { ok: false, message: RATE_LIMITED }
  await recordEvent(deps, "request", email, ip)
  const [listed] = await deps.sql<{ email: string }>`select email from allowed_email where email = ${email}`
  if (listed) {
    const code = generateCode()
    const now = deps.now?.() ?? new Date()
    const expires = new Date(now.getTime() + CODE_TTL_MS)
    await deps.sql`
      insert into login_code (email, code_hash, expires_at, attempts, created_at)
      values (${email}, ${hashCode(deps.secret, email, code)}, ${expires}, 0, ${now})
      on conflict (email) do update
      set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at`
    try {
      await deps.send({
        to: email,
        subject: `Your InsightCanvas code: ${code}`,
        text: `Your InsightCanvas sign-in code is ${code}.\n\nIt works once and expires in 10 minutes. If you didn't ask for it, ignore this email.`,
      })
    } catch (error) {
      // Don't reveal delivery problems (that would leak list membership); log for the operator.
      console.error("[auth] could not send sign-in code:", error instanceof Error ? error.message : error)
    }
  }
  return { ok: true, message: GENERIC_SENT }
}

export type VerifyResult =
  | { ok: true; email: string; token: string; expiresAt: Date }
  | { ok: false; message: string }

export async function verifyCode(deps: AuthDeps, rawEmail: unknown, rawCode: unknown, ip: string): Promise<VerifyResult> {
  const email = normalizeEmail(rawEmail)
  const code = String(rawCode ?? "").replace(/\s+/g, "")
  if (await overLimit(deps, "verify", email, ip)) return { ok: false, message: RATE_LIMITED }
  await recordEvent(deps, "verify", email, ip)
  if (!/^\d{6}$/.test(code)) return { ok: false, message: GENERIC_BAD_CODE }
  const now = deps.now?.() ?? new Date()
  const [row] = await deps.sql<{ code_hash: string; expires_at: Date | string; attempts: number }>`
    select code_hash, expires_at, attempts from login_code where email = ${email}`
  const expected = row?.code_hash ?? "0".repeat(64)
  const matches = safeEqualHex(hashCode(deps.secret, email, code), expected)
  if (!row) return { ok: false, message: GENERIC_BAD_CODE }
  const expired = new Date(row.expires_at).getTime() <= now.getTime()
  if (expired || Number(row.attempts) >= MAX_CODE_ATTEMPTS) {
    await deps.sql`delete from login_code where email = ${email}`
    return { ok: false, message: GENERIC_BAD_CODE }
  }
  if (!matches) {
    await deps.sql`update login_code set attempts = attempts + 1 where email = ${email}`
    return { ok: false, message: GENERIC_BAD_CODE }
  }
  // Single use: delete before creating the session. If another request already used it, stop.
  const used = await deps.sql<{ email: string }>`
    delete from login_code where email = ${email} and code_hash = ${expected} returning email`
  if (!used.length) return { ok: false, message: GENERIC_BAD_CODE }
  const [stillListed] = await deps.sql<{ email: string }>`select email from allowed_email where email = ${email}`
  if (!stillListed) return { ok: false, message: GENERIC_BAD_CODE }
  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
  await deps.sql`
    insert into app_session (token_hash, email, created_at, expires_at)
    values (${hashToken(token)}, ${email}, ${now}, ${expiresAt})`
  return { ok: true, email, token, expiresAt }
}

export type SessionUser = { email: string; isAdmin: boolean; firstName: string | null; lastName: string | null }

export async function userForToken(deps: Pick<AuthDeps, "sql" | "now">, token: string | null | undefined): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null
  const now = deps.now?.() ?? new Date()
  const [row] = await deps.sql<{ email: string; is_admin: boolean; first_name: string | null; last_name: string | null }>`
    select s.email, a.is_admin, v.first_name, v.last_name
    from app_session s
    join allowed_email a on a.email = s.email
    left join visitor_name v on v.email = s.email
    where s.token_hash = ${hashToken(token)} and s.expires_at > ${now}`
  if (!row) return null
  return { email: row.email, isAdmin: Boolean(row.is_admin), firstName: row.first_name, lastName: row.last_name }
}

export async function endSession(deps: Pick<AuthDeps, "sql">, token: string | null | undefined) {
  if (!token) return
  await deps.sql`delete from app_session where token_hash = ${hashToken(token)}`
}

/** Housekeeping: drop expired codes, sessions and old rate-limit rows. */
export async function purgeExpired(deps: Pick<AuthDeps, "sql" | "now">) {
  const now = deps.now?.() ?? new Date()
  const old = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  await deps.sql`delete from login_code where expires_at <= ${now}`
  await deps.sql`delete from app_session where expires_at <= ${now}`
  await deps.sql`delete from login_event where created_at < ${old}`
}
