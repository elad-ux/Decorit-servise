// Minimal Web Push service worker: show a notification for each push event,
// and focus/open the panel when it's clicked. No caching/offline behavior —
// this app is always network-fresh, the SW exists purely to receive pushes.

self.addEventListener("push", (event) => {
  let data = { title: "Decorit", body: "התקבלה התראה חדשה", url: "./", tag: "decorit-push" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // non-JSON payload — fall back to the defaults above
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "./", self.location.href).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(new URL("./", self.location.href).href) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
