# Security notes — Decorit panel

This document is written for whoever reviews this codebase, including a future
security audit. It states what this app assumes, what it enforces, and what it
explicitly does **not** — so a reviewer isn't guessing at intent.

## 1. Trust model

This is a **static, client-only** app with no backend of its own. Everything
shipped to the browser — HTML, CSS, JS, every constant in `src/lib/config.ts`
— is public. There is no server-side secret this app holds, because it has no
server. **The browser (and therefore the end user) is fully untrusted.** All
real authorization is enforced by the n8n workflows on
`containertracker43.duckdns.org`, which:

- validate `session_token` against `dashboard_sessions` (with `expires_at`) on
  **every single request**, not just at login;
- enforce field- and endpoint-level permissions by `role`
  (`admin` / `manager` / `warehouse`) server-side (see e.g. `Dashboard API —
  Update Container Field`, which whitelists editable fields and restricts
  `warehouse` to warehouse-date fields only).

Nothing in this repo should ever be written as if the client enforces
security — client-side role checks in `Hub.tsx` etc. are **UX only** (hide a
button a user isn't allowed to use), never a substitute for the server check.

## 2. Authentication & session handling

- Login is phone + WhatsApp OTP (`otp/request` → `otp/verify`), not a
  password. This app doesn't change that flow, only calls it.
- On success, `{session_token, role, name}` is stored in `localStorage` under
  `decorit_panel_session` (see `src/lib/auth.tsx`).
  - **Why `localStorage` and not an httpOnly cookie**: the API
    (`containertracker43.duckdns.org`) is a different origin from wherever
    this panel is hosted (GitHub Pages / a custom domain), so this app cannot
    set or receive cookies scoped to the API host at all — a cross-origin
    static site has no mechanism to do so. `localStorage` is therefore the
    only place to hold the token, same as the current Appsmith
    implementation. **This means an XSS bug in this app is a full session
    compromise** (token theft), which is exactly why §3 below matters.
  - The stored value is defensively parsed (`readStoredSession` in
    `auth.tsx`) — a corrupted or hand-edited value is treated as "logged
    out", never trusted as-is.
- `expiresAtGuess` stored client-side is a **local UX hint only** ("now + 8h",
  matching the server's known TTL at issue time). It is never sent to the
  server and never used to decide whether a request is allowed — the server
  re-validates `expires_at` itself on every call, so tampering with this
  field client-side achieves nothing.

## 3. Client-side hardening in this codebase

- **No `dangerouslySetInnerHTML`, no `eval`, no dynamic `<script>` injection**
  anywhere in this app. All rendered data goes through JSX, which escapes by
  default. Keep it that way — the moment a future page needs to render
  HTML-ish content (e.g. a broadcast template body), treat that as a decision
  requiring explicit sanitization, not a default.
- **Content-Security-Policy** meta tag in `index.html`: `script-src 'self'`
  (no inline scripts, no third-party script hosts, no `eval`), `connect-src`
  restricted to `'self'` and the one API host this app talks to. This is a
  **best-effort** CSP — GitHub Pages serves static files only, so this can't
  be a real HTTP response header. Meta-tag CSP cannot enforce
  `frame-ancestors` or replace `X-Frame-Options`; if clickjacking protection
  becomes a requirement, it needs a host that can set real headers (e.g. a
  Cloudflare Worker/Pages in front of this, or a custom domain proxy).
- **TypeScript strict mode** is on (`tsconfig.json`) to catch a class of bugs
  (undefined access, implicit any) before they ship.
- Phone/OTP input is validated client-side, but this is **only** for UX
  (fail fast, clear error) — the server is the real validator and always will
  be, since the client can be bypassed entirely (curl, a modified build, etc.).

## 4. Known gaps / things this migration did **not** fix — flag for audit

These predate this migration (they're true of the current Appsmith
deployment too) and are **not** introduced by this codebase, but a reviewer
should know about them:

- **CORS on the n8n webhooks has not been verified from a real browser.**
  This sandboxed build environment's outbound network policy blocks
  `containertracker43.duckdns.org` entirely (confirmed via the environment's
  own proxy status endpoint — `connect_rejected`, not an n8n-side 403), so
  neither a `curl` preflight nor a live browser test could be run from here.
  **This must be verified for real** — deploy this build to GitHub Pages (or
  run `npm run dev` and open it in a real browser) and confirm the login flow
  actually completes without a CORS error in devtools. If it fails, CORS
  needs to be enabled in n8n's webhook response (or globally in the n8n
  instance settings) for the deployed origin.
- **OTP rate limiting / brute force protection is unknown.** `Flow 6 — OTP
  Request` and `Flow 7 — OTP Verify` were read during the spec phase; neither
  showed a rate limit or lockout on repeated OTP attempts. A 6-digit numeric
  OTP without a request-rate limit is guessable within its 10-minute window
  under sustained brute force. Worth confirming/adding server-side
  (independent of this frontend).
- **`update-container-field` does not write to `status_history`** when
  `status` changes manually — flagged in the spec artifact, not yet fixed
  (this frontend hasn't reached the Containers module yet).
- **`broadcast_categories` / `broadcast_contact_categories` have RLS
  disabled** in Supabase (found during the original system mapping,
  unrelated to this panel specifically but sitting on the same project).
- **The GitHub repo hosting this code, and the GitHub Pages site it deploys,
  are public.** Anyone can read this source (which is fine — there's no
  secret in it, see §1) and anyone can *load* the login page and *request*
  an OTP for any phone number in `authorized_users` (the OTP send itself
  isn't gated by whether the requester is authorized — see `Flow 6`, it
  responds identically either way, which is good anti-enumeration practice,
  but it also means anyone can trigger an OTP WhatsApp message to a real
  staff member's phone repeatedly). If that's unacceptable, either restrict
  `otp/request` server-side (rate limit per phone/IP) or make the repo/site
  non-public (note: private GitHub Pages requires GitHub Pro/Team/Enterprise).

## 5. Reporting

If you find an issue in this app while reviewing it, the fix almost always
belongs in one of two places: **this repo** (client-side bug — XSS, broken
auth guard, leaked data in a response the UI shouldn't render) or **the n8n
workflows** (server-side authorization/validation bug — those are out of this
repo, in the n8n instance directly). Please note which, so it lands with the
right owner.
