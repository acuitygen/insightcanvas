import { createFileRoute } from "@tanstack/react-router"
import { ReportCanvas } from "@/components/insight/report-screen"

export const Route = createFileRoute("/reports/$id")({ component: ReportPage })

function ReportPage() {
  const { id } = Route.useParams()
  return <ReportCanvas id={id} />
}
