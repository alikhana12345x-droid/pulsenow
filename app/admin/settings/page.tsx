import { Suspense } from "react";
import { requireCapabilityPage } from "@/lib/auth/permissions";
import { SettingsContent } from "./settings-content";
import AdminLoading from "../loading";

export default async function AdminSettingsPage() {
  // The lowest bar in here — SettingsContent hides the superadmin-only sections.
  const actor = await requireCapabilityPage("manage_support_contacts");

  return (
    <Suspense fallback={<AdminLoading />}>
      <SettingsContent viewerRole={actor.role} />
    </Suspense>
  );
}
