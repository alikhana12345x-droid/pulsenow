import { redirect } from "next/navigation";
import Link from "next/link";
import { getViewerActor, type Actor } from "@/lib/auth/permissions";
import { isAdminRole } from "@/lib/auth/roles";
import { AdminDesktopNav, AdminMobileNav } from "./admin-nav";
import { AdminUserMenu } from "./admin-user-menu";

const SANDBOX = process.env.NEXT_PUBLIC_SANDBOX_MODE === "true";

export default async function AdminShell({
    children,
}: {
    children: React.ReactNode;
}) {
    // getViewerActor reads the x-user-sub the proxy set after calling
    // getClaims() once per request, so this costs one profile lookup and no
    // token-refresh round-trip. The role still comes from the database.
    let profile: Actor | null = null;
    try {
        profile = await getViewerActor();
    } catch {
        redirect("/auth/error?error=Database+unavailable.+Please+try+again.");
    }

    if (!profile) redirect("/?auth=login");
    if (!isAdminRole(profile.role)) redirect("/protected");

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_32%),linear-gradient(180deg,_rgba(15,23,42,0.22)_0%,_transparent_28%)] bg-background">
            <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 backdrop-blur">
                {/* ── Main bar ── */}
                <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 md:h-16">
                    {/* Left: logo + desktop nav */}
                    <div className="flex min-w-0 items-center gap-4">
                        <Link
                            href="/admin"
                            prefetch={false}
                            className="flex shrink-0 items-center gap-2.5 text-primary"
                        >
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-sm font-bold md:h-9 md:w-9 md:rounded-2xl">
                                BP
                            </span>
                            <div className="hidden leading-tight sm:block">
                                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
                                    Control Room
                                </p>
                                <p className="text-base font-bold tracking-tight text-foreground md:text-lg">
                                    PulseNow Admin
                                </p>
                            </div>
                        </Link>

                        <AdminDesktopNav role={profile.role} />
                    </div>

                    {/* Right: sandbox badge + user menu */}
                    <div className="flex shrink-0 items-center gap-2 md:gap-3">
                        {SANDBOX && (
                            <span className="rounded-full border border-yellow-500/30 bg-yellow-500/20 px-2 py-0.5 text-[10px] font-bold text-yellow-400">
                                SANDBOX
                            </span>
                        )}
                        <AdminUserMenu username={profile.username} role={profile.role} />
                    </div>
                </div>

                {/* ── Mobile nav row ── */}
                <AdminMobileNav role={profile.role} />
            </header>

            <main className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 sm:py-6 md:py-8">
                <div className="mx-auto w-full max-w-6xl">{children}</div>
            </main>
        </div>
    );
}
