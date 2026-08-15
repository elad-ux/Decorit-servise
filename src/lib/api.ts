import { ENDPOINTS } from "./config";
import { notifySessionInvalid } from "./sessionEvents";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Roles are dynamic, not a fixed set: admins define them (name + which
 * features they can see) from the "הרשאות" rules page, backed by the
 * role_permissions table. "admin" is the one hardcoded exception — it's
 * always full access everywhere, server-enforced, and not itself editable
 * from that page (so the team can never lock itself out of admin access).
 * A handful of built-in names (manager/warehouse/whatsapp) exist as
 * pre-seeded starting points but carry no special meaning in code beyond
 * whatever permissions are actually granted to them.
 */
export type Role = string;

export interface OtpRequestResponse {
  status: "ok";
  registered: boolean;
}

export interface OtpVerifyResponse {
  status: "ok";
  session_token: string;
  role: Role;
  name: string;
}

/**
 * Every call is a POST with a JSON body — this is the contract every
 * n8n "Dashboard API" webhook expects (see the spec artifact). Failures are
 * normalized into ApiError so callers don't need to special-case fetch vs.
 * HTTP-error vs. n8n's own {error:true} shape.
 */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("שגיאת רשת — לא ניתן להתחבר לשרת", 0);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // no JSON body — fall through, res.ok/status still drives the error below
  }

  const asRecord = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;

  // A 401 on a request that carried a session_token means the server
  // rejected that specific token — expired, or force-revoked by an admin
  // (never a wrong-OTP/wrong-phone case, since those calls don't send one).
  // Distinct from a 403, which means a real session that's just missing a
  // specific permission — that should surface as an inline error, not a
  // forced logout.
  const hadSessionToken =
    typeof body === "object" && body !== null && "session_token" in (body as Record<string, unknown>);
  if (res.status === 401 && hadSessionToken) {
    notifySessionInvalid();
  }

  if (!res.ok) {
    const msg =
      (typeof asRecord.message === "string" && asRecord.message) ||
      (typeof asRecord.error === "string" && asRecord.error) ||
      `שגיאת שרת (${res.status})`;
    throw new ApiError(msg, res.status);
  }

  // n8n workflows in this system sometimes respond 200 with {success:false,...}
  // instead of a non-2xx status — treat that the same as a hard error.
  if (asRecord.success === false) {
    const msg = (typeof asRecord.error === "string" && asRecord.error) || "הפעולה נכשלה";
    throw new ApiError(msg, res.status);
  }

  return data as T;
}

/** Digits-only, country-code-normalized on the server; we just strip formatting. */
export function normalizePhoneForDisplay(raw: string): string {
  return raw.trim().replace(/[\s-]/g, "");
}

export function requestOtp(phone: string): Promise<OtpRequestResponse> {
  return postJson(ENDPOINTS.otpRequest, { phone });
}

export function verifyOtp(phone: string, otpCode: string): Promise<OtpVerifyResponse> {
  return postJson(ENDPOINTS.otpVerify, { phone, otp_code: otpCode });
}

/**
 * The broadcast (marketing) endpoints are each a single webhook that
 * multiplexes several operations via an `action` field in the body, instead
 * of one webhook per operation like the container endpoints. This is the
 * shared caller for that shape.
 */
export function postAction<T>(
  url: string,
  sessionToken: string,
  action: string,
  payload: unknown = {},
): Promise<T> {
  return postJson(url, { session_token: sessionToken, action, payload });
}
