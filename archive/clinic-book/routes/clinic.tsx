import { createFileRoute, Outlet } from "@tanstack/react-router"
import { Shell } from "@/components/insight/shell"

export const Route = createFileRoute("/clinic")({ component: ClinicLayout })

function ClinicLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  )
}
