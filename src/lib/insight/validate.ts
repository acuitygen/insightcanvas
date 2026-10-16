import { ALLOWED_TABLES } from "./catalog"
import type { EngineCtx, SqlVerdict } from "./types"

const ALLOWED_FN = new Set([
  "sum",
  "count",
  "min",
  "max",
  "nullif",
  "coalesce",
  "date_trunc",
  "generate_series",
  "extract",
  "make_date",
  "abs",
  "round",
  "greatest",
  "least",
  "cast",
  "lower",
  "upper",
  "lag",
  "lead",
])

const NOT_FN = new Set([
  "as",
  "over",
  "in",
  "and",
  "or",
  "not",
  "when",
  "then",
  "else",
  "on",
  "where",
  "from",
  "join",
  "left",
  "right",
  "full",
  "inner",
  "outer",
  "cross",
  "using",
  "values",
  "select",
  "with",
  "case",
  "by",
  "order",
  "group",
  "limit",
  "offset",
  "union",
  "all",
  "distinct",
  "between",
  "is",
  "null",
  "like",
  "ilike",
  "exists",
  "filter",
  "within",
  "partition",
  "rows",
  "range",
  "unbounded",
  "preceding",
  "following",
  "current",
  "row",
  "interval",
  "date",
  "timestamp",
  "asc",
  "desc",
  "having",
  "window",
  "lateral",
  "true",
  "false",
  "end",
  "into",
  "join",
])

export function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ")
}

export function validateSql(sql: string, ctx: EngineCtx = { returnsConfirmed: true, certifiedFormulas: [] }): SqlVerdict {
  const stripped = stripSqlComments(sql).trim()
  if (!stripped) return { ok: false, message: "The statement is empty." }

  const parts = stripped
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length > 1) {
    return {
      ok: false,
      message: "Stacked statements are rejected. The gateway allows one SELECT only.",
    }
  }

  const body = parts[0] ?? ""
  if (!/^(select|with)\b/i.test(body)) {
    return { ok: false, message: "Only a single SELECT, optionally starting with WITH, is permitted." }
  }

  if (/\b(insert|update|delete|drop|alter|truncate|grant|revoke|merge|copy|call|execute|vacuum|create|comment)\b/i.test(body)) {
    return { ok: false, message: "Writes, DDL, and privilege changes are rejected before execution." }
  }

  if (/\binto\b/i.test(body)) {
    return { ok: false, message: "SELECT INTO is rejected. Results are not written anywhere." }
  }

  if (/\bdo\b/i.test(body)) {
    return { ok: false, message: "Anonymous code blocks are rejected." }
  }

  if (/\b(pg_[a-z0-9_]*|dblink|lo_import|lo_export|lo_from_bytea)\b/i.test(body)) {
    return { ok: false, message: "System and external-access functions are rejected." }
  }

  if (/\bselect\s+\*/i.test(body)) {
    return {
      ok: false,
      message: "SELECT * is rejected. Every column has to be named and allowed by the model.",
    }
  }

  if (/\b(password|secret|credential|api_key|ssn)\b/i.test(body)) {
    return { ok: false, message: "That column is outside the published model." }
  }

  const limit = body.match(/\blimit\s+(\d+)\b/i)
  if (!limit) {
    return {
      ok: false,
      message: "A numeric LIMIT is required. The row cap is a gateway rule, not a database default.",
    }
  }
  if (Number(limit[1]) > 5000) {
    return { ok: false, message: "LIMIT exceeds the connection cap of 5,000 rows." }
  }

  const cteNames = new Set<string>()
  for (const match of body.matchAll(/\b([a-z_][\w]*)\s+as\s*\(/gi)) {
    cteNames.add(match[1].toLowerCase())
  }

  const allowed = new Set(ALLOWED_TABLES)
  for (const match of body.matchAll(/\b(?:from|join)\s+([a-z_][\w.]*)/gi)) {
    const name = match[1].toLowerCase()
    if (cteNames.has(name) || ALLOWED_FN.has(name)) continue
    if (!name.includes(".")) {
      return { ok: false, message: `Relation ${name} is not a CTE or an approved table.` }
    }
    if (!allowed.has(name)) {
      return { ok: false, message: `Table ${name} is outside the published model.` }
    }
    if (name === "analytics.fact_return" && !ctx.returnsConfirmed) {
      return {
        ok: false,
        message: "fact_return is not usable until the returns relationship is confirmed.",
      }
    }
  }

  for (const match of body.matchAll(/\b([a-z_][\w]*)\s*\(/gi)) {
    const name = match[1].toLowerCase()
    if (NOT_FN.has(name) || cteNames.has(name)) continue
    if (!ALLOWED_FN.has(name)) {
      return { ok: false, message: `Function ${name} is not on the approved list.` }
    }
  }

  return { ok: true }
}
