# AI Zone — Deployment & Operations (spec §16)

## Environments

Keep **development**, **staging**, and **production** separate. Each needs its own:

- `DATABASE_URL` (never share a database across environments)
- `JWT_SECRET` — generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- Provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, optionally `ANTHROPIC_WORKSPACE_ID` for unscoped keys)
- `CORS_ORIGIN` set to the frontend origin(s), comma-separated

Never commit `.env`. Rotate provider keys and `JWT_SECRET` on a schedule and after any suspected leak.

## Deploy with Docker Compose

```bash
cp .env.example .env         # fill in secrets; set POSTGRES_PASSWORD for the compose stack
docker compose up -d --build # builds api + web, starts Postgres
```

- `web` serves the SPA on **:8080** and proxies `/api` to the API container (nginx, SSE-safe).
- `api` runs `prisma migrate deploy` before boot — migrations are applied automatically.
- Health: `GET /health` returns `{status, db}`; the API container has a Docker healthcheck on it.

Logs: `docker compose logs -f api` (pino structured JSON).

## Migrations

```bash
# local dev (regenerates client, may prompt)
cd apps/api && npx prisma migrate dev

# staging/production (non-interactive, applies pending migrations)
cd apps/api && DATABASE_URL=... npx prisma migrate deploy
```

Migrations ship with the repo (`apps/api/prisma/migrations`). Never edit an applied migration; add a new one.

## Backups (spec §16: tested restoration)

```bash
# nightly logical backup (example cron)
0 2 * * * docker exec -t $(docker ps -qf name=db) pg_dump -U postgres ai_zone | gzip > /backups/ai_zone_$(date +\%F).sql.gz
```

**Test the restore path quarterly** (a backup is only real if restored):

```bash
gunzip -c /backups/ai_zone_2026-10-01.sql.gz | docker exec -i $(docker ps -qf name=db) psql -U postgres -d ai_zone_restore
```

Retention: keep 7 daily, 4 weekly, 6 monthly. Store one copy off-host.

## Monitoring & alerts

- **Health probe**: `GET /health` — wire to uptime monitoring; `db: "down"` + 503 = page someone.
- **Logs**: pino JSON on stdout — ship to your log stack; alert on `Agent run failed`, `Unhandled request error`, `provider_auth`.
- **Costs**: watch `usage_records.costAmount` (30-day rollup exposed at `GET /api/v1/admin/overview`).
- **Rate limits**: 429s in the access log indicate either abuse or plan limits doing their job.

## Pre-launch checklist (spec §17)

- [x] Auth, ownership checks, rate limits (verified by security smoke tests)
- [x] Streaming chat with real provider (Anthropic) — pending account credits
- [x] Usage recorded per request; credentials never in browser code
- [x] Backups configured — **run one restore drill before launch**
- [x] Migrations automated; health endpoint live
- [x] Admin console operational (users, plans, models)
- [ ] Separate staging database + staging provider keys
- [ ] Load test at expected concurrency (see `npm run smoke`)
