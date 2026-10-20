import { scanSql } from "./sql-scan"

/** Rows returned from an outside database are capped here and again after the query. */
export const EXTERNAL_ROW_CAP = 200

/**
 * Functions refused on an outside database. Same families the Ask gateway blocks
 * (pg_*, dblink, large objects), plus functions that change settings or run SQL
 * text given as a string.
 */
const BLOCKED_FN =
  /\b(pg_[a-z0-9_]*|dblink[a-z0-9_]*|lo_[a-z0-9_]*|set_config|current_setting|query_to_xml[a-z_]*|table_to_xml[a-z_]*|cursor_to_xml[a-z_]*|database_to_xml[a-z_]*|schema_to_xml[a-z_]*|xpath[a-z_]*|txid_[a-z_]*|nextval|setval)\s*\(/i

export function readOnlySql(value: unknown): string {
  const raw = String(value ?? "")
  if (!raw.trim() || raw.length > 4000) throw new Error("Enter one SELECT, up to 4000 characters.")
  const scanned = scanSql(raw)
  if (!scanned.ok) throw new Error(scanned.message)
  const sql = scanned.text.trim()
  if (sql.includes(";")) throw new Error("Send a single statement, with no semicolon.")
  if (!/^(select|with)\b/i.test(sql)) throw new Error("Only a SELECT is allowed.")
  if (/\b(insert|update|delete|merge|drop|alter|create|grant|revoke|copy|truncate|call|do|execute|into|lock|listen|notify|set|reset|vacuum|analyze|refresh|discard|prepare|deallocate)\b/i.test(sql)) {
    throw new Error("That statement is not read-only.")
  }
  if (BLOCKED_FN.test(sql)) throw new Error("System, settings and external-access functions are not allowed.")
  if (/\bfor\s+(update|share|no\s+key\s+update|key\s+share)\b/i.test(sql)) throw new Error("Row locks are not allowed.")
  // Execute the comment-free text with string literals intact, so a trailing "--" can't
  // comment out the wrapper's LIMIT. The checks above ran on the copy with strings emptied.
  const runnable = scanSql(raw, { keepStrings: true })
  if (!runnable.ok) throw new Error(runnable.message)
  return `select * from (\n${runnable.text.trim()}\n) as insight_q limit ${EXTERNAL_ROW_CAP}`
}

/**
 * TLS options for an outside database. Certificates are verified by default.
 * Local hosts skip TLS. Set INSIGHT_EXTERNAL_DB_TLS_INSECURE=true only for a
 * test database you control: it turns certificate checks off.
 */
export function sslOptions(connectionString: string, env: Record<string, string | undefined> = process.env) {
  let host = ""
  try {
    host = new URL(connectionString).hostname
  } catch {
    host = ""
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return undefined
  const insecure = String(env.INSIGHT_EXTERNAL_DB_TLS_INSECURE ?? "").toLowerCase() === "true"
  return { rejectUnauthorized: !insecure }
}
