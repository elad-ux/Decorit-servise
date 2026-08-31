// n8n "Dashboard API" endpoints this panel talks to.
//
// The URL is just /webhook/{path} — no webhook-node ID segment. n8n's own
// "Production URL" hint (shown in the editor and via its API) includes that
// ID, which is misleading: the actual route registered in n8n's webhook
// table (`webhook_entity`) is keyed on the plain path alone, confirmed by
// inspecting it directly. The ID-prefixed URL 404s as "not registered" even
// though the workflow is active — this cost a long debugging session before
// the real routing rule was found. Don't reintroduce the ID prefix.
//
// The paths themselves are not secrets — they're already fully exposed today
// inside the Appsmith app's client-executed queries (any app viewer's
// browser sends them in plaintext), so having them in this bundle changes
// nothing about their exposure. The real access boundary is the OTP +
// session_token flow enforced server-side by n8n on every request. See
// SECURITY.md.
const API_ROOT = "https://containertracker43.duckdns.org/webhook";

export const ENDPOINTS = {
  otpRequest: `${API_ROOT}/otp/request`,
  otpVerify: `${API_ROOT}/otp/verify`,
  containersList: `${API_ROOT}/dashboard/containers`,
  containerDetail: `${API_ROOT}/dashboard/container-detail`,
  updateContainerField: `${API_ROOT}/dashboard/update-container-field`,
  upsertContainer: `${API_ROOT}/dashboard/upsert-container`,
  deleteContainer: `${API_ROOT}/dashboard/delete-container`,
  uploadContainerDocument: `${API_ROOT}/dashboard/upload-document`,
  containerDocumentUrl: `${API_ROOT}/dashboard/document-url`,
  broadcastContacts: `${API_ROOT}/dashboard/broadcast-contacts`,
  broadcastTemplates: `${API_ROOT}/dashboard/broadcast-templates`,
  broadcastSend: `${API_ROOT}/dashboard/broadcast-send`,
  uploadBroadcastMedia: `${API_ROOT}/dashboard/upload-broadcast-media`,
  manageUsers: `${API_ROOT}/dashboard/manage-users`,
  managePermissions: `${API_ROOT}/dashboard/manage-permissions`,
  pushSubscriptions: `${API_ROOT}/dashboard/push-subscriptions`,
  broadcastActivityLog: `${API_ROOT}/dashboard/broadcast-activity-log`,
} as const;

/** Raw EC P-256 point, base64url — the public half of the VAPID keypair used to sign Web Push messages. Safe to ship client-side (that's its purpose). */
export const VAPID_PUBLIC_KEY =
  "BHvuyUMPqTmJaas7DnxfOTbV8uNnbrJvhOhsdqkhHFR1I3D3MDDP70HVnYRiqd0UNVazT-intGH26DGKJhIFqE8";

export const SESSION_STORAGE_KEY = "decorit_panel_session";
