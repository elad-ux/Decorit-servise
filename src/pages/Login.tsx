import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { requestOtp, normalizePhoneForDisplay, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import logoWordmark from "../assets/brand/logo-wordmark-cream.png";
import logoMark from "../assets/brand/logo-mark-dark.png";

type Step = "phone" | "code";

const PHONE_PATTERN = /^0\d{8,9}$|^\+?972\d{8,9}$/;
const OTP_RESEND_COOLDOWN_SECONDS = 30;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as { from?: { pathname: string }; sessionEndedByServer?: boolean } | null;
  const from = navState?.from?.pathname ?? "/";
  const sessionEndedByServer = navState?.sessionEndedByServer ?? false;

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  async function sendOtp(targetPhone: string) {
    setBusy(true);
    setError(null);
    try {
      await requestOtp(targetPhone);
      // Server intentionally responds the same way whether or not the phone
      // is registered (see Flow 6 — OTP Request), so we don't reveal that
      // distinction here either — same UI regardless.
      setStep("code");
      setResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      const timer = window.setInterval(() => {
        setResendCooldown((s) => {
          if (s <= 1) {
            window.clearInterval(timer);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בשליחת הקוד. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  function handlePhoneSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = normalizePhoneForDisplay(phone);
    if (!PHONE_PATTERN.test(cleaned)) {
      setError("מספר טלפון לא תקין");
      return;
    }
    setPhone(cleaned);
    void sendOtp(cleaned);
  }

  async function handleCodeSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(otpCode)) {
      setError("הקוד צריך להיות 6 ספרות");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(phone, otpCode);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "קוד שגוי או שגיאת רשת");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <aside className="login-brand">
        <div className="login-brand-dots" />
        <div className="login-brand-blob login-brand-blob-a" />
        <div className="login-brand-blob login-brand-blob-b" />
        <div className="login-brand-content">
          <img className="login-brand-logo" src={logoWordmark} alt="Decorit — Designing Your Dreams" />
          <hr className="login-brand-rule" />
          <p className="login-brand-tagline">יבוא ושיווק מוצרי עיצוב, וילונות ואביזרי דקורציה</p>
          <p className="login-brand-sub">פאנל ניהול לצוות — מעקב מכולות, תפוצות ושירות לקוחות במקום אחד.</p>
        </div>
      </aside>

      <div className="login-form-panel">
        <div className="login-card">
          <img className="login-card-logo" src={logoMark} alt="Decorit" />
          {step === "phone" ? (
            <form onSubmit={handlePhoneSubmit} noValidate>
              <h1>כניסה לפאנל</h1>
              <p className="sub">נשלח קוד אימות בוואטסאפ למספר שלכם</p>
              {sessionEndedByServer && !error && (
                <div className="error-box">ההתחברות שלכם הסתיימה או נותקה. יש להתחבר מחדש.</div>
              )}
              {error && <div className="error-box">{error}</div>}
              <div className="field">
                <label htmlFor="phone">מספר טלפון</label>
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="050-1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={busy}
                  autoFocus
                />
              </div>
              <button className="btn" type="submit" disabled={busy || phone.trim().length === 0}>
                {busy ? "שולח..." : "שלחו לי קוד"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit} noValidate>
              <h1>הזינו את הקוד</h1>
              <p className="sub">שלחנו קוד בן 6 ספרות בוואטסאפ ל-{phone}</p>
              {error && <div className="error-box">{error}</div>}
              <div className="field">
                <label htmlFor="otp">קוד אימות</label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  disabled={busy}
                  autoFocus
                />
              </div>
              <button className="btn" type="submit" disabled={busy || otpCode.length !== 6}>
                {busy ? "מאמת..." : "כניסה"}
              </button>
              <button
                type="button"
                className="btn-link"
                disabled={resendCooldown > 0 || busy}
                onClick={() => void sendOtp(phone)}
              >
                {resendCooldown > 0 ? `שליחה חוזרת בעוד ${resendCooldown} שנ'` : "שלחו קוד שוב"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
