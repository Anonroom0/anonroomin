/**
 * ============================================================================
 * SERVICE WORKER FOR PUSH NOTIFICATIONS
 * ============================================================================
 * Placed in the /public folder. Handles incoming background messages.
 */

self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();

    const options = {
      body: data.body || 'You have a new message.',
      icon: data.icon || '/vite.svg', // Replace with your actual app icon
      badge: data.badge || '/vite.svg',
      vibrate: [100, 50, 100],
      data: {
        url: data.url ?? '/'
      }
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Anonroom', options)
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url == url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
