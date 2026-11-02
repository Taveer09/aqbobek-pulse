self.addEventListener("push", (event) => {
  let data = {
    title: "Aqbobek Pulse",
    body: "Расписание обновлено",
    url: "/notifications",
  };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.id || "pulse",
      data: { url: data.url },
      icon: "/favicon.svg",
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        const target = list.find((c) => c.url.startsWith(self.location.origin));
        if (target) {
          target.navigate(new URL("/notifications", self.location.origin).href);
          return target.focus();
        }
        return clients.openWindow("/notifications");
      }),
  );
});
