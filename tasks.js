// Задачі на день: разові або з повтором (щодня, по буднях, у вибрані дні тижня, кожні N днів).
// Зірки дня залежать від кількості виконаних справ: за замовчуванням 5 — одна, 10 — дві, 15 — три.
// Пороги налаштовуються; starTiers: [{ since, tiers }] — історія, щоб минулі дні рахувались за тодішніми.
// Сховище: { tasks: [{ id, title, start, repeat, until, createdAt }], done: { date: [id] },
//            skipped: { date: [id] }, dayStars: { date: n }, penalties: { date: [id] }, settledThrough }
// dayStars — зароблені за день зірки; лишаються, навіть якщо виконану задачу потім видалити.
// Задача з прапорцем (flag: true) — високий пріоритет: якщо її не виконано до кінця дня,
// з балансу знімається 1 зірка. Минулі дні «закриваються» при наступному запуску (penalties),
// settledThrough — останній уже підбитий день.
// До STAR_RULES_SINCE діяли старі правила: зіркові задачі (starDone), 5 штук — зірка, штраф 1/5.
// actual: { date: { id: хвилини } } — фактично затрачений час, який вказали після виконання.
// Задача може мати числову мету goal: { target, unit } («100 раз», «40 хв»): progress: { date: { id: n } }
// зберігає, скільки вже зроблено за день; досягнута мета робить задачу виконаною.
// goalUnits — свої одиниці мети, яких немає серед стандартних.

const STORAGE_TASKS = 'daily-tasks';

