import { ENDPOINTS } from "./config";
import { postJson } from "./api";

export type ActivityEntityType = "contact" | "template" | "batch" | "send" | "category" | "user" | "permission";

export interface ActivityLogEntry {
  id: string;
  actor_phone: string;
  actor_name: string | null;
  actor_role: string;
  /** Open-ended — not a closed enum, new values can appear over time. Render as free text/badge, never a hardcoded dropdown. */
  action: string;
  entity_type: ActivityEntityType;
  entity_id: string | null;
  entity_label: string | null;
  /** JSON-encoded string, not an object — parse client-side before display. */
  details: string;
  created_at: string;
}

export interface ActivityLogFilters {
  actor_phone?: string;
  action?: string;
  entity_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

/**
 * Read-only endpoint — no `action` field in the request body (unlike the
 * other Dashboard API endpoints, which multiplex several actions per
 * webhook via `postAction`), just `{session_token, payload}`. admin-only
 * server-side (403 for everyone else).
 */
export function listActivityLog(sessionToken: string, filters: ActivityLogFilters = {}): Promise<{ entries: ActivityLogEntry[] }> {
  return postJson(ENDPOINTS.broadcastActivityLog, { session_token: sessionToken, payload: filters });
}
