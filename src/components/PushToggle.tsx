import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { getActiveSubscription, isPushSupported, subscribeToPush, unsubscribeFromPush } from "../lib/push";

type State = "checking" | "unsupported" | "off" | "on" | "denied" | "busy";

export default function PushToggle() {
  const { session } = useAuth();
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!isPushSupported()) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const sub = await getActiveSubscription();
      if (!cancelled) setState(sub ? "on" : "off");
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "unsupported" || !session) return null;

  async function handleClick() {
    if (!session) return;
    setError(null);
    setState("busy");
    try {
      if (state === "on") {
        await unsubscribeFromPush(session.sessionToken);
        setState("off");
      } else {
        await subscribeToPush(session.sessionToken);
        setState("on");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בהגדרת התראות");
      setState(Notification.permission === "denied" ? "denied" : "off");
    }
  }

  const label =
    state === "on" ? "🔔 התראות פעילות" : state === "denied" ? "🔕 התראות חסומות" : state === "busy" ? "..." : "🔕 הפעל התראות";

  return (
    <span title={error ?? (state === "denied" ? "יש לאשר התראות בהגדרות הדפדפן" : "התראה בזמן אמת כשלקוח משיב")}>
      <button type="button" className="btn-link" onClick={() => void handleClick()} disabled={state === "busy" || state === "denied"}>
        {label}
      </button>
    </span>
  );
}
