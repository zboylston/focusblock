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
- `lib/db/src/schema/sessions.ts` — focus session log table
- `lib/db/src/schema/tasks.ts` — daily planner tasks table
- `artifacts/api-server/src/routes/sessions.ts` — session CRUD + stats routes
- `artifacts/api-server/src/routes/tasks.ts` — task CRUD routes
- `artifacts/focusblock/src/` — React frontend

## Architecture decisions

- Each "chunk" in the Daily Planner creates a separate DB row (so users can check them off one by one)
- Sessions are created when the timer hits zero; rating is applied separately via PATCH
- The "chunks until 5 PM" counter uses `Intl.DateTimeFormat` to compute EST offset regardless of user timezone
- Audio alert uses the Web Audio API (oscillator) — no external file needed
- Stats endpoint (`GET /sessions/stats/today`) aggregates ratings server-side for the session log summary

## Product

- 30-minute focus timer with pre-session label input
- 5-minute break timer auto-queued after each focus session
- Rating modal on completion (😩 😐 🙂 🔥) — saved to DB
- Daily Planner: add tasks with chunk counts; clicking an uncompleted task pre-fills the timer
- Daily Planner: a play button on each task group auto-starts a fresh 30-min focus block and increments a per-group "plays" counter (separate from the manually-clickable completion dots)
- Session Log: today's completed sessions with timestamps and ratings
- Live "X chunks until 5 PM EST" counter in the header

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after every spec change before using new hooks
- `date` columns use `mode: "string"` — always pass `YYYY-MM-DD` strings, never Date objects
- The `/sessions/stats/today` route must be registered BEFORE `/sessions/:id` to avoid route collision in Express
- Per-group "plays" are stored on the first block (chunkIndex 1) of a task group; increment via `PATCH /tasks/:id { incrementPlays: 1 }` which is atomic server-side (avoids lost updates from rapid taps) — do not read-modify-write `plays` from the client

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
