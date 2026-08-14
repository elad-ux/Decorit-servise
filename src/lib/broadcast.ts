import { ENDPOINTS } from "./config";
import { postAction, postJson } from "./api";

export interface BroadcastContact {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string;
  city: string | null;
  /**
   * A contact can belong to several categories (many-to-many via
   * broadcast_contact_categories) — this is what "list" actually returns
   * per row (from the broadcast_contacts_with_categories view). The plain
   * `category` text column on broadcast_contacts is legacy/unused by the
   * n8n upsert handler (never written on update, always blanked on
   * create) — don't resurrect it.
   */
  categories: BroadcastCategory[];
  active: boolean;
  opted_out: boolean;
  opted_out_at: string | null;
  opted_out_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface BroadcastCategory {
  id: string;
  name: string;
}

export interface TemplateButton {
  type: "quick_reply" | "url" | "phone";
  text: string;
  value: string;
}

export interface BroadcastTemplate {
  id: string;
  name: string;
  meta_template_name: string | null;
  meta_template_id: string | null;
  category: string | null;
  language: string;
  header_type: "none" | "text" | "image" | "video" | "document";
  header_text: string | null;
  header_sample_media_url: string | null;
  body_text: string;
  footer_text: string | null;
  variables_used: string[] | null;
  has_optout_line: boolean;
  buttons: TemplateButton[] | null;
  status: "draft" | "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface BroadcastBatch {
  id: string;
  template_id: string;
  campaign_media_url: string | null;
  filter_cities: string[] | null;
  filter_categories: string[] | null;
  target_count: number | null;
  scheduled_for: string | null;
  status: "scheduled" | "sending" | "completed" | "cancelled";
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * Shape of broadcast_status_view rows, exactly as list_message_status
 * returns them — note it's `send_id`, not `id`, and there's no
 * `contact_id` (the contact is denormalized inline instead).
 */
export interface BroadcastSendRow {
  send_id: string;
  batch_id: string;
  status: "queued" | "sent" | "delivered" | "read" | "failed" | "skipped_optout" | "cancelled";
  error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  replied_at: string | null;
  reply_text: string | null;
  button_clicked: string | null;
  business_name: string;
  contact_name: string | null;
  phone: string;
  city: string | null;
  template_name: string;
}

export interface SendStatusSummary {
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  cancelled: number;
  replied: number;
}

function contacts<T>(sessionToken: string, action: string, payload?: unknown) {
  return postAction<T>(ENDPOINTS.broadcastContacts, sessionToken, action, payload);
}

function templates<T>(sessionToken: string, action: string, payload?: unknown) {
  return postAction<T>(ENDPOINTS.broadcastTemplates, sessionToken, action, payload);
}

function send<T>(sessionToken: string, action: string, payload?: unknown) {
  return postAction<T>(ENDPOINTS.broadcastSend, sessionToken, action, payload);
}

// ---- Contacts ----

export async function listContacts(sessionToken: string): Promise<BroadcastContact[]> {
  const res = await contacts<{ contacts: BroadcastContact[] }>(sessionToken, "list");
  return res.contacts;
}

export async function listCategories(sessionToken: string): Promise<BroadcastCategory[]> {
  const res = await contacts<{ categories: BroadcastCategory[] }>(sessionToken, "list_categories");
  return res.categories;
}

export function addCategory(sessionToken: string, name: string): Promise<unknown> {
  return contacts(sessionToken, "add_category", { name });
}

export interface UpsertContactInput {
  id?: string;
  business_name: string;
  contact_name?: string | null;
  phone: string;
  city?: string | null;
  /** Category UUIDs (from BroadcastCategory.id) — replaces the contact's full category set. */
  category_ids: string[];
}

export function upsertContact(sessionToken: string, contact: UpsertContactInput): Promise<unknown> {
  return contacts(sessionToken, "upsert", contact);
}

export function deleteContact(sessionToken: string, id: string): Promise<unknown> {
  return contacts(sessionToken, "delete", { id });
}

export function setContactActive(sessionToken: string, id: string, active: boolean): Promise<unknown> {
  return contacts(sessionToken, "bulk_set_active", { ids: [id], active });
}

export function markContactOptedOut(sessionToken: string, id: string): Promise<unknown> {
  return contacts(sessionToken, "mark_opted_out", { id });
}

export function reactivateContact(sessionToken: string, id: string): Promise<unknown> {
  return contacts(sessionToken, "reactivate", { id });
}

// ---- Templates ----

export async function listTemplates(sessionToken: string): Promise<BroadcastTemplate[]> {
  const res = await templates<{ templates: BroadcastTemplate[] }>(sessionToken, "list");
  return res.templates;
}

export function upsertTemplate(sessionToken: string, template: Partial<BroadcastTemplate>): Promise<unknown> {
  return templates(sessionToken, "upsert", template);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip the "data:<mime>;base64," prefix — the server only wants the payload
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a template header image/video/document to Supabase Storage
 * (bucket `broadcast-media`) via the dedicated upload-broadcast-media
 * webhook — this is a plain single-purpose endpoint (base64 body), not
 * one of the action-routed ones, so it doesn't go through postAction.
 */
export async function uploadBroadcastMedia(sessionToken: string, file: File): Promise<{ url: string }> {
  const file_base64 = await fileToBase64(file);
  return postJson(ENDPOINTS.uploadBroadcastMedia, {
    session_token: sessionToken,
    file_base64,
    original_name: file.name,
    mime_type: file.type || "application/octet-stream",
  });
}

export function deleteTemplate(sessionToken: string, id: string): Promise<unknown> {
  return templates(sessionToken, "delete", { id });
}

/**
 * Submits the template to Meta for approval (creates it via the WhatsApp
 * Message Templates API) — n8n builds the Meta payload from the template's
 * own fields server-side. Only valid for draft/rejected templates; sets
 * status to "pending" on success. Fails if the template is currently
 * pending review.
 */
export async function submitTemplateToMeta(
  sessionToken: string,
  id: string,
): Promise<{ status: string; meta_template_name: string }> {
  return templates(sessionToken, "submit_to_meta", { id });
}

/**
 * Polls Meta for the template's current review status and syncs it back
 * (approved/rejected/pending + rejection_reason) to broadcast_templates.
 */
export async function refreshTemplateStatus(
  sessionToken: string,
  id: string,
): Promise<{ status: string; rejection_reason: string | null }> {
  return templates(sessionToken, "refresh_status", { id });
}

// ---- Send / campaigns ----

export async function listSendTemplates(sessionToken: string): Promise<BroadcastTemplate[]> {
  const res = await send<{ templates: BroadcastTemplate[] }>(sessionToken, "list_templates");
  return res.templates;
}

export async function countTarget(
  sessionToken: string,
  filters: { filter_cities?: string[]; filter_categories?: string[] },
): Promise<number> {
  const res = await send<{ target_count: number }>(sessionToken, "count_target", filters);
  return res.target_count;
}

export interface CreateBatchInput {
  template_id: string;
  campaign_media_url?: string;
  filter_cities?: string[];
  filter_categories?: string[];
  scheduled_for?: string;
}

export function createBatch(
  sessionToken: string,
  input: CreateBatchInput,
): Promise<{ queued: number; note: string }> {
  return send(sessionToken, "create_batch", input);
}

export async function listBatches(sessionToken: string): Promise<BroadcastBatch[]> {
  const res = await send<{ batches: BroadcastBatch[] }>(sessionToken, "list_batches");
  return res.batches;
}

export async function listMessageStatus(
  sessionToken: string,
  batchId?: string,
): Promise<{ sends: BroadcastSendRow[]; summary: SendStatusSummary }> {
  return send(sessionToken, "list_message_status", batchId ? { batch_id: batchId } : {});
}
