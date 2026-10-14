// Задачі на день: разові або з повтором (щодня, по буднях, у вибрані дні тижня, кожні N днів).
// Задача буває звичайною або зірковою (star: true): кожні STAR_GOAL виконаних зіркових задач
// дають одну зірку. Прогрес зірки спільний для всіх днів і не скидається з кінцем дня.
// Сховище: { tasks: [{ id, title, star, start, repeat, until, createdAt }], done: { date: [id] },
//            skipped: { date: [id] }, starDone: { date: [id] } }
// starDone — зараховані виконання зіркових задач; лишаються, навіть якщо задачу потім видалити.

const STORAGE_TASKS = 'daily-tasks';

const REPEAT_TYPES = [
  { id: 'none', label: 'Не повторювати' },
  { id: 'daily', label: 'Щодня' },
  { id: 'weekdays', label: 'По буднях' },
  { id: 'weekly', label: 'Дні тижня' },
  { id: 'interval', label: 'Кожні N днів' },
];

// Порядок з понеділка; d — номер дня в Date.getDay()
const WEEKDAYS = [
  { d: 1, short: 'Пн' }, { d: 2, short: 'Вт' }, { d: 3, short: 'Ср' }, { d: 4, short: 'Чт' },
  { d: 5, short: 'Пт' }, { d: 6, short: 'Сб' }, { d: 0, short: 'Нд' },
];

const INTERVAL_MIN = 2;
const INTERVAL_MAX = 30;

const STAR_GOAL = 5;

// Висота золота (у % від квадрата) для 0…5 балів, щоб залита площа зірки була рівно 0, 1/5 … 5/5.
// Верхній промінь вузький, тож за висотою 4/5 виглядали б майже повною зіркою.
// Пораховано для контуру зірки нижче; при зміні STAR_GOAL чи форми — перерахувати.
const STAR_FILL_HEIGHTS = [0, 32.5, 44.7, 53.8, 60.8, 100];

const STAR_PHRASES = [
  'Мрії стають ближчими! ✨',
  'Ще одна зірка у вашому небі! 🌟',
  'Крок за кроком — до великої мети! 🚀',
  'Ви сяєте! Так тримати! 💫',
  'Всесвіт помічає ваші зусилля! 🌌',
  'Зірки сходяться на вашу користь! ⭐',
];

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_TASKS);
    const data = raw ? JSON.parse(raw) : {};
    return { tasks: data.tasks || [], done: data.done || {}, skipped: data.skipped || {}, starDone: data.starDone || {} };
  } catch {
    return { tasks: [], done: {}, skipped: {}, starDone: {} };
  }
}

let taskStore = loadTasks();

function saveTasks() {
  localStorage.setItem(STORAGE_TASKS, JSON.stringify(taskStore));
}

function starPoints() {
  return Object.values(taskStore.starDone).reduce((sum, ids) => sum + ids.length, 0);
}

