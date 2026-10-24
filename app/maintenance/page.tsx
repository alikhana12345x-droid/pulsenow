import { MaintenanceScreen } from "@/components/maintenance-screen";

// Rewrite target for every request while maintenance mode is on (see
// lib/supabase/proxy.ts) — the proxy already decided the viewer isn't a
// superadmin, so this page has nothing left to check.
export default function MaintenancePage() {
  return <MaintenanceScreen />;
}
