// Daily — щоденник стану, думок та вдячності

const APP_VERSION = 'v1.1';
const STORAGE_ENTRIES = 'daily-entries';

const MOOD_LEVELS = [
  { value: 1, emoji: '😞', text: 'Погано' },
  { value: 2, emoji: '😕', text: 'Так собі' },
  { value: 3, emoji: '😐', text: 'Нормально' },
  { value: 4, emoji: '🙂', text: 'Добре' },
  { value: 5, emoji: '😄', text: 'Чудово' },
];

const ENERGY_LEVELS = [
  { value: 1, emoji: '🪫', text: 'Нуль' },
  { value: 2, emoji: '🥱', text: 'Мало' },
  { value: 3, emoji: '🔋', text: 'Норм' },
  { value: 4, emoji: '💪', text: 'Багато' },
  { value: 5, emoji: '⚡', text: 'Максимум' },
];

const MIN_GRATITUDE_ROWS = 1;

// ---------- Сховище ----------

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_ENTRIES);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

let entries = loadEntries();

function saveEntries() {
  localStorage.setItem(STORAGE_ENTRIES, JSON.stringify(entries));
}

function isEntryEmpty(entry) {
  return !entry.mood
    && !entry.energy
    && !(entry.thoughts || []).length
    && !(entry.gratitude || []).some((g) => g.trim());
}

function getEntry(date) {
  return entries[date] || { mood: null, energy: null, rated: false, gratitude: [], thoughts: [] };
}

function updateEntry(date, changes) {
  const entry = { ...getEntry(date), ...changes, updatedAt: new Date().toISOString() };
  if (isEntryEmpty(entry)) {
    delete entries[date];
  } else {
    entries[date] = entry;
  }
  saveEntries();
  flashSaved();
}

