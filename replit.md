# FocusBlock

A full-stack time-blocking and focus timer app for deep work. Track 30-minute focus chunks, plan your day, log sessions with emoji ratings, and see how many chunks remain until 5 PM.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/focusblock run dev` — run the frontend (port 26006)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, Lucide React, TanStack React Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/tasks.ts` — unified focus-block table (planner + log; has `rating` + `notes`)
- `artifacts/api-server/src/routes/tasks.ts` — task CRUD + timeline + stats + complete-focus routes
- `artifacts/focusblock/src/components/dashboard/Timeline.tsx` — unified infinite-scroll timeline
- `artifacts/focusblock/src/` — React frontend

## Architecture decisions

- Each "chunk" in the Daily Planner creates a separate DB row (so users can check them off one by one)
- A block becomes "done" two ways, both via `POST /tasks/complete-focus` (timer finish) or `PATCH /tasks/:id { completed }` (manual check) — there is no separate "session" concept anymore
- `complete-focus` atomically claims the lowest open block for name+today (`FOR UPDATE SKIP LOCKED`); if none is open it appends a new completed block to the group
- Rating/notes live on the block row (`rating`, `notes`); applied via PATCH after completion
- The "chunks until 5 PM" counter uses `Intl.DateTimeFormat` to compute EST offset regardless of user timezone
- Audio alert uses the Web Audio API (oscillator) — no external file needed
- The timeline paginates by distinct calendar day, newest-first, via a `before` (YYYY-MM-DD) cursor — `GET /tasks/timeline`

## Product

- 30-minute focus timer with pre-session label input
- 5-minute break timer auto-queued after each focus session
- Rating modal on completion (😩 😐 🙂 🔥) — saved to DB
- Unified Timeline (Scandinavian, infinite scroll, newest-day first with hairline date dividers): plan blocks with chunk counts, check them off manually OR by finishing the timer, and see completed blocks inline as time · emoji · note log lines
- Clicking an uncompleted block pre-fills the timer label; a play button auto-starts a fresh focus block and increments a per-group "plays" counter
- Inline today summary (blocks today / minutes focused)
- Live "X chunks until 5 PM EST" counter in the header

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after every spec change before using new hooks
- `date` columns use `mode: "string"` — always pass `YYYY-MM-DD` strings, never Date objects
- Literal `/tasks/*` routes (`/tasks/timeline`, `/tasks/stats/today`, `/tasks/complete-focus`) must be registered BEFORE `/tasks/:id` to avoid route collision in Express
- Orval generates `z.date()` (not a string) for `format: date` query params, so the generated `GetTimelineQueryParams` rejects the raw string Express puts in `req.query`. The timeline route validates `before` directly as a `YYYY-MM-DD` string instead of using the generated schema
- Per-group "plays" are stored on the first block (chunkIndex 1) of a task group; increment via `PATCH /tasks/:id { incrementPlays: 1 }` which is atomic server-side (avoids lost updates from rapid taps) — do not read-modify-write `plays` from the client

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
