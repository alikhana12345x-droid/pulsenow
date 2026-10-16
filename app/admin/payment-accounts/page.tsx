import { requireCapabilityPage } from "@/lib/auth/permissions";
import { getPaymentAccounts } from "@/lib/actions/payment-accounts";
import { PaymentAccountsClient } from "./payment-accounts-client";

export default async function PaymentAccountsPage() {
  await requireCapabilityPage("manage_payment_accounts");
  const accounts = await getPaymentAccounts();

  return <PaymentAccountsClient initialAccounts={accounts} />;
}
