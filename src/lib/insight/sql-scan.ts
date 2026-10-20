/**
 * Small SQL lexer used by the gateway checks.
 *
 * Pattern checks on raw SQL can be fooled by comment markers inside string
 * literals ("'--'" hides the rest of a line from a naive comment stripper),
 * by double-quoted identifiers, and by nested comments. scanSql() walks the
 * text the way Postgres does and returns a version with comments removed and
 * every string literal emptied to '', so later checks only see code.
 * Constructs the gateway does not need are rejected outright.
 */
export type ScanResult = { ok: true; text: string } | { ok: false; message: string }

export function scanSql(sql: string, options: { keepStrings?: boolean } = {}): ScanResult {
  let out = ""
  let i = 0
  const n = sql.length
  while (i < n) {
    const c = sql[i]
    const next = sql[i + 1]
    if (c === "-" && next === "-") {
      while (i < n && sql[i] !== "\n") i++
      out += " "
      continue
    }
    if (c === "/" && next === "*") {
      let depth = 1
      i += 2
      while (i < n && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          depth++
          i += 2
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          depth--
          i += 2
        } else i++
      }
      if (depth > 0) return { ok: false, message: "Unterminated comment." }
      out += " "
      continue
    }
    if (c === "'") {
      const prev = out.slice(-1)
      if (/[eEuUbBxXnN&]/.test(prev) && !/[\w]/.test(out.slice(-2, -1) || " ")) {
        return {
          ok: false,
          message: "Escape, Unicode, bit and national string literals are not allowed. Use a plain '…' literal.",
        }
      }
      const startQuote = i
      i++
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2
        else if (sql[i] === "'") break
        else i++
      }
      if (i >= n) return { ok: false, message: "Unterminated string literal." }
      i++
      out += options.keepStrings ? sql.slice(startQuote, i) : "''"
      continue
    }
    if (c === '"') {
      return { ok: false, message: "Quoted identifiers are not allowed. Use the plain names from the model." }
    }
    if (c === "$" && !/[0-9]/.test(next ?? "")) {
      return { ok: false, message: "Dollar-quoted strings are not allowed." }
    }
    if (c === "\\") {
      return { ok: false, message: "Backslash commands are not allowed." }
    }
    out += c
    i++
  }
  return { ok: true, text: out }
}

export type Token = { t: string; depth: number }

/** Split scanned SQL into lower-cased tokens with their parenthesis depth. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let depth = 0
  const re = /\$\d+|''|[a-z_][\w]*(?:\s*\.\s*[a-z_][\w]*)*|\d+(?:\.\d+)?|::|[(),;.*=<>!+\-/%|]/gi
  for (const m of text.matchAll(re)) {
    const raw = m[0]
    if (raw === "(") {
      tokens.push({ t: "(", depth })
      depth++
      continue
    }
    if (raw === ")") {
      depth = Math.max(0, depth - 1)
      tokens.push({ t: ")", depth })
      continue
    }
    tokens.push({ t: raw.replace(/\s+/g, "").toLowerCase(), depth })
  }
  return tokens
}

/** Relation names that appear in FROM / JOIN positions, including comma-separated FROM lists. */
export function relationRefs(tokens: Token[]): string[] {
  const refs: string[] = []
  const FROM_END = new Set([
    "where", "group", "order", "limit", "having", "window", "union", "intersect", "except",
    "offset", "fetch", "on", "using", "join", "inner", "left", "right", "full", "cross", "natural",
    "select", "returning", "for",
  ])
  const fromDepths: number[] = []
  const takeRef = (k: number) => {
    let j = k
    while (tokens[j] && (tokens[j].t === "lateral" || tokens[j].t === "only")) {
      if (tokens[j].t === "only") refs.push("only")
      j++
    }
    const tok = tokens[j]
    if (tok && tok.t !== "(") refs.push(tok.t)
  }
  for (let k = 0; k < tokens.length; k++) {
    const { t, depth } = tokens[k]
    if (fromDepths.length && fromDepths[fromDepths.length - 1] > depth) fromDepths.pop()
    if (t === "from" || t === "join") {
      takeRef(k + 1)
      if (t === "from") fromDepths.push(depth)
      continue
    }
    const inFrom = fromDepths.length && fromDepths[fromDepths.length - 1] === depth
    if (inFrom && FROM_END.has(t)) {
      fromDepths.pop()
      continue
    }
    if (inFrom && t === ",") takeRef(k + 1)
  }
  return refs
}
