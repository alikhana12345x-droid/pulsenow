-- Snapshot the EFFECTIVE win probability (post house-edge caps) and the
-- theoretical per-round expected RTP so the Reports → Validation tab can
-- compare realized results against what the engine actually played, instead
-- of the raw tier config (which caps routinely override, e.g. Skyrise).
ALTER TABLE "game_rounds" ADD COLUMN IF NOT EXISTS "effective_win_probability" numeric(5,2);
ALTER TABLE "game_rounds" ADD COLUMN IF NOT EXISTS "expected_rtp" numeric(6,4);
