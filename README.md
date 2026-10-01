# AI Zone

Provider-neutral multi-model AI platform — **Phase 1 complete (spec Milestones 1–8)**.

AI Zone is an independently owned AI workspace: chat, agents, documents, and usage
billing unified behind one backend, where AI providers (OpenAI, Anthropic, DeepSeek, Gemini)
are interchangeable pluggable adapters — never a hard dependency. The platform owns
the product logic, data, security, and orchestration; the models are swappable.

## Status

| Milestone | Scope | State |
|---|---|---|
| 1 — Foundation | Monorepo, TS config, health endpoint, dev docs | ✅ |
| 2 — Accounts | Auth (Argon2id + JWT), conversations, persistent history | ✅ |
| 3 — AI orchestration | Adapter interface, streaming, usage recording | ✅ |
| 4 — Model hub | **4 providers** (OpenAI, Anthropic, DeepSeek, Gemini), capability routing, user default model, Model Hub UI | ✅ |
| 5 — Agent framework | Versioned agents, tool contracts + permission policy, bounded run loop, status/cancel/**approval-resume** | ✅ |
| 6 — Files & documents | Secure uploads (magic-byte validation), PDF/DOCX/text extraction, Document Intelligence, history search | ✅ |
| 7 — Billing & admin | Free/Pro/Team plans with server-side enforcement, usage reports, admin console | ✅ |
| 8 — Launch prep | DB health probe, Docker/compose deploy, smoke + load suite, ops guide | ✅ |

**Verification:** 80 automated tests passing · typecheck clean across all workspaces ·
security smoke (ownership, authz, rate limits, upload caps) · live load probe
(~100 req/s at concurrency 10, 0 errors).

## Features

- **Multi-provider chat** — one interface over OpenAI, Anthropic, DeepSeek, and Gemini
  (DeepSeek and Gemini reuse the OpenAI-compatible adapter). Manual selection or
  capability/cost-based auto-routing; streaming over SSE with stop button.
- **Agents with guardrails** — general, coding, research, document, writing agents.
  Tools (calculator, datetime, text stats, uuid, JSON) run only through a permission
  policy: allowlist, per-run budgets, step limits, timeouts, and human approval
  gates that pause/resume with a persisted transcript.
- **Document intelligence** — upload PDF/DOCX/TXT/MD/CSV/JSON (magic-byte sniffed,
  size-capped), then summarize / extract / question / compare via the model, with
  usage attributed per request.
- **Plans & entitlements** — Free / Pro $20 / Team $60. Request, token, model, and
  upload limits enforced server-side (429/403), never from frontend counters.
- **Admin console** — overview stats, user search with role/activation/plan
  assignment (last-admin guard, audited), model enable/disable.
- **Landing page** — product overview and pricing that mirror the enforced plans.

## Layout

```
apps/
  web/        React 18 + Vite + Tailwind (chat, Model Hub, Documents, Usage, Admin, landing)
  api/        Node + Express + TypeScript backend
packages/
  shared-types/  DTOs shared by both apps
  validation/    Zod schemas (single source for API + web)
infrastructure/
  docker/        API + web Dockerfiles, nginx config
  smoke.mjs      Smoke + load probe (npm run smoke / smoke:load)
docs/
  DEPLOYMENT.md  Environments, backups, monitoring, pre-launch checklist
apps/api/prisma/ Schema, migrations, seed (models, agents, plans)
```

## Models & providers

| Provider | Models | Adapter |
|---|---|---|
| OpenAI | gpt-4o, gpt-4o-mini | `openai` |
| Anthropic | Claude 3.5 Sonnet, Claude 3.5 Haiku | `anthropic` (supports `ANTHROPIC_WORKSPACE_ID` for unscoped keys) |
| DeepSeek | DeepSeek V3 (chat), DeepSeek R1 (reasoner) | OpenAI-compatible reuse |
| Gemini | Gemini 3.8 Flash, Gemini 3.5 Flash Lite | OpenAI-compatible reuse |

Pricing per model is stored in the DB (versioned) — cost math reads it at request
time, never from hardcoded rates.

**Live verification:** all four providers are confirmed against their production APIs —
Gemini verified end-to-end (real streaming completions with tokens and cost recorded),
Anthropic and DeepSeek verified authenticated (completions pending account credit),
OpenAI code path verified pending its API key.

## Quick start (local)

```bash
cp .env.example .env        # fill DATABASE_URL, JWT_SECRET, provider keys
npm install
npm run db:generate
npm run db:migrate
npm run db:seed             # models, 5 agents, plans, free-plan backfill
npm run dev:api             # :4000
npm run dev:web             # :5173 (proxies /api to :4000)
```

## Quick start (Docker)

```bash
cp .env.example .env        # set POSTGRES_PASSWORD + provider keys
docker compose up -d --build
# web on :8080 (nginx proxies /api), API on :4000, Postgres with healthcheck
# migrations apply automatically before the API boots
```

## Testing & ops

```bash
npm test                # 80 unit tests (vitest)
npm run typecheck       # all workspaces
npm run smoke           # health, auth, catalog, conversations + latency probe
npm run smoke:load      # 200 requests @ concurrency 20
docker compose logs -f api
```

See `docs/DEPLOYMENT.md` for environments, backups/restore drills, monitoring,
and the pre-launch checklist.

## Environment

Provider keys live only in `.env` (gitignored) and are used server-side — they are
never shipped to the browser. `ANTHROPIC_WORKSPACE_ID` is required for unscoped
(user-level) Anthropic keys.

## Spec

Implemented from the AI Zone Developer Technical Specification v1.0
(`spec/` blueprint): Phase 1 = platform foundation on external model APIs;
Phase 2 (future) = self-hosted/fine-tuned models behind the same adapter
interface.
