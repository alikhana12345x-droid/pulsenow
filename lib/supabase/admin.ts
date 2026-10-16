import { createClient } from "@supabase/supabase-js";

// Service-role client — never expose to the browser.
// Used for admin operations: single-device enforcement, user management, etc.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
