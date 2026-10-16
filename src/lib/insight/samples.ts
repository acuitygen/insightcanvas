import { sheetFromRecords } from "./sheets"

const days = ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]

export function clinicSheet() {
  const clinicians = ["Dr Mehta", "Dr Iyer", "Nurse Kaur"]
  const visits = ["Consult", "Follow-up", "Procedure"]
  const statuses = ["Kept", "Kept", "Kept", "No-show", "Cancelled"]
  const records = days.flatMap((day, dayIndex) =>
    clinicians.map((clinician, index) => ({
      Day: day,
      Clinician: clinician,
      Visit: visits[(dayIndex + index) % visits.length],
      Status: statuses[(dayIndex + index) % statuses.length],
      Minutes: 15 + ((dayIndex + index) % 4) * 15,
      Fee: statuses[(dayIndex + index) % statuses.length] === "Kept" ? 800 + index * 450 : 0,
    })),
  )
  const sheet = sheetFromRecords("Clinic day book", "sample", records)
  sheet.id = "sample-clinic"
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
