import { Suspense } from "react";
import AdminShell from "./admin-shell";
import { AdminQueryProvider } from "./admin-query-provider";
import AdminLoading from "./loading";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminQueryProvider>
        <AdminShell>{children}</AdminShell>
      </AdminQueryProvider>
    </Suspense>
  );
}
