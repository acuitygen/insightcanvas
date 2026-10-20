import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"

// Server functions must take identity from the session cookie, never from a client-sent email.
describe("server functions don't trust client-sent identity", () => {
  const dir = "src/lib/insight"
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const text = readFileSync(`${dir}/${file}`, "utf8")
    if (!text.includes("createServerFn")) continue
    it(file, () => {
      assert.doesNotMatch(text, /\b(input|data)\.by\b/)
      assert.doesNotMatch(text, /\bby: string\b/)
    })
  }
  it("access.ts guards list reads and edits", () => {
    const text = readFileSync(`${dir}/access.ts`, "utf8")
    const block = (name: string) => text.slice(text.indexOf(`export const ${name}`), text.indexOf("export const", text.indexOf(`export const ${name}`) + 10))
    assert.match(block("listAllowed"), /requireUser\(\)/)
    assert.match(block("addAllowed"), /requireAdmin\(\)/)
    assert.match(block("removeAllowed"), /requireAdmin\(\)/)
    assert.match(block("saveName"), /requireUser\(\)/)
  })
})
