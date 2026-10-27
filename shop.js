// Магазин винагород: товари з ціною в зірках, купівля за зароблені зірки, архів покупок.
// Баланс = зароблені зірки (starsEarned у tasks.js: зірки днів мінус штрафи) − витрачені на покупки.
// Сховище: { items: [{ id, title, emoji, cost, createdAt }],
//            purchases: [{ id, itemId, title, emoji, cost, at, usedAt }] }
// Купівля кладе винагороду в «Мої покупки» (usedAt: null — чекає), використати її можна будь-коли.
// У покупці зберігаємо знімок назви, емодзі й ціни — товар потім можуть змінити чи видалити.

const STORAGE_SHOP = 'daily-shop';

const SHOP_EMOJIS = ['🎁', '☕', '🍰', '🍕', '🎬', '📚', '🎮', '🎧', '👟', '💆', '✈️', '🛍️'];
const SHOP_COST_MIN = 1;
const SHOP_COST_MAX = 99;

const SHOP_HAPPY_PHRASES = [
  'Ви це заслужили! 🎉',
  'Винагорода ваша! 🥳',
  'Праця окупилась! ✨',
  'Чудовий вибір! 🎁',
  'Час насолоджуватись! 💫',
];

function loadShop() {
  try {
    const raw = localStorage.getItem(STORAGE_SHOP);
    const data = raw ? JSON.parse(raw) : {};
    // Покупки до появи «використано» вважаємо вже використаними — щоб не з'явилась купа «очікуваних»
    const purchases = (data.purchases || []).map((p) => ('usedAt' in p ? p : { ...p, usedAt: p.at }));
    return { items: data.items || [], purchases };
  } catch {
    return { items: [], purchases: [] };
  }
}

let shopStore = loadShop();

function saveShop() {
  localStorage.setItem(STORAGE_SHOP, JSON.stringify(shopStore));
}

function starsSpent() {
  return shopStore.purchases.reduce((sum, p) => sum + p.cost, 0);
}

