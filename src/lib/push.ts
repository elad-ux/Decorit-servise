import { ENDPOINTS, VAPID_PUBLIC_KEY } from "./config";
import { postAction } from "./api";

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
}

/** Browser permission state — separate from whether we actually hold a subscription. */
export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("./");
  if (existing) return existing;
  return navigator.serviceWorker.register("./sw.js");
}

/** Existing push subscription for this browser, if any — null if never subscribed. */
export async function getActiveSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("./");
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

/** Requests permission (if needed), subscribes this browser, and saves it server-side. */
export async function subscribeToPush(sessionToken: string): Promise<PushSubscription> {
  if (!isPushSupported()) {
    throw new Error("התראות דחיפה אינן נתמכות בדפדפן זה");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("ההרשאה להתראות נדחתה");
  }

  const registration = await getRegistration();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  });

  const json = subscription.toJSON();
  await postAction(ENDPOINTS.pushSubscriptions, sessionToken, "save_push_subscription", {
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    user_agent: navigator.userAgent,
  });

  return subscription;
}

/** Removes the server-side record and unsubscribes this browser. */
export async function unsubscribeFromPush(sessionToken: string): Promise<void> {
  const subscription = await getActiveSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await postAction(ENDPOINTS.pushSubscriptions, sessionToken, "remove_push_subscription", { endpoint });
}
