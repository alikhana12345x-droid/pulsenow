import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./supabase/schema";

// In Next.js dev mode, module re-evaluation on hot reload creates a new
// postgres() pool each time. Storing on globalThis reuses the same pool
// across reloads so connections don't pile up and exhaust Supabase's limit.
declare global {
  // eslint-disable-next-line no-var
  var _pgClient: postgres.Sql | undefined;
}

const client =
  globalThis._pgClient ??
  postgres(process.env.DB_URL!, {
    prepare: false,      // required for PgBouncer / Supabase transaction pooler
    max: 10,             // enough for dashboard (7) + shell (1) + other pages simultaneously
    idle_timeout: 20,    // release idle connections after 20 s
    max_lifetime: 300,   // recycle connections every 5 min to avoid stale pool buildup
    connect_timeout: 10, // fail fast rather than pile up waiting connections
  });

if (process.env.NODE_ENV !== "production") {
  globalThis._pgClient = client;
}

export const db = drizzle(client, { schema });
