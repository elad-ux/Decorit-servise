import { ENDPOINTS } from "./config";
import { postAction } from "./api";

/** Every cutting-module action shares this response envelope. */
function manage<T>(sessionToken: string, action: string, payload?: unknown): Promise<T> {
  return postAction<{ ok: true; data: T }>(ENDPOINTS.cutting, sessionToken, action, payload).then(
    (res) => res.data,
  );
}

export interface CuttingFabricColor {
  id: string;
  color_name: string;
  in_stock: boolean;
}

export interface CuttingFabric {
  id: string;
  name: string;
  active: boolean;
  colors: CuttingFabricColor[];
}

export type CuttingTaskStatus = "pending" | "completed" | "archived";

export interface CuttingTask {
  id: string;
  customer_name: string;
  fabric_id: string;
  fabric_color_id: string;
  quantity_ordered: number;
  customer_order_number: string | null;
  office_notes: string | null;
  is_urgent: boolean;
  is_limited: boolean;
  status: CuttingTaskStatus;
  created_by: string;
  created_at: string;
  quantity_completed: number | null;
  /** Legacy single value ("roll" | "bag"), kept for old rows. New reports use `packaging_types` + `packages_count`. */
  packaging_type: string | null;
  /** Kinds of packaging the cutter used (any of bag / roll / pallet). */
  packaging_types: string[] | null;
  /** Total packages across all the kinds in `packaging_types`. */
  packages_count: number | null;
  cutter_notes: string | null;
  completed_by: string | null;
  completed_at: string | null;
  archived_at: string | null;
  /** Set when the task was cancelled (it is then archived). */
  cancelled_at: string | null;
  cancelled_by: string | null;
  updated_at: string;
  /** Set only by the `update` action — null on a freshly created, never-edited task. */
  updated_by: string | null;
  /** Present on `list` results (embedded joins/lookups), absent on `create`/`update`/`report_complete`/`reopen`. */
  fabric_name?: string;
  color_name?: string;
  color_in_stock?: boolean;
  created_by_name?: string | null;
  updated_by_name?: string | null;
  completed_by_name?: string | null;
}

export interface CuttingSetting {
  key: string;
  value: string;
  description: string | null;
}

export function listFabrics(sessionToken: string, includeInactive = false): Promise<CuttingFabric[]> {
  return manage(sessionToken, "fabrics_list", { include_inactive: includeInactive });
}

export function addFabric(sessionToken: string, name: string): Promise<CuttingFabric> {
  return manage(sessionToken, "fabric_add", { name });
}

export function updateFabric(
  sessionToken: string,
  id: string,
  fields: { name?: string; active?: boolean },
): Promise<CuttingFabric> {
  return manage(sessionToken, "fabric_update", { id, ...fields });
}

export function addColor(sessionToken: string, fabricId: string, colorName: string): Promise<CuttingFabricColor> {
  return manage(sessionToken, "color_add", { fabric_id: fabricId, color_name: colorName });
}

export function updateColor(
  sessionToken: string,
  id: string,
  fields: { color_name?: string; in_stock?: boolean },
): Promise<CuttingFabricColor> {
  return manage(sessionToken, "color_update", { id, ...fields });
}

export function updateStock(sessionToken: string, fabricColorId: string, inStock: boolean): Promise<CuttingFabricColor> {
  return manage(sessionToken, "stock_update", { fabric_color_id: fabricColorId, in_stock: inStock });
}

export interface CreateTaskInput {
  customer_name: string;
  fabric_id: string;
  fabric_color_id: string;
  quantity_ordered: number;
  customer_order_number?: string;
  office_notes?: string;
  is_urgent?: boolean;
}

export function createTask(sessionToken: string, input: CreateTaskInput): Promise<CuttingTask> {
  return manage(sessionToken, "create", input);
}

export interface UpdateTaskInput {
  id: string;
  customer_name?: string;
  fabric_id?: string;
  fabric_color_id?: string;
  quantity_ordered?: number;
  customer_order_number?: string;
  office_notes?: string;
  is_urgent?: boolean;
}

export function updateTask(sessionToken: string, input: UpdateTaskInput): Promise<CuttingTask> {
  return manage(sessionToken, "update", input);
}

export function deleteTask(sessionToken: string, id: string): Promise<void> {
  return manage(sessionToken, "delete", { id });
}

export interface ListTasksFilter {
  status?: CuttingTaskStatus | "all";
  is_urgent?: boolean;
  fabric_id?: string;
  customer?: string;
  from?: string;
  to?: string;
}

