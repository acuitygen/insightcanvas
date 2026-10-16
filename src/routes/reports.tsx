import { createFileRoute, Outlet } from "@tanstack/react-router"
import { Shell } from "@/components/insight/shell"

export const Route = createFileRoute("/reports")({ component: ReportsLayout })

function ReportsLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  )
}
