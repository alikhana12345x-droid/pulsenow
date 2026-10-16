/**
 * Query-string state for the server-paged admin lists (Finance, Audit):
 * `q` search, `page`, `size`, plus one filter param per list. Anything a
 * tampered URL could put there is clamped back to something the query accepts.
 */

export const LIST_PAGE_SIZES = [10, 20, 50];
const DEFAULT_PAGE_SIZE = 20;

export type RawParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function readListParams(params: RawParams) {
  const page = Number(one(params.page));
  const size = Number(one(params.size));
  const q = (one(params.q) ?? "").trim().slice(0, 100);

  return {
    q,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    size: LIST_PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE,
  };
}

/** A filter param, kept only when it is one of the values the list offers. */
export function readChoice<T extends string>(params: RawParams, key: string, allowed: readonly T[]) {
  const value = one(params[key]);
  return allowed.includes(value as T) ? (value as T) : undefined;
}
