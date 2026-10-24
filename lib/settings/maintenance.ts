import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { platform_settings } from "@/lib/supabase/schema";

export const MAINTENANCE_MODE_KEY = "maintenance_mode";

/**
 * Whether the whole app is paused for everyone but superadmins. Deliberately
 * free of the "use server" boundary (unlike the rest of platform-settings.ts)
 * so the proxy can import and call it directly on every request.
 */
export async function isMaintenanceModeEnabled(): Promise<boolean> {
  try {
    const [row] = await db
      .select({ value: platform_settings.value })
      .from(platform_settings)
      .where(eq(platform_settings.key, MAINTENANCE_MODE_KEY))
      .limit(1);
    return row?.value === true;
  } catch {
    // Table missing (migration not yet applied) or transient error — never
    // let a settings-read failure lock everyone out of the app.
    return false;
  }
}
