import { createServerFn } from "@tanstack/react-start"
import { readOnlySql, sslOptions } from "./external-sql"

function cleanEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Confirm your email first.")
  return email
}

export const queryDatabase = createServerFn({ method: "POST" })
  .validator((input: { by: string; connectionString: string; sql: string }) => {
    const connectionString = String(input.connectionString ?? "").trim()
    if (!/^postgres(ql)?:\/\//i.test(connectionString) || connectionString.length > 500) {
      throw new Error("Paste a postgres:// connection string. It is used for this query and is not saved.")
    }
    return { by: cleanEmail(input.by), connectionString, sql: readOnlySql(input.sql) }
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db")
    const app = await getSql()
    const allowed = await app<{ email: string }>`select email from allowed_email where email = ${data.by}`
    if (!allowed.length) return { ok: false as const, message: "Confirm an email on the list before querying a database.", columns: [], rows: [] }
    const { Client } = await import("pg")
    const client = new Client({
      connectionString: data.connectionString,
      connectionTimeoutMillis: 8000,
      statement_timeout: 8000,
      ssl: sslOptions(data.connectionString),
    })
    try {
      await client.connect()
      // Belt and braces: even if a write slipped past the text checks, a READ ONLY
      // transaction makes Postgres refuse it. The transaction is always rolled back.
      await client.query("begin transaction read only")
      await client.query("set local statement_timeout = 8000")
      let result
      try {
        result = await client.query(data.sql)
      } finally {
        await client.query("rollback").catch(() => undefined)
      }
      const columns = result.fields.map((field) => field.name).slice(0, 12)
      const rows = result.rows.slice(0, 200).map((row) => {
        const out: Record<string, string | number | null> = {}
        for (const column of columns) {
          const value = (row as Record<string, unknown>)[column]
          if (value == null) out[column] = null
          else if (typeof value === "number") out[column] = value
          else if (typeof value === "bigint") out[column] = Number(value)
          else if (value instanceof Date) out[column] = value.toISOString().slice(0, 10)
          else if (typeof value === "object") out[column] = JSON.stringify(value)
          else out[column] = String(value)
        }
        return out
      })
      return { ok: true as const, message: `${rows.length} rows. Credentials were not stored.`, columns, rows }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not query that database."
      return { ok: false as const, message: message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://…"), columns: [], rows: [] }
    } finally {
      await client.end().catch(() => undefined)
    }
  })