const REPEAT_TYPES = [
  { id: 'none', label: 'Ніколи' },
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

// Тривалість (естімейт) задачі в хвилинах — обов'язкова, за замовчуванням 1 година
const ESTIMATE_DEFAULT = 60;
const ESTIMATE_STEP = 5;
const ESTIMATE_MAX_HOURS = 12;
// Більше цього на день — попереджаємо, що плани занадто амбіційні
const DAY_PLAN_LIMIT = 8 * 60;

// Число й одиницю з'єднуємо нерозривним пробілом, щоб «30» і «хв» не розривало між рядками
function formatEstimate(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}\u00a0хв`;
  return m ? `${h}\u00a0год ${m}\u00a0хв` : `${h}\u00a0год`;
}

const INTERVAL_MIN = 2;
const INTERVAL_MAX = 30;

// Скільки виконаних справ за день дають 1, 2 і 3 зірки
const DEFAULT_STAR_TIERS = [5, 10, 15];
// До 19.10.2026 стандартними були 4 · 9 · 15 — минулі дні рахуємо за ними, як і будь-яку зміну порогів
const PREVIOUS_DEFAULT_TIERS = [4, 9, 15];
const DEFAULT_TIERS_SINCE = '2026-10-19';
const STAR_COUNT = 3;
const STAR_RULES_SINCE = '2026-10-18';
const LEGACY_STAR_GOAL = 5;

// Похвала за результат і заклик рухатись далі — кілька варіантів на кожну зірку, щоб не набридало
const STAR_TIER_COPY = [
  null,
  {
    title: 'Перша зірка дня! ⭐',
    texts: [
      'Чудовий старт! День уже працює на вас — тримайте цей темп.',
      'Ви взяли розгін! Кожна наступна справа наближає другу зірку.',
      'Так тримати! Перший крок зроблено, далі — тільки цікавіше.',
    ],
  },
  {
    title: 'Дві зірки! 🌟',
    texts: [
      'Ви в ударі! Такий день хочеться запам\'ятати — продовжуйте в тому ж дусі.',
      'Неймовірна продуктивність! Ще трохи — і день стане ідеальним.',
      'Ви сяєте! Ваша наполегливість дає чудові плоди — так тримати.',
    ],
  },
  {
    title: 'Максимум зірок! 💫',
    texts: [
      'Ідеальний день! Ви зробили неймовірне — пишайтеся собою.',
      'Легендарний результат! Саме з таких днів складаються великі звершення.',
      'Ви підкорили цей день! Така сила волі надихає — несіть цей вогник і далі.',
    ],
  },
];

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_TASKS);
    const data = raw ? JSON.parse(raw) : {};
    return {
      tasks: data.tasks || [],
      done: data.done || {},
      skipped: data.skipped || {},
      starDone: data.starDone || {},
      dayStars: data.dayStars || {},
      penalties: data.penalties || {},
      actual: data.actual || {},
      progress: data.progress || {},
      goalUnits: data.goalUnits || [],
      starTiers: data.starTiers || [],
      settledThrough: data.settledThrough || null,
    };
  } catch {
    return { tasks: [], done: {}, skipped: {}, starDone: {}, dayStars: {}, penalties: {}, actual: {}, progress: {}, goalUnits: [], starTiers: [], settledThrough: null };
  }
}

let taskStore = loadTasks();

function saveTasks() {
  localStorage.setItem(STORAGE_TASKS, JSON.stringify(taskStore));
}

function pluralTasks(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'справа';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'справи';
  return 'справ';
}

// Пороги, що діяли того дня: останній запис, який почав діяти не пізніше
function tiersOn(date) {
  const entry = [...taskStore.starTiers].sort((a, b) => a.since.localeCompare(b.since)).filter((e) => e.since <= date).pop();
  if (entry) return entry.tiers;
  return date < DEFAULT_TIERS_SINCE ? PREVIOUS_DEFAULT_TIERS : DEFAULT_STAR_TIERS;
}

function starsForCount(n, date) {
  return tiersOn(date).filter((min) => n >= min).length;
}

// Скільки справ дня виконано — як у «Виконано X з Y»
function doneCountOn(date) {
  return tasksForDate(date).filter((t) => isTaskDone(t, date)).length;
}

// Зірки, зароблені за день; день, у якому ще нічого не відмічали після оновлення, рахуємо наживо
function dayStarsOn(date) {
  if (date < STAR_RULES_SINCE) return 0;
  return taskStore.dayStars[date] ?? starsForCount(doneCountOn(date), date);
}

function updateDayStars(date) {
  if (date >= STAR_RULES_SINCE) taskStore.dayStars[date] = starsForCount(doneCountOn(date), date);
}

// Усього зароблено: зірки днів мінус штрафи, плюс зароблене за старими правилами
function starsEarned() {
  const before = (map) => Object.entries(map).filter(([d]) => d < STAR_RULES_SINCE).reduce((sum, [, ids]) => sum + ids.length, 0);
  const legacy = Math.floor((before(taskStore.starDone) - before(taskStore.penalties)) / LEGACY_STAR_GOAL);
  const dates = new Set([...Object.keys(taskStore.dayStars), ...Object.keys(taskStore.done)]);
  const earned = [...dates].reduce((sum, d) => sum + dayStarsOn(d), 0);
  const penalties = Object.entries(taskStore.penalties)
    .filter(([d]) => d >= STAR_RULES_SINCE)
    .reduce((sum, [, ids]) => sum + ids.length, 0);
  return legacy + earned - penalties;
}

// ---------- Числова мета задачі ----------

const GOAL_UNITS = ['раз', 'хв', 'вправ'];
const GOAL_CUSTOM_MAX = 6;
const GOAL_MAX = 9999;

function goalProgress(task, date) {
  return taskStore.progress[date]?.[task.id] || 0;
}

function setGoalProgress(task, date, value) {
  if (value > 0) {
    taskStore.progress[date] = { ...taskStore.progress[date], [task.id]: value };
  } else if (taskStore.progress[date]) {
    delete taskStore.progress[date][task.id];
    if (!Object.keys(taskStore.progress[date]).length) delete taskStore.progress[date];
  }
}

function formatGoal(goal) {
  return `${goal.target}\u00a0${goal.unit}`;
}

// Швидкі кнопки «+N» під розмір мети: для 3 вправ — лише +1, для 100 присідань — +5…+50
function goalSteps(target) {
  if (target <= 5) return [1];
  if (target <= 20) return [1, 2, 5];
  if (target <= 60) return [5, 10, 15, 20];
  if (target <= 200) return [5, 10, 25, 50];
  return [10, 50, 100, 250];
}

// ---------- Штрафи за пропущені пріоритетні задачі ----------

// Підбиваємо підсумки всіх днів до вчора включно, які ще не закриті.
// Повертає список нових штрафів, щоб показати користувачу, за що знято бали.
function settlePenalties() {
  const yesterday = shiftDate(todayISO(), -1);
  // Перший запуск з цією функцією — минулі дні не штрафуємо
  if (!taskStore.settledThrough) {
    taskStore.settledThrough = yesterday;
    saveTasks();
    return [];
  }
  const missed = [];
  for (let date = shiftDate(taskStore.settledThrough, 1); date <= yesterday; date = shiftDate(date, 1)) {
    taskStore.tasks
      .filter((task) => task.flag && taskOccursOn(task, date) && !isTaskDone(task, date))
      .forEach((task) => {
        taskStore.penalties[date] = [...new Set([...(taskStore.penalties[date] || []), task.id])];
        missed.push({ task, date });
      });
  }
  if (taskStore.settledThrough < yesterday) {
    taskStore.settledThrough = yesterday;
    saveTasks();
  }
  return missed;
}

function isPenalized(task, date) {
  return (taskStore.penalties[date] || []).includes(task.id);
}

// Для вже закритого дня відмітка заднім числом знімає штраф, а знята відмітка — повертає
function syncPenalty(task, date) {
  if (!taskStore.settledThrough || date > taskStore.settledThrough) return;
  const ids = new Set(taskStore.penalties[date] || []);
  if (task.flag && !isTaskDone(task, date)) ids.add(task.id);
  else ids.delete(task.id);
  taskStore.penalties[date] = [...ids];
  if (!taskStore.penalties[date].length) delete taskStore.penalties[date];
}

function announcePenalties(missed) {
  if (!missed.length) return;
  const text = missed.length === 1
    ? `Пріоритетну задачу «${missed[0].task.title}» не виконано: −1 ★`
    : `Не виконано пріоритетних задач: ${missed.length}. −${missed.length} ★`;
  setTimeout(() => {
    showToast(text, 4000);
    pulse(starWidget, 'star-lose');
  }, 600);
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
    .sort((a, b) => (isTaskDone(a, date) - isTaskDone(b, date))
      || (Boolean(b.flag) - Boolean(a.flag))
      || a.createdAt.localeCompare(b.createdAt));
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

// Вибір повтору — список з галочкою, як у «Нагадуваннях»; під обраним типом — дні тижня або інтервал
const ROW_CHECK_SVG = '<svg class="repeat-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function renderRepeatList(el, repeat, date, onChange) {
  el.innerHTML = '';
  REPEAT_TYPES.forEach((type) => {
    const active = repeat.type === type.id;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'repeat-option' + (active ? ' active' : '');
    row.setAttribute('role', 'radio');
    row.setAttribute('aria-checked', active);
    row.innerHTML = `<span></span>${active ? ROW_CHECK_SVG : ''}`;
    row.querySelector('span').textContent = type.label;
    row.addEventListener('click', () => {
      if (!active) onChange(defaultRepeat(type.id, date));
    });
    el.appendChild(row);

    if (active && type.id === 'weekly') el.appendChild(renderWeekdayPicker(repeat, onChange));
    if (active && type.id === 'interval') el.appendChild(renderIntervalPicker(repeat, onChange));
  });
}

function renderWeekdayPicker(repeat, onChange) {
  const box = document.createElement('div');
  box.className = 'repeat-extra weekday-picker';
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
    box.appendChild(btn);
  });
  return box;
}

function renderIntervalPicker(repeat, onChange) {
  const box = document.createElement('div');
  box.className = 'repeat-extra interval-picker';
  box.innerHTML = `
    <span>Кожні</span>
    <button type="button" class="sleep-btn interval-minus" aria-label="Менше">−</button>
    <b class="interval-value">${repeat.interval}</b>
    <button type="button" class="sleep-btn interval-plus" aria-label="Більше">+</button>
    <span>${pluralDays(repeat.interval)}</span>`;
  const change = (delta) => onChange({ ...repeat, interval: Math.min(INTERVAL_MAX, Math.max(INTERVAL_MIN, repeat.interval + delta)) });
  box.querySelector('.interval-minus').addEventListener('click', () => change(-1));
  box.querySelector('.interval-plus').addEventListener('click', () => change(1));
  return box;
}

// ---------- Барабани тривалості ----------
// Класичний вибір часу, як в iOS: барабани «год» (0–12) і «хв» (крок 5 хв) зі «клацанням» на значеннях.
// Використовується в шторці задачі й у діалозі фактичного часу. set() викликати, коли барабани видимі.

const WHEEL_ROW = 36;

function createDurationPicker(root, onChange) {
  root.insertAdjacentHTML('beforeend', `
    <div class="wheel-picker">
      <div class="wheel-band" aria-hidden="true"></div>
      <div class="wheel wheel-hours" role="listbox" aria-label="Години" tabindex="0"></div>
      <span class="wheel-unit">год</span>
      <div class="wheel wheel-minutes" role="listbox" aria-label="Хвилини" tabindex="0"></div>
      <span class="wheel-unit">хв</span>
    </div>`);
  const hours = root.querySelector('.wheel-hours');
  const minutes = root.querySelector('.wheel-minutes');

  const fill = (wheel, values) => {
    values.forEach((value, i) => {
      const item = document.createElement('div');
      item.className = 'wheel-item';
      item.setAttribute('role', 'option');
      item.textContent = String(value).padStart(2, '0');
      item.addEventListener('click', () => wheel.scrollTo({ top: i * WHEEL_ROW, behavior: 'smooth' }));
      wheel.appendChild(item);
    });
  };
  fill(hours, Array.from({ length: ESTIMATE_MAX_HOURS + 1 }, (_, i) => i));
  fill(minutes, Array.from({ length: 60 / ESTIMATE_STEP }, (_, i) => i * ESTIMATE_STEP));

  const index = (wheel) => Math.max(0, Math.min(wheel.children.length - 1, Math.round(wheel.scrollTop / WHEEL_ROW)));
  const mark = (wheel) => {
    const current = index(wheel);
    [...wheel.children].forEach((item, i) => {
      item.classList.toggle('selected', i === current);
      item.setAttribute('aria-selected', i === current);
    });
  };
  const read = () => {
    const value = index(hours) * 60 + index(minutes) * ESTIMATE_STEP;
    // 0 год 0 хв не буває — мінімум 5 хвилин
    if (!value) {
      minutes.scrollTo({ top: WHEEL_ROW, behavior: 'smooth' });
      return ESTIMATE_STEP;
    }
    return value;
  };

  [hours, minutes].forEach((wheel) => {
    let settleTimer = null;
    wheel.addEventListener('scroll', () => {
      mark(wheel);
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => onChange(read()), 120);
    }, { passive: true });
    // Клавіатура: стрілки змінюють значення на один крок
    wheel.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      wheel.scrollBy({ top: e.key === 'ArrowDown' ? WHEEL_ROW : -WHEEL_ROW, behavior: 'smooth' });
    });
  });

  return {
    set(value) {
      hours.scrollTop = Math.floor(value / 60) * WHEEL_ROW;
      minutes.scrollTop = ((value % 60) / ESTIMATE_STEP) * WHEEL_ROW;
      mark(hours);
      mark(minutes);
    },
  };
}

// ---------- Вкладка «Задачі» ----------

document.getElementById('task-new-btn').addEventListener('click', () => openTaskSheet(null));

// ---------- Смужка тижня ----------

// Стан дня для крапки під датою: немає задач / є невиконані / усе виконано
function dayStatus(date) {
  const tasks = tasksForDate(date);
  if (!tasks.length) return 'none';
  return tasks.every((t) => isTaskDone(t, date)) ? 'done' : 'open';
}

const tasksWeek = createWeekPicker(document.getElementById('tasks-week'), {
  statusFor: dayStatus,
  extra: document.getElementById('open-shop-btn'),
});

// ---------- Список задач ----------

const FLAG_SVG = '<svg class="task-flag" viewBox="0 0 24 24" role="img" aria-label="Високий пріоритет"><rect x="4" y="2.5" width="2.2" height="19" rx="1.1"/><path d="M6.2 3.5h12.3c.5 0 .8.6.5 1l-2.6 3.8 2.6 3.8c.3.4 0 1-.5 1H6.2z"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const CROSS_SVG = '<svg class="cross" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
const CLOCK_SVG = '<svg class="meta-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
const REPEAT_SVG = '<svg class="meta-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></svg>';
// Згорнутість розділів списку: «Виконано» за замовчуванням згорнутий, «Не виконано» — розгорнутий
const TASK_SECTIONS = {
  done: { key: 'daily-tasks-done-collapsed', label: 'Виконано', collapsedByDefault: true },
  missed: { key: 'daily-tasks-missed-collapsed', label: 'Не виконано', collapsedByDefault: false },
};

function isSectionCollapsed(section) {
  try {
    const value = localStorage.getItem(TASK_SECTIONS[section].key);
    return value == null ? TASK_SECTIONS[section].collapsedByDefault : value === 'true';
  } catch {
    return TASK_SECTIONS[section].collapsedByDefault;
  }
}

function setSectionCollapsed(section, value) {
  try {
    localStorage.setItem(TASK_SECTIONS[section].key, String(value));
  } catch {}
}

// Заголовок розділу з лічильником; задачі розділу додаються, лише якщо він розгорнутий
function renderTaskSection(list, section, tasks) {
  if (!tasks.length) return;
  const collapsed = isSectionCollapsed(section);
  const header = document.createElement('button');
  header.type = 'button';
  header.id = `${section}-header`;
  header.className = `done-header section-${section}` + (collapsed ? ' collapsed' : '');
  header.setAttribute('aria-expanded', !collapsed);
  header.innerHTML = `
    <span>${TASK_SECTIONS[section].label}</span>
    <span class="done-count">${tasks.length}</span>
    <svg class="done-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>`;
  header.addEventListener('click', () => {
    setSectionCollapsed(section, !collapsed);
    renderTasks();
  });
  list.appendChild(header);
  if (!collapsed) tasks.forEach((task) => list.appendChild(renderTaskRow(task)));
}

function renderTasks() {
  tasksWeek.render();

  const tasks = tasksForDate(currentDate);
  const doneCount = tasks.filter((t) => isTaskDone(t, currentDate)).length;
  // Шкала — усі справи дня: позначки лише тих зірок, які з таким планом можна набрати,
  // а повзунок показує, скільки вже виконано
  const progress = document.getElementById('tasks-progress');
  progress.hidden = !tasks.length;
  const track = progress.querySelector('.tier-track');
  const share = tasks.length ? Math.min(1, doneCount / tasks.length) : 0;
  // Градієнт розтягнуто на всю шкалу й відкрито до поточного місця — що далі, то епічніший колір
  progress.style.setProperty('--share', share);
  renderTierMarks(track, doneCount, tasks.length);
  const knob = track.querySelector('.tier-knob');
  knob.style.left = `${share * 100}%`;
  knob.textContent = doneCount;
  if (!starAnimating) renderStarWidget();

  const list = document.getElementById('task-list');
  list.innerHTML = '';
  if (!tasks.length) {
    renderTasksEmpty(list);
    return;
  }

  // Виконані — в окремому розділі, який можна згорнути, як у «Нагадуваннях».
  // У минулому дні невиконані теж збираються в свій розділ «Не виконано»
  const openTasks = tasks.filter((t) => !isTaskDone(t, currentDate));
  const doneTasks = tasks.filter((t) => isTaskDone(t, currentDate));
  // У минулому дні спершу показуємо виконане — фокус на досягненнях
  if (currentDate < todayISO()) {
    renderTaskSection(list, 'done', doneTasks);
    renderTaskSection(list, 'missed', openTasks);
  } else {
    openTasks.forEach((task) => list.appendChild(renderTaskRow(task)));
    renderTaskSection(list, 'done', doneTasks);
  }
}

