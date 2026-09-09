import { postJson } from "./api";
import { ENDPOINTS } from "./config";

// Unlike the broadcast (marketing) endpoints, containers are one-webhook-per-operation —
// no shared `action` router. See postAction's own comment in api.ts for the contrast.

export type ContainerStatus =
  | "pending"
  | "at_sea"
  | "port_arrival"
  | "customs"
  | "ready"
  | "warehouse_arrived"
  | "warehouse_cleared"
  | "delivered";

export const CONTAINER_STATUS_LABEL: Record<ContainerStatus, string> = {
  pending: "ממתין",
  at_sea: "בים",
  port_arrival: "הגיע לנמל",
  customs: "במכס",
  ready: "מוכן לשחרור",
  warehouse_arrived: "הגיע למחסן",
  warehouse_cleared: "פונה מהמחסן",
  delivered: "נמסר",
};

/** Rough grouping used for the list page's stat tiles. */
export const CONTAINER_STATUS_STAGE: Record<ContainerStatus, "sea" | "port" | "warehouse" | "done"> = {
  pending: "sea",
  at_sea: "sea",
  port_arrival: "port",
  customs: "port",
  ready: "port",
  warehouse_arrived: "warehouse",
  warehouse_cleared: "warehouse",
  delivered: "done",
};

export interface ContainerSupplier {
  id: string;
  container_id: string;
  supplier_name: string;
  items_count: number | null;
  created_at: string;
}

/** Fields returned by the containers-list endpoint — a subset of the full row (see Container below). */
export interface ContainerListRow {
  id: string;
  container_number: string;
  customer_name: string | null;
  status: ContainerStatus;
  carrier: string | null;
  vessel_name: string | null;
  origin_port: string | null;
  dest_port: string | null;
  departure_date: string | null;
  eta: string | null;
  /** Stripped server-side for the warehouse role. */
  shipper_name: string | null;
  warehouse_arrival_date: string | null;
  warehouse_departure_date: string | null;
  port_free_days_end: string | null;
  carrier_free_days_end: string | null;
  container_size: string | null;
  container_suppliers: { supplier_name: string; created_at: string }[];
}

/** Full row from the container-detail endpoint. Several fields are stripped server-side for the warehouse role (see comments). */
export interface Container {
  id: string;
  container_number: string;
  bl_number: string | null;
  seal_number: string | null;
  carrier: string | null;
  vessel_name: string | null;
  voyage_number: string | null;
  customer_name: string | null;
  cargo_description: string | null;
  packages: number | null;
  gross_weight_kg: number | null;
  volume_cbm: number | null;
  freight_terms: string | null;
  origin_port: string | null;
  dest_port: string | null;
  place_of_receipt: string | null;
  place_of_delivery: string | null;
  departure_date: string | null;
  eta: string | null;
  actual_arrival: string | null;
  /** Warehouse role: stripped. */
  shipper_name: string | null;
  /** Warehouse role: stripped. */
  shipper_address: string | null;
  /** Warehouse role: stripped. */
  consignee_name: string | null;
  /** Warehouse role: stripped. */
  consignee_address: string | null;
  /** Warehouse role: stripped. */
  notify_party: string | null;
  status: ContainerStatus;
  warehouse_arrival_date: string | null;
  warehouse_arrival_by: string | null;
  warehouse_departure_date: string | null;
  warehouse_departure_by: string | null;
  release_ready: boolean;
  release_confirmed_by: string | null;
  release_confirmed_at: string | null;
  intake_assigned_to: string | null;
  intake_assigned_at: string | null;
  port_free_days: number | null;
  port_free_days_start: string | null;
  port_free_days_end: string | null;
  port_demurrage_notified: boolean;
  carrier_free_days: number | null;
  carrier_free_days_start: string | null;
  carrier_free_days_end: string | null;
  carrier_detention_notified: boolean;
  bl_mapped: boolean;
  is_archived: boolean;
  archived_at: string | null;
  tracking_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  container_size: string | null;
  ownership_confirmed_by: string | null;
  ownership_confirmed_at: string | null;
  bl_pl_items_match: boolean | null;
  bl_total_items: number | null;
  pl_total_items: number | null;
  container_suppliers: ContainerSupplier[];
}

export interface StatusHistoryEntry {
  id: string;
  container_id: string;
  status: ContainerStatus;
  location: string | null;
  details: string | null;
  updated_by: string | null;
  updated_at: string;
  source: "api" | "manual" | "whatsapp" | "photo" | string;
}

export type DocumentType = "bl" | "packing_list" | "invoice" | "certificate" | "release_docs" | "other";

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  bl: "שטר מטען (B/L)",
  packing_list: "רשימת אריזה",
  invoice: "חשבונית",
  certificate: "תעודה",
  release_docs: "מסמכי שחרור",
  other: "אחר",
};

