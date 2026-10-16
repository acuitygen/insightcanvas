import { createFileRoute } from "@tanstack/react-router"
import { Shell } from "@/components/insight/shell"
import { Studio } from "@/components/insight/studio"

export const Route = createFileRoute("/")({ component: Home })

function Home() {
  return (
    <Shell>
      <Studio />
    </Shell>
  )
}