function daysBetween(from, to) {
  const a = fromISODate(from);
  const b = fromISODate(to);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

function taskOccursOn(task, date) {
  if (date < task.start || (task.until && date > task.until)) return false;
  if ((taskStore.skipped[date] || []).includes(task.id)) return false;
  const day = fromISODate(date).getDay();
  switch (task.repeat.type) {
    case 'none': return date === task.start;
    case 'daily': return true;
    case 'weekdays': return day >= 1 && day <= 5;
    case 'weekly': return task.repeat.days.includes(day);
    case 'interval': return daysBetween(task.start, date) % task.repeat.interval === 0;
    default: return false;
  }
}

function isTaskDone(task, date) {
  return (taskStore.done[date] || []).includes(task.id);
}

// Невиконані зверху, виконані опускаються вниз; всередині — у порядку створення
function tasksForDate(date) {
  return taskStore.tasks
    .filter((task) => taskOccursOn(task, date))
    .sort((a, b) => (isTaskDone(a, date) - isTaskDone(b, date)) || a.createdAt.localeCompare(b.createdAt));
}

function pluralDays(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дні';
  return 'днів';
}

function repeatLabel(repeat) {
  switch (repeat.type) {
    case 'daily': return 'Щодня';
    case 'weekdays': return 'По буднях';
    case 'weekly': return WEEKDAYS.filter((w) => repeat.days.includes(w.d)).map((w) => w.short).join(', ');
    case 'interval': return `Кожні ${repeat.interval} ${pluralDays(repeat.interval)}`;
    default: return '';
  }
}

function defaultRepeat(type, date) {
  if (type === 'weekly') return { type, days: [fromISODate(date).getDay()] };
  if (type === 'interval') return { type, interval: INTERVAL_MIN };
  return { type };
}

// Редактор повтору: тип + дні тижня або інтервал. Використовується і при додаванні, і в редагуванні
function renderRepeatEditor(el, repeat, date, onChange) {
  el.innerHTML = `
    <div class="chips repeat-types"></div>
    <div class="repeat-extra"></div>`;

  const types = el.querySelector('.repeat-types');
  REPEAT_TYPES.forEach((type) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (repeat.type === type.id ? ' active' : '');
    chip.textContent = type.label;
    chip.addEventListener('click', () => onChange(defaultRepeat(type.id, date)));
    types.appendChild(chip);
  });

  const extra = el.querySelector('.repeat-extra');
  if (repeat.type === 'weekly') {
    extra.className = 'repeat-extra weekday-picker';
    WEEKDAYS.forEach((w) => {
      const selected = repeat.days.includes(w.d);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'weekday-btn' + (selected ? ' active' : '');
      btn.textContent = w.short;
      btn.addEventListener('click', () => {
        const days = selected ? repeat.days.filter((d) => d !== w.d) : [...repeat.days, w.d];
        if (days.length) onChange({ ...repeat, days });
      });
      extra.appendChild(btn);
    });
  } else if (repeat.type === 'interval') {
    extra.className = 'repeat-extra interval-picker';
    extra.innerHTML = `
      <span>Кожні</span>
      <button type="button" class="sleep-btn interval-minus" aria-label="Менше">−</button>
      <b class="interval-value">${repeat.interval}</b>
      <button type="button" class="sleep-btn interval-plus" aria-label="Більше">+</button>
      <span>${pluralDays(repeat.interval)}</span>`;
    const change = (delta) => onChange({ ...repeat, interval: Math.min(INTERVAL_MAX, Math.max(INTERVAL_MIN, repeat.interval + delta)) });
    extra.querySelector('.interval-minus').addEventListener('click', () => change(-1));
    extra.querySelector('.interval-plus').addEventListener('click', () => change(1));
  } else {
    extra.className = 'repeat-extra';
  }
}

// ---------- Вкладка «Задачі» ----------

document.getElementById('task-new-btn').addEventListener('click', () => openTaskSheet(null));

document.getElementById('tasks-prev').addEventListener('click', () => setDate(shiftDate(currentDate, -1)));
document.getElementById('tasks-next').addEventListener('click', () => setDate(shiftDate(currentDate, 1)));
document.getElementById('tasks-date').addEventListener('change', (e) => {
  if (e.target.value) setDate(e.target.value);
});

