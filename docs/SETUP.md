# AI Zone — Local Setup

## Prerequisites

- **Node.js ≥ 20** (developed on 22/24)
- **PostgreSQL ≥ 14** (developed against 18)
- Docker (optional — for the compose stack)

## 1. Environment

```bash
cp .env.example .env
```

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✓ | `postgresql://postgres:PASSWORD@localhost:5432/ai_zone` |
| `JWT_SECRET` | ✓ | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `OPENAI_API_KEY` | one provider | Server-side only |
| `ANTHROPIC_API_KEY` | one provider | Add `ANTHROPIC_WORKSPACE_ID` if the key is unscoped (user-level) |
| `DEEPSEEK_API_KEY` | one provider | OpenAI-compatible endpoint, used via the OpenAI adapter |
| `GEMINI_API_KEY` | one provider | OpenAI-compatible endpoint (`generativelanguage.googleapis.com/v1beta/openai`) |
| `CORS_ORIGIN` | — | Default `http://localhost:5173`; comma-separated list allowed |
| `CONTEXT_MAX_INPUT_TOKENS` | — | Chat history budget (default 12000) |

At least one provider key is needed for chat; everything else works without keys.

## 2. Database

```bash
psql -h localhost -U postgres -c "CREATE DATABASE ai_zone"
```

> The database name in `DATABASE_URL` must match. The compose stack uses `ai_zone`
> inside the `db` service; local dev in this repo currently uses a DB named `Syntra` —
> either works as long as `DATABASE_URL` points at it.

## 3. Install, migrate, seed

```bash
npm install
npm run db:generate    # prisma client
npm run db:migrate     # apply migrations (interactive dev)
npm run db:seed        # 8 models / 4 providers, 5 agents, 3 plans, free backfill
```

If Prisma says it cannot find `DATABASE_URL`, source the root env first:
`set -a && . ../../.env && set +a` (from `apps/api`).

## 4. Run

```bash
npm run dev:api   # http://localhost:4000  (GET /health)
npm run dev:web   # http://localhost:5173  (proxies /api to :4000)
```

Sign up through the landing page → you land in the chat workspace with the
Model Hub, Documents, Usage, and (for admins) the Admin console in the sidebar.

## 5. Verify

```bash
npm test            # 80 unit tests
npm run smoke       # health + auth + catalogs + latency probe (needs API running)
```

To see a real completion, use a model whose provider key you configured — the
model selector lists everything enabled in the DB; the Model Hub shows which
models your plan allows.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `P1000` auth failed on migrate | `DATABASE_URL` password ≠ Postgres password. Test: `psql -h localhost -U postgres` |
| `401 provider_auth` in chat | Provider key missing/invalid in `.env`; restart `dev:api` after edits |
| Anthropic: workspace header error | Set `ANTHROPIC_WORKSPACE_ID` (unscoped key) or create a scoped key |
| Anthropic/DeepSeek: `402` | Add credits in the provider console |
| Gemini model `404` | Model generation retired for new keys — reseed (`npm run db:seed`) to get current model IDs |
| Gemini `503` high demand | Flagship tiers are capacity-limited upstream; try the flash-lite tier |
| 413 on upload | 10 MB multipart cap (PDF up to 20 MB is parsed server-side; multipart still caps at 10) |

## Docker

See the README quick start and `docs/DEPLOYMENT.md` for the compose stack,
backups, and ops checklist.
