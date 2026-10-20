# InsightCanvas

[![CI](https://github.com/acuitygen/insightcanvas/actions/workflows/ci.yml/badge.svg)](https://github.com/acuitygen/insightcanvas/actions/workflows/ci.yml)

**Ask a plain-English question about your sales data and get the SQL, the plan and an accessible chart, with every step shown.**

> **Status: pre-alpha prototype.** It runs and deploys, but it is **not ready for real or confidential data yet** (see Known limits). Sign-in uses emailed one-time codes. The product goals, including a local language model, SQL Server and a full SQL parser, are in [`docs/PRD.md`](docs/PRD.md). This README describes what the code does today.

## What it does today

- **Ask.** Type a question such as *"Revenue by month, fiscal year to date"* or *"Top 8 products by revenue, year to date"*. You get a chart, the data table, the plan and the SQL.
- **Asks instead of guessing.** For example, "sales" could mean revenue, units or orders, and "by date" could mean order date or ship date. In those cases it asks you to choose before compiling anything.
- **Built-in demo dataset.** Questions run against a generated retail dataset (`lumen_retail` model v3, as of 16 Oct 2026), held in memory. It covers orders, products, regions, channels and returns. Ask answers do not query your database.
- **Time intelligence.** Month, quarter and year to date; the fiscal year starts in April; prior period; same period last year; rolling calendar windows; and missing periods filled from a date spine. Partial periods are labelled, and 29 February maps to 28 February in year-over-year comparisons, with a note saying so.
- **Charts:** bar and column, line, area, pie and donut, waterfall, radar, combination and timeline, plus a data table every time.
- **Sign-in.** Only addresses on the allow-list can get in, using a 6-digit code sent by email (details below).
- **Model page.** Confirm the returns relationship, certify formulas such as average selling price, and (for admins) manage the email list.
- **Sources page.** Add CSV, Excel or JSON files. You can also run one read-only SELECT against an outside Postgres database by pasting its `postgres://` address, which is used for that query only and not saved. There is also a mail search for Gmail or Outlook, through the Grok app connector.
- **Reports.** Pin tiles to shared reports, which are saved in the app database. Export a chart as a self-contained HTML file with a strict Content-Security-Policy and no network calls.
- **Audit page.** Lists questions, SQL and outcomes. This log is kept in the browser's local storage, can be cleared by the user, and is not a server audit trail yet.

## How a question becomes a chart

There is **no language model in this build**. Every step is plain, deterministic TypeScript in `src/lib/insight/`.

1. **Resolve and plan** (`planner.ts`). Match words to the catalog of certified metrics, dimensions, filters, date roles and time phrases, and produce a typed plan. Unknown or ambiguous terms return a clarifying question, and unsupported ones are refused.
2. **Compile** (`compile.ts`). Turn the plan into Postgres-dialect SQL, with literals passed as parameters and joins taken only from the model.
3. **Validate** (`validate.ts`, `sql-scan.ts`). The same check runs on SQL that you edit.
   - The SQL is lexed (strings and comments handled the way Postgres reads them), then checked against rules:
     - one SELECT or WITH statement only
     - no writes, DDL, `INTO`, `DO`, `TABLE` shorthand or `SELECT *`
     - no quoted identifiers, escape or dollar-quoted strings
     - only approved tables (including comma-joined ones) and approved functions
     - an outer `LIMIT` no higher than 5,000 is required
   - This is a lexer plus rules, **not a full SQL parser (AST)**.
4. **Execute** (`execute.ts`). Run the plan against the in-memory demo dataset.
5. **Present.** Pick a chart type from the shape of the result, and add a text summary and the data table.

`pipeline.ts` ties the steps together, and `collectProblems()` is a built-in self-check that the tests also run.

## Sign-in

- **How it works.** You enter your email and get a **6-digit code** by email. The code is random, stored only as an HMAC (keyed with `INSIGHT_AUTH_SECRET`), valid for **10 minutes**, works **once**, and is discarded after 5 wrong guesses. Checks are constant-time.
- **Same answer either way.** The reply is identical whether or not the email is on the list, and a failed delivery is only logged on the server.
- **Rate limits** count every request, listed or not, over 15 minutes: 5 code requests per email and 20 per IP; 10 verify attempts per email and 50 per IP.
- **Session.** A successful code sets an `ic_session` cookie that is **httpOnly, SameSite=Lax, and Secure in production**. It holds a random 32-byte token, and only its SHA-256 is stored. Sessions last 7 days and end on sign-out, or when the person is removed from the list.
- **Identity comes from the session only.** Every server function (reports, outside-database queries, mail search, the list itself) works out who you are from the session cookie and never from an email the browser sends.
- **Admins and the list.** Viewing the list needs a session, and only **admins** can add or remove people. Admins can't remove themselves.
- **First admin.** The first person to open a new copy becomes the admin. Set `INSIGHT_BOOTSTRAP_EMAIL` to allow only one address to claim that. For existing databases, migration `0004_email_otp.sql` makes the earliest address on the list the admin.
- **Sending email:**
  - `RESEND_API_KEY` set: the [Resend](https://resend.com) API is used.
  - Otherwise, `SMTP_URL` set: that SMTP server is used.
  - Either way, set `INSIGHT_MAIL_FROM` as the sender address.
  - In local development with neither set, the code is printed to the server console.
  - In production with neither set, no email is sent and nobody can sign in.

## Outside Postgres queries (Sources page)

Pasted SQL is checked and run on the server (`external-sql.ts`, `external-db.ts`):

- **Checks:**
  - one SELECT or WITH statement, no semicolons, comments removed before running
  - no write or session-changing keywords, no row locks
  - blocked functions: `pg_*`, `dblink*`, `lo_*`, `set_config`, `current_setting`, the `*_to_xml` family, `xpath`, `txid_*`, `nextval` and `setval`
- **Read-only transaction:** the query runs inside `BEGIN TRANSACTION READ ONLY` with an 8-second statement timeout and is always rolled back. It's wrapped in an outer `LIMIT 200`.
- **TLS certificates are verified** for any host that isn't local. To turn checks off for a test database you control, set `INSIGHT_EXTERNAL_DB_TLS_INSECURE=true`.
- **Not done yet:**
  - It doesn't check that the database account is SELECT-only. Use a read-only role.
  - It doesn't restrict which hosts the server may connect to.

## Tech stack

TanStack Start (React 19, Vite, Nitro), Tailwind CSS 4, Recharts, zustand, and Kysely with `pg` or PGLite for the app database. Deploys on Vercel through Nitro's Vercel preset. `node:test` with `tsx` for tests.

## Deploy

The runnable app is the repository root (`package.json`, `src/`, `migrations/`). It does not need a GPU or a local language model. Questions in this build are planned by the app itself.

You need Node.js 22 or newer (`engines` in `package.json` says so), and npm.

### Run it on your machine

```bash
cp .env.example .env
npm install
npm run dev
```

Open [http://localhost:8080](http://localhost:8080).

On the first screen, add the email addresses that may open the app, then continue. Each person confirms their own email and types their first and last name. Add more people later on the Model page.

Leave `DATABASE_URL` empty and the app uses a built-in Postgres (PGLite). That data lives in the running process. It is not shared with another machine, and it disappears when that process is replaced.

### Use a shared database

Set `DATABASE_URL` in `.env` to a Postgres connection string, such as a Neon URL. The database user must be allowed to create tables. This database holds the email list and saved reports. It is not the customer's warehouse.

```bash
npm run build
```

`npm run build` builds the app and applies new files in `migrations/` once. Files under `migrations/auth/` are not applied while sign-in stays off. The same migration runs again on a later build and does nothing if it was already applied.

A customer's own database is pasted on the Sources page as a read-only `postgres://` string. It is used for that query and is not saved in `.env`.

| Variable | Required | What to set |
| --- | --- | --- |
| `DATABASE_URL` | Only for a shared deploy | Postgres URL. Empty means the built-in database. |
| `VITE_AUTH_ENABLED` | No | Leave it `false`. The door is the email list inside the app. |

### Deploy on Vercel

The production build uses Nitro's Vercel preset. `vercel.json` is already in the repo.

1. Import `acuitygen/insightcanvas` into Vercel.
2. Set `DATABASE_URL` to the shared Postgres URL. Do not deploy the shared book on the built-in database: a Vercel function does not keep that data.
3. Set `VITE_AUTH_ENABLED` to `false`.
4. Build command: `npm run build`.
5. Deploy. The first person to open the site adds the allowed emails, the same way as on a local machine.

To check the production build before you ship it:

```bash
npm run build
npm run preview
```

That preview listens on [http://127.0.0.1:8081](http://127.0.0.1:8081).

### Environment variables

| Variable | Required | What to set |
| --- | --- | --- |
| `DATABASE_URL` | Only for a shared deploy | Postgres URL. Empty means the built-in database. |
| `VITE_AUTH_ENABLED` | No | Leave it `false`. |
| `INSIGHT_AUTH_SECRET` | **Yes in production** | A random string of at least 32 characters, e.g. `openssl rand -hex 32`. Keys the code hashes. Without it in production, sign-in is refused. |
| `RESEND_API_KEY` | One mail option is required in production | Resend API key, for sending sign-in codes |
| `SMTP_URL` | One mail option is required in production | Alternative to Resend, e.g. `smtps://user:pass@smtp.example.com:465` |
| `INSIGHT_MAIL_FROM` | With Resend or SMTP | Sender address, e.g. `InsightCanvas <login@acuitygen.com>`. It must be a domain the provider has verified. |
| `INSIGHT_BOOTSTRAP_EMAIL` | Recommended | The only address allowed to become the first admin on a new database |
| `INSIGHT_EXTERNAL_DB_TLS_INSECURE` | No | `true` turns off certificate checks for outside databases. Leave it unset. |

## Checks and tests

```bash
npm run typecheck
npm run lint
npm test              # product tests: SQL gateway, outside-database checks, planner, compiler, time
npm run build:app     # build without applying migrations
npm run test:template # app-builder template tooling tests; needs the builder's .grok/ folder, so not run in CI
```

**CI** (`.github/workflows/ci.yml`) runs typecheck, lint, tests and `build:app` on Node 22 for every push and pull request.

## What was tested

- **Sign-in** (`src/lib/insight/auth/core.test.ts`, run against an in-memory Postgres):
  - codes stored only as hashes, sent only to listed addresses, with the same answer for unknown ones
  - single use, 10-minute expiry, lockout after wrong guesses, a new code replacing the old one
  - rate limits by email and by IP
  - sessions ending on removal and on sign-out
  - mail sender selection
  - a source check that no server function accepts a client-sent email
- **SQL gateway** (`src/lib/insight/__tests__/validate.test.ts`):
  - allowed queries, plus the original attack strings
  - 16 bypass attempts found in review, all now refused: comma joins, quoted identifiers, `TABLE`, a CTE named after a blocked function, `--` inside a string, a LIMIT only in a subquery or string, nested comments, escape and dollar strings, `FETCH`, `ONLY`
- **Outside-database checks:** blocked functions, writes inside CTEs, row locks, a trailing comment that tried to remove the row cap, and the TLS defaults.
- **Planner → compiler → gateway:** sample questions compile to SQL the gateway accepts, with literals kept as parameters. Ambiguous and uncertified requests clarify or block.
- **Time helpers:** leap days, fiscal year, to-date ranges, prior period, same period last year, date spines.

## Known limits

- **Sign-in is new.** The emailed code is the only factor, so anyone who can read your inbox can sign in. The first-admin claim is open on an empty database unless `INSIGHT_BOOTSTRAP_EMAIL` is set. Rate limits live in the app database, with no CAPTCHA. There is no separate check against cross-site request forgery: it relies on SameSite=Lax cookies and TanStack's POST server functions.
- **Everyone signed in sees all shared reports.** There are no per-report permissions.
- **Ask uses only the demo dataset.** It doesn't query your own database, and the README's earlier claims of a local Ollama model, SQL Server, a full AST parser and scoped embed tokens describe goals, not this build.
- **The audit log is in the browser** and can be cleared.
- **Outside-database queries** don't verify SELECT-only accounts or restrict hosts.
- **Mail search goes through the Grok connector**, so it depends on that platform. Data shown there leaves your network.
- **`xlsx` 0.18.5** has a known high-severity advisory for crafted files.

## Roadmap

| Phase | Scope |
| --- | --- |
| 1 | PostgreSQL connection, entity model, plain-English questions, core charts, HTML export, basic validation and audit log |
| 2 | Formulas, time intelligence including edge cases, remaining chart types, SQL Server, stronger SQL gateway tests |
| 3 | Authenticated embeds inside the client environment, version history, polish, accessibility audit |

**Out of scope for v1:** multi-tenant SaaS, public anonymous embeds, write-back, scheduled refresh, cross-database federation, native mobile apps, arbitrary user JavaScript, and multi-page dashboards with cross-filtering.

## Repository layout

```
src/lib/insight/   planner, compiler, SQL gateway, demo dataset, time helpers, server functions
src/components/    screens (Ask studio, Model, Sources, Reports, Audit, Help, Embed)
src/routes/        TanStack routes
migrations/        app database (email list, reports); migrations/auth only when sign-in is on
docs/PRD.md        product requirements (v1.4)
scripts/           build, migration and template tooling
```

## Licence

Proprietary, all rights reserved, AcuityGen LLP (not yet confirmed; there's no licence file). `CONTRIBUTING.md`: not accepting outside contributions during pre-alpha.

## Owner

AcuityGen LLP. Product owner: Bikram. Contact: bikram@acuitygen.com
