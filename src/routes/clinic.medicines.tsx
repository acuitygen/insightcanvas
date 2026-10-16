import { createFileRoute } from "@tanstack/react-router"
import { MedicineShelf } from "@/components/insight/clinic-ui"

export const Route = createFileRoute("/clinic/medicines")({ component: MedicineShelf })
