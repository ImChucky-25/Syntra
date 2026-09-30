# AI Zone

Provider-neutral multi-model AI platform — Phase 1 implementation (spec Milestones 1–3).

## What's in this build

| Area | Delivered |
|---|---|
| Monorepo | npm workspaces: `apps/web`, `apps/api`, `packages/shared-types`, `packages/validation` |
| Accounts | Email+password auth, Argon2id hashing, JWT bearer tokens, HTTP-only cookie option, Zod validation |
| Persistence | PostgreSQL via Prisma: users, sessions, conversations, messages, models, providers, usage records |
| Orchestration | `AIModelAdapter` interface, OpenAI adapter (streaming + usage), context budgeting, token-aware trimming |
| Routing | Capability-based auto-routing + manual selection, normalized provider errors, safe retries |
| Streaming | SSE `/api/v1/chat/stream` with `delta`/`usage`/`done`/`error` events |
| Usage tracking | Per-request `usage_records` with real token counts, model cost/version tracking, `/api/v1/usage` endpoint |

## Layout

```
apps/
  web/        React 18 + Vite + Tailwind chat workspace
  api/        Node + Express + TypeScript backend
packages/
  shared-types/  DTOs shared by both apps
  validation/    Zod schemas (single source for API + web)
docs/
  API.md        Endpoint reference
  SETUP.md      Local setup guide
```

## Quick start

1. Create the database:
   ```bash
   createdb -U postgres ai_zone    # or: psql -U postgres -c "CREATE DATABASE ai_zone"
   ```
2. Configure environment:
   ```bash
   cp .env.example .env            # then edit DATABASE_URL, JWT_SECRET, OPENAI_API_KEY
   ```
3. Install & migrate:
   ```bash
   npm install
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```
4. Run:
   ```bash
   npm run dev:api    # backend on :4000
   npm run dev:web    # frontend on :5173 (proxies /api to :4000)
   ```

See `docs/SETUP.md` for details and `docs/API.md` for the endpoint contract.
