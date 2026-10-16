import { createFileRoute } from "@tanstack/react-router"
import { RequireAccess } from "@/components/insight/door"
import { EmbedScreen } from "@/components/insight/embed-screen"

export const Route = createFileRoute("/embed/$id")({ component: EmbedPage })

function EmbedPage() {
  const { id } = Route.useParams()
  return (
    <RequireAccess>
      <div className="min-h-screen bg-canvas text-ink">
        <EmbedScreen id={id} />
      </div>
    </RequireAccess>
  )
}