function renderTaskRow(task) {
  const done = isTaskDone(task, currentDate);
  const row = document.createElement('div');
  // День минув, а задачу не виконано — червоний хрестик замість порожнього кружечка
  const missed = !done && currentDate < todayISO();
  row.className = 'task' + (done ? ' done' : '') + (missed ? ' missed' : '');
  // Задача з метою: кружечок — кільце прогресу; почата, але не завершена в минулому — помаранчеве кільце
  const progress = task.goal ? goalProgress(task, currentDate) : 0;
  const partial = missed && progress > 0;
  if (partial) row.classList.add('partial');
  const circle = task.goal && !done && (!missed || partial)
    ? `<span class="check-circle goal-ring">${goalRingSvg(progress / task.goal.target)}${CHECK_SVG}</span>`
    : `<span class="check-circle">${missed ? CROSS_SVG : CHECK_SVG}</span>`;
  row.innerHTML = `
    <button type="button" class="task-check" role="checkbox" aria-checked="${done}">${circle}</button>
    <button type="button" class="task-body">
      <span class="task-title">${task.flag ? FLAG_SVG : ''}<span></span></span>
      <span class="task-meta"></span>
    </button>`;
  row.querySelector('.task-title span').textContent = task.title;
  const meta = repeatLabel(task.repeat);
  const metaEl = row.querySelector('.task-meta');
  if (task.goal) {
    const part = document.createElement('span');
    part.className = 'meta-part goal-count' + (progress || done ? '' : ' empty');
    const value = done ? Math.max(progress, task.goal.target) : progress;
    part.textContent = `${value}/${formatGoal(task.goal)}`;
    if (partial) part.append(` · ${Math.round((progress / task.goal.target) * 100)}%`);
    metaEl.appendChild(part);
  }
  if (task.estimate) {
    const part = document.createElement('span');
    part.className = 'meta-part';
    part.innerHTML = CLOCK_SVG;
    // Виконана задача з фактичним часом, що не збігся з планом: закреслений план і факт —
    // червоним, якщо вийшло довше, зеленим, якщо швидше
    const actual = done ? taskStore.actual[currentDate]?.[task.id] : null;
    if (actual && actual !== task.estimate) {
      part.classList.add(actual > task.estimate ? 'time-over' : 'time-under');
      const plan = document.createElement('span');
      plan.className = 'time-plan';
      plan.textContent = formatEstimate(task.estimate);
      part.append(plan, formatEstimate(actual));
    } else {
      part.append(formatEstimate(task.estimate));
    }
    metaEl.appendChild(part);
  }
  if (meta) {
    const part = document.createElement('span');
    part.className = 'meta-part';
    part.innerHTML = REPEAT_SVG;
    part.append(meta);
    metaEl.appendChild(part);
  }
  // Перенесена задача: показуємо, звідки, щоб не плутати з повторюваною того ж дня
  if (task.movedFrom && task.start === currentDate) {
    const part = document.createElement('span');
    part.className = 'meta-part';
    part.innerHTML = '<svg class="meta-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6v5a4 4 0 0 0 4 4h11M15 11l4 4-4 4"/></svg>';
    part.append(`з ${formatDayMonth(task.movedFrom)}`);
    metaEl.appendChild(part);
  }
  // Невиконана задача, яку вже перенесли: лишається в минулому дні з позначкою, куди саме
  const movedTo = missed && movedCopyOf(task, currentDate);
  if (movedTo) {
    const part = document.createElement('span');
    part.className = 'meta-part';
    part.innerHTML = '<svg class="meta-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
    part.append(`перенесено ${moveTargetLabel(movedTo.start)}`);
    metaEl.appendChild(part);
  }
  if (isPenalized(task, currentDate)) {
    row.classList.add('penalized');
    const badge = document.createElement('span');
    badge.className = 'penalty-badge';
    badge.textContent = `Не виконано · ${currentDate < STAR_RULES_SINCE ? `−1/${LEGACY_STAR_GOAL}` : '−1'} ★`;
    row.querySelector('.task-meta').appendChild(badge);
  }
  row.querySelector('.task-check').setAttribute('aria-label', done
    ? `Позначити «${task.title}» невиконаною`
    : missed ? `«${task.title}» не виконано. Позначити виконаною` : `Позначити «${task.title}» виконаною`);
  row.querySelector('.task-check').addEventListener('click', (e) => {
    if (task.goal) openGoalSheet(task, row, e.currentTarget);
    else toggleTask(task, row, e.currentTarget);
  });
  row.querySelector('.task-body').addEventListener('click', () => openTaskSheet(task));
  if (missed && canMoveToNextDay(task, currentDate)) row.appendChild(renderMoveButton(task));
  return attachTaskSwipe(row, task, done);
}

const GOAL_RING_R = 12;
const GOAL_RING_LEN = 2 * Math.PI * GOAL_RING_R;

function goalRingSvg(share) {
  const offset = GOAL_RING_LEN * (1 - Math.min(1, share));
  return `<svg class="goal-ring-svg" viewBox="0 0 28 28" aria-hidden="true">
    <circle class="goal-ring-track" cx="14" cy="14" r="${GOAL_RING_R}"/>
    ${share > 0 ? `<circle class="goal-ring-bar" cx="14" cy="14" r="${GOAL_RING_R}" stroke-dasharray="${GOAL_RING_LEN}" stroke-dashoffset="${offset}"/>` : ''}
  </svg>`;
}

// ---------- Шторка «Скільки зроблено?» ----------

const goalSheet = document.getElementById('goal-sheet');
const goalInput = document.getElementById('goal-sheet-input');
const GOAL_BIG_LEN = 2 * Math.PI * 42;
let goalSheetState = null;

function openGoalSheet(task, row, checkEl) {
  goalSheetState = { task, row, checkEl, date: currentDate };
  const { target, unit } = task.goal;
  document.getElementById('goal-sheet-task').textContent = `${task.title} · мета ${formatGoal(task.goal)}`;
  document.getElementById('goal-sheet-unit').textContent = `з ${target}\u00a0${unit}`;
  const quick = document.getElementById('goal-sheet-quick');
  quick.innerHTML = '';
  goalSteps(target).forEach((step) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `+${step}`;
    btn.addEventListener('click', () => setGoalSheetValue(goalSheetValue() + step));
    quick.appendChild(btn);
  });
  quick.style.gridTemplateColumns = `repeat(${quick.children.length}, 1fr)`;
  const done = isTaskDone(task, currentDate);
  document.getElementById('goal-sheet-all').hidden = done;
  setGoalSheetValue(done ? Math.max(goalProgress(task, currentDate), target) : goalProgress(task, currentDate));
  goalSheet.hidden = false;
}

function goalSheetValue() {
  return Math.max(0, Math.min(GOAL_MAX, parseInt(goalInput.value, 10) || 0));
}

function setGoalSheetValue(value) {
  value = Math.max(0, Math.min(GOAL_MAX, value));
  goalInput.value = value;
  renderGoalSheet();
}

function renderGoalSheet() {
  const value = goalSheetValue();
  const { target } = goalSheetState.task.goal;
  document.getElementById('goal-sheet-value').textContent = value;
  const bar = document.getElementById('goal-sheet-bar');
  bar.style.strokeDashoffset = GOAL_BIG_LEN * (1 - Math.min(1, value / target));
  goalSheet.classList.toggle('reached', value >= target);
}

function closeGoalSheet() {
  goalSheet.hidden = true;
  goalInput.blur();
}

// Зберегли прогрес: досягли мети — задача виконана (з усіма святкуваннями), опустились нижче — відмітка знімається
function applyGoalProgress(value) {
  const { task, row, checkEl, date } = goalSheetState;
  closeGoalSheet();
  const done = isTaskDone(task, date);
  setGoalProgress(task, date, value);
  saveTasks();
  if (value >= task.goal.target && !done) toggleTask(task, row, checkEl);
  else if (value < task.goal.target && done) toggleTask(task, row, checkEl);
  else {
    flashSaved();
    renderTasks();
  }
}

goalInput.addEventListener('input', renderGoalSheet);
goalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    applyGoalProgress(goalSheetValue());
  }
});
document.getElementById('goal-sheet-minus').addEventListener('click', () => setGoalSheetValue(goalSheetValue() - 1));
document.getElementById('goal-sheet-plus').addEventListener('click', () => setGoalSheetValue(goalSheetValue() + 1));
document.getElementById('goal-sheet-save').addEventListener('click', () => applyGoalProgress(goalSheetValue()));
document.getElementById('goal-sheet-all').addEventListener('click', () => {
  applyGoalProgress(Math.max(goalSheetValue(), goalSheetState.task.goal.target));
});
goalSheet.addEventListener('click', (e) => {
  if (e.target === goalSheet) closeGoalSheet();
});
attachSheetDrag(goalSheet, closeGoalSheet);

// ---------- Свайпи по задачі ----------
// Вправо — виконати (або повернути), вліво — видалити, як у системних списках iOS.

const SWIPE_THRESHOLD = 90;

