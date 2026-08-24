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
      icon: '/vite.svg', // Replace with your actual app icon
      badge: '/vite.svg',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: '2'
      }
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Anonroom', options)
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url == '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
