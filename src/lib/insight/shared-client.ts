import { listSharedReports, removeSharedReport, removeSharedTile, saveSharedReport } from "@/lib/insight/shared-reports"
import { useInsight } from "@/lib/insight/store"
import type { Tile } from "@/lib/insight/table-visual"

export async function refreshSharedReports() {
  const result = await listSharedReports({ data: {} })
  if (result.ok) useInsight.getState().setReports(result.reports)
  return result
}

export async function publishReport(input: { id?: string; title: string; audience: string; tiles?: Tile[] }) {
  const result = await saveSharedReport({ data: { ...input } })
  if (result.ok) await refreshSharedReports()
  return result
}

export async function dropReport(id: string) {
  const result = await removeSharedReport({ data: { id } })
  if (result.ok) await refreshSharedReports()
  return result
}

export async function dropTile(reportId: string, tileId: string) {
  const result = await removeSharedTile({ data: { reportId, tileId } })
  if (result.ok) await refreshSharedReports()
  return result
}
