-- Gap #1: snapshot effective win_probability + is_promo on every game_round at placement.
-- Gap #1c: typed is_win_round column for Mines winnable-round frequency reporting.
-- These columns are required for promo-cost reports, realized-vs-expected edge validation,
-- and the QA/Validation report (section 4.9 of admin-reporting-plan.md).

ALTER TABLE "game_rounds"
  ADD COLUMN "win_probability" numeric(5, 2),
  ADD COLUMN "is_promo"        boolean NOT NULL DEFAULT false,
  ADD COLUMN "is_win_round"    boolean;

-- Backfill is_promo = false for all historical rows (already defaulted above, belt+suspenders).
UPDATE "game_rounds" SET "is_promo" = false WHERE "is_promo" IS NULL;

-- Partial index accelerates promo-cost reports (filter promo rows in date range).
CREATE INDEX "game_rounds_promo_created_idx" ON "game_rounds" ("is_promo", "created_at")
  WHERE "is_promo" = true;
