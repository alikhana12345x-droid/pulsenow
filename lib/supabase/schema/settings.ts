import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

// Generic key/value store for platform-wide settings that admins can flip at
// runtime (e.g. payment_mode = "manual" | "auto"). Values are jsonb so a key
// can hold a string, number, or object without a schema change.
export const platform_settings = pgTable("platform_settings", {
  key:        text("key").primaryKey(),
  value:      jsonb("value").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
