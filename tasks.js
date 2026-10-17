// Задачі на день: разові або з повтором (щодня, по буднях, у вибрані дні тижня, кожні N днів).
// Задача буває звичайною або зірковою (star: true): кожні STAR_GOAL виконаних зіркових задач
// дають одну зірку. Прогрес зірки спільний для всіх днів і не скидається з кінцем дня.
// Сховище: { tasks: [{ id, title, star, start, repeat, until, createdAt }], done: { date: [id] },
//            skipped: { date: [id] }, starDone: { date: [id] }, penalties: { date: [id] }, settledThrough }
// starDone — зараховані виконання зіркових задач; лишаються, навіть якщо задачу потім видалити.
// Задача з прапорцем (flag: true) — високий пріоритет: якщо її не виконано до кінця дня,
// від балансу знімається 1/5 зірки. Минулі дні «закриваються» при наступному запуску (penalties),
// settledThrough — останній уже підбитий день.

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
const ESTIMATE_STEP = 15;
const ESTIMATE_MAX = 12 * 60;
const ESTIMATE_PRESETS = [15, 30, 45, 60, 90, 120, 180, 240];
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
    return {
      tasks: data.tasks || [],
      done: data.done || {},
      skipped: data.skipped || {},
      starDone: data.starDone || {},
      penalties: data.penalties || {},
      settledThrough: data.settledThrough || null,
    };
  } catch {
    return { tasks: [], done: {}, skipped: {}, starDone: {}, penalties: {}, settledThrough: null };
  }
}

let taskStore = loadTasks();

function saveTasks() {
  localStorage.setItem(STORAGE_TASKS, JSON.stringify(taskStore));
}

// Бали (1/5 зірки): зараховані зіркові задачі мінус штрафи за невиконані задачі з прапорцем
function starPoints() {
  const count = (map) => Object.values(map).reduce((sum, ids) => sum + ids.length, 0);
  return count(taskStore.starDone) - count(taskStore.penalties);
}

