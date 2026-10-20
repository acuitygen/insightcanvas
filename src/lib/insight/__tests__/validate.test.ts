import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { validateSql } from "../validate"
import { scanSql } from "../sql-scan"
import { DEFAULT_CTX } from "../types"

const ok = (sql: string) => assert.deepEqual(validateSql(sql, DEFAULT_CTX), { ok: true }, sql)
const refused = (sql: string, pattern?: RegExp) => {
  const v = validateSql(sql, DEFAULT_CTX)
  assert.equal(v.ok, false, `should refuse: ${sql}`)
  if (pattern && !v.ok) assert.match(v.message, pattern)
}

const GOOD = "SELECT d.month_start, SUM(f.net_revenue) AS revenue FROM analytics.fact_order_line AS f JOIN analytics.dim_date AS d ON d.date_key = f.order_date GROUP BY 1 ORDER BY 1 LIMIT 100"

describe("validateSql: allowed", () => {
  it("accepts a plain aggregate over model tables", () => ok(GOOD))
  it("accepts CTEs, generate_series and interval literals", () =>
    ok("WITH spine AS (SELECT gs::date AS p FROM generate_series($1::date, $2::date, INTERVAL '1 month') AS gs) SELECT spine.p FROM spine LIMIT 12"))
  it("accepts a CTE with a column list", () =>
    ok("WITH t(a) AS (SELECT SUM(f.net_revenue) FROM analytics.fact_order_line AS f) SELECT t.a FROM t LIMIT 1"))
  it("accepts LIMIT with OFFSET", () => ok(GOOD.replace("LIMIT 100", "LIMIT 100 OFFSET 10")))
  it("ignores comment markers inside string literals", () =>
    ok("SELECT SUM(f.net_revenue) FROM analytics.fact_order_line AS f WHERE f.note <> '--x;' LIMIT 1"))
  it("ignores leading comments", () => ok("-- header\n/* note */ " + GOOD))
})

describe("validateSql: original attack corpus", () => {
  for (const sql of [
    "DROP TABLE analytics.fact_order_line",
    "SELECT net_revenue FROM analytics.fact_order_line; DELETE FROM analytics.fact_order_line",
    "SELECT pg_read_file('/etc/passwd')",
    "SELECT secret FROM secret.credentials LIMIT 10",
    "SELECT * FROM analytics.fact_order_line LIMIT 10",
    "SELECT SUM(net_revenue) FROM analytics.fact_order_line",
    "",
    "UPDATE analytics.fact_order_line SET net_revenue = 0",
    "SELECT net_revenue INTO t FROM analytics.fact_order_line LIMIT 1",
    "SELECT SUM(f.net_revenue) FROM analytics.fact_order_line AS f LIMIT 9000",
    "SELECT x FROM users LIMIT 1",
  ]) it(`refuses ${sql.slice(0, 60) || "(empty)"}`, () => refused(sql))
})

describe("validateSql: bypasses found in review (all fixed)", () => {
  it("comma join to an outside table", () =>
    refused("SELECT SUM(net_revenue) AS r FROM analytics.fact_order_line, public.users LIMIT 10", /outside the published model/))
  it("comma join after a subquery", () =>
    refused("SELECT a.x FROM (SELECT 1 AS x) AS a, public.users LIMIT 10", /outside the published model/))
  it("double-quoted table names", () =>
    refused('SELECT SUM(net_revenue) AS r FROM "public"."users" LIMIT 10', /Quoted identifiers/))
  it("double-quoted function names", () => refused(`SELECT "set_config"('a','b',false) LIMIT 1`, /Quoted/))
  it("TABLE shorthand in a subquery", () => refused("SELECT x FROM (TABLE public.users) t LIMIT 10", /TABLE/))
  it("a CTE named after a blocked function", () =>
    refused("WITH set_config AS (SELECT 1) SELECT set_config('a','b',false) LIMIT 1", /set_config/))
  it("'--' inside a string hiding the rest of the line", () =>
    refused("SELECT '--', t.x FROM (SELECT 1 AS x) t, public.users\n LIMIT 10", /outside the published model/))
  it("LIMIT only inside a subquery", () =>
    refused("SELECT SUM(net_revenue) FROM analytics.fact_order_line WHERE 1 IN (SELECT 1 LIMIT 1)", /LIMIT is required/))
  it("LIMIT only inside a string", () =>
    refused("SELECT SUM(net_revenue) FROM analytics.fact_order_line WHERE 'limit 5' = ''", /LIMIT is required/))
  it("nested comments", () => refused("/* /* */ SELECT 1 */ SELECT x FROM public.users LIMIT 1", /outside the published model/))
  it("escape-string literals", () =>
    refused("SELECT SUM(net_revenue) FROM analytics.fact_order_line WHERE x = E'\\'' LIMIT 1", /Escape/))
  it("dollar-quoted strings", () => refused("SELECT $$a$$ LIMIT 1", /Dollar/))
  it("FETCH instead of LIMIT", () =>
    refused("SELECT SUM(net_revenue) FROM analytics.fact_order_line FETCH FIRST 9 ROWS ONLY LIMIT 5", /FETCH/))
  it("FROM ONLY", () => refused("SELECT x.a FROM ONLY public.users x LIMIT 1"))
  it("unknown functions", () =>
    refused("SELECT current_setting('x') FROM analytics.fact_order_line LIMIT 1", /not on the approved list/))
  it("returns table before the relationship is confirmed", () => {
    const v = validateSql("SELECT SUM(r.amount) FROM analytics.fact_return AS r LIMIT 1", { returnsConfirmed: false, certifiedFormulas: [] })
    assert.equal(v.ok, false)
  })
})

describe("scanSql", () => {
  it("empties strings and drops comments", () => {
    const r = scanSql("select 'a--b' /* c */ -- d\n from x")
    assert.ok(r.ok)
    if (r.ok) assert.equal(r.text.replace(/\s+/g, " ").trim(), "select '' from x")
  })
  it("keeps strings when asked", () => {
    const r = scanSql("select 'it''s' -- c", { keepStrings: true })
    assert.ok(r.ok)
    if (r.ok) assert.equal(r.text.trim(), "select 'it''s'")
  })
  it("rejects unterminated strings and comments", () => {
    assert.equal(scanSql("select 'a").ok, false)
    assert.equal(scanSql("select /* a").ok, false)
  })
})
