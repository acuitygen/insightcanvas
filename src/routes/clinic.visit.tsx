import { createFileRoute } from "@tanstack/react-router"
import { VisitDesk } from "@/components/insight/clinic-ui"

type VisitSearch = { patient?: string }

export const Route = createFileRoute("/clinic/visit")({
  validateSearch: (search: Record<string, unknown>): VisitSearch => ({
    patient: typeof search.patient === "string" ? search.patient : undefined,
  }),
  component: VisitRoute,
})

function VisitRoute() {
  const { patient } = Route.useSearch()
  return <VisitDesk patientId={patient} />
}
