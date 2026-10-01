# AI Zone — API Reference (v1)

Base URL: `/api/v1` · JSON bodies · Bearer JWT via `Authorization: Bearer <token>`
(or the `ai_zone_token` HTTP-only cookie). All errors share one shape:

```json
{ "error": { "code": "machine_readable_code", "message": "human message" } }
```

Common error codes: `validation_error` (400) · `unauthorized` (401) · `forbidden`
(403) · `not_found` (404) · `rate_limited` (429, plan limit) · `provider_*`
(502/503/504, upstream model failure) · `plan_limit` (403, model not in plan).

---

## Auth

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | — | `{email, password, displayName}` → `{user, token}` (201) |
| POST | `/auth/login` | — | `{email, password}` → `{user, token}` |
| POST | `/auth/logout` | ✓ | Revokes the session |
| GET | `/auth/me` | ✓ | Current `{user}` |

## Conversations

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/conversations?q=` | ✓ | List (max 100). `q` searches titles **and** message content |
| POST | `/conversations` | ✓ | `{title?, modelPreference?}` → conversation (201) |
| GET | `/conversations/:id` | ✓ | `{conversation, messages}` — ownership enforced |
| PATCH | `/conversations/:id` | ✓ | Rename / change `modelPreference` |
| DELETE | `/conversations/:id` | ✓ | Soft-delete |

## Chat (SSE)

### `POST /chat/stream` ✓ (rate limit: 30/min)

```json
{ "conversationId": "uuid", "content": "text", "modelKey": "optional" }
```

Responds `text/event-stream`; each event is `data: {...}\n\n`:

| Event | Payload |
|---|---|
| `meta` | `{conversationId, userMessageId, assistantMessageId, model}` |
| `delta` | `{text}` — repeated |
| `usage` | `{inputTokens, outputTokens, costAmount}` |
| `done` | `{conversationId}` |
| `error` | `{code, message}` |

Entitlements are enforced before the call: monthly request/token limits → `429`;
model not in plan → `403 plan_limit`.

## Models & preferences

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/models` | ✓ | Enabled models with `capabilities`, `contextWindow`, per-1k costs |
| GET | `/preferences` | ✓ | `{defaultModelKey, theme}` |
| PATCH | `/preferences` | ✓ | `{defaultModelKey: string|null}` — validated against the catalog |

Routing precedence: request `modelKey` → conversation preference → user default →
capability/cost ranking.

## Agents & runs

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/agents` | — | Enabled agents with sanitized tool policies |
| POST | `/agents/:id/runs` | ✓ (10/min) | `{input, modelKey?}`; `:id` = agent key or uuid → `{run}` (202) |
| GET | `/runs/:id` | ✓ | Status, output, token counts, `toolExecutions[]` |
| POST | `/runs/:id/cancel` | ✓ | Cooperative cancel; awaited runs finalize immediately |
| POST | `/runs/:id/tools/:toolId` | ✓ | `{decision: "approve"\|"reject"}` — resumes the run when no approvals pend |

Run status lifecycle: `RUNNING → COMPLETED | FAILED | CANCELLED`, pausing at
`AWAITING_APPROVAL` for gated tools. Bounded: ≤5 model steps, ≤12 tool calls,
policy timeouts.

## Files & documents

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/files` | ✓ (20/min) | Multipart field `file` (≤10 MB). Sniffed by magic bytes; extracts text → `{file}` (201) |
| GET | `/files` | ✓ | List metadata (`?limit=`, `?offset=`) |
| GET | `/files/:id` | ✓ | Metadata + `extractedText` |
| DELETE | `/files/:id` | ✓ | Removes object + row |
| POST | `/documents/:id/analyze` | ✓ | `{task: "summarize"\|"extract"\|"question"\|"compare", question?, documentIds?}` → analysis + model + tokens |

Accepted: PDF (≤20 MB), DOCX (≤10 MB), TXT/MD/CSV/JSON (≤2 MB). Plan caps apply
(`429` when exceeded).

## Usage & billing

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/usage?days=1..365` | ✓ | Totals, per-model, daily rollups (default 30d) |
| GET | `/subscriptions` | ✓ | Current plan, limits, and period usage |

Plans: `free` (100 req / 200K tokens / 2 small models), `pro` (2K / 5M / all),
`team` (10K / 25M / all). Limits reset each calendar-month billing period.

## Admin (role=ADMIN, read from DB)

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/overview` | Users, subs, conversations, 30-day cost, provider health |
| GET | `/admin/users?q=` | Search with plan + usage rollups |
| PATCH | `/admin/users/:id` | `{role?, isActive?, planKey?}` — last-admin guard; audited |
| PATCH | `/admin/models/:id` | `{enabled}` — audited |

## Health

`GET /health` (unauthenticated) → `{status: "ok", db: "up"}` or `503 {db: "down"}`.
