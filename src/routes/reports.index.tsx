import { createFileRoute } from "@tanstack/react-router"
import { ReportsHome } from "@/components/insight/report-screen"

export const Route = createFileRoute("/reports/")({ component: ReportsHome })
