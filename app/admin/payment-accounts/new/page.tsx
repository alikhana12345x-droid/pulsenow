import { requireCapabilityPage } from "@/lib/auth/permissions";
import { PaymentAccountForm } from "../payment-account-form";

export default async function NewPaymentAccountPage() {
  await requireCapabilityPage("manage_payment_accounts");
  return <PaymentAccountForm mode="create" />;
}
