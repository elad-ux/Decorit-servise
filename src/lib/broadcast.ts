import { ENDPOINTS } from "./config";
import { postAction, postJson } from "./api";
import { buildCsv, downloadCsv } from "./csv";

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
  /**
   * deleted_from_meta: the template was deleted on Meta's side (confirmed),
   * but the local row can't be deleted too — it's referenced by real send/
   * batch history via a NO ACTION foreign key, so deleting it would corrupt
   * that history. Kept as a distinct terminal state so it never gets
   * confused with a genuine Meta rejection (which is a content problem, not
   * "this template no longer exists").
   */
  status: "draft" | "pending" | "approved" | "rejected" | "deleted_from_meta";
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
 * returns them — note it's `send_id`, not `id`.
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
  /** When a dashboard user last opened this reply — null means unseen. Distinct from read_at, which is WhatsApp's own read receipt for the OUTGOING message. */
  reply_seen_at: string | null;
  reply_tags: string[];
  contact_id: string;
  opted_out: boolean;
  opted_out_at: string | null;
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

/** Distinct city values already present on real contacts — powers the city chip picker on the Send page. */
export async function listDistinctCities(sessionToken: string): Promise<string[]> {
  const res = await contacts<{ cities: string[] }>(sessionToken, "distinct_values");
  return res.cities;
}

export interface ImportRowError {
  row: number;
  reason: string;
}

/**
 * A normalized, validated import row exactly as import_preview returns it.
 * import_confirm expects this same shape back verbatim (business_name,
 * contact_name, phone, city, categories, _status) — no client-side
 * reshaping needed, just pass the preview response's `rows` straight
 * through once the user confirms.
 */
export interface ImportRow {
  row: number;
  business_name: string;
  contact_name: string;
  phone: string;
  city: string;
  categories: string[];
  _status: "new" | "update";
  _existingId: string | null;
}

export interface ImportPreviewResult {
  total: number;
  new_count: number;
  update_count: number;
  error_count: number;
  errors: ImportRowError[];
  rows: ImportRow[];
}

/**
 * Validates + normalizes raw parsed spreadsheet rows (Hebrew headers שם
 * העסק/איש קשר/טלפון/עיר/קטגוריה, or business_name/contact_name/phone/
 * city/category — either works) and matches them against existing
 * contacts by phone, without writing anything yet.
 */
export function previewContactImport(sessionToken: string, rows: Record<string, string>[]): Promise<ImportPreviewResult> {
  return contacts(sessionToken, "import_preview", { rows });
}

/**
 * Writes the rows from a previous import_preview call: creates new
 * contacts / updates existing ones (matched by phone), and links
 * categories by name — a category name not already in the system is
 * created automatically, up to 3 categories per row.
 */
export function confirmContactImport(
  sessionToken: string,
  rows: ImportRow[],
  sourceFile?: string,
): Promise<{ added: number; updated: number }> {
  return contacts(sessionToken, "import_confirm", { rows, source_file: sourceFile });
}

/** Column order shared by the import template and the export file, so a downloaded export can be re-imported as-is. */
const CONTACT_CSV_HEADERS = ["שם העסק", "איש קשר", "טלפון", "עיר", "קטגוריה"];

export function downloadContactImportTemplate() {
  const csv = buildCsv(CONTACT_CSV_HEADERS, [["חנות לדוגמה", "ישראל ישראלי", "0501234567", "תל אביב", "לקוחות"]]);
  downloadCsv("תבנית_אנשי_קשר.csv", csv);
}

/** Exports whatever contact rows the caller passes — the Contacts page passes its currently-filtered list, so this respects city/category/search filters already applied there. */
export function downloadContactsCsv(rowsToExport: BroadcastContact[]) {
  const rows = rowsToExport.map((c) => [
    c.business_name,
    c.contact_name ?? "",
    c.phone,
    c.city ?? "",
    c.categories.map((cat) => cat.name).join("; "),
    c.active ? "כן" : "לא",
    c.opted_out ? "כן" : "לא",
  ]);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadCsv(`אנשי_קשר_${stamp}.csv`, buildCsv([...CONTACT_CSV_HEADERS, "פעיל", "הוסר מרשימת תפוצה"], rows));
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

export type AiContentSuggestion = {
  suggested_text: string | null;
  category: "marketing" | "utility";
  confidence: "high" | "medium" | "low";
  reasoning: string;
};

export function suggestTemplateContent(sessionToken: string, bodyText: string): Promise<{ suggestion: AiContentSuggestion }> {
  return send(sessionToken, "ai_suggest_content", { body_text: bodyText });
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

/**
 * Forces an immediate per-template sync against Meta (in addition to the
 * automatic 15-minute reconcile job). Looks the template up by its stored
 * meta_template_id first, falling back to name-based search — recovers even
 * templates whose meta_template_name was never saved locally.
 */
export async function forceSyncTemplate(
  sessionToken: string,
  id: string,
): Promise<{ status: string; meta_template_name: string; rejection_reason: string | null }> {
  return templates(sessionToken, "force_sync", { id });
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

/**
 * Cancels a batch: marks every send still in "queued" status as "cancelled"
 * (n8n's Cancel Queued Sends node) and the batch itself as "cancelled".
 * Sends already sent/delivered/failed are untouched — real send history
 * stays accurate, only work still waiting in the queue is stopped.
 */
export function cancelBatch(
  sessionToken: string,
  batchId: string,
): Promise<{ cancelled_sends: number; note: string }> {
  return send(sessionToken, "cancel_batch", { batch_id: batchId });
}

export async function listMessageStatus(
  sessionToken: string,
  batchId?: string,
): Promise<{ sends: BroadcastSendRow[]; summary: SendStatusSummary }> {
  return send(sessionToken, "list_message_status", batchId ? { batch_id: batchId } : {});
}

/** Marks a reply as seen by the current dashboard user — like opening an email. */
export function markReplySeen(sessionToken: string, sendId: string): Promise<unknown> {
  return send(sessionToken, "mark_reply_seen", { send_id: sendId });
}

/** Replaces the full tag set on a reply thread (e.g. "חשוב", "המשך_טיפול"). */
export function setReplyTags(sessionToken: string, sendId: string, tags: string[]): Promise<unknown> {
  return send(sessionToken, "set_reply_tags", { send_id: sendId, tags });
}

export interface ConversationMessage {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  wa_message_id: string | null;
  responded: boolean;
  created_at: string;
}

/** Full message thread for one contact (broadcast_conversation_messages), unlike reply_text which only ever holds the latest reply. */
export function listConversation(sessionToken: string, contactId: string): Promise<{ messages: ConversationMessage[] }> {
  return send(sessionToken, "list_conversation", { contact_id: contactId });
}

/** Staff sends a free-form reply from the dashboard — only works while the contact's 24h WhatsApp session window is open. */
export function sendReply(sessionToken: string, contactId: string, text: string): Promise<{ success: boolean; error?: string }> {
  return send(sessionToken, "send_reply", { contact_id: contactId, text });
}
