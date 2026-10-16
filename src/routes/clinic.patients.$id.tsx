import { createFileRoute } from "@tanstack/react-router"
import { PatientFile } from "@/components/insight/clinic-ui"

export const Route = createFileRoute("/clinic/patients/$id")({ component: PatientRoute })

function PatientRoute() {
  const { id } = Route.useParams()
  return <PatientFile id={id} />
}
