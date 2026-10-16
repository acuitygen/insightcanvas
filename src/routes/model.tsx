import { createFileRoute } from "@tanstack/react-router"
import { ModelScreen } from "@/components/insight/model-screen"
import { Shell } from "@/components/insight/shell"

export const Route = createFileRoute("/model")({ component: ModelPage })

function ModelPage() {
  return (
    <Shell>
      <ModelScreen />
    </Shell>
  )
}