function attachTaskSwipe(row, task, done) {
  const wrap = document.createElement('div');
  wrap.className = 'task-swipe';
  wrap.innerHTML = `
    <div class="swipe-action swipe-done" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><span>${done ? 'Повернути' : 'Виконано'}</span>
    </div>
    <div class="swipe-action swipe-delete" aria-hidden="true">
      <span>Видалити</span><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>
    </div>`;
  wrap.appendChild(row);

  let x0 = 0;
  let y0 = 0;
  let dx = 0;
  let mode = null; // null — ще не визначили, 'swipe' — горизонтальний жест, 'scroll' — прокрутка
  let lastSwipeAt = 0;

  // Жест не повинен ще й відкрити шторку чи натиснути чекбокс
  row.addEventListener('click', (e) => {
    if (Date.now() - lastSwipeAt < 400) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, { capture: true });

  row.addEventListener('touchstart', (e) => {
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    dx = 0;
    mode = null;
    row.style.transition = 'none';
  }, { passive: true });

  row.addEventListener('touchmove', (e) => {
    const mx = e.touches[0].clientX - x0;
    const my = e.touches[0].clientY - y0;
    if (!mode) {
      if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my)) mode = 'swipe';
      else if (Math.abs(my) > 10) mode = 'scroll';
    }
    if (mode !== 'swipe') return;
    e.preventDefault();
    dx = mx;
    row.style.transform = `translateX(${dx}px)`;
    wrap.classList.add('swiping');
    wrap.classList.toggle('to-right', dx > 0);
    wrap.classList.toggle('armed', Math.abs(dx) > SWIPE_THRESHOLD);
  }, { passive: false });

  const end = () => {
    if (mode !== 'swipe') return;
    mode = null;
    lastSwipeAt = Date.now();
    row.style.transition = 'transform 0.25s ease-out';

    if (dx > SWIPE_THRESHOLD) {
      row.style.transform = '';
      setTimeout(() => {
        wrap.classList.remove('swiping', 'to-right', 'armed');
        toggleTask(task, row, row.querySelector('.task-check'));
      }, 180);
    } else if (dx < -SWIPE_THRESHOLD) {
      row.style.transform = 'translateX(-110%)';
      wrap.style.height = `${wrap.offsetHeight}px`;
      requestAnimationFrame(() => wrap.classList.add('removing'));
      setTimeout(() => deleteTaskBySwipe(task), 260);
    } else {
      row.style.transform = '';
      setTimeout(() => wrap.classList.remove('swiping', 'to-right', 'armed'), 250);
    }
  };
  row.addEventListener('touchend', end);
  row.addEventListener('touchcancel', end);
  return wrap;
}

