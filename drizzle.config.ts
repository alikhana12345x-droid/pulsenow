import { loadEnvConfig } from "@next/env";
import type { Config } from "drizzle-kit";

loadEnvConfig(process.cwd());

export default {
  schema: "./lib/supabase/schema",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DB_URL!,
  },
  out: "drizzle",
} satisfies Config;