function starBalance() {
  return starsEarned() - starsSpent();
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---------- Екран магазину ----------

const shopModal = document.getElementById('shop-modal');

document.getElementById('open-shop-btn').addEventListener('click', () => {
  renderShop();
  shopModal.hidden = false;
});

function waitingPurchases() {
  return shopStore.purchases.filter((p) => !p.usedAt);
}

function updateWaitingBadge() {
  const badge = document.getElementById('waiting-badge');
  const count = waitingPurchases().length;
  badge.hidden = !count;
  badge.textContent = count;
}

function renderShop() {
  updateWaitingBadge();
  const balance = starBalance();
  document.getElementById('shop-balance-value').textContent = Math.max(0, balance);
  document.getElementById('shop-balance-label').textContent = `${pluralStars(Math.max(0, balance))} на балансі`;

  const list = document.getElementById('shop-list');
  list.innerHTML = '';
  if (!shopStore.items.length) {
    list.innerHTML = `
      <div class="tasks-empty shop-empty">
        <div class="tasks-empty-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48"><rect x="8" y="18" width="32" height="22" rx="4"/><path d="M6 13h36v6H6zM24 13v27M24 13c-3-6-11-6-9 0M24 13c3-6 11-6 9 0"/></svg>
        </div>
        <div class="tasks-empty-title">Магазин поки порожній</div>
        <div class="tasks-empty-text">Додайте винагороди, на які хочете заробити зірки: кіно, смаколик, нова книга…</div>
      </div>`;
    return;
  }

  [...shopStore.items]
    .sort((a, b) => a.cost - b.cost || a.createdAt.localeCompare(b.createdAt))
    .forEach((item) => list.appendChild(renderShopItem(item, balance)));
}

function renderShopItem(item, balance) {
  const affordable = balance >= item.cost;
  const share = Math.min(1, Math.max(0, balance / item.cost));
  const missing = item.cost - balance;
  const card = document.createElement('div');
  card.className = 'shop-item' + (affordable ? ' affordable' : '');
  card.innerHTML = `
    <button type="button" class="shop-item-body">
      <span class="shop-item-emoji" aria-hidden="true"></span>
      <span class="shop-item-info">
        <span class="shop-item-title"></span>
        <span class="shop-item-cost">★ ${item.cost}</span>
        <span class="shop-item-owned"></span>
        ${affordable ? '' : `
        <span class="shop-progress" aria-label="Ще ${missing} ★ до цієї винагороди">
          <span class="shop-progress-bar"><span class="shop-progress-fill" style="width:${share * 100}%"></span></span>
          <span class="shop-progress-text">ще ${missing} ★</span>
        </span>`}
      </span>
    </button>
    <button type="button" class="shop-buy-btn">Купити</button>`;
  card.querySelector('.shop-item-emoji').textContent = item.emoji;
  card.querySelector('.shop-item-title').textContent = item.title;
  card.querySelector('.shop-item-body').addEventListener('click', () => openShopSheet(item));

  // Скільки разів купували, скільки вже використали і скільки чекає
  const bought = shopStore.purchases.filter((p) => p.itemId === item.id);
  const owned = card.querySelector('.shop-item-owned');
  if (bought.length) {
    const used = bought.filter((p) => p.usedAt).length;
    const waiting = bought.length - used;
    // Окремими чипами, щоб на вузькому екрані переносились цілими
    owned.innerHTML = `<span class="owned-count">Куплено ${bought.length}</span><span class="owned-count">Використано ${used}</span>`
      + (waiting ? `<span class="owned-waiting">🎁 ${waiting} чекає</span>` : '');
  } else {
    owned.remove();
  }

  const buy = card.querySelector('.shop-buy-btn');
  buy.addEventListener('click', () => {
    if (starBalance() < item.cost) {
      showShopSad(item);
      return;
    }
    openBuyConfirm(item, buy);
  });
  return card;
}

// ---------- Підтвердження покупки ----------

const buyConfirm = document.getElementById('buy-confirm');
let buyConfirmItem = null;
let buyConfirmFrom = null;

function openBuyConfirm(item, fromEl) {
  buyConfirmItem = item;
  buyConfirmFrom = fromEl;
  document.getElementById('buy-confirm-emoji').textContent = item.emoji;
  document.getElementById('buy-confirm-title').textContent = `Купити «${item.title}»?`;
  document.getElementById('buy-confirm-balance').innerHTML = `Ціна <b>★ ${item.cost}</b> · Залишиться <b>★ ${starBalance() - item.cost}</b>`;
  document.getElementById('buy-confirm-ok').textContent = `Купити за ★ ${item.cost}`;
  buyConfirm.hidden = false;
}

function closeBuyConfirm() {
  buyConfirm.hidden = true;
  buyConfirmItem = null;
}

document.getElementById('buy-confirm-ok').addEventListener('click', () => {
  const item = buyConfirmItem;
  const from = buyConfirmFrom;
  closeBuyConfirm();
  if (item && starBalance() >= item.cost) buyItem(item, from);
});
document.getElementById('buy-confirm-cancel').addEventListener('click', closeBuyConfirm);
buyConfirm.addEventListener('click', (e) => {
  if (e.target === buyConfirm) closeBuyConfirm();
});

function buyItem(item, fromEl) {
  shopStore.purchases.push({
    id: newId(),
    itemId: item.id,
    title: item.title,
    emoji: item.emoji,
    cost: item.cost,
    at: new Date().toISOString(),
    usedAt: null,
  });
  saveShop();
  if (navigator.vibrate) navigator.vibrate([20, 40, 30]);
  burstFrom(fromEl, STAR_COLORS);
  renderShop();
  renderStarWidget();
  showShopHappy(item);
}

// ---------- Попапи покупки ----------

const shopPopup = document.getElementById('shop-popup');

function showShopHappy(item) {
  const balance = starBalance();
  shopPopup.className = 'star-popup shop-popup happy';
  document.getElementById('shop-popup-art').innerHTML = `
    <div class="star-popup-rays"></div>
    <div class="gift">
      <div class="gift-lid"></div>
      <div class="gift-box"></div>
      <div class="gift-item"></div>
    </div>`;
  document.getElementById('shop-popup-art').querySelector('.gift-item').textContent = item.emoji;
  document.getElementById('shop-popup-title').textContent = SHOP_HAPPY_PHRASES[Math.floor(Math.random() * SHOP_HAPPY_PHRASES.length)];
  document.getElementById('shop-popup-text').textContent =
    `«${item.title}» — ваше! Чекає в «Моїх покупках», використайте, коли захочете. На балансі ${balance} ★.`;
  document.getElementById('shop-popup-btn').textContent = 'Ура! 🎉';
  shopPopup.hidden = false;
  if (!prefersReducedMotion()) setTimeout(goldenRain, 350);
}

function showShopSad(item) {
  const missing = item.cost - starBalance();
  shopPopup.className = 'star-popup shop-popup sad';
  document.getElementById('shop-popup-art').innerHTML = `
    <svg class="sad-star" viewBox="0 0 24 24" aria-hidden="true">
      <path class="sad-star-body" d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z"/>
      <circle class="sad-eye" cx="10" cy="11" r="0.75"/>
      <circle class="sad-eye" cx="14" cy="11" r="0.75"/>
      <path class="sad-mouth" d="M10.2 14.6q1.8-1.4 3.6 0"/>
    </svg>
    <span class="sad-tear" aria-hidden="true"></span>`;
  document.getElementById('shop-popup-title').textContent = 'Поки не вистачає зірок 😔';
  document.getElementById('shop-popup-text').textContent =
    `Для «${item.title}» потрібно ще ${missing} ★. Виконуйте справи — і ця винагорода стане вашою!`;
  document.getElementById('shop-popup-btn').textContent = 'Зрозуміло';
  shopPopup.hidden = false;
  if (navigator.vibrate) navigator.vibrate(60);
}

function closeShopPopup() {
  shopPopup.hidden = true;
}

document.getElementById('shop-popup-btn').addEventListener('click', closeShopPopup);
shopPopup.addEventListener('click', (e) => {
  if (e.target === shopPopup) closeShopPopup();
});

// ---------- Створення й редагування товару ----------

const shopSheet = document.getElementById('shop-sheet');
const shopTitleInput = document.getElementById('shop-sheet-title');
const shopSaveBtn = document.getElementById('shop-sheet-save');
let shopSheetItem = null;
let shopSheetEmoji = SHOP_EMOJIS[0];
let shopSheetCost = 5;

document.getElementById('shop-new-btn').addEventListener('click', () => openShopSheet(null));

function openShopSheet(item) {
  shopSheetItem = item;
  shopSheetEmoji = item ? item.emoji : SHOP_EMOJIS[0];
  shopSheetCost = item ? item.cost : 5;
  document.getElementById('shop-sheet-heading').textContent = item ? 'Товар' : 'Новий товар';
  shopSaveBtn.textContent = item ? 'Готово' : 'Додати';
  shopTitleInput.value = item ? item.title : '';
  updateShopSave();
  renderShopEmojis();
  renderShopCost();
  renderShopDelete();
  shopSheet.hidden = false;
  if (!item) shopTitleInput.focus();
}

function closeShopSheet() {
  shopSheet.hidden = true;
  shopSheetItem = null;
  shopTitleInput.blur();
}

function updateShopSave() {
  shopSaveBtn.disabled = !shopTitleInput.value.trim();
}

shopTitleInput.addEventListener('input', updateShopSave);
shopTitleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveShopSheet();
  }
});

