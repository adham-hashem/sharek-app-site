// SHARek service worker for background push notifications
// Listens for push events from FCM and displays system notifications
// when the app is in the background or closed.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    try {
      data = { notification: { title: "SHARek", body: event.data?.text() ?? "" } };
    } catch {
      data = { notification: { title: "SHARek", body: "New notification" } };
    }
  }

  const notification = data.notification || {};
  const payload = data.data || {};

  const title = notification.title || "SHARek";
  const body = notification.body || "";
  const clickAction = payload.click_action || "home";

  const options = {
    body,
    icon: new URL("image.png", self.registration.scope).href,
    badge: new URL("image.png", self.registration.scope).href,
    data: { click_action: clickAction, ...payload },
    vibrate: payload.priority === "high" ? [90, 60, 90] : [60],
    requireInteraction: payload.priority === "high",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const clickAction = event.notification.data?.click_action || "home";
  const targetUrl = `${self.registration.scope}?action=${encodeURIComponent(clickAction)}`;

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url.startsWith(self.registration.scope)) {
          client.postMessage({ type: "NOTIFICATION_CLICK", action: clickAction });
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
