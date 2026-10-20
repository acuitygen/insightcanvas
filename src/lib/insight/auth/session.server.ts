import { randomBytes } from "node:crypto"
import { deleteCookie, getCookie, getRequestIP, getRequestProtocol, setCookie } from "@tanstack/react-start/server"
import { endSession, purgeExpired, SESSION_TTL_MS, userForToken, type AuthDeps, type SessionUser, type Sql } from "./core"
import { pickSender } from "./mailer.server"

export const SESSION_COOKIE = "ic_session"

const globalRef = globalThis as typeof globalThis & { __insightDevSecret__?: string }

function authSecret(): string {
  const configured = process.env.INSIGHT_AUTH_SECRET?.trim()
  if (configured && configured.length >= 32) return configured
  if (process.env.NODE_ENV === "production") {
    throw new Error("INSIGHT_AUTH_SECRET must be set (at least 32 characters) before anyone can sign in.")
  }
  // Development only: a random secret per server process. Codes and sessions reset on restart.
  globalRef.__insightDevSecret__ ??= randomBytes(32).toString("hex")
  return globalRef.__insightDevSecret__
}

async function db(): Promise<Sql> {
  const { getSql } = await import("@/lib/db")
  return (await getSql()) as unknown as Sql
}

export async function authDeps(): Promise<AuthDeps> {
  return { sql: await db(), secret: authSecret(), send: pickSender().send }
}

export function clientIp(): string {
  try {
    return getRequestIP({ xForwardedFor: true }) || "unknown"
  } catch {
    return "unknown"
  }
}

function secureCookie(): boolean {
  if (process.env.NODE_ENV === "production") return true
  try {
    return getRequestProtocol({ xForwardedProto: true }) === "https"
  } catch {
    return false
  }
}

export function setSessionCookie(token: string) {
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}

export async function signOutCurrent() {
  const token = getCookie(SESSION_COOKIE)
  await endSession({ sql: await db() }, token)
  deleteCookie(SESSION_COOKIE, { path: "/" })
}

/** The signed-in person for this request, from the session cookie only. */
export async function currentUser(): Promise<SessionUser | null> {
  const sql = await db()
  if (Math.random() < 0.02) await purgeExpired({ sql }).catch(() => undefined)
  return userForToken({ sql }, getCookie(SESSION_COOKIE))
}

export class AuthError extends Error {}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser()
  if (!user) throw new AuthError("Sign in first.")
  return user
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (!user.isAdmin) throw new AuthError("Only an admin can change the list.")
  return user
}

export async function currentUserForToken(token: string): Promise<SessionUser | null> {
  return userForToken({ sql: await db() }, token)
}
