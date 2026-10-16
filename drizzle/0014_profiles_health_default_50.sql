-- New accounts start at 50% health instead of 100%. Rows still on the old
-- default (never changed by an admin) move to the new one; admin-set values stay.
ALTER TABLE "profiles" ALTER COLUMN "health" SET DEFAULT 50;
UPDATE "profiles" p SET "health" = 50
WHERE p."health" = 100
  AND NOT EXISTS (
    SELECT 1 FROM "admin_audit_log" a
    WHERE a."action" = 'set_health' AND a."target_id"::text = p."id"::text
  );
