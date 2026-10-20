import { test } from "node:test"
import assert from "node:assert/strict"
import { practiceSheet, salesSheet } from "../samples"

test("salesSheet is a fictional sales log with the expected columns", () => {
  const sheet = salesSheet()
  assert.equal(sheet.id, "sample-sales")
  const json = JSON.stringify(sheet)
  assert.match(json, /Rep Alpha/)
  assert.doesNotMatch(json, /clinic|patient|Dr /i)
})

test("practiceSheet still builds", () => {
  assert.equal(practiceSheet().id, "sample-practice")
})
