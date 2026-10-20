import type { MailSender } from "./core"

/**
 * Picks how sign-in codes are emailed:
 * - RESEND_API_KEY set  -> Resend HTTP API
 * - SMTP_URL set        -> SMTP (e.g. smtps://user:pass@smtp.example.com:465)
 * - neither, not production -> prints the code to the server console (local development only)
 * - neither, production -> refuses to send (sign-in won't work until one is set)
 * INSIGHT_MAIL_FROM is the sender address for Resend and SMTP.
 */
export type MailEnv = Record<string, string | undefined>

export function pickSender(env: MailEnv = process.env): { kind: "resend" | "smtp" | "console" | "none"; send: MailSender } {
  const from = env.INSIGHT_MAIL_FROM?.trim() || ""
  if (env.RESEND_API_KEY?.trim()) {
    const key = env.RESEND_API_KEY.trim()
    return {
      kind: "resend",
      send: async ({ to, subject, text }) => {
        if (!from) throw new Error("INSIGHT_MAIL_FROM is not set.")
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [to], subject, text }),
        })
        if (!res.ok) throw new Error(`Resend returned ${res.status}`)
      },
    }
  }
  if (env.SMTP_URL?.trim()) {
    const url = env.SMTP_URL.trim()
    return {
      kind: "smtp",
      send: async ({ to, subject, text }) => {
        if (!from) throw new Error("INSIGHT_MAIL_FROM is not set.")
        const nodemailer = await import("nodemailer")
        const transport = nodemailer.createTransport(url)
        await transport.sendMail({ from, to, subject, text })
      },
    }
  }
  if (env.NODE_ENV !== "production") {
    return {
      kind: "console",
      send: async ({ to, subject }) => {
        console.log(`[auth] dev mail to ${to}: ${subject}`)
      },
    }
  }
  return {
    kind: "none",
    send: async () => {
      throw new Error("No mail sender configured. Set RESEND_API_KEY or SMTP_URL, and INSIGHT_MAIL_FROM.")
    },
  }
}
