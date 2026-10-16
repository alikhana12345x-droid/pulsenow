-- Adds a generic key/value settings store so admins can flip platform-wide
-- toggles at runtime (first use: payment_mode = "manual" | "auto"). IF NOT
-- EXISTS keeps it safe under either push or migrate.
CREATE TABLE IF NOT EXISTS "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
