"use client";

import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { EmptyList, FilterPills, ListToolbar, PaginationBar, SearchField } from "../list-controls";

/**
 * One account, already rendered by the server as a table row (wide screens) and
 * a card (phones and tablets). This component only searches, filters, sorts and
 * pages them, so all formatting stays on the server and can't drift between the
 * server's and the browser's locale or timezone.
 */
export type UserEntry = {
  id: string;
  /** Lower-cased name, @handle, email, phone and id, matched against the search box. */
  search: string;
  isStaff: boolean;
  isBanned: boolean;
  /** Withdrawals on hold — they wait on the Finance desk instead of going to the gateway. */
  isHeld: boolean;
  joinedAt: number;
  balance: number;
  deposited: number;
  withdrawn: number;
  row: ReactNode;
  card: ReactNode;
};

export type UserColumn = { label: string; align?: "right" };

const FILTERS = {
  all: { label: "All", match: () => true },
  players: { label: "Players", match: (e: UserEntry) => !e.isStaff },
  staff: { label: "Staff", match: (e: UserEntry) => e.isStaff },
  banned: { label: "Banned", match: (e: UserEntry) => e.isBanned },
  held: { label: "Held", match: (e: UserEntry) => e.isHeld },
};

const SORTS = {
  newest: { label: "Newest first", compare: (a: UserEntry, b: UserEntry) => b.joinedAt - a.joinedAt },
  oldest: { label: "Oldest first", compare: (a: UserEntry, b: UserEntry) => a.joinedAt - b.joinedAt },
  balance: { label: "Highest balance", compare: (a: UserEntry, b: UserEntry) => b.balance - a.balance },
  deposited: { label: "Most deposited", compare: (a: UserEntry, b: UserEntry) => b.deposited - a.deposited },
  withdrawn: { label: "Most withdrawn", compare: (a: UserEntry, b: UserEntry) => b.withdrawn - a.withdrawn },
};

const PAGE_SIZES = [5,10, 20, 50, 100];

type FilterKey = keyof typeof FILTERS;
type SortKey = keyof typeof SORTS;

export function UsersBrowser({
  entries,
  columns,
  showStaffFilter,
}: {
  entries: UserEntry[];
  columns: UserColumn[];
  /** Admins only ever see players, so a Staff filter would always be empty. */
  showStaffFilter: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const listTop = useRef<HTMLDivElement>(null);

  const filterKeys = (Object.keys(FILTERS) as FilterKey[]).filter(
    (key) => key !== "staff" || showStaffFilter
  );

  const visible = useMemo(() => {
    // Every word has to match somewhere, so "ali gmail" narrows rather than widens.
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return entries
      .filter(FILTERS[filter].match)
      .filter((e) => terms.every((t) => e.search.includes(t)))
      .sort(SORTS[sort].compare);
  }, [entries, query, filter, sort]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  // Clamped rather than reset, so a save that drops a row (unbanning someone
  // under the Banned filter) can't strand the viewer on an empty last page.
  const current = Math.min(page, pageCount);
  const pageEntries = visible.slice((current - 1) * pageSize, current * pageSize);

  const narrowed = query.trim() !== "" || filter !== "all";

  function goTo(next: number) {
    setPage(next);
    // The bar stays on screen while the list scrolls, so after flipping pages
    // from far down, bring the new page's first row back into view.
    const el = listTop.current;
    if (el && el.getBoundingClientRect().top < 0) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div className="space-y-4">
      <ListToolbar
        search={
          <>
            <SearchField
              className="flex-1 lg:w-72 lg:flex-none"
              label="Search users"
              placeholder="Name, @handle, email, phone or ID"
              value={query}
              onChange={(next) => {
                setQuery(next);
                setPage(1);
              }}
            />
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortKey);
                setPage(1);
              }}
              aria-label="Sort users"
              className="shrink-0 rounded-xl border border-border/70 bg-card px-2.5 py-1.5 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {(Object.keys(SORTS) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {SORTS[key].label}
                </option>
              ))}
            </select>
          </>
        }
        filters={
          <FilterPills
            label="Filter users"
            active={filter}
            options={filterKeys.map((key) => ({
              key,
              label: FILTERS[key].label,
              count: entries.filter(FILTERS[key].match).length,
            }))}
            onSelect={(key) => {
              setFilter(key as FilterKey);
              setPage(1);
            }}
          />
        }
      />

      {visible.length === 0 ? (
        entries.length === 0 ? (
          <EmptyList message="No users found." />
        ) : (
          <EmptyList
            message="No users match these filters."
            onClear={() => {
              setQuery("");
              setFilter("all");
              setPage(1);
            }}
          />
        )
      ) : (
        <>
          {/* Offset clears the sticky site header (plus the mobile nav row). */}
          <div ref={listTop} className="scroll-mt-28 md:scroll-mt-24">
            {/* Phones and tablets: cards, two across once there's room. The
                explicit single column is minmax(0, 1fr) — the implicit one is
                `auto`, which grows to a card's unwrapped name/email line and
                pushes the card off the side of the screen. */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:hidden">
              {pageEntries.map((e) => (
                <Fragment key={e.id}>{e.card}</Fragment>
              ))}
            </div>

            {/* Wide screens: the dense table. */}
            <div className="hidden overflow-hidden rounded-[24px] border border-border/70 bg-card/80 xl:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60">
                      {columns.map((c) => (
                        <th
                          key={c.label}
                          className={`whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground first:pl-4 last:pr-4 ${
                            c.align === "right" ? "text-right" : "text-left"
                          }`}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageEntries.map((e) => (
                      <Fragment key={e.id}>{e.row}</Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <PaginationBar
            page={current}
            pageCount={pageCount}
            pageSize={pageSize}
            total={visible.length}
            overall={narrowed ? entries.length : null}
            sizes={PAGE_SIZES}
            onPage={goTo}
            onPageSize={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}
    </div>
  );
}
