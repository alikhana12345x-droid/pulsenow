CREATE INDEX "deposits_created_idx" ON "deposits" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "deposits_status_created_idx" ON "deposits" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payment_accounts_is_active_idx" ON "payment_accounts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "withdrawals_user_id_idx" ON "withdrawals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "withdrawals_created_idx" ON "withdrawals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "profiles_is_banned_idx" ON "profiles" USING btree ("is_banned");--> statement-breakpoint
CREATE INDEX "admin_audit_log_admin_id_idx" ON "admin_audit_log" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "admin_audit_log_action_idx" ON "admin_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "admin_audit_log_created_idx" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "referral_earnings_referral_id_idx" ON "referral_earnings" USING btree ("referral_id");--> statement-breakpoint
CREATE INDEX "referral_earnings_bet_id_idx" ON "referral_earnings" USING btree ("bet_id");--> statement-breakpoint
CREATE INDEX "referral_earnings_created_idx" ON "referral_earnings" USING btree ("created_at");