import { currentVisitor } from "@/components/insight/door"
import { listSharedReports, removeSharedReport, removeSharedTile, saveSharedReport } from "@/lib/insight/shared-reports"
import { useInsight } from "@/lib/insight/store"
import type { Tile } from "@/lib/insight/table-visual"

export async function refreshSharedReports() {
  const by = currentVisitor()?.email ?? ""
  if (!by) return { ok: false as const, message: "Confirm your email first.", reports: [] }
  const result = await listSharedReports({ data: { by } })
  if (result.ok) useInsight.getState().setReports(result.reports)
  return result
}

export async function publishReport(input: { id?: string; title: string; audience: string; tiles?: Tile[] }) {
  const by = currentVisitor()?.email ?? ""
  const result = await saveSharedReport({ data: { by, ...input } })
  if (result.ok) await refreshSharedReports()
  return result
}

export async function dropReport(id: string) {
  const by = currentVisitor()?.email ?? ""
  const result = await removeSharedReport({ data: { by, id } })
  if (result.ok) await refreshSharedReports()
  return result
}

export async function dropTile(reportId: string, tileId: string) {
  const by = currentVisitor()?.email ?? ""
  const result = await removeSharedTile({ data: { by, reportId, tileId } })
  if (result.ok) await refreshSharedReports()
  return result
}