function deleteTaskBySwipe(task) {
  if (task.repeat.type !== 'none') {
    withTaskUndo('Задачу прибрано з цього дня', () => deleteTaskOccurrence(task, currentDate));
  } else {
    withTaskUndo('Задачу видалено', () => deleteTaskFrom(task, task.start));
  }
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
  const starsBefore = dayStarsOn(date);
  const done = new Set(taskStore.done[date] || []);
  const nowDone = !done.has(task.id);
  if (nowDone) done.add(task.id);
  else done.delete(task.id);
  taskStore.done[date] = [...done];
  if (!taskStore.done[date].length) delete taskStore.done[date];

  // Мета: виконана задача — мета досягнута; знята відмітка з повністю «набраної» задачі обнуляє прогрес
  const prevProgress = task.goal ? goalProgress(task, date) : 0;
  if (task.goal && nowDone && prevProgress < task.goal.target) setGoalProgress(task, date, task.goal.target);
  if (task.goal && !nowDone && prevProgress >= task.goal.target) setGoalProgress(task, date, 0);

  // Зірки дня: перераховуємо за кількістю виконаного, знята відмітка може забрати зірку
  updateDayStars(date);
  syncPenalty(task, date);
  const starsAfter = dayStarsOn(date);
  saveTasks();
  if (!nowDone) {
    // Фактичний час стосується лише виконаної задачі
    const prevActual = taskStore.actual[date]?.[task.id];
    setActual(task, date, null);
    saveTasks();
    // Зняту відмітку легко повернути — без анімацій і повторного нарахування зірок
    const restored = JSON.stringify(taskStore);
    showUndo('Відмітку знято', () => {
      const store = JSON.parse(restored);
      store.done[date] = [...new Set([...(store.done[date] || []), task.id])];
      taskStore = store;
      // Відмітку повернули — мета знову досягнута
      if (task.goal) setGoalProgress(task, date, Math.max(prevProgress, task.goal.target));
      updateDayStars(date);
      if (prevActual) setActual(task, date, prevActual);
      syncPenalty(task, date);
      saveTasks();
      renderTasks();
    });
  }

  row.classList.toggle('done', nowDone);
  checkEl.setAttribute('aria-checked', nowDone);
  // Пропущену задачу відмітили заднім числом — хрестик одразу стає галочкою
  if (nowDone && row.classList.contains('missed')) {
    row.classList.remove('missed');
    checkEl.querySelector('.check-circle').innerHTML = CHECK_SVG;
  }

  if (!nowDone) {
    renderTasks();
    if (starsAfter < starsBefore) pulse(starWidget, 'star-lose');
    return;
  }

  row.classList.add('just-done');
  // Після анімації спитаємо фактичний час; святкування почекають, поки діалог закриють
  timeDialogPending = true;
  burstFrom(checkEl, starsAfter > starsBefore ? STAR_COLORS : FX_COLORS);
  if (navigator.vibrate) navigator.vibrate(12);
  if (starsAfter > starsBefore) animateStarGain(checkEl, starsAfter);

  const all = tasksForDate(date);
  const allDone = all.length && all.every((t) => isTaskDone(t, date));
  // Даємо анімації дограти, потім виконана задача опускається вниз
  setTimeout(() => {
    if (currentDate === date) {
      renderTasks();
      const header = document.getElementById('done-header');
      if (header) pulse(header, 'bump');
    }
    if (allDone) afterTimeDialog(celebrateAllDone);
    openTimeDialog(task, date);
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

const DAY_STAR_SVG = '<svg class="day-star" viewBox="0 0 24 24"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z"/></svg>';

// Три зірочки дня по центру; у день без справ не показуємо
// Показуємо лише зірки, яких можна досягти з поточним планом: при 10 справах — дві
function reachableStars(date) {
  return Math.max(dayStarsOn(date), starsForCount(tasksForDate(date).length, date));
}

function renderStarWidget() {
  const count = doneCountOn(currentDate);
  const stars = dayStarsOn(currentDate);
  const reachable = reachableStars(currentDate);
  const shape = starWidget.querySelector('.star-shape');
  if (shape.children.length !== reachable) shape.innerHTML = DAY_STAR_SVG.repeat(reachable);
  shape.classList.toggle('full-set', reachable === STAR_COUNT);
  [...shape.children].forEach((star, i) => star.classList.toggle('on', i < stars));
  starWidget.classList.toggle('is-full', reachable > 0 && stars === reachable);
  starWidget.hidden = !reachable;
  starWidget.setAttribute('aria-label', `Зірок за день: ${stars} з ${reachable}. Виконано справ: ${count}`);
}

// Позначки порогів на шкалі всіх справ дня: риска й зірочки над нею; недосяжні з таким планом не малюємо
function renderTierMarks(track, count, planned) {
  track.querySelectorAll('.tier-mark').forEach((m) => m.remove());
  tiersOn(currentDate).forEach((min, i) => {
    if (min > planned) return;
    const mark = document.createElement('span');
    mark.className = 'tier-mark' + (count >= min ? ' reached' : '') + (min === planned ? ' last' : '');
    mark.style.left = `${(min / planned) * 100}%`;
    mark.innerHTML = `<i aria-hidden="true">${'★'.repeat(i + 1)}</i>`;
    track.appendChild(mark);
  });
}

function pulse(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

// Золота зірочка летить з чекбокса до зірочок дня, потім — попап з новою кількістю зірок
function animateStarGain(fromEl, stars) {
  starAnimating = true;
  const arrive = () => {
    renderStarWidget();
    pulse(starWidget, 'star-gain');
    floatPlusOne();
    setTimeout(() => afterTimeDialog(() => celebrateStar(stars)), 850);
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

// Нова зірка дня: спалах, золоті промені й конфеті, попап з бадьорим текстом
function celebrateStar(stars) {
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

  setTimeout(() => showStarPopup(stars), prefersReducedMotion() ? 0 : 450);
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

function showStarPopup(stars) {
  const copy = STAR_TIER_COPY[stars];
  document.getElementById('star-popup-title').textContent = copy.title;
  document.getElementById('star-popup-text').textContent = copy.texts[Math.floor(Math.random() * copy.texts.length)];
  const art = document.getElementById('star-popup-stars');
  art.innerHTML = [...Array(STAR_COUNT).keys()].map((i) => `
    <svg class="popup-day-star${i < stars ? ' on' : ''}${i === stars - 1 ? ' new' : ''}" viewBox="0 0 24 24" style="--i:${i}">
      <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z"/>
    </svg>`).join('');
  starPopup.hidden = false;
  document.getElementById('star-popup-btn').focus();
}

function closeStarPopup() {
  starPopup.hidden = true;
  starAnimating = false;
  renderStarWidget();
  if (!document.getElementById('shop-modal').hidden) renderShop();
}

document.getElementById('star-popup-btn').addEventListener('click', closeStarPopup);
starPopup.addEventListener('click', (e) => {
  if (e.target === starPopup) closeStarPopup();
});

starWidget.addEventListener('click', () => {
  const count = doneCountOn(currentDate);
  const next = tiersOn(currentDate).find((min) => count < min);
  const day = currentDate === todayISO() ? 'Сьогодні' : 'Цього дня';
  if (!next) {
    showToast(`★ ${day} зібрано всі ${STAR_COUNT} зірки — чудовий день!`, 2600);
    return;
  }
  const left = next - count;
  showToast(`★ До наступної зірки — ще ${left} ${pluralTasks(left)}`, 2600);
});

// ---------- Редагування задачі ----------

const taskSheet = document.getElementById('task-sheet');
const sheetTitleInput = document.getElementById('task-sheet-title');
const sheetSaveBtn = document.getElementById('task-sheet-save');
// null — створення нової задачі, інакше — редагування
let sheetTask = null;
let sheetRepeat = null;
let sheetDate = null;
const sheetFlag = document.getElementById('task-sheet-flag');
const sheetEstimateRow = document.getElementById('task-sheet-estimate-row');
const sheetEstimatePicker = document.getElementById('task-sheet-estimate');
let sheetEstimate = ESTIMATE_DEFAULT;
const sheetDateInput = document.getElementById('task-sheet-date');
const sheetRepeatRow = document.getElementById('task-sheet-repeat-row');
const sheetRepeatList = document.getElementById('task-sheet-repeat');

function openTaskSheet(task) {
  sheetTask = task;
  sheetRepeat = task ? { ...task.repeat, days: task.repeat.days ? [...task.repeat.days] : undefined } : { type: 'none' };
  document.getElementById('task-sheet-heading').textContent = task ? 'Задача' : 'Нова задача';
  sheetSaveBtn.textContent = task ? 'Готово' : 'Додати';
  sheetTitleInput.value = task ? task.title : '';
  sheetDate = task ? task.start : currentDate;
  sheetFlag.checked = Boolean(task?.flag);
  sheetEstimate = task?.estimate || ESTIMATE_DEFAULT;
  sheetGoal = task?.goal ? { ...task.goal } : { target: null, unit: GOAL_UNITS[0] };
  setGoalEditorOpen(false);
  renderSheetGoal();
  setEstimateOpen(false);
  renderSheetEstimate();
  updateSheetSave();
  renderSheetDate();
  setRepeatListOpen(false);
  renderSheetRepeat();
  if (task) renderSheetDelete();
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

function renderSheetDate() {
  // Для повторюваної задачі дата — це початок серії
  document.getElementById('task-sheet-date-title').textContent = sheetRepeat.type === 'none' ? 'Дата' : 'Починаючи з';
  document.getElementById('task-sheet-date-label').textContent = capitalize(formatDate(sheetDate, 'short'));
  sheetDateInput.value = sheetDate;
}

sheetDateInput.addEventListener('change', () => {
  if (!sheetDateInput.value) return;
  sheetDate = sheetDateInput.value;
  renderSheetDate();
});
sheetDateInput.addEventListener('click', () => {
  try {
    sheetDateInput.showPicker?.();
  } catch {}
});

// ---------- Тривалість ----------

function setEstimateOpen(open) {
  sheetEstimatePicker.hidden = !open;
  // Позицію барабанів можна виставити лише коли вони видимі
  if (open) estimatePicker.set(sheetEstimate);
  sheetEstimateRow.classList.toggle('open', open);
  sheetEstimateRow.setAttribute('aria-expanded', open);
}

sheetEstimateRow.addEventListener('click', () => setEstimateOpen(sheetEstimatePicker.hidden));

// Шторка задачі: барабани тривалості
const estimatePicker = createDurationPicker(sheetEstimatePicker, (minutes) => {
  sheetEstimate = minutes;
  renderSheetEstimate();
});

function renderSheetEstimate() {
  document.getElementById('task-sheet-estimate-label').textContent = formatEstimate(sheetEstimate);
}

// ---------- Мета в шторці задачі ----------

const sheetGoalRow = document.getElementById('task-sheet-goal-row');
const sheetGoalEditor = document.getElementById('task-sheet-goal');
const sheetGoalTarget = document.getElementById('task-sheet-goal-target');
let sheetGoal = { target: null, unit: GOAL_UNITS[0] };

function setGoalEditorOpen(open) {
  sheetGoalEditor.hidden = !open;
  sheetGoalRow.classList.toggle('open', open);
  sheetGoalRow.setAttribute('aria-expanded', open);
  if (open && !sheetGoal.target) sheetGoalTarget.focus();
}

sheetGoalRow.addEventListener('click', () => setGoalEditorOpen(sheetGoalEditor.hidden));

function renderSheetGoal() {
  sheetGoalTarget.value = sheetGoal.target || '';
  renderSheetGoalLabel();
  renderGoalUnits();
}

function renderSheetGoalLabel() {
  const label = document.getElementById('task-sheet-goal-label');
  label.textContent = sheetGoal.target ? formatGoal(sheetGoal) : 'Немає';
  label.classList.toggle('on', Boolean(sheetGoal.target));
}

// Мета в хвилинах — це й тривалість задачі
function syncEstimateWithGoal() {
  if (sheetGoal.unit !== 'хв' || !sheetGoal.target) return;
  sheetEstimate = Math.min(ESTIMATE_MAX_HOURS * 60, sheetGoal.target);
  renderSheetEstimate();
}

sheetGoalTarget.addEventListener('input', () => {
  const value = Math.min(GOAL_MAX, parseInt(sheetGoalTarget.value, 10) || 0);
  sheetGoal.target = value || null;
  renderSheetGoalLabel();
  syncEstimateWithGoal();
});

function selectGoalUnit(unit) {
  sheetGoal.unit = unit;
  // Своя одиниця, якою скористались, піднімається першою — найдовше невживані витісняються
  if (!GOAL_UNITS.includes(unit)) {
    taskStore.goalUnits = [unit, ...taskStore.goalUnits.filter((u) => u !== unit)].slice(0, GOAL_CUSTOM_MAX);
    saveTasks();
  }
  renderSheetGoalLabel();
  renderGoalUnits();
  syncEstimateWithGoal();
}

function renderGoalUnits() {
  const box = document.getElementById('task-sheet-goal-units');
  box.innerHTML = '';
  const units = [...GOAL_UNITS, ...taskStore.goalUnits];
  // Одиницю задачі могли видалити зі списку — у самій задачі вона лишається
  if (!units.includes(sheetGoal.unit)) units.push(sheetGoal.unit);
  units.forEach((unit) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'goal-chip' + (unit === sheetGoal.unit ? ' on' : '');
    chip.textContent = unit;
    chip.addEventListener('click', () => {
      if (chip.dataset.longPressed) return;
      selectGoalUnit(unit);
    });
    if (taskStore.goalUnits.includes(unit)) attachUnitLongPress(chip, unit);
    box.appendChild(chip);
  });
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'goal-chip goal-chip-add';
  add.textContent = '+ своя';
  add.addEventListener('click', () => startCustomUnit(add));
  box.appendChild(add);
}

// Довгий тап по своїй одиниці — видалити її зі списку (з можливістю скасувати)
function attachUnitLongPress(chip, unit) {
  let timer = null;
  const start = () => {
    delete chip.dataset.longPressed;
    timer = setTimeout(() => {
      chip.dataset.longPressed = '1';
      if (navigator.vibrate) navigator.vibrate(15);
      const before = [...taskStore.goalUnits];
      taskStore.goalUnits = taskStore.goalUnits.filter((u) => u !== unit);
      saveTasks();
      renderGoalUnits();
      showUndo(`Одиницю «${unit}» видалено`, () => {
        taskStore.goalUnits = before;
        saveTasks();
        renderGoalUnits();
      });
    }, 550);
  };
  const cancel = () => clearTimeout(timer);
  chip.addEventListener('touchstart', start, { passive: true });
  chip.addEventListener('mousedown', start);
  ['touchend', 'touchmove', 'touchcancel', 'mouseup', 'mouseleave'].forEach((ev) => chip.addEventListener(ev, cancel));
  chip.addEventListener('contextmenu', (e) => e.preventDefault());
}

function startCustomUnit(addChip) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'goal-chip goal-chip-input';
  input.maxLength = 14;
  input.placeholder = 'напр. кроків';
  input.enterKeyHint = 'done';
  input.setAttribute('aria-label', 'Своя одиниця');
  addChip.replaceWith(input);
  input.focus();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    const unit = input.value.trim().toLowerCase();
    if (unit) selectGoalUnit(unit);
    else renderGoalUnits();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish();
    }
    if (e.key === 'Escape') {
      input.value = '';
      finish();
    }
  });
  input.addEventListener('blur', finish);
}

function setRepeatListOpen(open) {
  sheetRepeatList.hidden = !open;
  sheetRepeatRow.classList.toggle('open', open);
  sheetRepeatRow.setAttribute('aria-expanded', open);
}

sheetRepeatRow.addEventListener('click', () => setRepeatListOpen(sheetRepeatList.hidden));

function renderSheetRepeat() {
  document.getElementById('task-sheet-repeat-label').textContent = repeatLabel(sheetRepeat) || 'Ніколи';
  renderRepeatList(sheetRepeatList, sheetRepeat, sheetDate, (repeat) => {
    sheetRepeat = repeat;
    renderSheetRepeat();
    renderSheetDate();
  });
}

// Видалення без підтверджень: одразу видаляємо й пропонуємо «Скасувати».
// Для повторюваної задачі — вибір: лише цей день або цей і всі наступні.
function renderSheetDelete() {
  const box = document.getElementById('task-sheet-delete');
  box.innerHTML = '';
  const task = sheetTask;
  const options = task.repeat.type !== 'none'
    ? [
      { text: 'Видалити лише в цей день', toast: 'Задачу прибрано з цього дня', action: () => deleteTaskOccurrence(task, currentDate) },
      { text: 'Видалити в цей і всі наступні дні', toast: 'Задачу видалено з цього дня й далі', action: () => deleteTaskFrom(task, currentDate) },
    ]
    : [{ text: 'Видалити задачу', toast: 'Задачу видалено', action: () => deleteTaskFrom(task, task.start) }];
  options.forEach((option) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sheet-danger';
    btn.textContent = option.text;
    btn.addEventListener('click', () => {
      closeTaskSheet();
      withTaskUndo(option.toast, option.action);
    });
    box.appendChild(btn);
  });
}

// Виконує зміну задач і показує тост, який повертає попередній стан
function withTaskUndo(text, change) {
  const before = JSON.stringify(taskStore);
  change();
  saveTasks();
  renderTasks();
  showUndo(text, () => {
    taskStore = JSON.parse(before);
    saveTasks();
    renderTasks();
  });
}

// ---------- Перенесення пропущеної задачі на наступний день ----------

function moveTargetLabel(date) {
  return date === todayISO() ? 'на сьогодні' : `на ${formatDayMonth(date)}`;
}

// Копія, створена перенесенням цієї задачі з цього дня
function movedCopyOf(task, date) {
  return taskStore.tasks.find((t) => t.movedFromId === task.id && t.movedFrom === date);
}

// Не переносимо щоденні задачі (вони й так будуть завтра) і не створюємо дублікатів:
// якщо в наступному дні вже є ця ж повторювана задача або задача з такою самою назвою
function canMoveToNextDay(task, date) {
  if (task.repeat.type === 'daily' || movedCopyOf(task, date)) return false;
  const target = shiftDate(date, 1);
  if (taskOccursOn(task, target)) return false;
  const sameTitle = (t) => t.title.trim().toLowerCase() === task.title.trim().toLowerCase();
  return !tasksForDate(target).some((t) => t.id !== task.id && sameTitle(t));
}

function renderMoveButton(task) {
  const target = shiftDate(currentDate, 1);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'task-move';
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg><span></span>';
  btn.querySelector('span').textContent = moveTargetLabel(target);
  btn.setAttribute('aria-label', `Перенести «${task.title}» ${moveTargetLabel(target)}`);
  btn.addEventListener('click', () => moveTaskToNextDay(task, currentDate));
  return btn;
}

// Задача лишається в минулому дні невиконаною (як історія), а на наступний день
// з'являється її разова копія — повтор оригіналу при цьому не змінюється
function movedCopy(task, date) {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: task.title,
    flag: task.flag,
    estimate: task.estimate,
    ...(task.goal ? { goal: { ...task.goal } } : {}),
    start: shiftDate(date, 1),
    repeat: { type: 'none' },
    until: null,
    movedFrom: date,
    movedFromId: task.id,
    createdAt: new Date().toISOString(),
  };
}

function moveTaskToNextDay(task, date) {
  const target = shiftDate(date, 1);
  const moved = movedCopy(task, date);
  withTaskUndo(`Перенесено ${moveTargetLabel(target)}`, () => {
    taskStore.tasks.push(moved);
  });
  if (plannedMinutes(target) > DAY_PLAN_LIMIT) showOverloadPopup(moved);
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
  let newTask = null;
  const title = sheetTitleInput.value.trim();
  if (!title) {
    sheetTitleInput.focus();
    return;
  }
  if (sheetTask) {
    sheetTask.title = title;
    sheetTask.flag = sheetFlag.checked;
    sheetTask.estimate = sheetEstimate;
    sheetTask.repeat = sheetRepeat;
    sheetTask.start = sheetDate;
    if (sheetGoal.target) sheetTask.goal = { target: sheetGoal.target, unit: sheetGoal.unit };
    else delete sheetTask.goal;
  } else {
    newTask = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title,
      flag: sheetFlag.checked,
      estimate: sheetEstimate,
      start: sheetDate,
      repeat: sheetRepeat,
      until: null,
      createdAt: new Date().toISOString(),
    };
    if (sheetGoal.target) newTask.goal = { target: sheetGoal.target, unit: sheetGoal.unit };
    taskStore.tasks.push(newTask);
  }
  const addedElsewhere = !sheetTask && sheetDate !== currentDate;
  saveTasks();
  if (addedElsewhere) showToast(`Додано на ${formatDayMonth(sheetDate)}`, 2200);
  else flashSaved();
  closeTaskSheet();
  renderTasks();
  // Задачу створено, але якщо день перевантажено — чесно попереджаємо (щоразу)
  if (newTask && plannedMinutes(newTask.start) > DAY_PLAN_LIMIT) showOverloadPopup(newTask);
}

