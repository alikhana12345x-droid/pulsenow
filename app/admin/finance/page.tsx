import { Suspense } from "react";
import { FinanceContent } from "./finance-content";
import type { RawParams } from "../list-params";
import AdminLoading from "../loading";

type FinancePageProps = {
  /** tab, q, status, page, size — see list-params.ts. */
  searchParams?: Promise<RawParams>;
};

export default async function AdminFinancePage({ searchParams }: FinancePageProps) {
  const params = (await searchParams) ?? {};

  return (
    <Suspense fallback={<AdminLoading />}>
      <FinanceContent searchParams={params} />
    </Suspense>
  );
}