function renderShopEmojis() {
  const box = document.getElementById('shop-sheet-emojis');
  box.innerHTML = '';
  SHOP_EMOJIS.forEach((emoji) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-btn' + (emoji === shopSheetEmoji ? ' active' : '');
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      shopSheetEmoji = emoji;
      renderShopEmojis();
    });
    box.appendChild(btn);
  });
}

function renderShopCost() {
  document.getElementById('shop-sheet-cost').textContent = shopSheetCost;
}

function changeShopCost(delta) {
  shopSheetCost = Math.min(SHOP_COST_MAX, Math.max(SHOP_COST_MIN, shopSheetCost + delta));
  renderShopCost();
}

document.getElementById('shop-cost-minus').addEventListener('click', () => changeShopCost(-1));
document.getElementById('shop-cost-plus').addEventListener('click', () => changeShopCost(1));

// Видалення без підтвердження — з тостом «Скасувати»
function renderShopDelete() {
  const box = document.getElementById('shop-sheet-delete');
  box.innerHTML = '';
  if (!shopSheetItem) return;
  const item = shopSheetItem;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sheet-danger';
  btn.textContent = 'Видалити товар';
  btn.addEventListener('click', () => {
    const before = JSON.stringify(shopStore);
    shopStore.items = shopStore.items.filter((i) => i.id !== item.id);
    saveShop();
    closeShopSheet();
    renderShop();
    showUndo('Товар видалено', () => {
      shopStore = JSON.parse(before);
      saveShop();
      renderShop();
    });
  });
  box.appendChild(btn);
}