/** Server default (no `status` filter) excludes archived tasks. */
export function listTasks(sessionToken: string, filter: ListTasksFilter = {}): Promise<CuttingTask[]> {
  return manage(sessionToken, "list", filter);
}

export const PACKAGING_OPTIONS = [
  { value: "bag", label: "שקית/חבילה" },
  { value: "roll", label: "גליל" },
  { value: "pallet", label: "משטח/קלוב" },
] as const;

const PACKAGING_LABEL: Record<string, string> = Object.fromEntries(PACKAGING_OPTIONS.map((o) => [o.value, o.label]));

/** "שקית/חבילה + גליל" (new reports) or the legacy single value ("גליל"); "" when nothing was recorded. */
export function formatPackagingKinds(t: Pick<CuttingTask, "packaging_type" | "packaging_types">): string {
  if (t.packaging_types && t.packaging_types.length > 0) {
    return t.packaging_types.map((k) => PACKAGING_LABEL[k] ?? k).join(" + ");
  }
  if (t.packaging_type) return PACKAGING_LABEL[t.packaging_type] ?? t.packaging_type;
  return "";
}

/** "5 חבילות" / "חבילה אחת"; "" when the count wasn't recorded (legacy rows). */
export function formatPackagesCount(t: Pick<CuttingTask, "packages_count">): string {
  const n = t.packages_count;
  if (!n) return "";
  return n === 1 ? "חבילה אחת" : `${n} חבילות`;
}

/** "שקית/חבילה + גליל · 5 חבילות" — falls back to the legacy single value on old rows. */
export function formatPackaging(t: Pick<CuttingTask, "packaging_type" | "packaging_types" | "packages_count">): string {
  const kinds = formatPackagingKinds(t);
  const count = formatPackagesCount(t);
  return kinds && count ? `${kinds} · ${count}` : kinds;
}

export interface ReportCompleteInput {
  id: string;
  quantity_completed: number;
  /** Any of "bag" | "roll" | "pallet". When given, `packages_count` is required (>= number of kinds). */
  packaging_types?: string[];
  /** Total number of packages across all selected kinds. */
  packages_count?: number;
  cutter_notes?: string;
}

export function reportComplete(sessionToken: string, input: ReportCompleteInput): Promise<CuttingTask> {
  return manage(sessionToken, "report_complete", input);
}

export function reopenTask(sessionToken: string, id: string): Promise<CuttingTask> {
  return manage(sessionToken, "reopen", { id });
}

/** Omit `key` to get every setting. */
export function getSettings(sessionToken: string, key?: string): Promise<CuttingSetting[]> {
  return manage(sessionToken, "settings_get", key ? { key } : {});
}

export function setSetting(sessionToken: string, key: string, value: string, description?: string): Promise<CuttingSetting> {
  return manage(sessionToken, "settings_set", { key, value, description });
}

export function suggestCustomers(sessionToken: string, q: string): Promise<string[]> {
  return manage(sessionToken, "customers_suggest", { q });
}

export type PrintJobStatus = "queued" | "claimed" | "printed" | "failed" | "expired";

export interface PrintTaskStatus {
  status: PrintJobStatus;
  attempts: number;
  last_error: string | null;
  printed_at: string | null;
  created_at: string;
}

export interface PrinterFlags {
  offline?: boolean;
  cover_open?: boolean;
  paper_end?: boolean;
  stopped_paper_end?: boolean;
  paper_near_end?: boolean;
  error?: boolean;
  mechanical_error?: boolean;
  cutter_error?: boolean;
  unrecoverable?: boolean;
}

export interface PrintStatus {
  agent: {
    online: boolean;
    last_seen: string | null;
    printer_ok: boolean | null;
    status: PrinterFlags | null;
    status_at: string | null;
  };
  /** keyed by task id; only tasks that have a print job in the last 3 days */
  tasks: Record<string, PrintTaskStatus>;
}

export function getPrintStatus(sessionToken: string): Promise<PrintStatus> {
  return manage(sessionToken, "print_status");
}

/** Queue another slip for an existing task. */
export function reprintTask(sessionToken: string, taskId: string): Promise<{ job_id: string; status: PrintJobStatus }> {
  return manage(sessionToken, "print_reprint", { task_id: taskId });
}

/** Admin only (enforced server-side): the print agent's API key, to paste into the agent's .env file. */
export function getPrintAgentKey(sessionToken: string): Promise<{ agent_id: string; key: string }> {
  return postAction<{ ok: true; data: { agent_id: string; key: string } }>(ENDPOINTS.printKey, sessionToken, "get").then(
    (res) => res.data,
  );
}