sheetSaveBtn.addEventListener('click', saveTaskSheet);

// ---------- Перевантажений день ----------

// «18 жовтня» — без дня тижня, бо після «на» він мав би стояти в знахідному відмінку
function formatDayMonth(date) {
  return fromISODate(date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

// Сума тривалостей усіх задач дня; старі задачі без тривалості не враховуються
function plannedMinutes(date) {
  return tasksForDate(date).reduce((sum, task) => sum + (task.estimate || 0), 0);
}

const overloadPopup = document.getElementById('overload-popup');
let overloadTask = null;

function showOverloadPopup(task) {
  overloadTask = task;
  const total = plannedMinutes(task.start);
  const day = task.start === todayISO() ? 'на сьогодні' : `на ${formatDayMonth(task.start)}`;
  document.getElementById('overload-text').textContent =
    `Заплановано ${day} вже ${formatEstimate(total)} — це більше за ${formatEstimate(DAY_PLAN_LIMIT)}. `
    + 'На все може не вистачити часу. Можливо, варто перенести щось на інший день?';
  overloadPopup.hidden = false;
}

function closeOverloadPopup() {
  overloadPopup.hidden = true;
  overloadTask = null;
}

document.getElementById('overload-keep').addEventListener('click', closeOverloadPopup);
document.getElementById('overload-move').addEventListener('click', () => {
  const task = overloadTask;
  closeOverloadPopup();
  // Відкриваємо щойно створену задачу — у шторці можна змінити дату
  if (task) openTaskSheet(task);
});
overloadPopup.addEventListener('click', (e) => {
  if (e.target === overloadPopup) closeOverloadPopup();
});
attachSheetDrag(taskSheet, closeTaskSheet);

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
    penalties: mergeMap(existing.penalties, incoming.penalties),
    dayStars: Object.fromEntries(
      [...new Set([...Object.keys(existing.dayStars || {}), ...Object.keys(incoming.dayStars || {})])]
        .map((date) => [date, Math.max((existing.dayStars || {})[date] || 0, (incoming.dayStars || {})[date] || 0)]),
    ),
    actual: Object.fromEntries(
      [...new Set([...Object.keys(existing.actual || {}), ...Object.keys(incoming.actual || {})])]
        .map((date) => [date, { ...(incoming.actual || {})[date], ...(existing.actual || {})[date] }]),
    ),
    progress: Object.fromEntries(
      [...new Set([...Object.keys(existing.progress || {}), ...Object.keys(incoming.progress || {})])]
        .map((date) => [date, { ...(incoming.progress || {})[date], ...(existing.progress || {})[date] }]),
    ),
    starTiers: [...(existing.starTiers || []), ...(incoming.starTiers || []).filter((e) => !(existing.starTiers || []).some((x) => x.since === e.since))],
    goalUnits: [...new Set([...(existing.goalUnits || []), ...(incoming.goalUnits || [])])].slice(0, GOAL_CUSTOM_MAX),
    settledThrough: [existing.settledThrough, incoming.settledThrough].filter(Boolean).sort().pop() || null,
  };
}

// ---------- Фактично затрачений час ----------

function setActual(task, date, minutes) {
  const day = { ...(taskStore.actual[date] || {}) };
  if (minutes) day[task.id] = minutes;
  else delete day[task.id];
  if (Object.keys(day).length) taskStore.actual[date] = day;
  else delete taskStore.actual[date];
}

const timeDialog = document.getElementById('time-dialog');
let timeDialogTask = null;
let timeDialogDate = null;
let timeDialogValue = ESTIMATE_DEFAULT;
let timeDialogPending = false;
let afterTimeDialogQueue = [];

const timeDialogPicker = createDurationPicker(document.getElementById('time-dialog-picker'), (minutes) => {
  timeDialogValue = minutes;
  renderTimeDialogValue();
});

// Святкування (нова зірка, усе виконано) показуємо після діалогу, щоб попапи не накладались
function afterTimeDialog(fn) {
  if (timeDialogPending || !timeDialog.hidden) afterTimeDialogQueue.push(fn);
  else fn();
}

function openTimeDialog(task, date) {
  // Мета в хвилинах уже й є фактичним часом — не перепитуємо
  if (task.goal?.unit === 'хв') {
    setActual(task, date, goalProgress(task, date));
    saveTasks();
    closeTimeDialog(false);
    return;
  }
  timeDialogTask = task;
  timeDialogDate = date;
  const planned = task.estimate || ESTIMATE_DEFAULT;
  timeDialogValue = planned;
  document.getElementById('time-dialog-task').textContent = task.title;
  document.getElementById('time-dialog-plan').textContent = `За планом: ${formatEstimate(planned)}`;
  renderTimeDialogValue();
  timeDialog.hidden = false;
  timeDialogPicker.set(planned);
}

function renderTimeDialogValue() {
  const planned = timeDialogTask?.estimate || ESTIMATE_DEFAULT;
  const diff = timeDialogValue - planned;
  const save = document.getElementById('time-dialog-save');
  save.textContent = diff === 0 ? `Так, ${formatEstimate(planned)}` : `Зберегти ${formatEstimate(timeDialogValue)}`;
  document.getElementById('time-dialog-diff').textContent = diff === 0
    ? 'Збігається з планом'
    : diff > 0 ? `На ${formatEstimate(diff)} довше за план` : `На ${formatEstimate(-diff)} швидше за план`;
  document.getElementById('time-dialog-diff').className = 'time-dialog-diff' + (diff > 0 ? ' over' : diff < 0 ? ' under' : '');
}

