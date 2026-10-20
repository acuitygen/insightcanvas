import { ALLOWED_TABLES } from "./catalog"
import { relationRefs, scanSql, tokenize } from "./sql-scan"
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
  const scanned = scanSql(sql)
  if (!scanned.ok) return { ok: false, message: scanned.message }
  const stripped = scanned.text.trim()
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

  if (/\btable\b/i.test(body)) {
    return { ok: false, message: "TABLE shorthand is rejected. Name the columns you need." }
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

  const tokens = tokenize(body)

  // The row cap applies to the outer query: the statement must end with LIMIT n [OFFSET m].
  const top = tokens.filter((tok) => tok.depth === 0)
  const tail = top.map((tok) => tok.t)
  let end = tail.length
  if (tail[end - 2] === "offset" && /^\d+$/.test(tail[end - 1] ?? "")) end -= 2
  if (tail[end - 2] !== "limit" || !/^\d+$/.test(tail[end - 1] ?? "")) {
    return {
      ok: false,
      message: "A numeric LIMIT is required. The row cap is a gateway rule, not a database default.",
    }
  }
  if (Number(tail[end - 1]) > 5000) {
    return { ok: false, message: "LIMIT exceeds the connection cap of 5,000 rows." }
  }
  if (tail.includes("fetch")) {
    return { ok: false, message: "FETCH is rejected. Use LIMIT so the row cap can be checked." }
  }

  const cteNames = new Set<string>()
  for (const match of body.matchAll(/\b([a-z_][\w]*)\s*(?:\([^()]*\))?\s+as\s*\(/gi)) {
    cteNames.add(match[1].toLowerCase())
  }

  const allowed = new Set(ALLOWED_TABLES)
  for (const name of relationRefs(tokens)) {
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

  for (let k = 0; k < tokens.length - 1; k++) {
    if (tokens[k + 1].t !== "(") continue
    const name = tokens[k].t
    if (!/^[a-z_][\w.]*$/.test(name) || NOT_FN.has(name)) continue
    // A CTE name followed by "(" is only a definition (WITH x(a, b) AS ...), never a call.
    const prev = tokens[k - 1]?.t
    if (cteNames.has(name) && (prev === "with" || prev === "," || prev === "recursive")) continue
    if (!ALLOWED_FN.has(name)) {
      return { ok: false, message: `Function ${name} is not on the approved list.` }
    }
  }

  return { ok: true }
}
