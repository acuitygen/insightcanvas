# InsightCanvas: Product Requirements Document

Natural-language data visualisation for AcuityGen

Version 1.4  ·  16 October 2026

Client-deployed · Solo, AI-assisted · Latest Ollama models (self-hosted)

## 1. Purpose and Context

InsightCanvas lets a user connect a read-only database, confirm relationships, ask questions or define formulas in plain English, and receive a customisable, embeddable HTML visual. The language model proposes a structured plan only. A deterministic compiler and policy gateway produce and validate the SQL. The result always shows its SQL, calculation logic, and data table.

AcuityGen is a zero-employee startup. Version 1 is built and operated by one person with AI assistance. The product is delivered by deploying it inside the client’s environment. Question-to-plan translation uses the latest Ollama models running locally so that schema metadata and questions never leave the client’s network.

The product is not a full BI platform. It is the fastest safe path from one clear question to one trustworthy, embeddable visual.

## 2. Delivery and Operating Model

- Deployment: Installed and run inside the client’s environment (on-premise or client-controlled cloud).
- Builder: Solo, AI-assisted. No dedicated team for v1.
- Language model: Latest Ollama models (self-hosted, open-weight) used only to turn questions into typed query plans. No external model endpoint is called.
- Data residency: Credentials, schema metadata, plans, SQL, and results stay inside the client’s environment.

## 3. Scope

### In scope for v1

- Read-only connections to PostgreSQL (first) and SQL Server.
- Entity model: table selection, confirmed relationships, business names, certified measures.
- Plain-English questions and formulas → validated SQL → visual.
- Time intelligence with fiscal calendars and explicit edge-case handling.
- Visual library: bar/column, line, area, pie/donut, waterfall, radar, combination, timeline, plus always-available data table.
- Self-contained HTML export and authenticated embed (within the client environment).
- WCAG 2.2 AA, strong SQL gateway, audit log, row limits and timeouts.

### Out of scope for v1

- Multi-tenant SaaS, public anonymous embeds, write-back, scheduled refresh, cross-database federation, native mobile apps, arbitrary user JavaScript.
- Full multi-page dashboards with cross-filtering (single visual per output).

## 4. Success Measures

Proposed targets for a solo-built, client-deployed product using local Ollama models. Correctness and safety take priority.

| Measure | Target | How checked |
|---|---|---|
| Correctness | ≥ 90% exact match on a held-out set of supported questions (grain, filters, values) | Frozen evaluation set + golden fixtures |
| Ambiguity handling | ≥ 90% of ambiguous questions trigger clarification before execution | Labelled test cases |
| Safety | All prohibited SQL and privilege-escalation cases in the attack corpus are blocked | Automated validator tests + manual review |
| Speed | Median question-to-visual < 15 s on representative tables (local model latency included) | Server timing |
| Accessibility | Zero unresolved WCAG 2.2 AA failures on core flows | Automated scan + manual check |

## 5. Core Pipeline (Plain English → Visual)

The latest Ollama model never writes SQL. Failure at any stage stops with a plain-English message.

1. **Resolve:** Match against the published semantic model (business names, measures, date roles). Unknown terms trigger clarification.
2. **Plan:** Local Ollama model receives only authorised metadata and returns a typed plan (metrics, dimensions, filters, date role, grain, join path, visual family).
3. **Compile:** Deterministic code produces dialect-specific SQL. Joins come only from confirmed relationships. Time intelligence expands from templates.
4. **Validate:** Parse to AST. Allow only a single SELECT (safe CTEs and window functions permitted). Reject writes, DDL, stacked statements, unapproved functions, and tables outside the model. Enforce row/column policy and LIMIT.
5. **Execute:** Run on a pooled SELECT-only connection with timeout and row cap. Cancel cleanly on timeout or user abort.
6. **Present:** Recommend visual from result shape. Always show SQL, plan summary, and data table.

## 6. Semantic Model, Joins and Formulas

### Relationships

- Foreign keys are suggestions only. The operator confirms key pairs, cardinality, join type, and unmatched-row handling before a relationship is usable.
- One-to-many fan-out: aggregate at the measure grain before joining, or reject the unsafe plan.
- Ambiguous paths or multiple date roles require explicit choice; never silent substitution.
- Models are versioned. Queries pin a published version. Schema breaks mark dependent visuals stale rather than silently remapping.

### Formulas and measures

- Plain English or typed expression produces a readable expression tree with grain and aggregation scope.
- Ratio measures divide aggregates (never average of percentages). Nulls are preserved unless explicitly mapped. Zero denominator yields null plus explanation.
- Currency stays in decimal types. Mixed currencies are rejected without a declared conversion.
- Only the operator can certify a shared measure. Personal formulas remain private until certified.

