import { createFileRoute } from "@tanstack/react-router"
import { HelpScreen } from "@/components/insight/help-screen"
import { Shell } from "@/components/insight/shell"

export const Route = createFileRoute("/help")({ component: HelpPage })

function HelpPage() {
  return (
    <Shell>
      <HelpScreen />
    </Shell>
  )
}
