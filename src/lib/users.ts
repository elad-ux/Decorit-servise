import { ENDPOINTS } from "./config";
import { postAction } from "./api";
import type { Role } from "./api";

export interface AuthorizedUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  active: boolean;
  created_at: string;
  last_seen: string | null;
}

function manage<T>(sessionToken: string, action: string, payload?: unknown) {
  return postAction<T>(ENDPOINTS.manageUsers, sessionToken, action, payload);
}

export async function listUsers(sessionToken: string): Promise<AuthorizedUser[]> {
  const res = await manage<{ users: AuthorizedUser[] }>(sessionToken, "list");
  return res.users;
}

export interface UpsertUserInput {
  id?: string;
  name: string;
  phone: string;
  role: Role;
}

export function upsertUser(sessionToken: string, user: UpsertUserInput): Promise<{ user: AuthorizedUser }> {
  return manage(sessionToken, "upsert", user);
}

export function setUserActive(sessionToken: string, id: string, active: boolean): Promise<{ user: AuthorizedUser }> {
  return manage(sessionToken, "set_active", { id, active });
}

/**
 * Deletes every dashboard_sessions row for this user's phone, forcing an
 * immediate logout (if currently connected) and requiring a fresh OTP
 * login next time — whether or not they're connected right now.
 */
export function revokeSession(sessionToken: string, id: string): Promise<{ notice: string }> {
  return manage(sessionToken, "revoke_session", { id });
}
