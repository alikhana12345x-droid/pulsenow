-- Adds the lobby games registry. Trimmed to the real delta: every other object
-- emitted by `drizzle-kit generate` (bet_amount_tiers, game_rounds columns,
-- promotions cta fields) already exists in the live DB from earlier `push`es, so
-- only the `games` table is new. IF NOT EXISTS keeps it safe under push or migrate.
CREATE TABLE IF NOT EXISTS "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"game_type" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"emoji" text DEFAULT '' NOT NULL,
	"gradient" text DEFAULT '' NOT NULL,
	"glow" text,
	"payout_label" text,
	"badge" text,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'hidden' NOT NULL,
	"card_image_url" text,
	"loading_image_url" text,
	"banner_image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "games_status_sort_idx" ON "games" USING btree ("status","sort_order");