const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function renderTasks() {
  document.getElementById('tasks-date').value = currentDate;

  const tasks = tasksForDate(currentDate);
  const doneCount = tasks.filter((t) => isTaskDone(t, currentDate)).length;
  const progress = document.getElementById('tasks-progress');
  progress.hidden = !tasks.length;
  progress.querySelector('.tasks-progress-text').textContent = doneCount === tasks.length && tasks.length
    ? `Усе виконано! ${doneCount} з ${tasks.length} 🎉`
    : `Виконано ${doneCount} з ${tasks.length}`;
  progress.querySelector('.tasks-progress-fill').style.width = tasks.length ? `${(doneCount / tasks.length) * 100}%` : '0';
  progress.classList.toggle('complete', tasks.length > 0 && doneCount === tasks.length);
  if (!starAnimating) renderStarWidget();

  const list = document.getElementById('task-list');
  list.innerHTML = '';
  if (!tasks.length) {
    renderTasksEmpty(list);
    return;
  }

  tasks.forEach((task) => {
    const done = isTaskDone(task, currentDate);
    const row = document.createElement('div');
    row.className = 'task' + (done ? ' done' : '') + (task.star ? ' star' : '');
    row.innerHTML = `
      <button type="button" class="task-check" role="checkbox" aria-checked="${done}">${CHECK_SVG}</button>
      <button type="button" class="task-body">
        <span class="task-title">${task.star ? '<i class="task-star" aria-label="Зіркова задача">★</i>' : ''}<span></span></span>
        <span class="task-meta"></span>
      </button>`;
    row.querySelector('.task-title span').textContent = task.title;
    const meta = repeatLabel(task.repeat);
    row.querySelector('.task-meta').textContent = meta ? `🔁 ${meta}` : '';
    row.querySelector('.task-check').setAttribute('aria-label', done ? `Позначити «${task.title}» невиконаною` : `Позначити «${task.title}» виконаною`);
    row.querySelector('.task-check').addEventListener('click', (e) => toggleTask(task, row, e.currentTarget));
    row.querySelector('.task-body').addEventListener('click', () => openTaskSheet(task));
    list.appendChild(row);
  });
}

// Порожній стан за HIG: іконка, короткий заголовок і пояснення; дія — кнопка «Нова задача» внизу
function renderTasksEmpty(list) {
  const today = todayISO();
  const copy = currentDate < today
    ? { title: 'Цього дня задач не було', text: 'Можна додати задачу заднім числом, щоб нічого не загубилось.' }
    : currentDate === today
      ? { title: 'Сьогодні вільно', text: 'Сплануйте день: додайте першу задачу кнопкою «Нова задача» внизу.' }
      : { title: 'Поки нічого не заплановано', text: 'Додайте задачу наперед — вона чекатиме на цей день.' };
  list.innerHTML = `
    <div class="tasks-empty">
      <div class="tasks-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 48 48"><rect x="9" y="7" width="30" height="36" rx="7"/><path d="M17 19l3 3 6-6M17 31h14"/></svg>
      </div>
      <div class="tasks-empty-title"></div>
      <div class="tasks-empty-text"></div>
    </div>`;
  list.querySelector('.tasks-empty-title').textContent = copy.title;
  list.querySelector('.tasks-empty-text').textContent = copy.text;
}

function toggleTask(task, row, checkEl) {
  const date = currentDate;
  const done = new Set(taskStore.done[date] || []);
  const nowDone = !done.has(task.id);
  if (nowDone) done.add(task.id);
  else done.delete(task.id);
  taskStore.done[date] = [...done];
  if (!taskStore.done[date].length) delete taskStore.done[date];

  // Зіркові бали: зараховуємо при відмітці, повертаємо при знятті відмітки
  const pointsBefore = starPoints();
  const starDone = new Set(taskStore.starDone[date] || []);
  if (nowDone && task.star) starDone.add(task.id);
  if (!nowDone) starDone.delete(task.id);
  taskStore.starDone[date] = [...starDone];
  if (!taskStore.starDone[date].length) delete taskStore.starDone[date];
  const pointsAfter = starPoints();
  saveTasks();

  row.classList.toggle('done', nowDone);
  checkEl.setAttribute('aria-checked', nowDone);

  if (!nowDone) {
    renderTasks();
    return;
  }

  row.classList.add('just-done');
  burstFrom(checkEl, task.star ? STAR_COLORS : FX_COLORS);
  if (navigator.vibrate) navigator.vibrate(12);
  if (pointsAfter > pointsBefore) animateStarGain(checkEl, pointsAfter);

  const all = tasksForDate(date);
  const allDone = all.length && all.every((t) => isTaskDone(t, date));
  // Даємо анімації дограти, потім виконана задача опускається вниз
  setTimeout(() => {
    if (currentDate === date) renderTasks();
    if (allDone) celebrateAllDone();
  }, 650);
}

