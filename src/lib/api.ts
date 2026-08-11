import { ENDPOINTS } from "./config";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type Role = "admin" | "manager" | "warehouse";

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
async function postJson<T>(url: string, body: unknown): Promise<T> {
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
