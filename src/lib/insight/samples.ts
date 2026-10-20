import { sheetFromRecords } from "./sheets"

const days = ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]

/** Fictional sales log: made-up reps, regions and products for demos and tests. */
export function salesSheet() {
  const reps = ["Rep Alpha", "Rep Bravo", "Rep Charlie"]
  const products = ["Widget", "Gadget", "Service plan"]
  const stages = ["Won", "Won", "Won", "Lost", "Pending"]
  const records = days.flatMap((day, dayIndex) =>
    reps.map((rep, index) => ({
      Day: day,
      Rep: rep,
      Region: ["North", "South", "West"][index],
      Product: products[(dayIndex + index) % products.length],
      Stage: stages[(dayIndex + index) % stages.length],
      Units: 1 + ((dayIndex + index) % 4),
      Revenue: stages[(dayIndex + index) % stages.length] === "Won" ? (1 + ((dayIndex + index) % 4)) * 1200 : 0,
    })),
  )
  const sheet = sheetFromRecords("Sample sales log (fictional)", "sample", records)
  sheet.id = "sample-sales"
  return sheet
}

export function practiceSheet() {
  const lawyers = ["A. Shah", "R. Bose", "N. Kapoor"]
  const matters = ["Contract", "Filing", "Hearing", "Advice"]
  const statuses = ["Open", "Open", "Waiting", "Closed"]
  const records = days.flatMap((day, dayIndex) =>
    lawyers.map((lawyer, index) => ({
      Day: day,
      Lawyer: lawyer,
      Matter: matters[(dayIndex + index) % matters.length],
      Status: statuses[(dayIndex + index) % statuses.length],
      Hours: 1 + ((dayIndex + index) % 5),
      Billed: (1 + ((dayIndex + index) % 5)) * 3500,
    })),
  )
  const sheet = sheetFromRecords("Practice matter log", "sample", records)
  sheet.id = "sample-practice"
  return sheet
}