// ---------- Анімації ----------

const FX_COLORS = ['#9b7dff', '#ffa65c', '#5fd3a0', '#F5D547', '#ff7aa8', '#46B3D9'];

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function fxLayer() {
  let layer = document.getElementById('fx-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'fx-layer';
    document.body.appendChild(layer);
  }
  return layer;
}

// Невеликий феєрверк з чекбокса
function burstFrom(el, colors = FX_COLORS) {
  if (prefersReducedMotion()) return;
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const layer = fxLayer();
  for (let i = 0; i < 16; i++) {
    const p = document.createElement('span');
    p.className = 'fx-particle';
    const size = 5 + Math.random() * 5;
    p.style.width = `${size}px`;
    p.style.height = `${Math.random() < 0.5 ? size : size * 0.45}px`;
    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    p.style.background = colors[i % colors.length];
    layer.appendChild(p);
    const angle = (Math.PI * 2 * i) / 16 + Math.random() * 0.4;
    const dist = 32 + Math.random() * 38;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    p.animate([
      { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.4) rotate(${Math.random() * 360}deg)`, opacity: 0 },
    ], { duration: 550 + Math.random() * 250, easing: 'cubic-bezier(0.15, 0.7, 0.3, 1)' }).onfinish = () => p.remove();
  }
}

// Конфеті-дощ, коли виконано всі задачі дня
function celebrateAllDone() {
  // Якщо саме зараз святкуємо зірку — не перекриваємо її попап
  if (starAnimating) return;
  const banner = document.getElementById('tasks-celebrate');
  banner.classList.remove('show');
  void banner.offsetWidth;
  banner.classList.add('show');
  if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
  if (prefersReducedMotion()) return;

  const layer = fxLayer();
  const width = window.innerWidth;
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('span');
    p.className = 'fx-particle';
    p.style.width = `${6 + Math.random() * 6}px`;
    p.style.height = `${4 + Math.random() * 4}px`;
    p.style.left = `${Math.random() * width}px`;
    p.style.top = '-12px';
    p.style.background = FX_COLORS[i % FX_COLORS.length];
    layer.appendChild(p);
    const drift = (Math.random() - 0.5) * 160;
    const fall = window.innerHeight * (0.6 + Math.random() * 0.5);
    p.animate([
      { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${drift}px, ${fall}px) rotate(${360 + Math.random() * 540}deg)`, opacity: 0 },
    ], { duration: 1400 + Math.random() * 900, delay: Math.random() * 300, easing: 'cubic-bezier(0.25, 0.4, 0.4, 1)' }).onfinish = () => p.remove();
  }
}

// ---------- Зірка прогресу ----------

const STAR_COLORS = ['#FFD54A', '#FFB627', '#FF9F1C', '#FFE89A', '#ffffff'];
const starWidget = document.getElementById('star-widget');
let starAnimating = false;

function renderStarWidget(options = {}) {
  const points = starPoints();
  const inProgress = options.full ? STAR_GOAL : points % STAR_GOAL;
  // Лічильник — баланс: зароблені зірки мінус витрачені в магазині
  const total = Math.max(0, starBalance() - (options.full ? 1 : 0));
  starWidget.querySelector('.star-fill').style.height = `${STAR_FILL_HEIGHTS[inProgress]}%`;
  starWidget.classList.toggle('is-full', inProgress === STAR_GOAL);
  document.getElementById('star-progress-text').textContent = `${inProgress}/${STAR_GOAL}`;
  document.getElementById('star-total').textContent = total;
  starWidget.setAttribute('aria-label', `Зірка: ${inProgress} з ${STAR_GOAL}. Зірок на балансі: ${total}`);
}

