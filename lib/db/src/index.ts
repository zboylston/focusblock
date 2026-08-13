import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function databaseUrl() {
  // Neon's pooled DATABASE_URL goes through PgBouncer, which rejects the
  // prepared statements node-postgres/Drizzle use. Prefer the direct URL on Vercel.
  if (process.env.VERCEL) {
    return (
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.DATABASE_POSTGRES_URL_NON_POOLING ||
      process.env.DATABASE_URL
    );
  }
  return process.env.DATABASE_URL;
}

function createPool() {
  const url = databaseUrl();
  if (!url) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  return new Pool({
    connectionString: url,
    // Serverless invocations should not hold a large pool.
    max: process.env.VERCEL ? 1 : 10,
  });
}

let _pool: pg.Pool | undefined;
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getPool() {
  if (!_pool) {
    _pool = createPool();
  }
  return _pool;
}

export function getDb() {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

export const pool = new Proxy({} as pg.Pool, {
  get(_target, prop, receiver) {
    return Reflect.get(getPool(), prop, receiver);
  },
});

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export * from "./schema";
