import type { SortState } from "../lib/tableSort";

interface Props<K extends string> {
  label: string;
  sortKey: K;
  sort: SortState<K> | null;
  onSort: (key: K) => void;
}

/** Table header cell that sorts its column on click and shows the current direction. */
export default function SortableTh<K extends string>({ label, sortKey, sort, onSort }: Props<K>) {
  const active = sort?.key === sortKey;
  const arrow = !active ? "↕" : sort.dir === "asc" ? "▲" : "▼";
  return (
    <th aria-sort={!active ? "none" : sort.dir === "asc" ? "ascending" : "descending"}>
      <button type="button" className={`th-sort${active ? " th-sort-active" : ""}`} onClick={() => onSort(sortKey)}>
        {label}
        <span className="th-sort-arrow" aria-hidden="true">
          {arrow}
        </span>
      </button>
    </th>
  );
}
