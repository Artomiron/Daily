// Магазин винагород: товари з ціною в зірках, купівля за зароблені зірки, архів покупок.
// Баланс = зароблені зірки (кожні STAR_GOAL зіркових задач) − витрачені на покупки.
// Сховище: { items: [{ id, title, emoji, cost, createdAt }],
//            purchases: [{ id, itemId, title, emoji, cost, at }] }
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
    return { items: data.items || [], purchases: data.purchases || [] };
  } catch {
    return { items: [], purchases: [] };
  }
}

let shopStore = loadShop();

function saveShop() {
  localStorage.setItem(STORAGE_SHOP, JSON.stringify(shopStore));
}

function starsEarned() {
  return Math.floor(starPoints() / STAR_GOAL);
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

function renderShop() {
  const balance = starBalance();
  document.getElementById('shop-balance-value').textContent = Math.max(0, balance);
  document.getElementById('shop-balance-label').textContent = `${pluralStars(Math.max(0, balance))} на балансі`;

  const list = document.getElementById('shop-list');
  list.innerHTML = '';
  if (!shopStore.items.length) {
    list.innerHTML = `
      <div class="tasks-empty shop-empty">
        <div class="tasks-empty-icon shop-empty-icon" aria-hidden="true">🎁</div>
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
  const card = document.createElement('div');
  card.className = 'shop-item' + (affordable ? ' affordable' : '');
  card.innerHTML = `
    <button type="button" class="shop-item-body">
      <span class="shop-item-emoji" aria-hidden="true"></span>
      <span class="shop-item-info">
        <span class="shop-item-title"></span>
        <span class="shop-item-cost">★ ${item.cost}</span>
      </span>
    </button>
    <button type="button" class="shop-buy-btn">Купити</button>`;
  card.querySelector('.shop-item-emoji').textContent = item.emoji;
  card.querySelector('.shop-item-title').textContent = item.title;
  card.querySelector('.shop-item-body').addEventListener('click', () => openShopSheet(item));

  // Купівля в два тапи, щоб не витратити зірки випадково
  const buy = card.querySelector('.shop-buy-btn');
  let confirmTimer = null;
  buy.addEventListener('click', () => {
    if (starBalance() < item.cost) {
      showShopSad(item);
      return;
    }
    if (!buy.classList.contains('confirming')) {
      buy.classList.add('confirming');
      buy.textContent = `За ★ ${item.cost}?`;
      confirmTimer = setTimeout(() => {
        buy.classList.remove('confirming');
        buy.textContent = 'Купити';
      }, 3000);
      return;
    }
    clearTimeout(confirmTimer);
    buyItem(item, buy);
  });
  return card;
}

function buyItem(item, fromEl) {
  shopStore.purchases.push({
    id: newId(),
    itemId: item.id,
    title: item.title,
    emoji: item.emoji,
    cost: item.cost,
    at: new Date().toISOString(),
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
    `«${item.title}» — ваше. Насолоджуйтесь! На балансі лишилось ${balance} ★.`;
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
    `Для «${item.title}» потрібно ще ${missing} ★. Виконуйте зіркові задачі — і ця винагорода стане вашою!`;
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
  renderShopDelete(false);
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

function renderShopDelete(confirming) {
  const box = document.getElementById('shop-sheet-delete');
  box.innerHTML = '';
  if (!shopSheetItem) return;
  const make = (text, cls, onClick) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls;
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    box.appendChild(btn);
  };
  if (!confirming) {
    make('Видалити товар', 'sheet-danger', () => renderShopDelete(true));
    return;
  }
  make('Так, видалити', 'sheet-danger', () => {
    shopStore.items = shopStore.items.filter((i) => i.id !== shopSheetItem.id);
    saveShop();
    flashSaved();
    closeShopSheet();
    renderShop();
  });
  make('Не видаляти', 'sheet-plain', () => renderShopDelete(false));
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
document.getElementById('shop-sheet-cancel').addEventListener('click', closeShopSheet);
shopSheet.addEventListener('click', (e) => {
  if (e.target === shopSheet) closeShopSheet();
});

// ---------- Архів покупок ----------

const archiveModal = document.getElementById('archive-modal');

document.getElementById('open-archive-btn').addEventListener('click', () => {
  renderArchive();
  archiveModal.hidden = false;
});

function formatPurchaseDate(iso) {
  const date = new Date(iso);
  const day = date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  const time = date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
}

function renderArchive() {
  const purchases = [...shopStore.purchases].sort((a, b) => b.at.localeCompare(a.at));
  document.getElementById('archive-summary').textContent = purchases.length
    ? `Витрачено ${starsSpent()} ★ · покупок: ${purchases.length}`
    : '';
  const list = document.getElementById('archive-list');
  list.innerHTML = '';
  if (!purchases.length) {
    list.innerHTML = `
      <div class="tasks-empty">
        <div class="tasks-empty-icon shop-empty-icon" aria-hidden="true">🗂️</div>
        <div class="tasks-empty-title">Покупок ще немає</div>
        <div class="tasks-empty-text">Тут з'являться винагороди, які ви купите за зірки.</div>
      </div>`;
    return;
  }
  purchases.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'archive-row';
    row.innerHTML = `
      <span class="shop-item-emoji" aria-hidden="true"></span>
      <span class="archive-info">
        <span class="archive-title"></span>
        <span class="archive-date"></span>
      </span>
      <span class="archive-cost">−★ ${p.cost}</span>`;
    row.querySelector('.shop-item-emoji').textContent = p.emoji;
    row.querySelector('.archive-title').textContent = p.title;
    row.querySelector('.archive-date').textContent = formatPurchaseDate(p.at);
    list.appendChild(row);
  });
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
  return { items: byId(existing.items, incoming.items), purchases: byId(existing.purchases, incoming.purchases) };
}