function saveShopSheet() {
  const title = shopTitleInput.value.trim();
  if (!title) {
    shopTitleInput.focus();
    return;
  }
  if (shopSheetItem) {
    Object.assign(shopSheetItem, { title, emoji: shopSheetEmoji, cost: shopSheetCost });
  } else {
    shopStore.items.push({ id: newId(), title, emoji: shopSheetEmoji, cost: shopSheetCost, createdAt: new Date().toISOString() });
  }
  saveShop();
  flashSaved();
  closeShopSheet();
  renderShop();
}

shopSaveBtn.addEventListener('click', saveShopSheet);
attachSheetDrag(shopSheet, closeShopSheet);
document.getElementById('shop-sheet-cancel').addEventListener('click', closeShopSheet);
shopSheet.addEventListener('click', (e) => {
  if (e.target === shopSheet) closeShopSheet();
});

// ---------- Мої покупки ----------
// «Чекають» — куплені, ще не використані (однакові групуються, «Використати» списує найстарішу);
// «Використано» — по товару: скільки використано з куплених, тап розгортає дати.

const archiveModal = document.getElementById('archive-modal');
let archiveView = 'waiting';

document.getElementById('open-archive-btn').addEventListener('click', () => {
  setArchiveView(waitingPurchases().length ? 'waiting' : 'used');
  archiveModal.hidden = false;
});

document.querySelectorAll('#archive-switch .segment').forEach((btn) => {
  btn.addEventListener('click', () => setArchiveView(btn.dataset.view));
});

function setArchiveView(view) {
  archiveView = view;
  renderArchive();
}

