import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Render runs this app as a persistent Node process (not per-request
// serverless), so a normal connection pool works fine — no need for
// Neon's HTTP/edge driver, which exists mainly to work around serverless
// platforms that can't hold a long-lived TCP connection open.
//
// Built lazily rather than at module load: standalone scripts (e.g.
// scripts/import-players.ts) load .env.local via dotenv themselves, and if
// this pool were constructed eagerly at import time, ESM's import hoisting
// means it could run before that dotenv call — DATABASE_URL wouldn't be
// set yet. The Next.js app itself doesn't hit this (Next loads .env.local
// before any application code runs), but lazy init is harmless there too.
let _db: NodePgDatabase<typeof schema> | undefined;

export function getDb(): NodePgDatabase<typeof schema> {
  if (!_db) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    _db = drizzle(pool, { schema });
  }
  return _db;
}
