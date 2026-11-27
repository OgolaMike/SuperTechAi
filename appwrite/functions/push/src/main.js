import { Client, Account, Users } from 'node-appwrite';
import webpush from 'web-push';

const json = (res, status, payload) => res.json(payload, status);
const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
};

export default async ({ req, res, log, error }) => {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:support@supertechai.app';
  if (!endpoint || !projectId || !apiKey || !publicKey || !privateKey) {
    return json(res, 503, { ok: false, error: 'Push service is not fully configured.' });
  }

  const adminClient = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const users = new Users(adminClient);
  const body = req.bodyJson || {};
  const headers = req.headers || {};

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);

    // Trusted internal event delivery. Keep PUSH_INTERNAL_TOKEN only in server secrets.
    if (body.action === 'send') {
      const expected = process.env.PUSH_INTERNAL_TOKEN;
      if (!expected || !safeEqual(headers['x-supertech-internal-token'], expected)) {
        return json(res, 401, { ok: false, error: 'Not authorized.' });
      }
      if (typeof body.userId !== 'string' || !body.notification || typeof body.notification.title !== 'string') {
        return json(res, 400, { ok: false, error: 'A user and notification title are required.' });
      }
      return await sendToUser(users, body.userId, body.notification, res, log);
    }

    // All member actions require a JWT supplied by Appwrite for the signed-in user.
    const jwt = headers['x-appwrite-user-jwt'];
    if (!jwt) return json(res, 401, { ok: false, error: 'Sign in again before managing push notifications.' });
    const userClient = new Client().setEndpoint(endpoint).setProject(projectId).setJWT(jwt);
    const account = new Account(userClient);
    const user = await account.get();
    if (!user.emailVerification) return json(res, 403, { ok: false, error: 'Verify your email before enabling push notifications.' });

    if (body.action === 'test') {
      return await sendToUser(users, user.$id, {
        title: 'SuperTech AI test notification',
        body: 'Push notifications are reaching this device successfully.',
        url: '/',
        tag: 'supertech-push-test',
      }, res, log);
    }

    return json(res, 400, { ok: false, error: 'Unsupported push action.' });
  } catch (err) {
    error(err?.stack || String(err));
    return json(res, 500, { ok: false, error: 'Push request failed. Check the Appwrite Function execution log.' });
  }
};

async function sendToUser(users, userId, notification, res, log) {
  const prefs = await users.getPrefs(userId);
  const push = prefs?.supertechPush || {};
  const devices = Array.isArray(push.devices) ? push.devices : [];
  if (!devices.length) return res.json({ ok: false, delivered: 0, error: 'No push-enabled device is registered for this account.' }, 404);

  const message = JSON.stringify({
    title: String(notification.title).slice(0, 100),
    body: String(notification.body || '').slice(0, 240),
    url: typeof notification.url === 'string' && notification.url.startsWith('/') ? notification.url : '/',
    tag: typeof notification.tag === 'string' ? notification.tag.slice(0, 100) : 'supertech-alert',
  });
  const retained = [];
  let delivered = 0;
  const outcomes = await Promise.all(devices.map(async (device) => {
    try {
      await webpush.sendNotification(device.subscription, message, { TTL: 60 * 60, urgency: 'high' });
      delivered += 1;
      retained.push(device);
      return { ok: true };
    } catch (err) {
      const status = Number(err?.statusCode || 0);
      if (status !== 404 && status !== 410) retained.push(device);
      log('Push delivery failed: ' + status);
      return { ok: false, status };
    }
  }));
  if (retained.length !== devices.length) {
    await users.updatePrefs(userId, { ...prefs, supertechPush: { ...push, devices: retained } });
  }
  return res.json({ ok: delivered > 0, delivered, attempted: devices.length, outcomes });
}
