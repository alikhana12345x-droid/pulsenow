CREATE TABLE "house_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text DEFAULT 'PKR' NOT NULL,
	"method" text NOT NULL,
	"acct_code" text NOT NULL,
	"acct_no" text NOT NULL,
	"acct_name" text NOT NULL,
	"mobile" text,
	"status" text DEFAULT 'processing' NOT NULL,
	"gateway_ref" text,
	"failure_reason" text,
	"requested_by" uuid NOT NULL,
	"note" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "game_rounds" ADD COLUMN "effective_win_probability" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "game_rounds" ADD COLUMN "expected_rtp" numeric(6, 4);--> statement-breakpoint
ALTER TABLE "house_payouts" ADD CONSTRAINT "house_payouts_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "house_payouts_status_created_idx" ON "house_payouts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "house_payouts_created_idx" ON "house_payouts" USING btree ("created_at");