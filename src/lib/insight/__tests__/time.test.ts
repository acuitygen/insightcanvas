import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  addDays, addMonths, daysInMonth, diffDays, leapDaysIn, monthEnd, priorWindow, rangeLastFiscalYear,
  rangeLastNMonths, rangeMtd, rangeQtd, rangeYtd, shiftYear, spine, yoyRange,
} from "../time"

describe("date arithmetic", () => {
  it("adds days across month and year ends", () => {
    assert.equal(addDays("2026-12-31", 1), "2027-01-01")
    assert.equal(addDays("2024-03-01", -1), "2024-02-29")
  })
  it("adds months and clamps to month end", () => {
    assert.equal(addMonths("2026-01-15", 1), "2026-02-15")
    assert.equal(addMonths("2026-12-01", 1), "2027-01-01")
  })
  it("knows leap years", () => {
    assert.equal(daysInMonth(2024, 2), 29)
    assert.equal(daysInMonth(2025, 2), 28)
    assert.equal(monthEnd("2024-02-10"), "2024-02-29")
  })
  it("counts days", () => assert.equal(diffDays("2026-01-01", "2026-01-31"), 30))
})

describe("leap day handling", () => {
  it("clamps 29 Feb to 28 Feb when shifting a year, and says so", () => {
    assert.deepEqual(shiftYear("2024-02-29", 1), { iso: "2025-02-28", clamped: true })
    assert.deepEqual(shiftYear("2025-03-01", -1), { iso: "2024-03-01", clamped: false })
  })
  it("lists leap days in a range", () => {
    assert.deepEqual(leapDaysIn("2024-01-01", "2024-12-31"), ["2024-02-29"])
    assert.deepEqual(leapDaysIn("2025-01-01", "2025-12-31"), [])
  })
})

describe("periods (as of 2026-10-16, fiscal year starts in April)", () => {
  const AS_OF = "2026-10-16"
  it("fiscal year to date starts on 1 April and is partial", () => {
    const r = rangeYtd(AS_OF)
    assert.equal(r.start, "2026-04-01")
    assert.equal(r.end, AS_OF)
    assert.equal(r.partial, true)
  })
  it("month and quarter to date", () => {
    assert.equal(rangeMtd(AS_OF).start, "2026-10-01")
    assert.equal(rangeQtd(AS_OF).start, "2026-10-01")
  })
  it("last fiscal year is April to March", () => {
    const r = rangeLastFiscalYear(AS_OF)
    assert.equal(r.start, "2025-04-01")
    assert.equal(r.end, "2026-03-31")
  })
  it("rolling months use calendar ranges", () => {
    const r = rangeLastNMonths(3, AS_OF)
    assert.ok(r.start <= "2026-08-01" && r.end <= AS_OF, JSON.stringify(r))
  })
  it("prior window has the same length, immediately before", () => {
    const r = { start: "2026-04-01", end: "2026-04-30", partial: false, label: "Apr" }
    const p = priorWindow(r)
    assert.equal(p.end, "2026-03-31")
    assert.equal(diffDays(p.start, p.end), diffDays(r.start, r.end))
  })
  it("same period last year", () => {
    const { range } = yoyRange({ start: "2026-04-01", end: "2026-10-16", partial: true, label: "" })
    assert.equal(range.start, "2025-04-01")
    assert.equal(range.end, "2025-10-16")
  })
  it("builds a month spine with no gaps", () => {
    assert.deepEqual(spine("2026-01-01", "2026-04-30", "month"), ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"])
  })
})
