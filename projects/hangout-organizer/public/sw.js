/*
 * Service worker. Receives host notifications. That is ALL it does.
 *
 * THERE IS DELIBERATELY NO `fetch` HANDLER AND NO CACHE.
 *
 * Every page in this app is `force-dynamic`, because a poll's grid, its
 * heatmap and its "waiting on" list are wrong the moment someone else answers.
 * A service worker that served any of that from a cache would hand friends a
 * stale poll — showing slots already taken, or hiding an activity added an hour
 * ago — and it would do it silently, on the one page opened by people who have
 * never seen this app before. Offline support is not worth that. If you ever
 * add caching here, exclude /s/ and /e/ and think very hard about the rest.
 *
 * Not built or transpiled — it is served verbatim from /public, so this file
 * must stay plain browser JavaScript.
 */

// Take over without waiting for every tab to close, so a fix to this file is
// live on the next page load rather than whenever the host next quits Chrome.
self.addEventListener("install", function () {
  self.skipWaiting();
});
self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  // A push service may wake us with no payload at all. Ringing with a generic
  // line beats swallowing it — the host still learns something moved.
  var payload = { title: "Hangout Organizer", body: "Someone answered a poll.", url: "/" };
  if (event.data) {
    try {
      payload = Object.assign(payload, event.data.json());
    } catch (e) {
      payload.body = event.data.text() || payload.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      // Same tag for the same poll => the OS replaces rather than stacks.
      // `renotify` is what still makes it buzz; without it a replacement
      // arrives silently and the host only sees it when the phone is next
      // unlocked, which defeats the point of a notification.
      tag: payload.tag || "hangout",
      renotify: Boolean(payload.tag),
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clients) {
      // Prefer a tab that is already on that poll, then any tab of this app,
      // and only then open a new one. Tapping five notifications should not
      // leave five windows behind.
      var exact = null;
      var any = null;
      for (var i = 0; i < clients.length; i++) {
        var url = new URL(clients[i].url);
        if (url.pathname === target) { exact = clients[i]; break; }
        if (any === null) any = clients[i];
      }
      var client = exact || any;
      if (client) {
        return client.focus().then(function (focused) {
          if (!exact && "navigate" in focused) return focused.navigate(target);
        });
      }
      return self.clients.openWindow(target);
    })
  );
});
