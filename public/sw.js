// Runs independently of any open tab — this is what lets the
// notification fire even if the customer closed the tracking page or
// switched away to another app entirely.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }

  const title = data.title || "It's your turn!";
  const options = {
    body: data.body || "",
    icon: "/mg-logo.jpg",
    badge: "/mg-logo.jpg",
    tag: "queue-call",
    // Re-alert (sound + banner) even if an older call notification with
    // the same tag is still on screen. iOS plays its default sound;
    // vibrate is honored on Android only.
    renotify: true,
    silent: false,
    vibrate: [400, 150, 400, 150, 400],
    requireInteraction: true,
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