## 7. Time Intelligence (Edge Cases)

Time intelligence uses an explicit calendar with fiscal start month, timezone, and date role. Relative periods are resolved once per run and recorded.

- Supported: day/week/month/quarter/year grain; MTD/QTD/YTD; prior period; same period last year; YoY absolute and percent; rolling N calendar periods.
- Partial periods are labelled. Missing dates use a date spine (distinguish no activity vs no record).
- Leap day: default prior-year mapping clamps 29 February to 28 February and discloses the rule.
- Rolling windows use calendar ranges, not “last N rows”. Aggregate to grain first.
- Fiscal year start (including April) is configurable per connection.

## 8. SQL Gateway and Execution Safety

- Credentials live only in a secrets vault local to the client deployment. Browser never receives them. Connection is refused unless the database account is SELECT-only.
- Validate typed plan against the model, compile, then parse the full SQL AST. Parameterise literals. Resolve identifiers through the model allow-list.
- Permit only an approved SELECT subset. Reject stacked statements, writes, DDL, unsafe functions, external access, and SELECT INTO.
- Enforce row and column policy server-side on every reference (including CTEs and subqueries). Prefer source RLS or secured views where available.
- Hard timeout, row limit, and concurrency cap per connection. LIMIT is a result bound, not a scan budget.
- Cancel at the database on timeout or user request; discard late results. Clean session context before connection reuse.
- Any edited SQL still passes the full parse + policy + budget checks. Execution is bound to a short-lived server-side plan hash.

## 9. Visuals and HTML Delivery

- Recommend chart type from validated result shape. User can override only with compatible bindings.
- Every visual includes an accessible name, short text summary, and data-table alternative.
- HTML export is a structured specification rendered by trusted code (no arbitrary JavaScript). Snapshots are self-contained, network-denied, and include a timestamp.
- Live embeds (within the client environment) use a short-lived scoped token, restrictive CSP, and frame-ancestor allow-list. Expired or revoked tokens return no data.
- Sanitize all labels and template input. Escape embedded JSON. No external resources or scripts in exported HTML.

## 10. Security and Accessibility (Practical Baseline)

- OWASP Top 10 awareness (2025 categories) with concrete controls: broken access control, injection (SQL + HTML), cryptographic failures, insecure design, logging.
- ASVS Level 2 principles applied to the critical path. No claim of full formal verification in v1.
- Prompt injection: local Ollama model sees only curated metadata; output is a constrained plan; validation happens outside the model. No external API call for planning.
- WCAG 2.2 AA: contrast, full keyboard operation, screen-reader table alternative for charts, visible focus, reduced-motion support.
- Audit log of queries (user, English, SQL, row count, duration). Secrets never logged.

## 11. Delivery Approach (Solo, AI-Assisted)

Phases are sequential slices one person can build, test, and deploy into a client environment with a local Ollama runtime.

- Phase 1: PostgreSQL connection, entity model, plain-English questions (latest Ollama model), core charts, HTML export, basic validation and audit.
- Phase 2: Formulas, time intelligence (including edge cases), remaining chart types, SQL Server, stronger SQL gateway tests.
- Phase 3: Authenticated embeds within the client environment, version history, polish, and accessibility audit.

Exit each phase only when the relevant correctness fixtures and safety tests pass. No unresolved high-severity security issues.

## 12. Key Risks

- Wrong but plausible SQL → Always show SQL + data table; clarifying questions; track accept rate; operator can review any saved visual.
- Unsafe joins or fan-out → Confirmed relationships only; aggregate-before-join rule; model validation.
- Time-intelligence mismatch with real reports → Fiscal calendar support; every formula shows SQL; reconciliation against known numbers.
- Local Ollama model quality or latency → Use the latest capable open-weight model; keep the plan schema strict so poor output is rejected early; allow model updates without changing the rest of the pipeline.
- HTML or embed exfiltration → Constrained specifications, sanitization, restricted embeds, no arbitrary script.

## 13. Assumptions

- Deployed inside the client’s environment. No data or schema metadata leaves that environment.
- v1 is built and operated by one person with AI assistance.
- The latest Ollama models (self-hosted) are used for question-to-plan translation.
- Client supplies a suitable runtime environment (including GPU or sufficient CPU for the chosen Ollama model) and read-only database access.
- Modern evergreen browsers. Desktop authoring first; viewing works on tablet/phone.

— End of Document —
