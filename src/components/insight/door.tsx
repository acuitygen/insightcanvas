import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { accessCount, claimFirstAdmin, getMe, requestLoginCode, saveName, signOut, verifyLoginCode, type Me } from "@/lib/insight/access"

// Display cache only. The server decides who you are from the httpOnly session cookie.
let me: Me | null = null

export function currentVisitor(): Me | null {
  return me
}

export async function signOutVisitor() {
  await signOut()
  me = null
  window.location.reload()
}

function Frame({ title, body, children, onSubmit }: { title: string; body: string; children: ReactNode; onSubmit: (event: FormEvent) => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-8 text-ink">
      <form className="grid w-full max-w-md gap-4 rounded-[1.75rem] bg-paper p-6 shadow-shell md:p-8" onSubmit={onSubmit}>
        <div className="flex items-center gap-3">
          <img src="/logo.png?v=3" alt="" width={256} height={256} className="size-12 object-contain" />
          <div>
            <p className="text-lg font-bold leading-none tracking-tight">InsightCanvas</p>
            <p className="text-sm text-muted">Clinics and small firms</p>
          </div>
        </div>
        <div>
          <h1 className="text-3xl tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted">{body}</p>
        </div>
        {children}
      </form>
    </div>
  )
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "That did not work. Try again."
}

export function RequireAccess({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<"checking" | "setup" | "email" | "code" | "name" | "in">("checking")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [note, setNote] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  function enter(next: Me) {
    me = next
    setPhase(next.firstName && next.lastName ? "in" : "name")
  }

  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        const current = await getMe()
        if (cancel) return
        if (current) return enter(current)
        const status = await accessCount()
        if (cancel) return
        setPhase(status.needsSetup ? "setup" : "email")
      } catch {
        if (!cancel) setPhase("email")
      }
    })()
    return () => {
      cancel = true
    }
  }, [])

  async function run(task: () => Promise<void>) {
    setPending(true)
    setError("")
    try {
      await task()
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setPending(false)
    }
  }

  const claim = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await claimFirstAdmin({ data: { email } })
      await sendCode()
    })
  }

  async function sendCode() {
    const result = await requestLoginCode({ data: { email } })
    if (!result.ok) throw new Error(result.message)
    setNote(result.message)
    setCode("")
    setPhase("code")
  }

  const ask = (event: FormEvent) => {
    event.preventDefault()
    void run(sendCode)
  }

  const verify = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const result = await verifyLoginCode({ data: { email, code } })
      if (!result.ok || !result.me) throw new Error(result.ok ? "Sign-in failed. Ask for a new code." : result.message)
      enter(result.me)
    })
  }

  const save = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const saved = await saveName({ data: { firstName, lastName } })
      if (me) me = { ...me, firstName: saved.firstName, lastName: saved.lastName }
      setPhase("in")
    })
  }

  if (phase === "checking") {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas px-4 text-ink">
        <p className="text-sm font-semibold text-muted">Checking this link…</p>
      </div>
    )
  }

  if (phase === "in") return <>{children}</>

  if (phase === "setup") {
    return (
      <Frame
        title="Set up the first admin"
        body="This copy of InsightCanvas has no one on its list yet. Enter your email to become the first admin. We'll email you a 6-digit code to sign in, and you can add other people afterwards."
        onSubmit={claim}
      >
        <label className="grid gap-1 text-sm font-semibold" htmlFor="allow-email">
          Email
          <input id="allow-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-11 rounded-full border border-line bg-canvas px-4 font-normal" />
        </label>
        {error ? <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p> : null}
        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-60">
          {pending ? "Saving…" : "Become admin and send code"}
        </button>
      </Frame>
    )
  }

  if (phase === "code") {
    return (
      <Frame title="Enter your code" body={note || "Check your email for a 6-digit code."} onSubmit={verify}>
        <label className="grid gap-1 text-sm font-semibold" htmlFor="code">
          6-digit code
          <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required value={code} onChange={(event) => setCode(event.target.value)} className="min-h-11 rounded-full border border-line bg-canvas px-4 font-normal" />
        </label>
        {error ? <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p> : null}
        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-60">
          {pending ? "Checking…" : "Sign in"}
        </button>
        <button type="button" className="min-h-11 text-sm font-semibold" onClick={() => void run(sendCode)} disabled={pending}>
          Send a new code
        </button>
        <button type="button" className="min-h-11 text-sm font-semibold" onClick={() => setPhase("email")}>
          Use a different email
        </button>
      </Frame>
    )
  }

  if (phase === "name") {
    return (
      <Frame title="Your name" body={`Signed in as ${me?.email ?? email}. Add the name others will see.`} onSubmit={save}>
        <label className="grid gap-1 text-sm font-semibold" htmlFor="first-name">
          First name
          <input id="first-name" autoComplete="given-name" required value={firstName} onChange={(event) => setFirstName(event.target.value)} className="min-h-11 rounded-full border border-line bg-canvas px-4 font-normal" />
        </label>
        <label className="grid gap-1 text-sm font-semibold" htmlFor="last-name">
          Last name
          <input id="last-name" autoComplete="family-name" required value={lastName} onChange={(event) => setLastName(event.target.value)} className="min-h-11 rounded-full border border-line bg-canvas px-4 font-normal" />
        </label>
        {error ? <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p> : null}
        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-60">
          {pending ? "Saving…" : "Continue"}
        </button>
      </Frame>
    )
  }

  return (
    <Frame
      title="Sign in"
      body="Enter the email address this link was shared with. If it's on the list, we'll email you a 6-digit code."
      onSubmit={ask}
    >
      <label className="grid gap-1 text-sm font-semibold" htmlFor="email">
        Email
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-11 rounded-full border border-line bg-canvas px-4 font-normal" />
      </label>
      {error ? <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p> : null}
      <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-60">
        {pending ? "Sending…" : "Email me a code"}
      </button>
    </Frame>
  )
}
