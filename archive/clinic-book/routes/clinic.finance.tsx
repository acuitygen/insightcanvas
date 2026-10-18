import { createFileRoute } from "@tanstack/react-router"
import { FinanceBoard } from "@/components/insight/clinic-ui"

export const Route = createFileRoute("/clinic/finance")({ component: FinanceBoard })
