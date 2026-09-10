/**
 * ============================================================================
 * SERVICE WORKER FOR PUSH NOTIFICATIONS (web + Android Chrome / PWA)
 * ============================================================================
 */

self.addEventListener('push', function (event) {
  if (!event.data) return;

  var data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { body: event.data.text() };
  }

  var title = data.title || 'Anonroom';
  var options = {
    body: data.body || 'You have a new message.',
    icon: data.icon || '/android-chrome-192x192.png',
    badge: data.badge || '/android-chrome-192x192.png',
    image: data.image,
    vibrate: data.vibrate || [100, 50, 100],
    tag: data.tag || 'anonroom-msg',
    renotify: true,
    requireInteraction: false,
    data: {
      url: data.url || '/'
    },
    actions: data.actions || []
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var raw = (event.notification.data && event.notification.data.url) || '/';
  var targetUrl;
  try {
    targetUrl = new URL(raw, self.location.origin).href;
  } catch (e) {
    targetUrl = self.location.origin + '/';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        try {
          var clientOrigin = new URL(client.url).origin;
          if (clientOrigin === self.location.origin && 'focus' in client) {
            return client.focus().then(function (focused) {
              if (focused && focused.postMessage) {
                focused.postMessage({ type: 'notification-navigate', url: targetUrl });
              }
              return focused;
            });
          }
        } catch (e) { /* continue */ }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
