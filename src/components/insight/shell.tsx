import { Link, useRouterState } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { RequireAccess } from "./door"

const LINKS = [
  { to: "/", label: "Ask" },
  { to: "/reports", label: "Reports" },
  { to: "/sources", label: "Sources" },
  { to: "/model", label: "Model" },
  { to: "/audit", label: "Audit" },
  { to: "/help", label: "Help" },
] as const

export function Mark({ className = "size-12" }: { className?: string }) {
  return <img src="/logo.png?v=3" alt="" width={256} height={256} className={`${className} object-contain`} />
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <RequireAccess>
      <ShellFrame>{children}</ShellFrame>
    </RequireAccess>
  )
}

function ShellFrame({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return (
    <div className="min-h-screen bg-canvas px-3 py-3 text-ink md:px-6 md:py-8">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:rounded-full focus:bg-paper focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="mx-auto max-w-6xl rounded-[1.75rem] bg-paper shadow-shell">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 md:px-6">
          <Link to="/" className="flex min-h-11 items-center gap-3">
            <Mark />
            <span>
              <span className="block text-lg font-bold leading-none tracking-tight">InsightCanvas</span>
              <span className="text-sm text-muted">Clinics and small firms</span>
            </span>
          </Link>
          <nav aria-label="Primary" className="flex max-w-full gap-1 overflow-x-auto">
            {LINKS.map((link) => {
              const active = link.to === "/" ? pathname === "/" : pathname.startsWith(link.to)
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={active ? "page" : undefined}
                  className={
                    "inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold " +
                    (active ? "bg-ink text-paper" : "text-ink")
                  }
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>
            <p className="ml-auto hidden items-center gap-2 rounded-full bg-sage px-3 py-2 text-sm font-semibold sm:flex">
              <span className="size-2 rounded-full bg-teal" aria-hidden="true" />
              Read-only extract
            </p>
        </header>
        <main id="content" className="px-4 pb-6 md:px-6 md:pb-8">
          {children}
        </main>
      </div>
    </div>
  )
}
