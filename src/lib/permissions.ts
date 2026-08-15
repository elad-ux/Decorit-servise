import { ENDPOINTS } from "./config";
import { postAction } from "./api";

export interface FeatureCatalogEntry {
  key: string;
  label: string;
  group: string | null;
}

export interface RolePermission {
  role: string;
  feature_key: string;
}

export interface PermissionsData {
  feature_catalog: FeatureCatalogEntry[];
  roles: string[];
  permissions: RolePermission[];
}

function manage<T>(sessionToken: string, action: string, payload?: unknown) {
  return postAction<T>(ENDPOINTS.managePermissions, sessionToken, action, payload);
}

export async function listPermissions(sessionToken: string): Promise<PermissionsData> {
  return manage(sessionToken, "list");
}

/**
 * Self-service "what can I see" — any authenticated user can call this
 * (unlike list/set, which are admin-only), so the Hub can gate its own
 * cards dynamically for custom roles instead of relying on a hardcoded
 * per-role list that wouldn't know about roles created after the fact.
 */
export async function myPermissions(sessionToken: string): Promise<string[]> {
  const res = await manage<{ feature_keys: string[] }>(sessionToken, "my_permissions");
  return res.feature_keys;
}

/**
 * Toggles a single (role, feature_key) permission on or off. "admin" is
 * rejected server-side — it's a hardcoded full-access bypass everywhere,
 * never itself editable, so the team can never lock itself out.
 */
export function setPermission(sessionToken: string, role: string, featureKey: string, enabled: boolean): Promise<unknown> {
  return manage(sessionToken, "set", { role, feature_key: featureKey, enabled });
}
