import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readOnlySql, sslOptions } from "../external-sql"

describe("readOnlySql", () => {
  it("wraps a select with the row cap", () => {
    assert.equal(readOnlySql("select id from orders"), "select * from (\nselect id from orders\n) as insight_q limit 200")
  })
  it("keeps string literals and drops comments", () => {
    assert.match(readOnlySql("select 'a--b' as x -- tail"), /select 'a--b' as x\n\) as insight_q limit 200$/)
  })
  it("a trailing comment can't remove the wrapper's LIMIT", () => {
    assert.match(readOnlySql("select id from big --"), /limit 200$/)
  })
  for (const sql of [
    "delete from orders",
    "with x as (delete from orders returning 1) select 1",
    "select 1; select 2",
    "select pg_read_file('/etc/passwd')",
    "select pg_sleep(100)",
    "select set_config('transaction_read_only','off',false)",
    "select current_setting('data_directory')",
    "select dblink_connect('x')",
    "select lo_import('/etc/passwd')",
    "select query_to_xml('delete from orders', true, true, '')",
    "select nextval('s')",
    "select id from orders for update",
    'select "pg_read_file"(\'/etc/passwd\')',
    "select $$x$$",
    "select id into t from orders",
    "",
  ]) it(`refuses ${sql || "(empty)"}`, () => assert.throws(() => readOnlySql(sql)))
})

describe("sslOptions", () => {
  it("verifies certificates by default", () =>
    assert.deepEqual(sslOptions("postgres://u:p@db.example.com:5432/x", {}), { rejectUnauthorized: true }))
  it("skips TLS for localhost", () => assert.equal(sslOptions("postgres://u:p@localhost/x", {}), undefined))
  it("does not treat a host that merely contains 'localhost' as local", () =>
    assert.deepEqual(sslOptions("postgres://u:p@localhost.evil.com/x", {}), { rejectUnauthorized: true }))
  it("allows an explicit opt-out", () =>
    assert.deepEqual(sslOptions("postgres://u:p@db.example.com/x", { INSIGHT_EXTERNAL_DB_TLS_INSECURE: "true" }), { rejectUnauthorized: false }))
})
