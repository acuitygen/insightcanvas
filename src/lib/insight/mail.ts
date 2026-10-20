import { createServerFn } from "@tanstack/react-start"
import { classifyCallToolError } from "@/lib/app-data/errors"
import { ConnectorType } from "@/lib/app-data/types"

export type MailMessage = { id: string; from: string; subject: string; date: string }

const TOOLS = {
  Gmail: ["gmail_search", "gmail_search_messages"],
  Outlook: ["outlook_search", "outlook_search_mail"],
} as const

function textOf(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value)
}

function asMessages(data: unknown): MailMessage[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? ((data as { messages?: unknown; emails?: unknown; items?: unknown }).messages ??
        (data as { emails?: unknown }).emails ??
        (data as { items?: unknown }).items ??
        [])
      : []
  if (!Array.isArray(list)) return []
  return list.slice(0, 30).map((item, index) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
    const from = row.from ?? row.sender ?? row.fromEmail ?? ""
    return {
      id: textOf(row.id ?? row.messageId ?? index),
      from: typeof from === "object" && from ? textOf((from as { email?: unknown }).email ?? (from as { name?: unknown }).name) : textOf(from),
      subject: textOf(row.subject ?? row.title ?? "(no subject)"),
      date: textOf(row.date ?? row.internalDate ?? row.receivedDateTime ?? "").slice(0, 16),
    }
  })
}

export const searchMail = createServerFn({ method: "POST" })
  .validator((input: { mailbox: "Gmail" | "Outlook"; query: string }) => ({
    mailbox: input.mailbox === "Outlook" ? "Outlook" : "Gmail",
    query: String(input.query ?? "").trim().slice(0, 300) || "newer_than:7d",
  }))
  .handler(async ({ data }) => {
    const { currentUser } = await import("./auth/session.server")
    if (!(await currentUser())) return { ok: false as const, message: "Sign in first.", loginUrl: "", messages: [] as MailMessage[] }
    const { callTool } = await import("@/lib/app-data/client.server")
    const mailbox = data.mailbox === "Outlook" ? "Outlook" : "Gmail"
    const connectorType = mailbox === "Outlook" ? ConnectorType.Outlook : ConnectorType.Gmail
    let last = null as Awaited<ReturnType<typeof callTool>> | null
    for (const toolName of TOOLS[mailbox]) {
      const result = await callTool(toolName, { q: data.query, query: data.query, maxResults: 30 }, { connectorType })
      last = result
      if (result.ok) {
        const messages = asMessages(result.data)
        return {
          ok: true as const,
          message: messages.length ? `${messages.length} messages.` : "The mailbox answered, and there were no matching messages.",
          loginUrl: "",
          messages,
        }
      }
      const raw = (result.errorMessage ?? "").toLowerCase()
      if (!raw.includes("unknown") && !raw.includes("not found") && !raw.includes("not_found")) break
    }
    const classified = last ? classifyCallToolError(last) : null
    return {
      ok: false as const,
      message: classified?.message ?? "The mailbox is not connected.",
      loginUrl: last?.loginUrl ?? "",
      messages: [] as MailMessage[],
    }
  })
