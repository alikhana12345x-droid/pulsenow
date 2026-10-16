import { Suspense } from "react";
import AdminDashboardContent from "./admin-dashboard-content";
import AdminLoading from "./loading";

// Human-readable reason for a bounce off a superadmin-only page, so the
// redirect reads as a permission boundary rather than a broken link.
const DENIED_REASON: Record<string, string> = {
  view_reports: "Reports are available to superadmins only.",
  view_audit: "The audit log is available to superadmins only.",
  manage_payment_accounts: "Payment accounts are managed by a superadmin.",
  manage_platform_settings: "Platform settings are managed by a superadmin.",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ denied?: string }>;
}) {
  const { denied } = (await searchParams) ?? {};
  const reason = denied ? DENIED_REASON[denied] : undefined;

  return (
    <div className="space-y-4">
      {reason && (
        <p className="rounded-2xl border border-yellow-500/25 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
          {reason}
        </p>
      )}
      <Suspense fallback={<AdminLoading />}>
        <AdminDashboardContent />
      </Suspense>
    </div>
  );
}
