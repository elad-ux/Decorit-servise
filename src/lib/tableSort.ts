export type SortDir = "asc" | "desc";
export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}
type SortValue = string | number | null | undefined;

/** Click cycle on a column header: ascending → descending → back to the default order. */
export function nextSort<K extends string>(current: SortState<K> | null, key: K): SortState<K> | null {
  if (!current || current.key !== key) return { key, dir: "asc" };
  if (current.dir === "asc") return { key, dir: "desc" };
  return null;
}

const collator = new Intl.Collator("he", { numeric: true, sensitivity: "base" });

function compare(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

/** Stable sort on one column; empty values always sink to the bottom, in either direction. */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: SortState<K> | null,
  accessors: Record<K, (row: T) => SortValue>,
): T[] {
  if (!sort) return [...rows];
  const get = accessors[sort.key];
  const sign = sort.dir === "asc" ? 1 : -1;
  const isEmpty = (v: SortValue) => v === null || v === undefined || v === "";
  return [...rows].sort((x, y) => {
    const a = get(x);
    const b = get(y);
    if (isEmpty(a) && isEmpty(b)) return 0;
    if (isEmpty(a)) return 1;
    if (isEmpty(b)) return -1;
    return sign * compare(a, b);
  });
}
