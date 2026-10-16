"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deletePaymentAccount,
  getPaymentAccounts,
  resetDailyUsed,
  togglePaymentAccount,
} from "@/lib/actions/payment-accounts";

type PaymentAccount = Awaited<ReturnType<typeof getPaymentAccounts>>[number];

const paymentAccountsKey = ["admin", "payment-accounts"] as const;

const GATEWAY_LABELS: Record<string, string> = {
  solidpay: "SolidPay",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  crypto_usdt: "USDT",
  crypto_eth: "ETH",
};

const GATEWAY_COLORS: Record<string, string> = {
  solidpay: "bg-amber-500/15 text-amber-400",
  jazzcash: "bg-red-500/15 text-red-400",
  easypaisa: "bg-green-500/15 text-green-400",
  crypto_usdt: "bg-teal-500/15 text-teal-400",
  crypto_eth: "bg-blue-500/15 text-blue-400",
};

export function PaymentAccountsClient({
  initialAccounts,
}: {
  initialAccounts: PaymentAccount[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useQuery({
    queryKey: paymentAccountsKey,
    queryFn: getPaymentAccounts,
    initialData: initialAccounts,
    initialDataUpdatedAt: Date.now(),
  });

  const settle = async () => {
    await queryClient.invalidateQueries({ queryKey: paymentAccountsKey });
    router.refresh();
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      togglePaymentAccount(id, isActive),
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: paymentAccountsKey });
      const previous =
        queryClient.getQueryData<PaymentAccount[]>(paymentAccountsKey);
      queryClient.setQueryData<PaymentAccount[]>(paymentAccountsKey, (old) =>
        old?.map((account) =>
          account.id === id ? { ...account, is_active: isActive } : account
        )
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(paymentAccountsKey, context?.previous);
    },
    onSettled: settle,
  });

  const resetMutation = useMutation({
    mutationFn: resetDailyUsed,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: paymentAccountsKey });
      const previous =
        queryClient.getQueryData<PaymentAccount[]>(paymentAccountsKey);
      queryClient.setQueryData<PaymentAccount[]>(paymentAccountsKey, (old) =>
        old?.map((account) =>
          account.id === id ? { ...account, daily_used: "0" } : account
        )
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(paymentAccountsKey, context?.previous);
    },
    onSettled: settle,
  });

  const deleteMutation = useMutation({
    mutationFn: deletePaymentAccount,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: paymentAccountsKey });
      const previous =
        queryClient.getQueryData<PaymentAccount[]>(paymentAccountsKey);
      queryClient.setQueryData<PaymentAccount[]>(paymentAccountsKey, (old) =>
        old?.filter((account) => account.id !== id)
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(paymentAccountsKey, context?.previous);
    },
    onSettled: settle,
  });

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border/70 bg-card/80 p-6 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
            Payment Routing
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            Payment Accounts
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage the gateways and wallets used for deposits and withdrawals,
            with visibility into daily usage and account status.
          </p>
        </div>
        <Link
          href="/admin/payment-accounts/new"
          className="inline-flex items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          + Add account
        </Link>
      </section>

      {accounts.length === 0 && (
        <div className="rounded-[24px] border border-dashed border-border bg-card/70 p-10 text-center text-muted-foreground">
          No payment accounts yet.{" "}
          <Link
            href="/admin/payment-accounts/new"
            className="text-primary underline"
          >
            Add one
          </Link>
        </div>
      )}

      <div className="grid gap-4">
        {accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            togglePending={
              toggleMutation.isPending &&
              toggleMutation.variables?.id === account.id
            }
            resetPending={
              resetMutation.isPending && resetMutation.variables === account.id
            }
            deletePending={
              deleteMutation.isPending && deleteMutation.variables === account.id
            }
            onToggle={() =>
              toggleMutation.mutate({
                id: account.id,
                isActive: !account.is_active,
              })
            }
            onReset={() => {
              if (!confirm("Reset daily usage counter to 0?")) return;
              resetMutation.mutate(account.id);
            }}
            onDelete={() => {
              if (
                !confirm("Delete this payment account? This cannot be undone.")
              ) {
                return;
              }
              deleteMutation.mutate(account.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function AccountCard({
  account,
  togglePending,
  resetPending,
  deletePending,
  onToggle,
  onReset,
  onDelete,
}: {
  account: PaymentAccount;
  togglePending: boolean;
  resetPending: boolean;
  deletePending: boolean;
  onToggle: () => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const creds = account.credentials as Record<string, string>;
  const dailyUsed = Number(account.daily_used);
  const dailyLimit = Number(account.daily_limit);
  const usedPct =
    dailyLimit > 0 ? Math.min((dailyUsed / dailyLimit) * 100, 100) : 0;

  return (
    <div
      className={`rounded-[24px] border bg-card/80 p-5 transition-colors ${
        account.is_active ? "border-border/80" : "border-border/50 opacity-70"
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                GATEWAY_COLORS[account.gateway] ??
                "bg-muted text-muted-foreground"
              }`}
            >
              {GATEWAY_LABELS[account.gateway] ?? account.gateway}
            </span>
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
              Priority {account.priority}
            </span>
            {account.is_deposit && (
              <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-[11px] text-blue-400">
                Deposits
              </span>
            )}
            {account.is_withdrawal && (
              <span className="rounded-full bg-purple-500/15 px-2.5 py-1 text-[11px] text-purple-400">
                Withdrawals
              </span>
            )}
          </div>
          <div className="mt-4 space-y-1">
            <p className="text-lg font-semibold text-foreground">
              {account.label}
            </p>
            <p className="break-all text-sm text-muted-foreground">
              {creds.account_number ?? creds.wallet_address ?? "-"}
              {creds.account_title ? ` - ${creds.account_title}` : ""}
              {creds.network ? ` - ${creds.network}` : ""}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-background/70 p-4 lg:min-w-[240px]">
          <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Daily used</span>
            <span>
              PKR {dailyUsed.toLocaleString()} / {dailyLimit.toLocaleString()}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all ${
                usedPct > 80 ? "bg-red-500" : "bg-primary"
              }`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              disabled={togglePending}
              onClick={onToggle}
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                account.is_active
                  ? "bg-green-500/15 text-green-400 hover:bg-red-500/15 hover:text-red-400"
                  : "bg-red-500/15 text-red-400 hover:bg-green-500/15 hover:text-green-400"
              }`}
            >
              {togglePending ? "..." : account.is_active ? "Active" : "Inactive"}
            </button>
            <button
              disabled={resetPending}
              onClick={onReset}
              className="rounded-lg bg-secondary px-3 py-1.5 text-xs transition-colors hover:bg-accent"
            >
              {resetPending ? "..." : "Reset daily"}
            </button>
            <Link
              href={`/admin/payment-accounts/${account.id}/edit`}
              className="rounded-lg bg-secondary px-3 py-1.5 text-xs transition-colors hover:bg-accent"
            >
              Edit
            </Link>
            <button
              disabled={deletePending}
              onClick={onDelete}
              className="ml-auto rounded-lg px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
            >
              {deletePending ? "..." : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