function pulse(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

// Золота зірочка летить з чекбокса до великої зірки, потім та заповнюється
function animateStarGain(fromEl, points) {
  const completesStar = points % STAR_GOAL === 0;
  starAnimating = true;
  const arrive = () => {
    renderStarWidget({ full: completesStar });
    pulse(starWidget, 'star-gain');
    floatPlusOne();
    if (completesStar) {
      setTimeout(() => celebrateStar(points / STAR_GOAL), 850);
    } else {
      starAnimating = false;
    }
  };

  if (prefersReducedMotion()) {
    arrive();
    return;
  }

  const from = fromEl.getBoundingClientRect();
  const to = starWidget.getBoundingClientRect();
  const flyer = document.createElement('span');
  flyer.className = 'star-flyer';
  flyer.textContent = '★';
  flyer.style.left = `${from.left + from.width / 2}px`;
  flyer.style.top = `${from.top + from.height / 2}px`;
  fxLayer().appendChild(flyer);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  flyer.animate([
    { transform: 'translate(-50%, -50%) scale(0.6) rotate(0deg)', opacity: 0 },
    { transform: `translate(calc(-50% + ${dx * 0.35}px), calc(-50% + ${dy * 0.35 - 40}px)) scale(1.4) rotate(140deg)`, opacity: 1, offset: 0.4 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.5) rotate(288deg)`, opacity: 0.9 },
  ], { duration: 650, easing: 'cubic-bezier(0.5, 0, 0.6, 1)' }).onfinish = () => {
    flyer.remove();
    arrive();
  };
}

function floatPlusOne() {
  if (prefersReducedMotion()) return;
  const rect = starWidget.getBoundingClientRect();
  const plus = document.createElement('span');
  plus.className = 'star-plus';
  plus.textContent = '+1';
  plus.style.left = `${rect.left + rect.width / 2}px`;
  plus.style.top = `${rect.top}px`;
  fxLayer().appendChild(plus);
  plus.animate([
    { transform: 'translate(-50%, 0)', opacity: 0 },
    { transform: 'translate(-50%, -14px)', opacity: 1, offset: 0.3 },
    { transform: 'translate(-50%, -30px)', opacity: 0 },
  ], { duration: 900, easing: 'ease-out' }).onfinish = () => plus.remove();
}

// Повна зірка: спалах, золоті промені й конфеті, попап з бадьорим текстом
function celebrateStar(totalStars) {
  pulse(starWidget, 'star-complete');
  if (navigator.vibrate) navigator.vibrate([30, 50, 30, 50, 60]);

  if (!prefersReducedMotion()) {
    const rect = starWidget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const layer = fxLayer();
    for (let i = 0; i < 28; i++) {
      const p = document.createElement('span');
      p.className = 'fx-particle star-ray';
      p.style.left = `${cx}px`;
      p.style.top = `${cy}px`;
      p.style.background = STAR_COLORS[i % STAR_COLORS.length];
      layer.appendChild(p);
      const angle = (Math.PI * 2 * i) / 28;
      const dist = 70 + Math.random() * 60;
      p.animate([
        { transform: `translate(-50%, -50%) rotate(${(angle * 180) / Math.PI}deg) scaleX(0.3)`, opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) rotate(${(angle * 180) / Math.PI}deg) scaleX(1)`, opacity: 0 },
      ], { duration: 800 + Math.random() * 300, easing: 'cubic-bezier(0.1, 0.8, 0.3, 1)' }).onfinish = () => p.remove();
    }
    goldenRain();
  }

  setTimeout(() => showStarPopup(totalStars), prefersReducedMotion() ? 0 : 450);
}

