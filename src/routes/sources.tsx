import { createFileRoute } from "@tanstack/react-router"
import { SourcesScreen } from "@/components/insight/sources-screen"
import { Shell } from "@/components/insight/shell"

export const Route = createFileRoute("/sources")({ component: SourcesPage })

function SourcesPage() {
  return (
    <Shell>
      <SourcesScreen />
    </Shell>
  )
}
