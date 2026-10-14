// Задачі на день: разові або з повтором (щодня, по буднях, у вибрані дні тижня, кожні N днів).
// Сховище: { tasks: [{ id, title, start, repeat, until, createdAt }], done: { date: [id] }, skipped: { date: [id] } }

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

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_TASKS);
    const data = raw ? JSON.parse(raw) : {};
    return { tasks: data.tasks || [], done: data.done || {}, skipped: data.skipped || {} };
  } catch {
    return { tasks: [], done: {}, skipped: {} };
  }
}

let taskStore = loadTasks();

function saveTasks() {
  localStorage.setItem(STORAGE_TASKS, JSON.stringify(taskStore));
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

const taskInput = document.getElementById('task-input');
const taskRepeatToggle = document.getElementById('task-repeat-toggle');
const taskRepeatPanel = document.getElementById('task-repeat-panel');
let newTaskRepeat = { type: 'none' };

function renderNewTaskRepeat() {
  taskRepeatToggle.classList.toggle('active', newTaskRepeat.type !== 'none');
  renderRepeatEditor(taskRepeatPanel, newTaskRepeat, currentDate, (repeat) => {
    newTaskRepeat = repeat;
    renderNewTaskRepeat();
  });
}

taskRepeatToggle.addEventListener('click', () => {
  taskRepeatPanel.hidden = !taskRepeatPanel.hidden;
  if (!taskRepeatPanel.hidden) renderNewTaskRepeat();
});

function addTask() {
  const title = taskInput.value.trim();
  if (!title) {
    taskInput.focus();
    return;
  }
  taskStore.tasks.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title,
    start: currentDate,
    repeat: newTaskRepeat,
    until: null,
    createdAt: new Date().toISOString(),
  });
  saveTasks();
  flashSaved();
  taskInput.value = '';
  newTaskRepeat = { type: 'none' };
  taskRepeatPanel.hidden = true;
  taskRepeatToggle.classList.remove('active');
  renderTasks();
}

document.getElementById('task-add-btn').addEventListener('click', addTask);
taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addTask();
  }
});

document.getElementById('tasks-prev').addEventListener('click', () => setDate(shiftDate(currentDate, -1)));
document.getElementById('tasks-next').addEventListener('click', () => setDate(shiftDate(currentDate, 1)));
document.getElementById('tasks-date').addEventListener('change', (e) => {
  if (e.target.value) setDate(e.target.value);
});
document.getElementById('tasks-today').addEventListener('click', () => setDate(todayISO()));

const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function renderTasks() {
  const isToday = currentDate === todayISO();
  document.getElementById('tasks-date').value = currentDate;
  document.getElementById('tasks-today').hidden = isToday;
  document.getElementById('tasks-date-label').textContent = isToday
    ? `Сьогодні, ${formatLongDate(currentDate)}`
    : capitalize(formatLongDate(currentDate));

  const tasks = tasksForDate(currentDate);
  const doneCount = tasks.filter((t) => isTaskDone(t, currentDate)).length;
  const progress = document.getElementById('tasks-progress');
  progress.hidden = !tasks.length;
  progress.querySelector('.tasks-progress-text').textContent = doneCount === tasks.length && tasks.length
    ? `Усе виконано! ${doneCount} з ${tasks.length} 🎉`
    : `Виконано ${doneCount} з ${tasks.length}`;
  progress.querySelector('.tasks-progress-fill').style.width = tasks.length ? `${(doneCount / tasks.length) * 100}%` : '0';
  progress.classList.toggle('complete', tasks.length > 0 && doneCount === tasks.length);

  const list = document.getElementById('task-list');
  list.innerHTML = '';
  if (!tasks.length) {
    list.innerHTML = '<div class="tasks-empty">На цей день задач немає.<br>Додайте першу вище ☝️</div>';
    return;
  }

  tasks.forEach((task) => {
    const done = isTaskDone(task, currentDate);
    const row = document.createElement('div');
    row.className = 'task' + (done ? ' done' : '');
    row.innerHTML = `
      <button type="button" class="task-check" role="checkbox" aria-checked="${done}">${CHECK_SVG}</button>
      <button type="button" class="task-body">
        <span class="task-title"><span></span></span>
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

function toggleTask(task, row, checkEl) {
  const date = currentDate;
  const done = new Set(taskStore.done[date] || []);
  const nowDone = !done.has(task.id);
  if (nowDone) done.add(task.id);
  else done.delete(task.id);
  taskStore.done[date] = [...done];
  if (!taskStore.done[date].length) delete taskStore.done[date];
  saveTasks();

  row.classList.toggle('done', nowDone);
  checkEl.setAttribute('aria-checked', nowDone);

  if (!nowDone) {
    renderTasks();
    return;
  }

  row.classList.add('just-done');
  burstFrom(checkEl);
  if (navigator.vibrate) navigator.vibrate(12);

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
function burstFrom(el) {
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
    p.style.background = FX_COLORS[i % FX_COLORS.length];
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

// ---------- Редагування задачі ----------

const taskSheet = document.getElementById('task-sheet');
let sheetTask = null;
let sheetRepeat = null;

function openTaskSheet(task) {
  sheetTask = task;
  sheetRepeat = { ...task.repeat, days: task.repeat.days ? [...task.repeat.days] : undefined };
  document.getElementById('task-sheet-title').value = task.title;
  renderSheetRepeat();
  renderSheetDelete(false);
  taskSheet.hidden = false;
}

function closeTaskSheet() {
  taskSheet.hidden = true;
  sheetTask = null;
}

function renderSheetRepeat() {
  renderRepeatEditor(document.getElementById('task-sheet-repeat'), sheetRepeat, sheetTask.start, (repeat) => {
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
    btn.className = 'danger-btn';
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
    btn.className = 'danger-btn';
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
  cancel.className = 'secondary-btn';
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

document.getElementById('task-sheet-save').addEventListener('click', () => {
  const title = document.getElementById('task-sheet-title').value.trim();
  if (!title) {
    document.getElementById('task-sheet-title').focus();
    return;
  }
  sheetTask.title = title;
  sheetTask.repeat = sheetRepeat;
  saveTasks();
  flashSaved();
  closeTaskSheet();
  renderTasks();
});

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
  return { tasks, done: mergeMap(existing.done, incoming.done), skipped: mergeMap(existing.skipped, incoming.skipped) };
}
