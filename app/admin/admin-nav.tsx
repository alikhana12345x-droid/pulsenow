"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { can, type Capability } from "@/lib/auth/roles";

// `requires` mirrors the guard on the page itself — this only keeps admins from
// walking into a redirect; the page is what actually refuses them.
const navLinks: { href: string; label: string; requires?: Capability }[] = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/games", label: "Games" },
    { href: "/admin/finance", label: "Finance" },
    { href: "/admin/payouts", label: "Payouts", requires: "withdraw_house_funds" },
    { href: "/admin/reports", label: "Reports", requires: "view_reports" },
    { href: "/admin/payment-accounts", label: "Accounts", requires: "manage_payment_accounts" },
    { href: "/admin/referrals", label: "Referrals" },
    { href: "/admin/promotions", label: "Promotions" },
    { href: "/admin/audit", label: "Audit", requires: "view_audit" },
    // Admins reach Settings for the support contacts; the rest of it stays superadmin-only.
    { href: "/admin/settings", label: "Settings", requires: "manage_support_contacts" },
];

function visibleLinks(role: string) {
    return navLinks.filter(({ requires }) => !requires || can(role, requires));
}

function active(pathname: string, href: string) {
    return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export function AdminDesktopNav({ role }: { role: string }) {
    const pathname = usePathname();
    return (
        <nav className="hidden items-center gap-1 rounded-full border border-border/70 bg-card/70 p-1 md:flex">
            {visibleLinks(role).map(({ href, label }) => (
                <Link
                    key={href}
                    href={href}
                    prefetch={false}
                    className={`rounded-full px-4 py-2 text-sm transition-colors ${
                        active(pathname, href)
                            ? "bg-primary text-primary-foreground font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                >
                    {label}
                </Link>
            ))}
        </nav>
    );
}

export function AdminMobileNav({ role }: { role: string }) {
    const pathname = usePathname();
    return (
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:hidden">
            {visibleLinks(role).map(({ href, label }) => (
                <Link
                    key={href}
                    href={href}
                    prefetch={false}
                    className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        active(pathname, href)
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border/70 bg-card/80 text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                >
                    {label}
                </Link>
            ))}
        </div>
    );
}