// ---------- Дати ----------

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromISODate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function shiftDate(s, days) {
  const d = fromISODate(s);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function todayISO() {
  return toISODate(new Date());
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(s, weekday) {
  const date = fromISODate(s);
  const options = { weekday, day: 'numeric', month: 'long' };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  return date.toLocaleDateString('uk-UA', options);
}

function formatLongDate(s) {
  return formatDate(s, 'long');
}

function formatShortDate(s) {
  return capitalize(formatDate(s, 'short'));
}

function nowTime() {
  return new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

// ---------- Вкладки та модальні вікна ----------

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tab}`));
  if (tab === 'history') renderHistory();
  if (tab === 'stats') renderStats();
  window.scrollTo(0, 0);
}

document.querySelectorAll('[data-close-modal]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById(btn.dataset.closeModal).hidden = true;
  });
});

// ---------- Сьогодні ----------

let currentDate = todayISO();

const dateInput = document.getElementById('entry-date');
const dateLabel = document.getElementById('date-label');

dateInput.addEventListener('change', () => {
  if (dateInput.value) setDate(dateInput.value);
});
document.getElementById('prev-day').addEventListener('click', () => setDate(shiftDate(currentDate, -1)));
document.getElementById('next-day').addEventListener('click', () => setDate(shiftDate(currentDate, 1)));
document.getElementById('go-today').addEventListener('click', () => setDate(todayISO()));

function setDate(date) {
  currentDate = date;
  renderToday();
}

function renderToday() {
  const entry = getEntry(currentDate);
  dateInput.value = currentDate;
  const isToday = currentDate === todayISO();
  dateLabel.textContent = isToday ? `Сьогодні, ${formatLongDate(currentDate)}` : capitalize(formatLongDate(currentDate));
  document.getElementById('go-today').hidden = isToday;

  renderScale('mood-scale', MOOD_LEVELS, 'mood');
  renderScale('energy-scale', ENERGY_LEVELS, 'energy');
  renderGratitude(entry.gratitude || []);
  showRateStep(entry.rated ? 'summary' : 'mood');
  renderThoughts(entry.thoughts || []);
  document.getElementById('save-status').textContent = '';
}

// ---------- Оцінити день ----------

const RATE_STEPS = ['mood', 'energy', 'gratitude'];

function showRateStep(step) {
  RATE_STEPS.forEach((s) => {
    document.getElementById(`rate-step-${s}`).hidden = s !== step;
  });
  document.getElementById('rate-summary').hidden = step !== 'summary';

  const progress = document.getElementById('rate-progress');
  if (step === 'summary') {
    renderRateSummary();
    progress.textContent = '✓ Оцінено';
    progress.classList.add('done');
  } else {
    progress.textContent = `Крок ${RATE_STEPS.indexOf(step) + 1} з ${RATE_STEPS.length}`;
    progress.classList.remove('done');
  }
  updateStepButtons();
}

function updateStepButtons() {
  const entry = getEntry(currentDate);
  document.querySelector('#rate-step-mood [data-next-step="energy"]').disabled = !entry.mood;
  document.querySelector('#rate-step-energy [data-next-step="gratitude"]').disabled = !entry.energy;
  document.getElementById('rate-done-btn').disabled = !(entry.gratitude || []).some((g) => g.trim());
}

document.querySelectorAll('[data-next-step]').forEach((btn) => {
  btn.addEventListener('click', () => {
    showRateStep(btn.dataset.nextStep);
    if (btn.dataset.nextStep === 'gratitude') {
      const empty = [...gratitudeList.querySelectorAll('input')].find((i) => !i.value.trim());
      if (empty) empty.focus();
    }
  });
});

document.getElementById('rate-done-btn').addEventListener('click', () => {
  updateEntry(currentDate, { rated: true });
  renderGratitude(getEntry(currentDate).gratitude || []);
  showRateStep('summary');
});

document.getElementById('rate-edit-btn').addEventListener('click', () => showRateStep('mood'));

function renderRateSummary() {
  const entry = getEntry(currentDate);
  const mood = MOOD_LEVELS.find((l) => l.value === entry.mood);
  const energy = ENERGY_LEVELS.find((l) => l.value === entry.energy);
  document.getElementById('summary-mood-emoji').textContent = mood ? mood.emoji : '—';
  document.getElementById('summary-mood-text').textContent = mood ? mood.text : '';
  document.getElementById('summary-energy-emoji').textContent = energy ? energy.emoji : '—';
  document.getElementById('summary-energy-text').textContent = energy ? energy.text : '';

  const list = document.getElementById('summary-gratitude');
  list.innerHTML = '';
  (entry.gratitude || []).filter((g) => g.trim()).forEach((g) => {
    const li = document.createElement('li');
    li.textContent = g;
    list.appendChild(li);
  });
}

function renderScale(containerId, levels, field) {
  const container = document.getElementById(containerId);
  const selected = getEntry(currentDate)[field];
  container.innerHTML = '';
  levels.forEach((level) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scale-btn' + (level.value === selected ? ' active' : '');
    btn.innerHTML = `<span class="scale-emoji">${level.emoji}</span><span class="scale-text">${level.text}</span>`;
    btn.addEventListener('click', () => {
      updateEntry(currentDate, { [field]: level.value });
      renderScale(containerId, levels, field);
      updateStepButtons();
    });
    container.appendChild(btn);
  });
}

// ---------- Вдячність ----------

const gratitudeList = document.getElementById('gratitude-list');

function renderGratitude(items) {
  gratitudeList.innerHTML = '';
  const filled = items.filter((g) => g.trim());
  const rows = Math.max(MIN_GRATITUDE_ROWS, filled.length);
  for (let i = 0; i < rows; i++) {
    addGratitudeRow(filled[i] || '', i);
  }
}

function addGratitudeRow(value, index) {
  const row = document.createElement('div');
  row.className = 'gratitude-row';

  const num = document.createElement('span');
  num.className = 'gratitude-num';
  num.textContent = index + 1;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = 'Я вдячний за...';
  input.addEventListener('input', saveGratitude);

  row.append(num, input);

  if (index >= MIN_GRATITUDE_ROWS) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'gratitude-remove';
    remove.title = 'Прибрати';
    remove.textContent = '✕';
    remove.addEventListener('click', () => {
      row.remove();
      saveGratitude();
      renderGratitude(getEntry(currentDate).gratitude || []);
    });
    row.appendChild(remove);
  }

  gratitudeList.appendChild(row);
  return input;
}

function saveGratitude() {
  const values = [...gratitudeList.querySelectorAll('input')].map((i) => i.value);
  // Порожні рядки в кінці не зберігаємо, але проміжні лишаємо, щоб нумерація не стрибала
  while (values.length && !values[values.length - 1].trim()) values.pop();
  updateEntry(currentDate, { gratitude: values });
  updateStepButtons();
}

document.getElementById('add-gratitude-btn').addEventListener('click', () => {
  const count = gratitudeList.querySelectorAll('.gratitude-row').length;
  addGratitudeRow('', count).focus();
});

// ---------- Думки ----------

const thoughtsList = document.getElementById('thoughts-list');
const thoughtInput = document.getElementById('thought-input');

function renderThoughts(thoughts) {
  thoughtsList.innerHTML = '';
  thoughts.forEach((thought) => {
    const item = document.createElement('div');
    item.className = 'thought';

    const head = document.createElement('div');
    head.className = 'thought-head';
    head.innerHTML = `<span>${thought.time || ''}</span>`;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'thought-remove';
    remove.title = 'Видалити думку';
    remove.textContent = '✕';
    remove.addEventListener('click', () => {
      if (!confirm('Видалити цю думку?')) return;
      const rest = getEntry(currentDate).thoughts.filter((t) => t.id !== thought.id);
      updateEntry(currentDate, { thoughts: rest });
      renderThoughts(rest);
    });
    head.appendChild(remove);

    const text = document.createElement('div');
    text.className = 'thought-text';
    text.textContent = thought.text;
    text.title = 'Натисніть, щоб редагувати';
    text.addEventListener('click', () => startEditThought(item, text, thought));

    item.append(head, text);
    thoughtsList.appendChild(item);
  });
}

function startEditThought(item, textEl, thought) {
  const area = document.createElement('textarea');
  area.className = 'thought-edit';
  area.rows = Math.max(2, thought.text.split('\n').length);
  area.value = thought.text;
  textEl.replaceWith(area);
  area.focus();

  const finish = () => {
    const value = area.value.trim();
    const thoughts = getEntry(currentDate).thoughts.map((t) => (t.id === thought.id ? { ...t, text: value } : t))
      .filter((t) => t.text);
    updateEntry(currentDate, { thoughts });
    renderThoughts(thoughts);
  };
  area.addEventListener('blur', finish, { once: true });
}

document.getElementById('add-thought-btn').addEventListener('click', () => {
  const text = thoughtInput.value.trim();
  if (!text) {
    thoughtInput.focus();
    return;
  }
  const thought = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), time: nowTime(), text };
  const thoughts = [...(getEntry(currentDate).thoughts || []), thought];
  updateEntry(currentDate, { thoughts });
  thoughtInput.value = '';
  renderThoughts(thoughts);
});

let savedTimer = null;
function flashSaved() {
  const el = document.getElementById('save-status');
  el.textContent = 'Збережено ✓';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { el.textContent = ''; }, 1500);
}

// ---------- Історія ----------

document.getElementById('history-search').addEventListener('input', renderHistory);

function entrySearchText(entry) {
  return [
    ...(entry.thoughts || []).map((t) => t.text),
    ...(entry.gratitude || []),
  ].join(' ').toLowerCase();
}

function renderHistory() {
  const container = document.getElementById('history-list');
  const query = document.getElementById('history-search').value.trim().toLowerCase();
  const dates = Object.keys(entries).sort().reverse()
    .filter((d) => !query || entrySearchText(entries[d]).includes(query));

  container.innerHTML = '';
  if (!dates.length) {
    container.innerHTML = `<div class="empty-state">${query ? 'Нічого не знайдено' : 'Поки що записів немає.<br>Почніть з вкладки «Сьогодні» ✍️'}</div>`;
    return;
  }

  dates.forEach((date) => {
    const entry = entries[date];
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'history-item';

    const mood = MOOD_LEVELS.find((l) => l.value === entry.mood);
    const energy = ENERGY_LEVELS.find((l) => l.value === entry.energy);
    const scores = [mood && `${mood.emoji} ${mood.value}`, energy && `${energy.emoji} ${energy.value}`].filter(Boolean).join('  ');

    const gratitude = (entry.gratitude || []).filter((g) => g.trim());
    const thoughts = entry.thoughts || [];
    const preview = thoughts.length ? thoughts[0].text : gratitude.length ? `🙏 ${gratitude.join(' · ')}` : '';
    const counts = [
      gratitude.length && `🙏 ${gratitude.length}`,
      thoughts.length && `💭 ${thoughts.length}`,
    ].filter(Boolean).join('  ');

    item.innerHTML = `
      <div class="history-head">
        <span class="history-date"></span>
        <span class="history-scores"></span>
      </div>
      ${preview ? '<div class="history-preview"></div>' : ''}
    `;
    item.querySelector('.history-date').textContent = formatShortDate(date);
    item.querySelector('.history-scores').textContent = [scores, counts].filter(Boolean).join('   ');
    if (preview) item.querySelector('.history-preview').textContent = preview;

    item.addEventListener('click', () => {
      setDate(date);
      switchTab('today');
    });
    container.appendChild(item);
  });
}

// ---------- Статистика ----------

let statsDays = 7;

document.querySelectorAll('.period-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    statsDays = Number(btn.dataset.days);
    document.querySelectorAll('.period-btn').forEach((b) => b.classList.toggle('active', b === btn));
    renderStats();
  });
});

function periodDates(days) {
  const today = todayISO();
  const result = [];
  for (let i = days - 1; i >= 0; i--) result.push(shiftDate(today, -i));
  return result;
}

function average(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function currentStreak() {
  let date = todayISO();
  if (!entries[date]) date = shiftDate(date, -1);
  let streak = 0;
  while (entries[date]) {
    streak++;
    date = shiftDate(date, -1);
  }
  return streak;
}

function renderStats() {
  const dates = periodDates(statsDays);
  const periodEntries = dates.map((d) => entries[d]).filter(Boolean);
  const moods = periodEntries.map((e) => e.mood).filter(Boolean);
  const energies = periodEntries.map((e) => e.energy).filter(Boolean);
  const gratitudeCount = periodEntries.reduce((sum, e) => sum + (e.gratitude || []).filter((g) => g.trim()).length, 0);

  const avgMood = average(moods);
  const avgEnergy = average(energies);
  const fmt = (v) => (v == null ? '—' : v.toFixed(1));

  const tiles = [
    { value: fmt(avgMood), label: 'Середній настрій' },
    { value: fmt(avgEnergy), label: 'Середня енергія' },
    { value: `${periodEntries.length}/${statsDays}`, label: 'Днів із записами' },
    { value: `${currentStreak()} 🔥`, label: 'Днів поспіль' },
    { value: gratitudeCount, label: 'Подяк за період' },
  ];
  document.getElementById('stats-summary').innerHTML = tiles
    .map((t) => `<div class="stat-tile"><div class="stat-value">${t.value}</div><div class="stat-label">${t.label}</div></div>`)
    .join('');

  drawChart(dates);
}

function drawChart(dates) {
  const canvas = document.getElementById('stats-chart');
  const styles = getComputedStyle(document.documentElement);
  const colors = {
    mood: styles.getPropertyValue('--accent').trim(),
    energy: styles.getPropertyValue('--accent-warm').trim(),
    grid: styles.getPropertyValue('--border').trim(),
    text: styles.getPropertyValue('--text-dim').trim(),
  };

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = 220;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const pad = { left: 22, right: 18, top: 10, bottom: 24 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (dates.length === 1 ? plotW / 2 : (i / (dates.length - 1)) * plotW);
  const y = (v) => pad.top + plotH - ((v - 1) / 4) * plotH;

  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillStyle = colors.text;
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = 1; v <= 5; v++) {
    ctx.beginPath();
    ctx.moveTo(pad.left, y(v));
    ctx.lineTo(width - pad.right, y(v));
    ctx.stroke();
    ctx.fillText(v, pad.left - 6, y(v));
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const labelEvery = Math.ceil(dates.length / 7);
  dates.forEach((d, i) => {
    if ((dates.length - 1 - i) % labelEvery !== 0) return;
    const date = fromISODate(d);
    ctx.fillText(`${date.getDate()}.${String(date.getMonth() + 1).padStart(2, '0')}`, x(i), height - pad.bottom + 8);
  });

  const drawSeries = (field, color) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    let prev = null;
    dates.forEach((d, i) => {
      const v = entries[d]?.[field];
      if (!v) return;
      if (prev) {
        ctx.beginPath();
        ctx.moveTo(x(prev.i), y(prev.v));
        ctx.lineTo(x(i), y(v));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x(i), y(v), dates.length > 31 ? 2 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      prev = { i, v };
    });
  };

  drawSeries('energy', colors.energy);
  drawSeries('mood', colors.mood);
}

window.addEventListener('resize', () => {
  if (document.getElementById('tab-stats').classList.contains('active')) drawChart(periodDates(statsDays));
});

// ---------- Резервна копія ----------

const backupStatus = document.getElementById('backup-status');

document.getElementById('open-settings-btn').addEventListener('click', () => {
  backupStatus.textContent = `Записів: ${Object.keys(entries).length}`;
  document.getElementById('settings-modal').hidden = false;
});

document.getElementById('export-btn').addEventListener('click', async () => {
  const data = { app: 'daily', version: APP_VERSION, exportedAt: new Date().toISOString(), entries };
  const json = JSON.stringify(data, null, 2);
  const fileName = `daily-backup-${todayISO()}.json`;
  const file = new File([json], fileName, { type: 'application/json' });

  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Daily — резервна копія' });
      backupStatus.textContent = 'Копію експортовано ✓';
      return;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  backupStatus.textContent = 'Копію збережено ✓';
});

const importFile = document.getElementById('import-file');
document.getElementById('import-btn').addEventListener('click', () => importFile.click());

importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  importFile.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const imported = data.entries;
    if (!imported || typeof imported !== 'object') throw new Error('bad format');
    const count = Object.keys(imported).length;
    if (!confirm(`Імпортувати ${count} записів? Вони об'єднаються з наявними.`)) return;
    Object.entries(imported).forEach(([date, entry]) => {
      entries[date] = mergeEntries(entries[date], entry);
    });
    saveEntries();
    renderToday();
    backupStatus.textContent = `Імпортовано ${count} записів ✓`;
  } catch {
    backupStatus.textContent = 'Не вдалося прочитати файл. Це точно резервна копія Daily?';
  }
});

function mergeEntries(existing, incoming) {
  if (!existing) return incoming;
  const unique = (arr) => [...new Set(arr)];
  const thoughts = [...(existing.thoughts || [])];
  (incoming.thoughts || []).forEach((t) => {
    if (!thoughts.some((e) => e.id === t.id)) thoughts.push(t);
  });
  return {
    ...existing,
    mood: existing.mood || incoming.mood || null,
    energy: existing.energy || incoming.energy || null,
    rated: Boolean(existing.rated || incoming.rated),
    gratitude: unique([...(existing.gratitude || []), ...(incoming.gratitude || [])].filter((g) => g.trim())),
    thoughts,
  };
}

// ---------- Ініціалізація ----------

renderToday();

// Якщо застосунок лишався відкритим через північ — повертаємось на новий день
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const today = todayISO();
  if (lastSeenToday !== today && currentDate === lastSeenToday) setDate(today);
  lastSeenToday = today;
});
let lastSeenToday = todayISO();

const appVersionEl = document.getElementById('app-version');
if (appVersionEl) appVersionEl.textContent = APP_VERSION;

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
