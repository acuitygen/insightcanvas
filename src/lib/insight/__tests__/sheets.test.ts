import { describe, it } from "node:test"
import assert from "node:assert/strict"
import * as XLSX from "xlsx"
import { MAX_FILE_BYTES, MAX_ROWS, parseCsv, parseExcel, parseJson, sheetFromRecords } from "../sheets"

function xlsxBuffer(rows: unknown[][], extra?: (ws: XLSX.WorkSheet) => void): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  extra?.(ws)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Data")
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer
  return out
}

const clean = () => assert.equal(({} as Record<string, unknown>).polluted, undefined, "Object.prototype was polluted")

describe("Excel uploads (SheetJS 0.20.3)", () => {
  it("reads the first sheet into records, as before", async () => {
    const records = await parseExcel(xlsxBuffer([["Region", "Revenue"], ["West", 1200], ["East", 900]]))
    assert.deepEqual(records, [{ Region: "West", Revenue: 1200 }, { Region: "East", Revenue: 900 }])
    const sheet = sheetFromRecords("t", "excel", records)
    assert.deepEqual(sheet.columns.map((c) => c.kind), ["text", "number"])
  })
  it("fills empty cells with empty strings, as before", async () => {
    const records = await parseExcel(xlsxBuffer([["A", "B"], ["x", null], [null, 2]]))
    assert.deepEqual(records, [{ A: "x", B: "" }, { A: "", B: 2 }])
  })
  it("doesn't let a __proto__ header pollute objects", async () => {
    const records = await parseExcel(xlsxBuffer([["__proto__", "constructor", "ok"], [JSON.stringify({ polluted: 1 }), "x", 1]]))
    clean()
    // SheetJS 0.20.3 renames these headers itself; either way no prototype key survives.
    for (const key of Object.keys(records[0])) assert.ok(!["__proto__", "constructor", "prototype"].includes(key), key)
    assert.equal(records[0].ok, 1)
    assert.equal(Object.getPrototypeOf(records[0]), Object.prototype)
  })
  it("returns formula results, not formulas", async () => {
    const records = await parseExcel(
      xlsxBuffer([["A", "B"], [1, 2]], (ws) => {
        ws["B2"] = { t: "n", v: 2, f: 'HYPERLINK("http://evil.example","x")' }
      }),
    )
    assert.deepEqual(records, [{ A: 1, B: 2 }])
  })
  it("stops after the row limit", async () => {
    const rows: unknown[][] = [["n"]]
    for (let i = 0; i < MAX_ROWS + 500; i++) rows.push([i])
    const records = await parseExcel(xlsxBuffer(rows))
    assert.equal(records.length, MAX_ROWS)
  })
  it("refuses files over the size limit before parsing", async () => {
    await assert.rejects(parseExcel(new ArrayBuffer(MAX_FILE_BYTES + 1)), /limit is 10 MB/)
  })
  it("fails cleanly on garbage and truncated files", async () => {
    const good = new Uint8Array(xlsxBuffer([["A"], [1]]))
    for (const bytes of [new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), good.slice(0, good.length / 2)]) {
      try {
        const r = await parseExcel(bytes.buffer as ArrayBuffer)
        assert.ok(Array.isArray(r))
      } catch (error) {
        assert.ok(error instanceof Error)
      }
    }
  })
})

describe("CSV uploads", () => {
  it("parses quotes, commas and CRLF as before", () => {
    assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n'), [{ a: "x, y", b: 'say "hi"' }])
  })
  it("renames dangerous headers", () => {
    const r = parseCsv('__proto__,prototype,b\n{"polluted":1},2,3\n')
    clean()
    assert.deepEqual(Object.keys(r[0]), ["Column 1", "Column 2", "b"])
  })
  it("stops after the row limit", () => {
    const text = "n\n" + Array.from({ length: MAX_ROWS + 100 }, (_, i) => String(i)).join("\n")
    assert.equal(parseCsv(text).length, MAX_ROWS)
  })
  it("refuses oversize text", () => assert.throws(() => parseCsv("x".repeat(MAX_FILE_BYTES + 1)), /limit/))
})

describe("JSON uploads", () => {
  it("accepts a list or { data: [...] }", () => {
    assert.deepEqual(parseJson('[{"a":1}]'), [{ a: 1 }])
    assert.deepEqual(parseJson('{"data":[{"a":1}]}'), [{ a: 1 }])
  })
  it("neutralises a __proto__ key", () => {
    const r = parseJson('[{"__proto__":{"polluted":1},"a":1}]')
    clean()
    assert.deepEqual(Object.keys(r[0]), ["Column 1", "a"])
    assert.equal(Object.getPrototypeOf(r[0]), Object.prototype)
  })
  it("rejects non-lists", () => assert.throws(() => parseJson('{"a":1}')))
})
