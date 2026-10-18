import { createFileRoute } from "@tanstack/react-router"
import { VisitPreview } from "@/components/insight/clinic-ui"

export const Route = createFileRoute("/clinic/preview/$id")({ component: PreviewRoute })

function PreviewRoute() {
  const { id } = Route.useParams()
  return <VisitPreview id={id} />
}