// Бали на балансі з урахуванням витраченого в магазині; може бути від'ємним — це «борг»
function balancePoints() {
  return starPoints() - starsSpent() * STAR_GOAL;
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
    ? `Пріоритетну задачу «${missed[0].task.title}» не виконано: −1/${STAR_GOAL} ★`
    : `Не виконано пріоритетних задач: ${missed.length}. −${missed.length}/${STAR_GOAL} ★`;
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
const STORAGE_DONE_COLLAPSED = 'daily-tasks-done-collapsed';

function isDoneCollapsed() {
  try {
    return localStorage.getItem(STORAGE_DONE_COLLAPSED) !== 'false';
  } catch {
    return true;
  }
}

function setDoneCollapsed(value) {
  try {
    localStorage.setItem(STORAGE_DONE_COLLAPSED, String(value));
  } catch {}
}

function renderTasks() {
  tasksWeek.render();

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

  // Виконані — в окремому розділі, який можна згорнути, як у «Нагадуваннях»
  const openTasks = tasks.filter((t) => !isTaskDone(t, currentDate));
  const doneTasks = tasks.filter((t) => isTaskDone(t, currentDate));
  openTasks.forEach((task) => list.appendChild(renderTaskRow(task)));
  if (doneTasks.length) {
    const collapsed = isDoneCollapsed();
    const header = document.createElement('button');
    header.type = 'button';
    header.id = 'done-header';
    header.className = 'done-header' + (collapsed ? ' collapsed' : '');
    header.setAttribute('aria-expanded', !collapsed);
    header.innerHTML = `
      <span>Виконано</span>
      <span class="done-count">${doneTasks.length}</span>
      <svg class="done-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>`;
    header.addEventListener('click', () => {
      setDoneCollapsed(!collapsed);
      renderTasks();
    });
    list.appendChild(header);
    if (!collapsed) doneTasks.forEach((task) => list.appendChild(renderTaskRow(task)));
  }
}

function renderTaskRow(task) {
  const done = isTaskDone(task, currentDate);
  const row = document.createElement('div');
  // День минув, а задачу не виконано — червоний хрестик замість порожнього кружечка
  const missed = !done && currentDate < todayISO();
  row.className = 'task' + (done ? ' done' : '') + (missed ? ' missed' : '') + (task.star ? ' star' : '');
  row.innerHTML = `
    <button type="button" class="task-check" role="checkbox" aria-checked="${done}"><span class="check-circle">${missed ? CROSS_SVG : CHECK_SVG}</span></button>
    <button type="button" class="task-body">
      <span class="task-title">${task.flag ? FLAG_SVG : ''}${task.star ? '<i class="task-star" aria-label="Зіркова задача">★</i>' : ''}<span></span></span>
      <span class="task-meta"></span>
    </button>`;
  row.querySelector('.task-title span').textContent = task.title;
  const meta = repeatLabel(task.repeat);
  const metaEl = row.querySelector('.task-meta');
  if (task.estimate) {
    const part = document.createElement('span');
    part.className = 'meta-part';
    part.innerHTML = CLOCK_SVG;
    part.append(formatEstimate(task.estimate));
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
  if (isPenalized(task, currentDate)) {
    row.classList.add('penalized');
    const badge = document.createElement('span');
    badge.className = 'penalty-badge';
    badge.textContent = `Не виконано · −1/${STAR_GOAL} ★`;
    row.querySelector('.task-meta').appendChild(badge);
  }
  row.querySelector('.task-check').setAttribute('aria-label', done
    ? `Позначити «${task.title}» невиконаною`
    : missed ? `«${task.title}» не виконано. Позначити виконаною` : `Позначити «${task.title}» виконаною`);
  row.querySelector('.task-check').addEventListener('click', (e) => toggleTask(task, row, e.currentTarget));
  row.querySelector('.task-body').addEventListener('click', () => openTaskSheet(task));
  if (missed && canMoveToNextDay(task, currentDate)) row.appendChild(renderMoveButton(task));
  return attachTaskSwipe(row, task, done);
}

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
  const done = new Set(taskStore.done[date] || []);
  const nowDone = !done.has(task.id);
  if (nowDone) done.add(task.id);
  else done.delete(task.id);
  taskStore.done[date] = [...done];
  if (!taskStore.done[date].length) delete taskStore.done[date];

  // Зіркові бали: зараховуємо при відмітці, повертаємо при знятті відмітки
  const pointsBefore = starPoints();
  const starDone = new Set(taskStore.starDone[date] || []);
  const wasStarCounted = starDone.has(task.id);
  if (nowDone && task.star) starDone.add(task.id);
  if (!nowDone) starDone.delete(task.id);
  taskStore.starDone[date] = [...starDone];
  if (!taskStore.starDone[date].length) delete taskStore.starDone[date];
  syncPenalty(task, date);
  const pointsAfter = starPoints();
  saveTasks();
  if (!nowDone) {
    // Зняту відмітку легко повернути — без анімацій і повторного нарахування зірок
    const restored = JSON.stringify(taskStore);
    showUndo('Відмітку знято', () => {
      const store = JSON.parse(restored);
      store.done[date] = [...new Set([...(store.done[date] || []), task.id])];
      if (wasStarCounted) store.starDone[date] = [...new Set([...(store.starDone[date] || []), task.id])];
      taskStore = store;
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
    if (currentDate === date) {
      renderTasks();
      const header = document.getElementById('done-header');
      if (header) pulse(header, 'bump');
    }
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
  const points = balancePoints();
  const debt = points < 0;
  const inProgress = options.full ? STAR_GOAL : debt ? 0 : points % STAR_GOAL;
  // Лічильник — баланс: зароблені зірки мінус витрачені в магазині
  const total = Math.max(0, starBalance() - (options.full ? 1 : 0));
  starWidget.querySelector('.star-fill').style.height = `${STAR_FILL_HEIGHTS[inProgress]}%`;
  starWidget.classList.toggle('is-full', inProgress === STAR_GOAL);
  starWidget.classList.toggle('in-debt', debt);
  // Борг показуємо як від'ємний прогрес: наступні зіркові задачі спершу його закривають
  document.getElementById('star-progress-text').textContent = debt ? `−${-points}/${STAR_GOAL}` : `${inProgress}/${STAR_GOAL}`;
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
  // Повна зірка — лише якщо баланс додатний (закриття «боргу» не святкуємо)
  const completesStar = balancePoints() > 0 && points % STAR_GOAL === 0;
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
  const points = balancePoints();
  if (points < 0) {
    showToast(`★ Борг ${-points}/${STAR_GOAL}: наступні зіркові задачі спершу закриють його`, 2600);
    return;
  }
  const left = STAR_GOAL - (points % STAR_GOAL);
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
let sheetDate = null;
const sheetFlag = document.getElementById('task-sheet-flag');
const sheetEstimateRow = document.getElementById('task-sheet-estimate-row');
const sheetEstimatePicker = document.getElementById('task-sheet-estimate');
let sheetEstimate = ESTIMATE_DEFAULT;
const sheetDateInput = document.getElementById('task-sheet-date');
const sheetRepeatRow = document.getElementById('task-sheet-repeat-row');
const sheetRepeatList = document.getElementById('task-sheet-repeat');

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
  sheetDate = task ? task.start : currentDate;
  sheetFlag.checked = Boolean(task?.flag);
  sheetEstimate = task?.estimate || ESTIMATE_DEFAULT;
  setEstimateOpen(false);
  renderSheetEstimate();
  renderSheetType();
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
  sheetEstimateRow.classList.toggle('open', open);
  sheetEstimateRow.setAttribute('aria-expanded', open);
}

sheetEstimateRow.addEventListener('click', () => setEstimateOpen(sheetEstimatePicker.hidden));

function renderSheetEstimate() {
  document.getElementById('task-sheet-estimate-label').textContent = formatEstimate(sheetEstimate);
  document.getElementById('estimate-value').textContent = formatEstimate(sheetEstimate);
  const presets = sheetEstimatePicker.querySelector('.estimate-presets');
  presets.innerHTML = '';
  ESTIMATE_PRESETS.forEach((minutes) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (minutes === sheetEstimate ? ' active' : '');
    chip.textContent = presetLabel(minutes);
    chip.addEventListener('click', () => {
      sheetEstimate = minutes;
      renderSheetEstimate();
    });
    presets.appendChild(chip);
  });
}

// Коротші підписи для кнопок швидкого вибору: «1,5 год» замість «1 год 30 хв»
function presetLabel(minutes) {
  return minutes > 60 && minutes % 60 === 30 ? `${Math.floor(minutes / 60)},5\u00a0год` : formatEstimate(minutes);
}

function changeEstimate(delta) {
  sheetEstimate = Math.min(ESTIMATE_MAX, Math.max(ESTIMATE_STEP, sheetEstimate + delta));
  renderSheetEstimate();
}

document.getElementById('estimate-minus').addEventListener('click', () => changeEstimate(-ESTIMATE_STEP));
document.getElementById('estimate-plus').addEventListener('click', () => changeEstimate(ESTIMATE_STEP));

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

// Не переносимо щоденні задачі (вони й так будуть завтра) і не створюємо дублікатів:
// якщо в наступному дні вже є ця ж повторювана задача або задача з такою самою назвою
function canMoveToNextDay(task, date) {
  if (task.repeat.type === 'daily') return false;
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

// Разова задача просто переїжджає; у повторюваної пропускаємо цей день
// і створюємо разову копію на наступний, щоб не ламати сам повтор
function moveTaskToNextDay(task, date) {
  const target = shiftDate(date, 1);
  let moved = task;
  withTaskUndo(`Перенесено ${moveTargetLabel(target)}`, () => {
    if (task.repeat.type === 'none') {
      task.start = target;
      task.movedFrom = date;
    } else {
      deleteTaskOccurrence(task, date);
      moved = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: task.title,
        star: task.star,
        flag: task.flag,
        estimate: task.estimate,
        start: target,
        repeat: { type: 'none' },
        until: null,
        movedFrom: date,
        createdAt: new Date().toISOString(),
      };
      taskStore.tasks.push(moved);
    }
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
    sheetTask.star = sheetStar;
    sheetTask.flag = sheetFlag.checked;
    sheetTask.estimate = sheetEstimate;
    sheetTask.repeat = sheetRepeat;
    sheetTask.start = sheetDate;
  } else {
    newTask = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title,
      star: sheetStar,
      flag: sheetFlag.checked,
      estimate: sheetEstimate,
      start: sheetDate,
      repeat: sheetRepeat,
      until: null,
      createdAt: new Date().toISOString(),
    };
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
    settledThrough: [existing.settledThrough, incoming.settledThrough].filter(Boolean).sort().pop() || null,
  };
}
