import { notFound } from "next/navigation";
import { requireCapabilityPage } from "@/lib/auth/permissions";
import { getPaymentAccountById, type GatewayType, type PaymentAccountCredentials } from "@/lib/actions/payment-accounts";
import { PaymentAccountForm } from "../../payment-account-form";

export default async function EditPaymentAccountPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapabilityPage("manage_payment_accounts");
  const { id } = await params;
  const account = await getPaymentAccountById(id);

  if (!account) notFound();

  return (
    <PaymentAccountForm
      mode="edit"
      accountId={account.id}
      initialData={{
        gateway: account.gateway as GatewayType,
        label: account.label,
        credentials: (account.credentials ?? {}) as PaymentAccountCredentials,
        daily_limit: account.daily_limit,
        priority: account.priority,
        is_deposit: account.is_deposit,
        is_withdrawal: account.is_withdrawal,
        is_active: account.is_active,
      }}
    />
  );
}