function closeTimeDialog(save) {
  if (save && timeDialogTask && isTaskDone(timeDialogTask, timeDialogDate)) {
    setActual(timeDialogTask, timeDialogDate, timeDialogValue);
    saveTasks();
    flashSaved();
  }
  timeDialog.hidden = true;
  timeDialogTask = null;
  timeDialogPending = false;
  const queue = afterTimeDialogQueue;
  afterTimeDialogQueue = [];
  queue.forEach((fn) => fn());
}

document.getElementById('time-dialog-save').addEventListener('click', () => closeTimeDialog(true));
document.getElementById('time-dialog-skip').addEventListener('click', () => closeTimeDialog(false));
timeDialog.addEventListener('click', (e) => {
  if (e.target === timeDialog) closeTimeDialog(false);
});
attachSheetDrag(timeDialog, () => closeTimeDialog(false));

// ---------- Статистика задач ----------

function renderTaskStats(dates) {
  let planned = 0;
  let done = 0;
  let pastPlanned = 0;
  let pastDone = 0;
  let doneMinutes = 0;
  let daysWithTasks = 0;
  let starsEarnedInRange = 0;
  let penaltiesCount = 0;
  const perDay = [];

  dates.forEach((date) => {
    const tasks = tasksForDate(date);
    const dayDone = tasks.filter((t) => isTaskDone(t, date));
    planned += tasks.length;
    done += dayDone.length;
    // Відсоток — лише за днями, що вже минули: сьогоднішні справи ще можна встигнути
    if (date < todayISO()) {
      pastPlanned += tasks.length;
      pastDone += dayDone.length;
    }
    doneMinutes += dayDone.reduce((sum, t) => sum + (t.estimate || 0), 0);
    if (tasks.length) daysWithTasks++;
    starsEarnedInRange += dayStarsOn(date);
    penaltiesCount += (taskStore.penalties[date] || []).length;
    // План і факт — лише для виконаних задач, де вказали фактичний час
    const withActual = dayDone.filter((t) => taskStore.actual[date]?.[t.id]);
    perDay.push({
      date,
      planned: tasks.length,
      done: dayDone.length,
      planMinutes: withActual.reduce((sum, t) => sum + (t.estimate || ESTIMATE_DEFAULT), 0),
      actualMinutes: withActual.reduce((sum, t) => sum + taskStore.actual[date][t.id], 0),
    });
  });

  const rate = pastPlanned ? Math.round((pastDone / pastPlanned) * 100) : null;
  const tiles = [
    { value: rate == null ? '—' : `${rate}%`, label: 'Виконано' },
    { value: `${done}<span class="stat-max">/${planned}</span>`, label: 'Задач виконано' },
    // Середнє — лише за днями, коли були задачі, щоб дні без планів не тягнули його вниз
    { value: daysWithTasks ? (done / daysWithTasks).toFixed(1).replace('.', ',') : '—', label: 'Виконано за день, у середньому' },
    { value: doneMinutes ? formatEstimate(doneMinutes) : '—', label: 'Час у виконаних задачах' },
    { value: `★ ${starsEarnedInRange}`, label: 'Зірок зароблено' },
    { value: penaltiesCount, label: 'Пріоритетних пропущено' },
  ];
  document.getElementById('task-stats-summary').innerHTML = tiles
    .map((t) => `<div class="stat-tile"><div class="stat-value">${t.value}</div><div class="stat-label">${t.label}</div></div>`)
    .join('');

  renderTaskRecords();
  renderCompletionChart(perDay);
  renderTimeChart(perDay);
}

const AVG_WEEKS = 4;

// Тиждень — дні тижня; довші періоди — число місяця через кілька днів
function chartLabel(perDay, i) {
  const date = fromISODate(perDay[i].date);
  if (perDay.length <= 7) return WEEK_SHORT[date.getDay()];
  const every = Math.ceil(perDay.length / 7);
  return (perDay.length - 1 - i) % every === 0 ? date.getDate() : '';
}

// Скільки в середньому виконували в цей самий день тижня за попередні тижні (лише дні, коли були справи)
function weekdayAverage(date) {
  const counts = [];
  for (let k = 1; k <= AVG_WEEKS; k++) {
    const d = shiftDate(date, -7 * k);
    if (tasksForDate(d).length) counts.push(doneCountOn(d));
  }
  return counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : null;
}

// Скільки задач виконано за день; колір — зірки дня: золото, срібло, бронза або нейтральний.
// На тижні поверх стовпчика — риска середнього за попередні тижні в той самий день тижня
function renderCompletionChart(perDay) {
  const chart = document.getElementById('task-stats-chart');
  chart.innerHTML = '';
  chart.classList.toggle('dense', perDay.length > 31);
  const week = perDay.length <= 7;
  const averages = perDay.map((day) => (week ? weekdayAverage(day.date) : null));
  document.getElementById('task-chart-avg-legend').hidden = !averages.some((a) => a != null);
  const max = Math.max(1, ...perDay.map((d) => d.done), ...averages.filter((a) => a != null));
  perDay.forEach((day, i) => {
    const col = document.createElement('div');
    col.className = 'completion-col';
    const avg = averages[i];
    col.title = `${capitalize(formatDate(day.date, 'short'))}: виконано ${day.done} з ${day.planned}`
      + (avg != null ? `, зазвичай ${avg.toFixed(1).replace('.', ',')}` : '');
    col.innerHTML = `
      <div class="completion-track">
        <div class="completion-bar ${STAR_MEDALS[chartDayStars(day)]}${day.done ? '' : ' empty'}" style="height:${day.done ? (day.done / max) * 100 : 3}%">
          ${day.done && perDay.length <= 14 ? `<span class="completion-value">${day.done}</span>` : ''}
        </div>
        ${avg != null ? `<span class="completion-avg" style="bottom:${(avg / max) * 100}%"></span>` : ''}
      </div>
      <span class="completion-label">${chartLabel(perDay, i)}</span>`;
    chart.appendChild(col);
  });
}

// ---------- Особисті рекорди ----------
// За всю історію: найкращий день за кількістю справ і найзірковіший тиждень (пн–нд).
// Поруч — де ви зараз відносно рекорду, щоб було видно, скільки лишилось його побити.

function historyStart() {
  const dates = [...taskStore.tasks.map((t) => t.start), ...Object.keys(taskStore.done)];
  return dates.length ? dates.sort()[0] : null;
}

function renderTaskRecords() {
  const box = document.getElementById('task-records');
  const start = historyStart();
  const today = todayISO();
  if (!start) {
    box.innerHTML = '<p class="card-hint">Виконуйте справи — тут з\'являться ваші рекорди.</p>';
    return;
  }
  let bestDay = null;
  const weeks = new Map();
  for (let date = start; date <= today; date = shiftDate(date, 1)) {
    const done = doneCountOn(date);
    if (done && (!bestDay || done > bestDay.done)) bestDay = { date, done };
    const week = weekStart(date);
    weeks.set(week, (weeks.get(week) || 0) + chartDayStars({ date, done }));
  }
  const thisWeek = weekStart(today);
  let bestWeek = null;
  weeks.forEach((stars, week) => {
    if (stars && (!bestWeek || stars > bestWeek.stars)) bestWeek = { week, stars };
  });

  const todayDone = doneCountOn(today);
  const weekStars = weeks.get(thisWeek) || 0;
  box.innerHTML = '';
  box.appendChild(recordRow({
    icon: '🏆',
    title: 'Найкращий день',
    value: bestDay ? `${bestDay.done} ${pluralTasks(bestDay.done)}` : '—',
    when: bestDay ? (bestDay.date === today ? 'сьогодні' : formatDayMonth(bestDay.date)) : '',
    current: todayDone,
    record: bestDay?.done || 0,
    isCurrent: bestDay?.date === today,
    left: (n) => `Сьогодні ${todayDone} — до рекорду ще ${n} ${pluralTasks(n)}`,
  }));
  box.appendChild(recordRow({
    icon: '⭐',
    title: 'Найбільше зірок за тиждень',
    value: bestWeek ? `${bestWeek.stars} ★` : '—',
    when: bestWeek ? (bestWeek.week === thisWeek ? 'цей тиждень' : `${formatDayMonth(bestWeek.week)} – ${formatDayMonth(shiftDate(bestWeek.week, 6))}`) : '',
    current: weekStars,
    record: bestWeek?.stars || 0,
    isCurrent: bestWeek?.week === thisWeek,
    left: (n) => `Цього тижня ${weekStars} ★ — до рекорду ще ${n} ★`,
  }));
}

function recordRow({ icon, title, value, when, current, record, isCurrent, left }) {
  const row = document.createElement('div');
  row.className = 'record-row' + (isCurrent ? ' new-record' : '');
  const share = record ? Math.min(1, current / record) : 0;
  const note = !record ? '' : isCurrent ? 'Новий рекорд! Так тримати 🎉' : left(record - current);
  row.innerHTML = `
    <span class="record-icon" aria-hidden="true">${icon}</span>
    <div class="record-body">
      <div class="record-head">
        <span class="record-title"></span>
        <b class="record-value"></b>
      </div>
      <div class="record-when"></div>
      ${record ? `<div class="record-bar"><i style="width:${share * 100}%"></i></div><div class="record-note"></div>` : ''}
    </div>`;
  row.querySelector('.record-title').textContent = title;
  row.querySelector('.record-value').textContent = value;
  row.querySelector('.record-when').textContent = when;
  if (record) row.querySelector('.record-note').textContent = note;
  return row;
}

const STAR_MEDALS = ['medal-none', 'medal-bronze', 'medal-silver', 'medal-gold'];

