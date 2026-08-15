/**
 * Tiny pub/sub so api.ts (which has no React context) can tell auth.tsx
 * that the current session_token was rejected server-side — expired
 * naturally, or force-revoked by an admin via the "נתק" button. auth.tsx
 * is the sole listener: it clears the session, which sends the user back
 * to /login through RequireAuth. Kept in its own module to avoid a
 * circular import between api.ts and auth.tsx.
 */
type Listener = () => void;

let listener: Listener | null = null;

export function onSessionInvalid(fn: Listener | null) {
  listener = fn;
}

export function notifySessionInvalid() {
  listener?.();
}
