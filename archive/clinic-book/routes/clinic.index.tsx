import { createFileRoute } from "@tanstack/react-router"
import { ClinicBoard } from "@/components/insight/clinic-ui"

export const Route = createFileRoute("/clinic/")({ component: ClinicBoard })
