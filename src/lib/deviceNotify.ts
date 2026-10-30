export function ensureNotificationPermission(): void {
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  void Notification.requestPermission();
}

export async function showSignalNotification(tag: string, title: string, body: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(title, {
    body,
    tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    silent: false,
    data: { url: '/' },
  });
}