function formatPurchaseDate(iso) {
  const date = new Date(iso);
  // Рік — лише для минулих років, щоб рядок не переносився
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const day = date.toLocaleDateString('uk-UA', sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
  const time = date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
}

function formatShortDate(iso) {
  return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
}

// Групуємо за товаром; якщо товар уже видалили — за назвою й емодзі зі знімка покупки
function purchaseKey(p) {
  return p.itemId || `${p.emoji}|${p.title}`;
}

function groupPurchases(purchases) {
  const groups = new Map();
  purchases.forEach((p) => {
    const key = purchaseKey(p);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  return [...groups.values()];
}

function renderArchive() {
  const waiting = waitingPurchases();
  const used = shopStore.purchases.filter((p) => p.usedAt);
  document.querySelectorAll('#archive-switch .segment').forEach((btn) => {
    const active = btn.dataset.view === archiveView;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active);
    btn.textContent = `${btn.dataset.view === 'waiting' ? 'Чекають' : 'Використано'} · ${btn.dataset.view === 'waiting' ? waiting.length : used.length}`;
  });
  document.getElementById('archive-summary').textContent = shopStore.purchases.length
    ? `Витрачено ${starsSpent()} ★ · покупок: ${shopStore.purchases.length}`
    : '';
  updateWaitingBadge();

  const list = document.getElementById('archive-list');
  list.innerHTML = '';
  const items = archiveView === 'waiting' ? waiting : used;
  if (!items.length) {
    const [title, text] = archiveView === 'waiting'
      ? ['Нічого не чекає', 'Куплені винагороди з\'являться тут — використаєте, коли захочете.']
      : ['Ще нічого не використано', 'Тут буде історія винагород, якими ви вже скористались.'];
    list.innerHTML = `
      <div class="tasks-empty">
        <div class="tasks-empty-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48"><rect x="6" y="9" width="36" height="10" rx="3"/><path d="M10 19v16a4 4 0 0 0 4 4h20a4 4 0 0 0 4-4V19M20 27h8"/></svg>
        </div>
        <div class="tasks-empty-title">${title}</div>
        <div class="tasks-empty-text">${text}</div>
      </div>`;
    return;
  }

  if (archiveView === 'waiting') {
    groupPurchases(waiting)
      .sort((a, b) => b[b.length - 1].at.localeCompare(a[a.length - 1].at))
      .forEach((group) => list.appendChild(renderWaitingGroup(group)));
  } else {
    groupPurchases(used)
      .sort((a, b) => lastUsed(b).localeCompare(lastUsed(a)))
      .forEach((group) => list.appendChild(renderUsedGroup(group)));
  }
}

function lastUsed(group) {
  return group.map((p) => p.usedAt).sort().pop();
}

function renderWaitingGroup(group) {
  const sorted = [...group].sort((a, b) => a.at.localeCompare(b.at));
  const oldest = sorted[0];
  const row = document.createElement('div');
  row.className = 'archive-row bag-row';
  row.innerHTML = `
    <span class="shop-item-emoji" aria-hidden="true"><span></span>${group.length > 1 ? `<i class="bag-count">×${group.length}</i>` : ''}</span>
    <span class="archive-info">
      <span class="archive-title"></span>
      <span class="archive-date"></span>
    </span>
    <button type="button" class="bag-use-btn">Використати</button>`;
  row.querySelector('.shop-item-emoji span').textContent = oldest.emoji;
  row.querySelector('.archive-title').textContent = oldest.title;
  row.querySelector('.archive-date').textContent = `Куплено ${formatPurchaseDate(oldest.at)} · ★ ${oldest.cost}`;
  row.querySelector('.bag-use-btn').addEventListener('click', (e) => {
    oldest.usedAt = new Date().toISOString();
    saveShop();
    burstFrom(e.currentTarget, FX_COLORS);
    if (navigator.vibrate) navigator.vibrate(15);
    renderArchive();
    if (!document.getElementById('shop-modal').hidden) renderShop();
    showUndo(`«${oldest.title}» використано — насолоджуйтесь!`, () => {
      oldest.usedAt = null;
      saveShop();
      renderArchive();
      renderShop();
    });
  });
  return row;
}

function renderUsedGroup(group) {
  const key = purchaseKey(group[0]);
  const bought = shopStore.purchases.filter((p) => purchaseKey(p) === key).length;
  const dates = group.map((p) => p.usedAt).sort().reverse();
  const row = document.createElement('div');
  row.className = 'archive-row used-row';
  row.innerHTML = `
    <button type="button" class="used-head">
      <span class="shop-item-emoji" aria-hidden="true"></span>
      <span class="archive-info">
        <span class="archive-title"></span>
        <span class="archive-date"></span>
      </span>
      <span class="used-tick" aria-hidden="true">✓</span>
    </button>
    <div class="used-dates" hidden></div>`;
  row.querySelector('.shop-item-emoji').textContent = group[0].emoji;
  row.querySelector('.archive-title').textContent = group[0].title;
  row.querySelector('.archive-date').textContent = `Використано ${group.length} з ${bought} · востаннє ${formatShortDate(dates[0])}`;
  const datesBox = row.querySelector('.used-dates');
  dates.forEach((d) => {
    const line = document.createElement('div');
    line.textContent = `Використано ${formatPurchaseDate(d)}`;
    datesBox.appendChild(line);
  });
  row.querySelector('.used-head').addEventListener('click', () => {
    datesBox.hidden = !datesBox.hidden;
    row.classList.toggle('open', !datesBox.hidden);
  });
  return row;
}

// ---------- Резервна копія ----------

function mergeShopStores(existing, incoming) {
  const byId = (a = [], b = []) => {
    const result = [...a];
    b.forEach((x) => {
      if (!result.some((y) => y.id === x.id)) result.push(x);
    });
    return result;
  };
  // Копії до появи «використано» — як при завантаженні: старі покупки вважаємо використаними
  const incomingPurchases = (incoming.purchases || []).map((p) => ('usedAt' in p ? p : { ...p, usedAt: p.at }));
  // Якщо покупку десь уже використали — лишаємо її використаною
  const purchases = byId(existing.purchases, incomingPurchases).map((p) => {
    const other = incomingPurchases.find((x) => x.id === p.id);
    return !p.usedAt && other?.usedAt ? { ...p, usedAt: other.usedAt } : p;
  });
  return { items: byId(existing.items, incoming.items), purchases };
}
