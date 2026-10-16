import { getAdminDashboardStats } from "@/lib/actions/admin";
import { AdminDashboardClient } from "./admin-dashboard-client";

export default async function AdminDashboardContent() {
  const stats = await getAdminDashboardStats();

  return <AdminDashboardClient initialStats={stats} />;
}
