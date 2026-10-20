import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { planQuestion } from "../planner"
import { compile } from "../compile"
import { validateSql } from "../validate"
import { answer, collectProblems } from "../pipeline"
import { DEFAULT_CTX, OPENING_QUESTION } from "../types"

const QUESTIONS = [
  OPENING_QUESTION,
  "Top 8 products by revenue, year to date",
  "Monthly revenue versus last year",
  "Gross margin by category, this quarter",
  "Revenue in February 2025 versus last year",
  "Revenue waterfall by category, fiscal year to date",
  "Revenue mix by channel, last quarter",
  "Revenue, units and gross margin by category, last quarter",
  "Rolling 3-month revenue",
]

describe("pipeline self-check", () => {
  it("collectProblems() reports nothing", () => assert.deepEqual(collectProblems(), []))
})

describe("planner → compile → validate", () => {
  for (const q of QUESTIONS) {
    it(`"${q}" compiles to SQL the gateway accepts`, () => {
      const planned = planQuestion(q, DEFAULT_CTX)
      assert.equal(planned.kind, "plan", JSON.stringify(planned))
      if (planned.kind !== "plan") return
      const { sql, params } = compile(planned.plan)
      assert.deepEqual(validateSql(sql, DEFAULT_CTX), { ok: true })
      assert.match(sql, /LIMIT \d+\s*(--[^\n]*\s*)*$/)
      for (const p of params) assert.ok(!sql.includes(`'${p.value}'`), "literals stay parameters")
    })
  }
  it("is deterministic", () => {
    const a = planQuestion(OPENING_QUESTION, DEFAULT_CTX)
    const b = planQuestion(OPENING_QUESTION, DEFAULT_CTX)
    assert.deepEqual(a, b)
  })
})

describe("clarify and block", () => {
  it("asks which measure 'sales' means instead of guessing", () => {
    const p = planQuestion("What were sales by region?", DEFAULT_CTX)
    assert.equal(p.kind, "clarify")
    if (p.kind === "clarify") assert.ok(p.choices.length >= 2)
  })
  it("asks which date role 'by date' means instead of picking one", () => {
    assert.equal(planQuestion("Revenue by date this year", DEFAULT_CTX).kind, "clarify")
  })
  it("blocks a currency it can't convert", () => {
    const r = answer("Revenue in euros by month")
    assert.notEqual(r.kind, "ok")
  })
  it("blocks returns until the relationship is confirmed", () => {
    assert.notEqual(answer("Return amount by month").kind, "ok")
  })
  it("blocks an uncertified formula, allows it once certified", () => {
    assert.equal(answer("Average selling price by category, this quarter").kind, "block")
    const r = answer("Average selling price by category, this quarter", { returnsConfirmed: false, certifiedFormulas: ["asp"] })
    assert.equal(r.kind, "ok")
  })
})
