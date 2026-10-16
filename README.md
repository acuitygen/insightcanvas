# InsightCanvas

**Plain-English questions in. Validated SQL and accessible charts out. Your data never leaves your network.**

InsightCanvas connects to your relational database, lets you confirm how your tables relate, and turns questions such as *"monthly revenue this fiscal year versus last, West region"* into a validated SQL query and a customisable chart. The SQL is always visible, along with the calculation logic and the data table behind every chart. Everything, including the language model, runs inside your own environment.

> **Status: pre-alpha.** The product requirements are written (PRD v1.4, 16 October 2026). Phase 1 build has not started. Nothing in this repository is production-ready.

## Why it exists

Getting a chart from a database today means waiting for an analyst to write SQL, or learning a BI tool's modelling language. Both put days between a question and its answer, and the result stays locked inside the BI tool. InsightCanvas is not a full BI platform. It is the fastest safe path from one clear question to one trustworthy, embeddable visual.

## What it does

- **Connects read-only** to PostgreSQL first, then SQL Server. The connection is refused unless the database account is SELECT-only.
- **Models your data.** Foreign keys are suggestions only. An operator confirms key pairs, cardinality and join type, names fields in business terms and certifies shared measures.
- **Answers plain-English questions and formulas.** It asks a clarifying question rather than guessing when a request is ambiguous.
- **Shows its working.** Every result carries the SQL, a plan summary and the data table.
- **Handles time intelligence.** Month, quarter and year to date, prior period, same period last year, year-over-year absolute and percent, rolling calendar windows, and configurable fiscal years (April start supported).
- **Renders the common chart types.** Bar and column, line, area, pie and donut, waterfall, radar, combination and timeline, plus an always-available data table.
- **Exports safe HTML.** Self-contained snapshots that make no network calls, or authenticated live embeds inside the client environment.

## How a question becomes a chart

The language model never writes SQL. It proposes a structured plan, and deterministic code does the rest. A failure at any stage stops with a plain-English message.

1. **Resolve.** Match the question to the published semantic model. Unknown terms trigger a clarifying question.
2. **Plan.** The local model receives only authorised metadata and returns a typed plan: metrics, dimensions, filters, date role, grain, join path and visual family.
3. **Compile.** Deterministic code produces dialect-specific SQL. Joins come only from confirmed relationships.
4. **Validate.** The SQL is parsed to an AST. Only a single SELECT is allowed. Writes, DDL, stacked statements, unapproved functions and tables outside the model are rejected, and row, column and LIMIT policy is enforced.
5. **Execute.** The query runs on a pooled SELECT-only connection with a timeout and row cap, and is cancelled at the database on timeout or user abort.
6. **Present.** The result's shape picks a recommended visual.

## Correctness first

A plausible wrong chart is the worst outcome for this product, so correctness is enforced in the design:

- **Join safety.** Measures are aggregated at their own grain before joining, or the unsafe plan is rejected. Ambiguous join paths and multiple date roles need an explicit choice, never a silent substitution.
- **Formula rules.** Ratios divide aggregates, never average percentages. Nulls are preserved unless explicitly mapped. A zero denominator returns null with an explanation. Mixed currencies are rejected without a declared conversion.
- **Time rules.** Partial periods are labelled. Missing dates come from a date spine. Rolling windows use calendar ranges, not the last N rows. On a leap day, the default prior-year mapping clamps 29 February to 28 February and says so.
- **Versioned models.** Queries pin a published model version. A schema break marks dependent visuals stale instead of silently remapping them.

Targets for v1, checked on a frozen evaluation set with golden fixtures: at least 90% exact match on supported questions, at least 90% of ambiguous questions trigger clarification before execution, and every case in the attack corpus is blocked.

## Security

OWASP Top 10 (2025 categories) is the baseline, with concrete controls for broken access control, SQL and HTML injection, cryptographic failures, insecure design and logging. OWASP ASVS Level 2 principles are applied to the critical path. There is no claim of full formal verification in v1.

- Self-hosted: credentials, schema metadata, plans, SQL and results stay in the client's environment, and no external model endpoint is called.
- Credentials live in a secrets vault local to the deployment. The browser never receives them.
- An AST-level SQL gateway with parameterised literals, identifier allow-lists and row and column policy enforced on every reference, including CTEs and subqueries.
- Edited SQL passes the same parse, policy and budget checks. Execution is bound to a short-lived server-side plan hash.
- The model sees only curated metadata. Its output is a constrained plan that is validated outside the model.
- HTML output is a structured specification rendered by trusted code. No arbitrary JavaScript, no external resources, escaped embedded JSON.
- Live embeds use short-lived scoped tokens, a restrictive CSP and a frame-ancestor allow-list. Expired or revoked tokens return no data.
- An audit log records user, question, SQL, row count and duration. Secrets are never logged.

## Accessibility

Targets **WCAG 2.2 Level AA**: contrast, full keyboard operation, visible focus, reduced-motion support, and a text summary plus data-table alternative behind every chart.

## Deployment model

InsightCanvas is installed and run inside each client's environment, on-premise or in a client-controlled cloud. The client supplies the runtime, including a GPU or sufficient CPU for the chosen Ollama model, and read-only database access.

## Roadmap

| Phase | Scope |
| --- | --- |
| 1 | PostgreSQL connection, entity model, plain-English questions, core charts, HTML export, basic validation and audit log |
| 2 | Formulas, time intelligence including edge cases, remaining chart types, SQL Server, stronger SQL gateway tests |
| 3 | Authenticated embeds inside the client environment, version history, polish, accessibility audit |

A phase exits only when its correctness fixtures and safety tests pass, with no unresolved high-severity security issues.

**Out of scope for v1:** multi-tenant SaaS, public anonymous embeds, write-back, scheduled refresh, cross-database federation, native mobile apps, arbitrary user JavaScript, and multi-page dashboards with cross-filtering.

## Tech stack

The stack is chosen during the Phase 1 spike. Fixed constraints:

- **Language model:** the latest capable open-weight model served locally through Ollama, with a strict plan schema so poor output is rejected early. The model can be updated without changing the rest of the pipeline.
- **Charts:** rendered by AcuityGen's own trusted code from a structured specification.

## Repository layout (proposed)

```
docs/          PRD, threat model, architecture decisions
app/           web application (editor and viewer)
engine/        resolve, plan, compile, validate, execute pipeline
connectors/    one adapter per database dialect
eval/          frozen evaluation set, attack corpus, golden fixtures
deploy/        container images, installer, upgrade and rollback scripts
```

## Documentation

- `docs/PRD.md`: full product requirements (v1.4)
- `CONTRIBUTING.md`: not accepting outside contributions during pre-alpha

## Licence

Proprietary, all rights reserved, AcuityGen LLP. This is an assumption, made because the product is sold for deployment in client environments. Not yet confirmed.

## Owner

AcuityGen LLP. Product owner: Bikram. Contact: bikram@acuitygen.com
