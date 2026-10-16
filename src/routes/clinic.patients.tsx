import { createFileRoute } from "@tanstack/react-router"
import { PatientBrowser } from "@/components/insight/clinic-ui"

export const Route = createFileRoute("/clinic/patients")({ component: PatientBrowser })
