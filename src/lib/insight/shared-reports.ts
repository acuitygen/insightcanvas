import { createServerFn } from "@tanstack/react-start"
import type { Tile } from "./table-visual"

type ReportRow = { id: string; title: string; audience: string; updated_at: string | Date }
type TileRow = {
  id: string
  report_id: string
  title: string
  summary: string
  source: string
  visual: string
  chart: string
  columns: string
  position: number
}

function cleanEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Confirm your email first.")
  return email
}

function cleanText(value: unknown, label: string, max = 160) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ")
  if (!text || text.length > max) throw new Error(`Enter a ${label}.`)
  return text
}

async function db() {
  const { getSql } = await import("@/lib/db")
  return getSql()
}

async function assertAllowed(email: string) {
  const sql = await db()
  const rows = await sql<{ email: string }>`select email from allowed_email where email = ${email}`
  if (!rows.length) return "That email is not on the list for this link."
  return null
}

function asReport(row: ReportRow, tiles: Tile[]) {
  const updated = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at)
  return { id: row.id, title: row.title, audience: row.audience, updatedAt: updated, tiles }
}

function parseTile(row: TileRow): Tile {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    source: row.source,
    visual: row.visual as Tile["visual"],
    chart: JSON.parse(row.chart) as Tile["chart"],
    columns: JSON.parse(row.columns) as Tile["columns"],
  }
}

export const listSharedReports = createServerFn({ method: "POST" })
  .validator((input: { by: string }) => ({ by: cleanEmail(input.by) }))
  .handler(async ({ data }) => {
    const denied = await assertAllowed(data.by)
    if (denied) return { ok: false as const, message: denied, reports: [] }
    const sql = await db()
    const pages = await sql<ReportRow>`select id, title, audience, updated_at from report_page order by updated_at desc`
    const tiles = await sql<TileRow>`select id, report_id, title, summary, source, visual, chart, columns, position from report_tile order by position`
    const reports = pages.map((page) => asReport(page, tiles.filter((tile) => tile.report_id === page.id).map(parseTile)))
    return { ok: true as const, message: "", reports }
  })

export const saveSharedReport = createServerFn({ method: "POST" })
  .validator((input: { by: string; id?: string; title: string; audience: string; tiles?: Tile[] }) => ({
    by: cleanEmail(input.by),
    id: String(input.id ?? "").trim() || crypto.randomUUID(),
    title: cleanText(input.title, "report name"),
    audience: cleanText(input.audience, "audience", 40),
    tiles: (input.tiles ?? []).slice(0, 8),
  }))
  .handler(async ({ data }) => {
    const denied = await assertAllowed(data.by)
    if (denied) return { ok: false as const, message: denied, id: "" }
    const sql = await db()
    await sql`
      insert into report_page (id, title, audience)
      values (${data.id}, ${data.title}, ${data.audience})
      on conflict (id) do update set title = excluded.title, audience = excluded.audience, updated_at = now()
    `
    if (data.tiles.length) {
      const existing = await sql<{ count: number }>`select count(*)::int as count from report_tile where report_id = ${data.id}`
      let position = existing[0]?.count ?? 0
      for (const tile of data.tiles) {
        if (position >= 8) break
        const id = tile.id || crypto.randomUUID()
        await sql`
          insert into report_tile (id, report_id, title, summary, source, visual, chart, columns, position)
          values (
            ${id},
            ${data.id},
            ${cleanText(tile.title, "title")},
            ${cleanText(tile.summary, "summary", 400)},
            ${cleanText(tile.source, "source")},
            ${tile.visual},
            ${JSON.stringify(tile.chart)},
            ${JSON.stringify(tile.columns)},
            ${position}
          )
          on conflict (id) do nothing
        `
        position += 1
      }
    }
    await sql`update report_page set updated_at = now() where id = ${data.id}`
    return { ok: true as const, message: "", id: data.id }
  })

export const removeSharedTile = createServerFn({ method: "POST" })
  .validator((input: { by: string; reportId: string; tileId: string }) => ({
    by: cleanEmail(input.by),
    reportId: cleanText(input.reportId, "report", 80),
    tileId: cleanText(input.tileId, "visual", 80),
  }))
  .handler(async ({ data }) => {
    const denied = await assertAllowed(data.by)
    if (denied) return { ok: false as const, message: denied }
    const sql = await db()
    await sql`delete from report_tile where id = ${data.tileId} and report_id = ${data.reportId}`
    return { ok: true as const, message: "" }
  })

export const removeSharedReport = createServerFn({ method: "POST" })
  .validator((input: { by: string; id: string }) => ({
    by: cleanEmail(input.by),
    id: cleanText(input.id, "report", 80),
  }))
  .handler(async ({ data }) => {
    const denied = await assertAllowed(data.by)
    if (denied) return { ok: false as const, message: denied }
    const sql = await db()
    await sql`delete from report_tile where report_id = ${data.id}`
    await sql`delete from report_page where id = ${data.id}`
    return { ok: true as const, message: "" }
  })
