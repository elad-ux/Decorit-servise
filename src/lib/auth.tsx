import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { SESSION_STORAGE_KEY } from "./config";
import { verifyOtp, type Role } from "./api";

export interface Session {
  sessionToken: string;
  role: Role;
  name: string;
  phone: string;
  /**
   * Local-only estimate (server TTL is 8h at issue time), NOT authoritative.
   * The server re-validates session_token + expires_at on every single API
   * call, so a tampered/extended value here buys an attacker nothing — this
   * field only drives a "your session will expire around..." UI hint.
   */
  expiresAtGuess: string;
}

/**
 * Defensive parse — never trust localStorage content as well-formed. Roles
 * are dynamic (defined via the rules page), so this only checks shape, not
 * membership in a fixed list — the server is what actually enforces role
 * validity on every API call regardless of what's cached here.
 */
function readStoredSession(): Session | null {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (
      typeof parsed.sessionToken === "string" &&
      parsed.sessionToken.length > 0 &&
      typeof parsed.name === "string" &&
      typeof parsed.phone === "string" &&
      typeof parsed.role === "string" &&
      parsed.role.length > 0 &&
      typeof parsed.expiresAtGuess === "string"
    ) {
      return parsed as Session;
    }
  } catch {
    // corrupted value — treat as logged out
  }
  return null;
}

interface AuthContextValue {
  session: Session | null;
  login: (phone: string, otpCode: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readStoredSession());

  useEffect(() => {
    if (session) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      async login(phone: string, otpCode: string) {
        const res = await verifyOtp(phone, otpCode);
        const expiresAtGuess = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
        setSession({
          sessionToken: res.session_token,
          role: res.role,
          name: res.name,
          phone,
          expiresAtGuess,
        });
      },
      logout() {
        setSession(null);
      },
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

/** Route guard: redirects to /login (preserving the intended destination) when logged out. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}