function goldenRain() {
  const layer = fxLayer();
  const width = window.innerWidth;
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('span');
    p.className = 'star-confetti';
    p.textContent = i % 3 === 0 ? '★' : '';
    if (i % 3) {
      p.style.width = `${5 + Math.random() * 6}px`;
      p.style.height = `${4 + Math.random() * 4}px`;
      p.style.background = STAR_COLORS[i % STAR_COLORS.length];
    } else {
      p.style.color = STAR_COLORS[i % 4];
      p.style.fontSize = `${10 + Math.random() * 10}px`;
    }
    p.style.left = `${Math.random() * width}px`;
    p.style.top = '-16px';
    layer.appendChild(p);
    const drift = (Math.random() - 0.5) * 140;
    const fall = window.innerHeight * (0.7 + Math.random() * 0.4);
    p.animate([
      { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${drift}px, ${fall}px) rotate(${360 + Math.random() * 360}deg)`, opacity: 0 },
    ], { duration: 1600 + Math.random() * 1000, delay: Math.random() * 400, easing: 'cubic-bezier(0.25, 0.4, 0.4, 1)' }).onfinish = () => p.remove();
  }
}

function pluralStars(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'зірка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'зірки';
  return 'зірок';
}

const starPopup = document.getElementById('star-popup');

function showStarPopup(totalStars) {
  document.getElementById('star-popup-title').textContent = STAR_PHRASES[Math.floor(Math.random() * STAR_PHRASES.length)];
  document.getElementById('star-popup-text').textContent = totalStars === 1
    ? 'Ви зібрали свою першу зірку! П\'ять зіркових справ — і небо стає яскравішим.'
    : `Зібрано вже ${totalStars} ${pluralStars(totalStars)}, на балансі ${starBalance()} ★. Витратьте в магазині або копіть далі!`;
  document.getElementById('star-popup-count').textContent = totalStars;
  starPopup.hidden = false;
  document.getElementById('star-popup-btn').focus();
}

function closeStarPopup() {
  starPopup.hidden = true;
  starAnimating = false;
  // Зірка порожніє для наступного кола, лічильник зростає
  renderStarWidget();
  pulse(document.getElementById('star-total-wrap'), 'star-total-bump');
  if (!document.getElementById('shop-modal').hidden) renderShop();
}

document.getElementById('star-popup-btn').addEventListener('click', closeStarPopup);
starPopup.addEventListener('click', (e) => {
  if (e.target === starPopup) closeStarPopup();
});

starWidget.addEventListener('click', () => {
  const left = STAR_GOAL - (starPoints() % STAR_GOAL);
  showToast(`★ До нової зірки: ще ${left} з ${STAR_GOAL} зіркових задач`, 2600);
});

// ---------- Редагування задачі ----------

const taskSheet = document.getElementById('task-sheet');
const sheetTitleInput = document.getElementById('task-sheet-title');
const sheetSaveBtn = document.getElementById('task-sheet-save');
// null — створення нової задачі, інакше — редагування
let sheetTask = null;
let sheetRepeat = null;
let sheetStar = false;

function renderSheetType() {
  document.querySelectorAll('#task-sheet-type .segment').forEach((btn) => {
    const active = (btn.dataset.type === 'star') === sheetStar;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', active);
  });
}

document.querySelectorAll('#task-sheet-type .segment').forEach((btn) => {
  btn.addEventListener('click', () => {
    sheetStar = btn.dataset.type === 'star';
    renderSheetType();
  });
});

function openTaskSheet(task) {
  sheetTask = task;
  sheetRepeat = task ? { ...task.repeat, days: task.repeat.days ? [...task.repeat.days] : undefined } : { type: 'none' };
  document.getElementById('task-sheet-heading').textContent = task ? 'Задача' : 'Нова задача';
  sheetSaveBtn.textContent = task ? 'Готово' : 'Додати';
  sheetTitleInput.value = task ? task.title : '';
  sheetStar = Boolean(task?.star);
  renderSheetType();
  updateSheetSave();
  renderSheetRepeat();
  if (task) renderSheetDelete(false);
  else document.getElementById('task-sheet-delete').innerHTML = '';
  taskSheet.hidden = false;
  if (!task) sheetTitleInput.focus();
}

function closeTaskSheet() {
  taskSheet.hidden = true;
  sheetTask = null;
  sheetTitleInput.blur();
}

function updateSheetSave() {
  sheetSaveBtn.disabled = !sheetTitleInput.value.trim();
}

sheetTitleInput.addEventListener('input', updateSheetSave);
sheetTitleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveTaskSheet();
  }
});

function renderSheetRepeat() {
  renderRepeatEditor(document.getElementById('task-sheet-repeat'), sheetRepeat, sheetTask ? sheetTask.start : currentDate, (repeat) => {
    sheetRepeat = repeat;
    renderSheetRepeat();
  });
}

// Видалення: для повторюваної задачі — лише цей день або цей і наступні
function renderSheetDelete(confirming) {
  const box = document.getElementById('task-sheet-delete');
  box.innerHTML = '';
  const recurring = sheetTask.repeat.type !== 'none';
  if (!confirming) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sheet-danger';
    btn.textContent = 'Видалити задачу';
    btn.addEventListener('click', () => renderSheetDelete(true));
    box.appendChild(btn);
    return;
  }

  const options = recurring
    ? [
      { text: 'Лише в цей день', action: () => deleteTaskOccurrence(sheetTask, currentDate) },
      { text: 'У цей і всі наступні дні', action: () => deleteTaskFrom(sheetTask, currentDate) },
    ]
    : [{ text: 'Так, видалити', action: () => deleteTaskFrom(sheetTask, sheetTask.start) }];
  options.forEach((option) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sheet-danger';
    btn.textContent = option.text;
    btn.addEventListener('click', () => {
      option.action();
      saveTasks();
      flashSaved();
      closeTaskSheet();
      renderTasks();
    });
    box.appendChild(btn);
  });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'sheet-plain';
  cancel.textContent = 'Не видаляти';
  cancel.addEventListener('click', () => renderSheetDelete(false));
  box.appendChild(cancel);
}

function deleteTaskOccurrence(task, date) {
  taskStore.skipped[date] = [...new Set([...(taskStore.skipped[date] || []), task.id])];
}

function deleteTaskFrom(task, date) {
  if (date <= task.start) {
    taskStore.tasks = taskStore.tasks.filter((t) => t.id !== task.id);
    Object.keys(taskStore.done).forEach((d) => {
      taskStore.done[d] = taskStore.done[d].filter((id) => id !== task.id);
      if (!taskStore.done[d].length) delete taskStore.done[d];
    });
  } else {
    task.until = shiftDate(date, -1);
  }
}

function saveTaskSheet() {
  const title = sheetTitleInput.value.trim();
  if (!title) {
    sheetTitleInput.focus();
    return;
  }
  if (sheetTask) {
    sheetTask.title = title;
    sheetTask.star = sheetStar;
    sheetTask.repeat = sheetRepeat;
  } else {
    taskStore.tasks.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title,
      star: sheetStar,
      start: currentDate,
      repeat: sheetRepeat,
      until: null,
      createdAt: new Date().toISOString(),
    });
  }
  saveTasks();
  flashSaved();
  closeTaskSheet();
  renderTasks();
}

sheetSaveBtn.addEventListener('click', saveTaskSheet);

document.getElementById('task-sheet-cancel').addEventListener('click', closeTaskSheet);
taskSheet.addEventListener('click', (e) => {
  if (e.target === taskSheet) closeTaskSheet();
});

// ---------- Резервна копія ----------

function mergeTaskStores(existing, incoming) {
  const tasks = [...existing.tasks];
  (incoming.tasks || []).forEach((task) => {
    if (!tasks.some((t) => t.id === task.id)) tasks.push(task);
  });
  const mergeMap = (a = {}, b = {}) => {
    const result = { ...a };
    Object.entries(b).forEach(([date, ids]) => {
      result[date] = [...new Set([...(result[date] || []), ...ids])];
    });
    return result;
  };
  return {
    tasks,
    done: mergeMap(existing.done, incoming.done),
    skipped: mergeMap(existing.skipped, incoming.skipped),
    starDone: mergeMap(existing.starDone, incoming.starDone),
  };
}
