import { createFileRoute } from "@tanstack/react-router"
import { AuditScreen } from "@/components/insight/audit-screen"
import { Shell } from "@/components/insight/shell"

export const Route = createFileRoute("/audit")({ component: AuditPage })

function AuditPage() {
  return (
    <Shell>
      <AuditScreen />
    </Shell>
  )
}
