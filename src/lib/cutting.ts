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
  packaging_type: string | null;
  cutter_notes: string | null;
  completed_by: string | null;
  completed_at: string | null;
  archived_at: string | null;
  updated_at: string;
  /** Present on `list` results (embedded joins), absent on `create`/`update`/`report_complete`/`reopen`. */
  fabric_name?: string;
  color_name?: string;
  color_in_stock?: boolean;
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

export interface ReportCompleteInput {
  id: string;
  quantity_completed: number;
  packaging_type?: string;
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
