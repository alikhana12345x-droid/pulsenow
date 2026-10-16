import { Suspense } from "react";
import { requireCapabilityPage } from "@/lib/auth/permissions";
import type { RawParams } from "../list-params";
import AdminLoading from "../loading";
import { AuditContent } from "./audit-content";

type AuditPageProps = {
  /** tab, q, action / source, page, size — see list-params.ts. */
  searchParams?: Promise<RawParams>;
};

export default async function AdminAuditPage({ searchParams }: AuditPageProps) {
  await requireCapabilityPage("view_audit");
  const params = (await searchParams) ?? {};

  return (
    <Suspense fallback={<AdminLoading />}>
      <AuditContent searchParams={params} />
    </Suspense>
  );
}
