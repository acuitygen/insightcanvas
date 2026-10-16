import { useEffect, useState } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { FormulaId, QueryResult, VisualFamily } from "./types"
import type { Sheet } from "./sheets"
import type { Tile } from "./table-visual"

export type SavedVisual = {
  id: string
  question: string
  title: string
  summary: string
  notes: string[]
  logic: string[]
  sql: string
  planHash: string
  columns: QueryResult["columns"]
  rows: QueryResult["rows"]
  chart: QueryResult["chart"]
  visual: VisualFamily
  createdAt: string
  expiresAt: string
  revoked: boolean
}

export type AuditEntry = {
  id: string
  at: string
  question: string
  status: "executed" | "clarified" | "blocked" | "validated" | "rejected"
  summary: string
  sql?: string
  rows?: number
  planHash?: string
}

export type ReportPage = {
  id: string
  title: string
  audience: string
  tiles: Tile[]
  updatedAt: string
}

type InsightState = {
  returnsConfirmed: boolean
  certifiedFormulas: FormulaId[]
  drafted: FormulaId[]
  saved: SavedVisual[]
  audit: AuditEntry[]
  reports: ReportPage[]
  sheets: Sheet[]
  setReturnsConfirmed: (value: boolean) => void
  draftFormula: (id: FormulaId) => void
  setCertified: (id: FormulaId, value: boolean) => void
  saveVisual: (visual: SavedVisual) => void
  revokeVisual: (id: string) => void
  log: (entry: AuditEntry) => void
  clearAudit: () => void
  createReport: (title: string, audience: string, tiles?: Tile[]) => string
  addTile: (reportId: string, tile: Tile) => void
  removeTile: (reportId: string, tileId: string) => void
  removeReport: (reportId: string) => void
  addSheet: (sheet: Sheet) => void
  removeSheet: (id: string) => void
  setReports: (reports: ReportPage[]) => void
}

export const useInsight = create<InsightState>()(
  persist(
    (set, get) => ({
      returnsConfirmed: false,
      certifiedFormulas: [],
      drafted: [],
      saved: [],
      audit: [],
      reports: [],
      sheets: [],
      setReturnsConfirmed: (value) => set({ returnsConfirmed: value }),
      draftFormula: (id) =>
        set({ drafted: get().drafted.includes(id) ? get().drafted : [...get().drafted, id] }),
      setCertified: (id, value) => {
        const drafted = get().drafted.includes(id) ? get().drafted : [...get().drafted, id]
        const certifiedFormulas = value
          ? [...new Set([...get().certifiedFormulas, id])]
          : get().certifiedFormulas.filter((item) => item !== id)
        set({ drafted, certifiedFormulas })
      },
      saveVisual: (visual) => set({ saved: [visual, ...get().saved.filter((item) => item.id !== visual.id)].slice(0, 12) }),
      revokeVisual: (id) =>
        set({ saved: get().saved.map((item) => (item.id === id ? { ...item, revoked: true } : item)) }),
      log: (entry) => set({ audit: [entry, ...get().audit].slice(0, 80) }),
      clearAudit: () => set({ audit: [] }),
      createReport: (title, audience, tiles = []) => {
        const id = crypto.randomUUID()
        const report: ReportPage = { id, title, audience, tiles, updatedAt: new Date().toISOString() }
        set({ reports: [report, ...get().reports].slice(0, 12) })
        return id
      },
      addTile: (reportId, tile) =>
        set({
          reports: get().reports.map((report) =>
            report.id === reportId
              ? { ...report, tiles: [...report.tiles, tile].slice(0, 8), updatedAt: new Date().toISOString() }
              : report,
          ),
        }),
      removeTile: (reportId, tileId) =>
        set({
          reports: get().reports.map((report) =>
            report.id === reportId ? { ...report, tiles: report.tiles.filter((tile) => tile.id !== tileId) } : report,
          ),
        }),
      removeReport: (reportId) => set({ reports: get().reports.filter((report) => report.id !== reportId) }),
      addSheet: (sheet) => set({ sheets: [sheet, ...get().sheets.filter((item) => item.id !== sheet.id)].slice(0, 6) }),
      removeSheet: (id) => set({ sheets: get().sheets.filter((sheet) => sheet.id !== id) }),
      setReports: (reports) => set({ reports }),
    }),
    { name: "insightcanvas-v1", skipHydration: true },
  ),
)

export function useInsightReady() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    const pending = useInsight.persist.rehydrate()
    void Promise.resolve(pending).then(() => {
      if (live) setReady(true)
    })
    return () => {
      live = false
    }
  }, [])
  return ready
}