export interface ContainerDocument {
  id: string;
  container_id: string;
  doc_type: DocumentType;
  file_path: string;
  original_name: string | null;
  file_size_kb: number | null;
  uploaded_at: string;
  uploaded_by: string | null;
  source: string | null;
  supplier_id: string | null;
}

export async function listContainers(sessionToken: string): Promise<ContainerListRow[]> {
  const res = await postJson<{ containers: ContainerListRow[] }>(ENDPOINTS.containersList, {
    session_token: sessionToken,
  });
  return res.containers;
}

export interface ContainerDetailResponse {
  container: Container | null;
  status_history: StatusHistoryEntry[];
  documents: ContainerDocument[];
}

export function getContainerDetail(sessionToken: string, containerId: string): Promise<ContainerDetailResponse> {
  return postJson(ENDPOINTS.containerDetail, { session_token: sessionToken, container_id: containerId });
}

/**
 * Whitelist of fields the server accepts for a manual edit — kept in sync with
 * n8n's own ALLOWED list in "Dashboard API — Update Container Field". Anything
 * else is silently dropped server-side, not errored.
 */
export interface ContainerFieldUpdates {
  container_size?: string | null;
  bl_number?: string | null;
  seal_number?: string | null;
  carrier?: string | null;
  vessel_name?: string | null;
  voyage_number?: string | null;
  customer_name?: string | null;
  cargo_description?: string | null;
  packages?: number | null;
  gross_weight_kg?: number | null;
  volume_cbm?: number | null;
  freight_terms?: string | null;
  origin_port?: string | null;
  dest_port?: string | null;
  place_of_receipt?: string | null;
  place_of_delivery?: string | null;
  departure_date?: string | null;
  eta?: string | null;
  actual_arrival?: string | null;
  shipper_name?: string | null;
  shipper_address?: string | null;
  consignee_name?: string | null;
  consignee_address?: string | null;
  notify_party?: string | null;
  status?: ContainerStatus;
  warehouse_arrival_date?: string | null;
  warehouse_departure_date?: string | null;
  notes?: string | null;
  ownership_confirmed_by?: string | null;
  ownership_confirmed_at?: string | null;
}

/**
 * `location`/`details` only matter when `updates.status` is set — the server
 * writes them onto the new status_history row it inserts for that change.
 * They're ignored otherwise.
 */
export async function updateContainerField(
  sessionToken: string,
  containerId: string,
  updates: ContainerFieldUpdates,
  statusChange?: { location?: string; details?: string },
): Promise<Container> {
  const res = await postJson<{ container: Container }>(ENDPOINTS.updateContainerField, {
    session_token: sessionToken,
    container_id: containerId,
    updates,
    status_location: statusChange?.location || undefined,
    status_details: statusChange?.details || undefined,
  });
  return res.container;
}

/**
 * Creates a container by container_number if none exists yet, or updates the
 * same small field set (9 fields) if it does — manager/admin only. A brand
 * new container will usually need a follow-up updateContainerField call to
 * fill in the rest (B/L number, weights, addresses, etc.), since this
 * endpoint only ever touches these 9.
 */
export interface UpsertContainerInput {
  container_number: string;
  customer_name?: string;
  carrier?: string;
  vessel_name?: string;
  origin_port?: string;
  dest_port?: string;
  departure_date?: string;
  eta?: string;
  shipper_name?: string;
  status?: ContainerStatus;
}

export function upsertContainer(sessionToken: string, input: UpsertContainerInput): Promise<Container> {
  return postJson(ENDPOINTS.upsertContainer, { session_token: sessionToken, ...input });
}

/**
 * Manager/admin only. Deletes the container row itself (and best-effort
 * cleans up its daily_checkout_responses) — does not explicitly clean up
 * documents/status_history/container_suppliers rows for it.
 */
export function deleteContainer(sessionToken: string, containerId: string): Promise<unknown> {
  return postJson(ENDPOINTS.deleteContainer, { session_token: sessionToken, container_id: containerId });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Manager/admin only. Uploads to Supabase Storage under a server-generated
 * filename (the client's own filename is discarded except for its
 * extension) and inserts a `documents` row. The response carries no id or
 * path back — re-fetch container detail to see the new document.
 */
export async function uploadContainerDocument(
  sessionToken: string,
  containerNumber: string,
  file: File,
  docType: DocumentType = "other",
): Promise<unknown> {
  const file_base64 = await fileToBase64(file);
  return postJson(ENDPOINTS.uploadContainerDocument, {
    session_token: sessionToken,
    container_number: containerNumber,
    doc_type: docType,
    original_name: file.name,
    file_base64,
    mime_type: file.type || "application/pdf",
  });
}

/** Returns a signed, directly-fetchable URL valid for 5 minutes. */
export async function getContainerDocumentUrl(sessionToken: string, filePath: string): Promise<string> {
  const res = await postJson<{ url: string }>(ENDPOINTS.containerDocumentUrl, {
    session_token: sessionToken,
    file_path: filePath,
  });
  return res.url;
}
