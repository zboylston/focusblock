---
name: Orval format:date coercion mismatch
description: Why OpenAPI format:date/date-time body fields arrive as Date (not string) in server Zod validation
---

# Orval `format: date` / `date-time` coercion

For an OpenAPI field with `format: date` (or `date-time`), Orval generates **two different shapes**:

- The generated **Zod schema** (`@workspace/api-zod`) uses `zod.coerce.date()` → parsing yields a **`Date`** object.
- The generated **TS response type** (`@workspace/api-client-react` schemas) types it as a **`string`**.

**Why this bites:** server route code that does `Body.safeParse(req.body)` gets `parsed.data.someDate` typed as `Date`, even though the frontend sends and reads a `string`. Passing it straight into a Drizzle `date(..., { mode: "string" })` column (or a string helper) is a TS error / runtime mismatch.

**How to apply:**
- In server routes, normalize a coerced `Date` back to a calendar string with `value.toISOString().slice(0, 10)` to preserve the intended `YYYY-MM-DD` (coerced `Date` from "YYYY-MM-DD" is UTC midnight, so UTC slice round-trips correctly). Do NOT format it in a local/Eastern timezone — that shifts the day.
- Query params without a `format` stay `zod.coerce.string()` → already a string; no conversion needed.
- If you don't want the `Date` coercion at all, drop `format: date` from the request body field in `openapi.yaml` and re-run codegen.
