// n8n "Dashboard API" endpoints this panel talks to.
//
// These webhook IDs are not secrets — they're already fully exposed today inside
// the Appsmith app's client-executed queries (any app viewer's browser sends
// them in plaintext), so moving them into this bundle changes nothing about
// their exposure. The real access boundary is the OTP + session_token flow
// enforced server-side by n8n on every request. See SECURITY.md.
const API_ROOT = "https://containertracker43.duckdns.org/webhook";

export const ENDPOINTS = {
  otpRequest: `${API_ROOT}/fcdbab09-0352-426a-a003-7c913ef6ea24/otp/request`,
  otpVerify: `${API_ROOT}/be0a69e4-fde2-4d92-b5ec-76c9de2fa6ea/otp/verify`,
  containersList: `${API_ROOT}/0c665fc8-14a9-4d0e-9c7c-a5a2c1247caf/dashboard/containers`,
  containerDetail: `${API_ROOT}/f5a0bbc7-4fb8-4f31-aa9e-45df4e12e055/dashboard/container-detail`,
  updateContainerField: `${API_ROOT}/e076ce2d-50f9-426e-b736-80563d8fdcd5/dashboard/update-container-field`,
} as const;

export const SESSION_STORAGE_KEY = "decorit_panel_session";
