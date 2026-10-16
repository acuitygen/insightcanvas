import { CHANNELS, PRODUCTS, REGIONS, type Product } from "./catalog"
import { AS_OF, EXTRACT_START } from "./types"
import { addDays } from "./time"

export type Line = {
  orderId: string
  orderDate: string
  shipDate: string
  productId: string
  regionId: string
  channelId: string
  units: number
  revenueCents: number
  costCents: number
}

export type ReturnRow = {
  returnId: string
  orderId: string
  returnDate: string
  amountCents: number
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T extends { weight: number }>(rand: () => number, items: T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  let cursor = rand() * total
  for (const item of items) {
    cursor -= item.weight
    if (cursor <= 0) return item
  }
  return items[items.length - 1]
}

const SEASON = [0.7, 0.74, 0.86, 1.02, 1.28, 1.46, 1.5, 1.34, 1.02, 0.9, 0.76, 0.72]

function build() {
  const rand = mulberry32(0x1c0a5e)
  const lines: Line[] = []
  const returns: ReturnRow[] = []
  let orderSeq = 1
  let returnSeq = 1
  let cursor = EXTRACT_START
  while (cursor <= AS_OF) {
    const year = Number(cursor.slice(0, 4))
    const month = Number(cursor.slice(5, 7))
    const dow = new Date(`${cursor}T00:00:00Z`).getUTCDay()
    const weekend = dow === 0 || dow === 6
    const growth = year === 2024 ? 0.78 : year === 2025 ? 0.94 : 1.08
    const dip = cursor.startsWith("2025-09") ? 0.8 : 1
    const orders = Math.max(2, Math.round((weekend ? 4 : 6) * SEASON[month - 1] * growth * dip))
    for (let i = 0; i < orders; i++) {
      const channel = pick(rand, CHANNELS)
      const region = pick(rand, REGIONS)
      const lineCount = 1 + (rand() < 0.32 ? 1 : 0) + (rand() < 0.06 ? 1 : 0)
      const orderId = `o${orderSeq++}`
      let orderRevenue = 0
      for (let n = 0; n < lineCount; n++) {
        const product = pick(rand, PRODUCTS) as Product
        const wholesale = channel.id === "wholesale"
        const units = wholesale ? 4 + Math.floor(rand() * 10) : 1 + Math.floor(rand() * 3)
        const jitter = 0.92 + rand() * 0.16
        const revenueCents = Math.round(units * product.price * 100 * jitter)
        const channelFactor = wholesale ? 1.25 : channel.id === "web" ? 0.95 : 1
        const costCents = Math.round(revenueCents * (1 - product.margin) * channelFactor)
        const shipDate = addDays(cursor, 1 + Math.floor(rand() * 5))
        lines.push({
          orderId,
          orderDate: cursor,
          shipDate,
          productId: product.id,
          regionId: region.id,
          channelId: channel.id,
          units,
          revenueCents,
          costCents,
        })
        orderRevenue += revenueCents
      }
      if (rand() < 0.045) {
        const returnDate = addDays(cursor, 8 + Math.floor(rand() * 16))
        if (returnDate <= AS_OF) {
          returns.push({
            returnId: `r${returnSeq++}`,
            orderId,
            returnDate,
            amountCents: Math.round(orderRevenue * (0.25 + rand() * 0.7)),
          })
        }
      }
    }
    cursor = addDays(cursor, 1)
  }
  const orders = new Set(lines.map((line) => line.orderId)).size
  return { lines, returns, orders }
}

const built = build()

export const LINES: Line[] = built.lines
export const RETURNS: ReturnRow[] = built.returns
export const DATA_STATS = {
  lines: built.lines.length,
  orders: built.orders,
  returns: built.returns.length,
  from: EXTRACT_START,
  to: AS_OF,
}
