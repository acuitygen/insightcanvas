import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { accessCount, addAllowed, confirmEmail, saveName } from "@/lib/insight/access"

const STORAGE = "insightcanvas-visitor"

type Visitor = { email: string; firstName: string; lastName: string }

function readVisitor(): Visitor | null {
  try {
    const raw = localStorage.getItem(STORAGE)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Visitor
    if (!parsed.email || !parsed.firstName || !parsed.lastName) return null
    return parsed
  } catch {
    return null
  }
}

function writeVisitor(visitor: Visitor) {
  localStorage.setItem(STORAGE, JSON.stringify(visitor))
}

export function currentVisitor(): Visitor | null {
  if (typeof window === "undefined") return null
  return readVisitor()
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
  return error instanceof Error ? error.message : "That did not save. Try again."
}

export function RequireAccess({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<"checking" | "setup" | "email" | "name" | "in">("checking")
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [added, setAdded] = useState<string[]>([])

  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        const status = await accessCount()
        if (cancel) return
        if (status.count === 0) {
          setPhase("setup")
          return
        }
        const saved = readVisitor()
        if (saved) {
          const check = await confirmEmail({ data: { email: saved.email } })
          if (cancel) return
          if (check.allowed) {
            setPhase("in")
            return
          }
          localStorage.removeItem(STORAGE)
        }
        setPhase("email")
      } catch {
        if (!cancel) setPhase("email")
      }
    })()
    return () => {
      cancel = true
    }
  }, [])

  async function addFirst(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      await addAllowed({ data: { email } })
      setAdded((current) => (current.includes(email.trim().toLowerCase()) ? current : [...current, email.trim().toLowerCase()]))
      setEmail("")
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setPending(false)
    }
  }

  async function checkEmail(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      const check = await confirmEmail({ data: { email } })
      if (!check.allowed) {
        setError("That email is not on the list for this link. Ask the person who sent it to add you.")
        return
      }
      setEmail(check.email)
      setPhase("name")
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setPending(false)
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      const saved = await saveName({ data: { email, firstName, lastName } })
      writeVisitor(saved)
      setPhase("in")
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setPending(false)
    }
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
        title="Who can open this link?"
        body="Add the email addresses before you share the link. Nothing is sent to an inbox. When someone opens the link, they type that same address, then their name."
        onSubmit={(event) => void addFirst(event)}
      >
        <label className="grid gap-1 text-sm font-semibold" htmlFor="allow-email">
          Email
          <input id="allow-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-11 rounded-full border border-line bg-canvas px-4 font-normal" />
        </label>
        {error ? <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p> : null}
        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-60">
          {pending ? "Saving…" : "Add this email"}
        </button>
        {added.length ? (
          <>
            <ul className="grid gap-1 text-sm">
              {added.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <button type="button" className="min-h-11 text-sm font-semibold" onClick={() => setPhase("email")}>
              Continue
            </button>
          </>
        ) : null}
      </Frame>
    )
  }

  if (phase === "name") {
    return (
      <Frame title="Your name" body={`${email} is on the list. Add the name this preview should remember.`} onSubmit={(event) => void save(event)}>
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
      title="Confirm your email"
      body="Type the email address this link was shared with. There is no password. If it is on the list, the next screen asks for your name."
      onSubmit={(event) => void checkEmail(event)}
    >
      <label className="grid gap-1 text-sm font-semibold" htmlFor="email">
        Email
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-11 rounded-full border border-line bg-canvas px-4 font-normal" />
      </label>
      {error ? <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p> : null}
      <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-60">
        {pending ? "Checking…" : "Confirm email"}
      </button>
    </Frame>
  )
}
