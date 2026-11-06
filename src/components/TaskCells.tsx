import { type CuttingTask, formatPackagesCount, formatPackagingKinds } from "../lib/cutting";

/** Date on one line, time under it — keeps the table narrow enough for a tablet held upright. */
export function DateTimeCell({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className="muted">—</span>;
  const d = new Date(iso);
  return (
    <span className="dt-cell">
      <span>{d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>
      <span className="dt-time">{d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>
    </span>
  );
}

/** How the order was packed (kinds) and how many packages in all, one above the other. */
export function PackagingCell({ task }: { task: Pick<CuttingTask, "packaging_type" | "packaging_types" | "packages_count"> }) {
  const kinds = formatPackagingKinds(task);
  const count = formatPackagesCount(task);
  if (!kinds && !count) return <span className="muted">—</span>;
  return (
    <span className="pack-cell">
      {kinds && <span>{kinds}</span>}
      {count && <strong>{count}</strong>}
    </span>
  );
}