// День до нових правил зірок рахуємо за кількістю справ, як у ранковому звіті
function chartDayStars(day) {
  return day.date < STAR_RULES_SINCE ? starsForCount(day.done, day.date) : dayStarsOn(day.date);
}

// Очікуваний і фактичний час виконаних задач по днях — лініями, як «Стан по днях»
function renderTimeChart(perDay) {
  const canvas = document.getElementById('time-stats-chart');
  const summary = document.getElementById('time-stats-summary');
  const planTotal = perDay.reduce((sum, d) => sum + d.planMinutes, 0);
  const actualTotal = perDay.reduce((sum, d) => sum + d.actualMinutes, 0);
  canvas.hidden = !actualTotal;
  if (!actualTotal) {
    summary.textContent = 'Вказуйте фактичний час після виконання задач — тут з\'явиться порівняння з планом.';
    return;
  }
  // Спільна шкала для обох ліній: від нуля до найдовшого дня
  const max = Math.max(...perDay.map((d) => Math.max(d.planMinutes, d.actualMinutes)));
  const byDate = new Map(perDay.map((d) => [d.date, d]));
  const styles = getComputedStyle(document.documentElement);
  const share = (minutes) => (minutes ? minutes / max : null);
  drawLineChart(canvas, perDay.map((d) => d.date), [
    { color: styles.getPropertyValue('--accent').trim(), valueAt: (date) => share(byDate.get(date).planMinutes) },
    { color: styles.getPropertyValue('--accent-warm').trim(), valueAt: (date) => share(byDate.get(date).actualMinutes) },
  ], 200);
  const diff = Math.round(((actualTotal - planTotal) / planTotal) * 100);
  const verdict = diff === 0 ? 'точно за планом' : diff > 0 ? `на ${diff}% довше за план` : `на ${-diff}% швидше за план`;
  summary.textContent = `Фактично ${formatEstimate(actualTotal)} проти ${formatEstimate(planTotal)} за планом — ${verdict}.`;
}

// ---------- Ранковий звіт за вчора ----------
// Показуємо раз на день при першому відкритті з 6 ранку, якщо вчора були заплановані справи:
// зірки дня, скільки виконано, час у справах, план на сьогодні й перенесення незавершеного.

const STORAGE_REPORT = 'daily-report-date';
const REPORT_FROM_HOUR = 6;
const dayReport = document.getElementById('day-report');
let dayReportAfter = null;

const REPORT_COPY = [
  { title: 'Кожен крок важливий 💪', texts: ['Новий день — нові можливості. Почніть з однієї справи!', 'Сьогодні чудовий день, щоб набрати темп.'] },
  { title: 'Гарний день! ⭐', texts: ['Вчора ви добре попрацювали — сьогодні буде ще краще!', 'Гарний ритм! Тримайте його й сьогодні.'] },
  { title: 'Чудовий день! 🌟', texts: ['Нехай цей день буде ще яскравішим!', 'Вчора ви були в ударі — продовжуйте в тому ж дусі!'] },
  { title: 'Неймовірний день! 💫', texts: ['Вчора ви були неймовірні — нехай сьогодні буде так само яскраво!', 'Легендарний результат! Цей запал — ваша суперсила.'] },
];

function pluralUnfinished(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'незавершену';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'незавершені';
  return 'незавершених';
}

// Показує звіт, якщо сьогодні його ще не було; after виконається, коли звіт закриють (або одразу)
function showDayReport(after) {
  const today = todayISO();
  const yesterday = shiftDate(today, -1);
  let shown = null;
  try {
    shown = localStorage.getItem(STORAGE_REPORT);
  } catch {}
  const tasks = tasksForDate(yesterday);
  // Уночі (до REPORT_FROM_HOUR) звіт не показуємо і не позначаємо — він дочекається ранку
  const night = new Date().getHours() < REPORT_FROM_HOUR;
  if (night || shown === today || !tasks.length) {
    if (after) after();
    return;
  }
  try {
    localStorage.setItem(STORAGE_REPORT, today);
  } catch {}
  dayReportAfter = after;

  const done = tasks.filter((t) => isTaskDone(t, yesterday));
  // День до нових правил зірок у балансі не рахувався — у звіті все одно показуємо, скільки зірок він вартий
  const stars = yesterday < STAR_RULES_SINCE ? starsForCount(done.length, yesterday) : dayStarsOn(yesterday);
  // Фактичний час, а де його не вказали — естімейт
  const minutes = done.reduce((sum, t) => sum + (taskStore.actual[yesterday]?.[t.id] || t.estimate || 0), 0);
  const copy = REPORT_COPY[stars];

  document.getElementById('day-report-date').textContent = `Вчора, ${formatDayMonth(yesterday)}`;
  document.getElementById('day-report-stars').innerHTML = [...Array(STAR_COUNT).keys()].map((i) => `
    <svg class="popup-day-star${i < stars ? ' on' : ''}" viewBox="0 0 24 24" style="--i:${i}">
      <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z"/>
    </svg>`).join('');
  document.getElementById('day-report-title').textContent = copy.title;
  document.getElementById('day-report-done').innerHTML = `${done.length}<span class="stat-max">/${tasks.length}</span>`;
  document.getElementById('day-report-time').textContent = minutes ? formatEstimate(minutes) : '—';

  const todayTasks = tasksForDate(today);
  document.getElementById('day-report-today').textContent = todayTasks.length
    ? `Сьогодні ${todayTasks.length} ${pluralTasks(todayTasks.length)} · ~${formatEstimate(plannedMinutes(today))}`
    : 'На сьогодні ще нічого не заплановано';
  document.getElementById('day-report-phrase').textContent = copy.texts[Math.floor(Math.random() * copy.texts.length)];

  const movable = tasks.filter((t) => !isTaskDone(t, yesterday) && canMoveToNextDay(t, yesterday));
  const moveBtn = document.getElementById('day-report-move');
  moveBtn.hidden = !movable.length;
  moveBtn.textContent = `→ Перенести ${movable.length} ${pluralUnfinished(movable.length)} на сьогодні`;
  moveBtn.onclick = () => {
    closeDayReport();
    withTaskUndo(`Перенесено на сьогодні: ${movable.length}`, () => {
      movable.forEach((t) => taskStore.tasks.push(movedCopy(t, yesterday)));
    });
    if (plannedMinutes(today) > DAY_PLAN_LIMIT) showOverloadPopup(taskStore.tasks[taskStore.tasks.length - 1]);
  };

  dayReport.hidden = false;
}

function closeDayReport() {
  if (dayReport.hidden) return;
  dayReport.hidden = true;
  const after = dayReportAfter;
  dayReportAfter = null;
  if (after) after();
}

document.getElementById('day-report-start').addEventListener('click', () => {
  closeDayReport();
  if (currentDate !== todayISO()) setDate(todayISO());
  switchTab('tasks');
});
dayReport.addEventListener('click', (e) => {
  if (e.target === dayReport) closeDayReport();
});
attachSheetDrag(dayReport, closeDayReport);

// ---------- Налаштування: пороги зірок ----------
// Змінені пороги починають діяти з завтра: сьогоднішні зірки й шкала посеред дня не змінюються.

const STAR_TIER_MAX = 99;

function setTomorrowTiers(tiers) {
  const tomorrow = shiftDate(todayISO(), 1);
  taskStore.starTiers = taskStore.starTiers.filter((e) => e.since < tomorrow);
  const today = tiersOn(todayISO());
  if (tiers.some((t, i) => t !== today[i])) taskStore.starTiers.push({ since: tomorrow, tiers: [...tiers] });
  saveTasks();
}

function renderStarTierSettings() {
  const tiers = [...tiersOn(shiftDate(todayISO(), 1))];
  const box = document.getElementById('star-tiers');
  box.innerHTML = '';
  tiers.forEach((value, i) => {
    const min = i === 0 ? 1 : tiers[i - 1] + 1;
    const max = i === tiers.length - 1 ? STAR_TIER_MAX : tiers[i + 1] - 1;
    const row = document.createElement('div');
    row.className = 'sheet-row star-tier-row';
    row.innerHTML = `
      <span class="star-tier-stars" aria-hidden="true">${'★'.repeat(i + 1)}</span>
      <span class="sheet-row-title">${i + 1}-а зірка</span>
      <span class="star-tier-stepper">
        <button type="button" aria-label="Менше справ">−</button>
        <b>${value}</b>
        <button type="button" aria-label="Більше справ">+</button>
      </span>`;
    const [minus, plus] = row.querySelectorAll('button');
    minus.disabled = value <= min;
    plus.disabled = value >= max;
    const change = (delta) => {
      tiers[i] = value + delta;
      setTomorrowTiers(tiers);
      renderStarTierSettings();
    };
    minus.addEventListener('click', () => change(-1));
    plus.addEventListener('click', () => change(1));
    row.querySelector('.star-tier-stepper').setAttribute('aria-label', `${i + 1}-а зірка: ${value} ${pluralTasks(value)}`);
    box.appendChild(row);
  });

  const today = tiersOn(todayISO());
  const changed = tiers.some((t, i) => t !== today[i]);
  document.getElementById('star-tiers-note').textContent = changed
    ? `Нові пороги діятимуть з завтра, ${formatDayMonth(shiftDate(todayISO(), 1))}. Сьогодні ще діють ${today.join(' · ')}.`
    : 'Зміни почнуть діяти з наступного дня — сьогоднішні зірки не зміняться.';
  document.getElementById('star-tiers-reset').disabled = DEFAULT_STAR_TIERS.every((t, i) => t === tiers[i]);
}

document.getElementById('star-tiers-reset').addEventListener('click', () => {
  setTomorrowTiers(DEFAULT_STAR_TIERS);
  renderStarTierSettings();
});
