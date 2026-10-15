// Щоденне нагадування «Як пройшов твій день?» через Web Push.
// Застосунок підписується на пуші й надсилає підписку, час і часовий пояс на сервер (push-worker/),
// а той у потрібний час надсилає сповіщення. Записи щоденника на сервер не потрапляють.

// Адреса Cloudflare Worker з push-worker/. Порожня — нагадування ще не налаштовані.
const PUSH_API_URL = 'https://daily-push.redtom93-e7f.workers.dev';
const STORAGE_REMINDER = 'daily-reminder';
const DEFAULT_REMINDER_TIME = '23:00';

const reminderToggle = document.getElementById('reminder-toggle');
const reminderTime = document.getElementById('reminder-time');
const reminderTest = document.getElementById('reminder-test');
const reminderStatus = document.getElementById('reminder-status');
const reminderHint = document.getElementById('reminder-hint');

function loadReminder() {
  try {
    return { enabled: false, time: DEFAULT_REMINDER_TIME, ...JSON.parse(localStorage.getItem(STORAGE_REMINDER) || '{}') };
  } catch {
    return { enabled: false, time: DEFAULT_REMINDER_TIME };
  }
}

function saveReminder(state) {
  try {
    localStorage.setItem(STORAGE_REMINDER, JSON.stringify(state));
  } catch {}
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Чому нагадування зараз неможливі — або null, якщо все гаразд
function reminderBlocker() {
  if (!PUSH_API_URL) return 'Нагадування скоро з\'являться — сервер ще налаштовується.';
  if (isIOS() && !isStandalone()) {
    return 'Щоб отримувати нагадування, додайте Daily на початковий екран (Safari → «Поділитися» → «На початковий екран») і відкрийте його з іконки.';
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'Цей браузер не підтримує сповіщення.';
  }
  if (Notification.permission === 'denied') {
    return 'Сповіщення для Daily вимкнені. Увімкніть їх у Параметрах iPhone → Сповіщення → Daily.';
  }
  return null;
}

function renderReminder() {
  const state = loadReminder();
  const blocker = reminderBlocker();
  reminderToggle.checked = state.enabled && !blocker;
  reminderToggle.disabled = Boolean(blocker);
  reminderTime.value = state.time;
  reminderTime.disabled = Boolean(blocker);
  reminderTest.hidden = !reminderToggle.checked;
  reminderHint.textContent = blocker || 'Щодня в обраний час нагадаю оцінити день.';
}

function urlBase64ToUint8Array(base64) {
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function api(path, body) {
  const response = await fetch(PUSH_API_URL + path, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function getSubscription(create) {
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription && create) {
    const { publicKey } = await api('/vapid');
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  return subscription;
}

async function syncReminder(time) {
  const subscription = await getSubscription(true);
  await api('/subscribe', {
    subscription: subscription.toJSON(),
    time,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

async function enableReminder() {
  // Дозвіл запитуємо прямо з тапу по перемикачу — iOS вимагає жест користувача
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    reminderStatus.textContent = 'Без дозволу на сповіщення нагадування не працюватимуть.';
    renderReminder();
    return;
  }
  const time = reminderTime.value || DEFAULT_REMINDER_TIME;
  await syncReminder(time);
  saveReminder({ enabled: true, time });
  reminderStatus.textContent = `Готово! Нагадаю щодня о ${time} 🔔`;
}

async function disableReminder() {
  const subscription = await getSubscription(false);
  if (subscription) {
    await api('/unsubscribe', { endpoint: subscription.endpoint }).catch(() => {});
    await subscription.unsubscribe();
  }
  saveReminder({ ...loadReminder(), enabled: false });
  reminderStatus.textContent = 'Нагадування вимкнено.';
}

reminderToggle.addEventListener('change', async () => {
  reminderToggle.disabled = true;
  reminderStatus.textContent = 'Зачекайте…';
  try {
    if (reminderToggle.checked) await enableReminder();
    else await disableReminder();
  } catch (err) {
    reminderStatus.textContent = `Не вдалося: ${err.message}. Спробуйте ще раз.`;
    saveReminder({ ...loadReminder(), enabled: false });
  }
  renderReminder();
});

reminderTime.addEventListener('change', async () => {
  const time = reminderTime.value || DEFAULT_REMINDER_TIME;
  const state = loadReminder();
  saveReminder({ ...state, time });
  if (!state.enabled) return;
  try {
    await syncReminder(time);
    reminderStatus.textContent = `Час змінено: нагадаю о ${time}`;
  } catch (err) {
    reminderStatus.textContent = `Не вдалося змінити час: ${err.message}`;
  }
});

reminderTest.addEventListener('click', async () => {
  reminderStatus.textContent = 'Надсилаю…';
  try {
    const subscription = await getSubscription(false);
    const result = await api('/test', { endpoint: subscription.endpoint });
    reminderStatus.textContent = result.ok ? 'Надіслано — сповіщення має з\'явитися за кілька секунд.' : `Сервер пушів відповів ${result.status}`;
  } catch (err) {
    reminderStatus.textContent = `Не вдалося: ${err.message}`;
  }
});

document.getElementById('open-settings-btn').addEventListener('click', () => {
  reminderStatus.textContent = '';
  renderReminder();
});

renderReminder();

// iOS інколи оновлює підписку — при кожному запуску тихо синхронізуємо її з сервером
(() => {
  const state = loadReminder();
  if (state.enabled && !reminderBlocker() && Notification.permission === 'granted') {
    syncReminder(state.time).catch(() => {});
  }
})();
