/**
 * System Web Notifications — minimal body, permission-gated.
 */

const APP_TITLE = 'Argus';

export function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * @returns {Promise<NotificationPermission | 'unsupported'>}
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Fire a minimal notification when permission is granted.
 */
export function fireNotification(label = '') {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification(APP_TITLE, {
      body: label,
      silent: false,
      tag: 'argus-presence',
      renotify: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    setTimeout(() => n.close(), 1200);
  } catch (err) {
    console.warn('[presence] notification failed:', err);
  }
}

/** @param {NotificationPermission | 'unsupported'} perm */
export function permissionLabelZh(perm) {
  switch (perm) {
    case 'granted':
      return '已允許';
    case 'denied':
      return '已拒絕';
    case 'default':
      return '尚未詢問';
    case 'unsupported':
      return '不支援';
    default:
      return String(perm);
  }
}
