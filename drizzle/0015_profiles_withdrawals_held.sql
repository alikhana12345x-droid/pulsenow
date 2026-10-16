-- Withdrawal hold: an admin-set flag. A held player's withdrawals are recorded
-- and their balance reserved as usual, but nothing is sent to the payment
-- gateway — each one waits on the Finance desk to be paid by hand or rejected.
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "withdrawals_held" boolean DEFAULT false NOT NULL;
