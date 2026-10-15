// Daily push — Cloudflare Worker, що надсилає щоденні нагадування «Як пройшов твій день?».
//
// Застосунок сам надсилає сюди підписку (Web Push) разом із часом нагадування й часовим поясом.
// Кожні 5 хвилин cron перевіряє, кому вже настав час, і надсилає пуш — не частіше одного разу на добу.
// Зберігається лише підписка, час і пояс; записи щоденника сюди ніколи не потрапляють.
//
// Прив'язки (wrangler.toml): KV SUBS, змінні ALLOWED_ORIGINS, VAPID_PUBLIC_KEY, VAPID_SUBJECT,
// секрет VAPID_PRIVATE_JWK (приватний ключ P-256 у форматі JWK).

const SEND_WINDOW_MINUTES = 60;
const PUSH_TTL_SECONDS = 4 * 60 * 60;
const MESSAGE = {
  title: 'Daily',
  body: 'Як пройшов твій день? Оцініть його за хвилину ✨',
};

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/vapid') {
        return json({ publicKey: env.VAPID_PUBLIC_KEY }, 200, cors);
      }
      if (request.method === 'POST' && url.pathname === '/subscribe') {
        return json(await subscribe(await request.json(), env), 200, cors);
      }
      if (request.method === 'POST' && url.pathname === '/unsubscribe') {
        const { endpoint } = await request.json();
        await env.SUBS.delete(await keyFor(endpoint));
        return json({ ok: true }, 200, cors);
      }
      if (request.method === 'POST' && url.pathname === '/test') {
        const { endpoint } = await request.json();
        const record = await env.SUBS.get(await keyFor(endpoint), 'json');
        if (!record) return json({ error: 'not subscribed' }, 404, cors);
        const status = await sendPush(record.subscription, { ...MESSAGE, body: 'Тестове нагадування — усе працює 🎉' }, env);
        return json({ ok: status < 300, status }, 200, cors);
      }
      return json({ error: 'not found' }, 404, cors);
    } catch (err) {
      return json({ error: err.message }, 400, cors);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDueReminders(env));
  },
};

// ---------- Підписки ----------

async function subscribe(body, env) {
  const { subscription, time, tz } = body;
  if (!subscription?.endpoint?.startsWith('https://') || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new Error('invalid subscription');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('invalid time');
  localParts(new Date(), tz); // кине помилку для неіснуючого поясу

  const key = await keyFor(subscription.endpoint);
  const existing = await env.SUBS.get(key, 'json');
  await env.SUBS.put(key, JSON.stringify({
    subscription,
    time,
    tz,
    // Якщо сьогодні вже нагадали — не повторюємо після зміни часу
    lastSent: existing?.lastSent || null,
    createdAt: existing?.createdAt || new Date().toISOString(),
  }));
  return { ok: true };
}

async function keyFor(endpoint) {
  if (typeof endpoint !== 'string') throw new Error('invalid endpoint');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return 'sub:' + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Розклад ----------

function localParts(date, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

async function sendDueReminders(env) {
  const now = new Date();
  let cursor;
  do {
    const page = await env.SUBS.list({ prefix: 'sub:', cursor });
    for (const { name } of page.keys) {
      const record = await env.SUBS.get(name, 'json');
      if (!record) continue;
      const local = localParts(now, record.tz);
      const [h, m] = record.time.split(':').map(Number);
      const late = local.minutes - (h * 60 + m);
      if (late < 0 || late > SEND_WINDOW_MINUTES || record.lastSent === local.date) continue;

      const status = await sendPush(record.subscription, MESSAGE, env);
      if (status === 404 || status === 410) {
        // Підписка більше не дійсна (застосунок видалили чи вимкнули сповіщення)
        await env.SUBS.delete(name);
      } else if (status < 300) {
        await env.SUBS.put(name, JSON.stringify({ ...record, lastSent: local.date }));
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

// ---------- Web Push: VAPID (RFC 8292) і шифрування aes128gcm (RFC 8291) ----------

async function sendPush(subscription, message, env) {
  const endpoint = new URL(subscription.endpoint);
  const jwt = await vapidJwt(`${endpoint.protocol}//${endpoint.host}`, env);
  const body = await encryptPayload(subscription, new TextEncoder().encode(JSON.stringify(message)));
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(PUSH_TTL_SECONDS),
      Urgency: 'normal',
    },
    body,
  });
  return response.status;
}

async function vapidJwt(audience, env) {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT,
  })));
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(new Uint8Array(signature))}`;
}

async function encryptPayload(subscription, plaintext) {
  const uaPublic = fromB64url(subscription.keys.p256dh);
  const authSecret = fromB64url(subscription.keys.auth);

  const serverKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, serverKeys.privateKey, 256));

  const keyInfo = concat(new TextEncoder().encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);

  // Один запис: дані + роздільник 0x02 (останній запис)
  const record = concat(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, record));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// ---------- Допоміжне ----------

function concat(...arrays) {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let offset = 0;
  arrays.forEach((a) => {
    out.set(a, offset);
    offset += a.length;
  });
  return out;
}

function b64url(bytes) {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
