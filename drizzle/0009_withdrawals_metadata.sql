-- Withdrawals need somewhere to keep gateway detail that has no column of its
-- own: the payee name SolidPay requires (acctName), the destination type
-- (wallet vs bank code), the provider's businessNo, and dispatch outcomes.
ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
