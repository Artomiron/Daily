// Daily — щоденник стану, думок та вдячності

const APP_VERSION = 'v1.2';
const STORAGE_ENTRIES = 'daily-entries';

// Психологічний стан — у circumplex.js, фізичний — у body.js

const MIN_GRATITUDE_ROWS = 1;

// ---------- Сховище ----------

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_ENTRIES);
    return migrateEntries(raw ? JSON.parse(raw) : {});
  } catch {
    return {};
  }
}

// Старі шкали (настрій, психологічний стан 1–8, енергія, фізичний стан 1–8)
// замінені циркумплексом і питаннями про тіло.
// Їхні значення лишаються в записі, але більше не показуються
function migrateEntries(data) {
  Object.values(data).forEach((entry) => {
    delete entry.emotions;
    // Тестова версія з трьома моделями: лишаємо тільки циркумплекс
    if (entry.psych) {
      if (entry.psych.circumplex && !entry.state) entry.state = entry.psych.circumplex;
      delete entry.psych;
    }
  });
  return data;
}

let entries = loadEntries();

function saveEntries() {
  localStorage.setItem(STORAGE_ENTRIES, JSON.stringify(entries));
}

function isEntryEmpty(entry) {
  return !entry.state
    && !entry.body
    && !(entry.thoughts || []).length
    && !(entry.gratitude || []).some((g) => g.trim());
}

function getEntry(date) {
  return entries[date] || { state: null, body: null, rated: false, gratitude: [], thoughts: [] };
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

  renderGratitude(entry.gratitude || []);
  showRateStep(entry.rated ? 'summary' : 'intro');
  renderThoughts(entry.thoughts || []);
  document.getElementById('save-status').textContent = '';
}

// ---------- Оцінити день ----------

const RATE_STEPS = ['state', 'body', 'gratitude'];

function showRateStep(step) {
  RATE_STEPS.forEach((s) => {
    document.getElementById(`rate-step-${s}`).hidden = s !== step;
  });
  document.getElementById('rate-intro').hidden = step !== 'intro';
  document.getElementById('rate-summary').hidden = step !== 'summary';
  // Під час проходження кроків панель вибору дня ховаємо, щоб не відволікала
  document.getElementById('tab-today').classList.toggle('rating', RATE_STEPS.includes(step));
  if (RATE_STEPS.includes(step)) window.scrollTo(0, 0);
  if (step === 'state') {
    resetStateScreen(getEntry(currentDate).state);
    renderStateStep();
  }
  if (step === 'body') renderBodyStep();

  const progress = document.getElementById('rate-progress');
  if (step === 'intro') {
    progress.textContent = '';
    progress.classList.remove('done');
  } else if (step === 'summary') {
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
  document.querySelector('#rate-step-state .primary-btn').disabled = !isStateFilled(entry.state);
  document.querySelector('#rate-step-body .primary-btn').disabled = !isBodyFilled(entry.body);
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

document.getElementById('rate-start-btn').addEventListener('click', () => showRateStep(RATE_STEPS[0]));

document.getElementById('rate-edit-btn').addEventListener('click', () => showRateStep(RATE_STEPS[0]));

function renderRateSummary() {
  const entry = getEntry(currentDate);

  const stateEl = document.getElementById('summary-state');
  stateEl.innerHTML = '';
  if (isStateFilled(entry.state)) {
    const zone = CIRCUMPLEX_ZONES[entry.state.zone];
    const { v, a } = stateScores(entry.state);
    stateEl.innerHTML = `
      ${stateMiniMap(entry.state)}
      <div class="summary-state-info">
        <div class="stat-label">Психологічно</div>
        <div class="summary-state-title"></div>
        <div class="summary-state-words"></div>
        <div class="summary-state-scores">Приємність <b>${formatScore(v)}</b> · Енергія <b>${formatScore(a)}</b></div>
      </div>`;
    const title = stateEl.querySelector('.summary-state-title');
    title.textContent = zone.name;
    title.style.color = zone.text;
    stateEl.querySelector('.summary-state-words').textContent = entry.state.words.join(' · ');
  }

  const bodyEl = document.getElementById('summary-body');
  bodyEl.innerHTML = '';
  if (isBodyFilled(entry.body)) {
    bodyEl.innerHTML = `
      <div class="body-index"><b></b><span>/100</span></div>
      <div>
        <div class="stat-label">Фізично · індекс тіла</div>
        <ul class="summary-body-parts"></ul>
      </div>`;
    bodyEl.querySelector('.body-index b').textContent = bodyIndex(entry.body);
    const parts = bodyEl.querySelector('.summary-body-parts');
    bodySummaryParts(entry.body).forEach((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      parts.appendChild(li);
    });
  }

  const list = document.getElementById('summary-gratitude');
  list.innerHTML = '';
  (entry.gratitude || []).filter((g) => g.trim()).forEach((g) => {
    const li = document.createElement('li');
    li.textContent = g;
    list.appendChild(li);
  });
}

// ---------- Психологічний стан ----------

function renderStateStep() {
  renderState(document.getElementById('state-body'), getEntry(currentDate).state, (state) => {
    updateEntry(currentDate, { state });
    renderStateStep();
    updateStepButtons();
  });
}

// ---------- Фізичний стан ----------

function renderBodyStep() {
  renderBody(document.getElementById('body-form'), getEntry(currentDate).body, (body) => {
    updateEntry(currentDate, { body });
    renderBodyStep();
    updateStepButtons();
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
    // Підтвердження другим тапом: confirm() не показується у застосунку з початкового екрана iOS
    let confirmTimer = null;
    remove.addEventListener('click', () => {
      if (!remove.classList.contains('confirming')) {
        remove.classList.add('confirming');
        remove.textContent = 'Видалити?';
        confirmTimer = setTimeout(() => {
          remove.classList.remove('confirming');
          remove.textContent = '✕';
        }, 3000);
        return;
      }
      clearTimeout(confirmTimer);
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

function periodStateScores(periodEntries) {
  return periodEntries.filter((e) => isStateFilled(e.state)).map((e) => stateScores(e.state));
}

// Бал стану (-5…+5) як частка від 0 до 1 — для графіка
function stateShare(entry, key) {
  return entry && isStateFilled(entry.state) ? (stateScores(entry.state)[key] + CIRCUMPLEX_RANGE) / (2 * CIRCUMPLEX_RANGE) : null;
}

function renderStats() {
  const dates = periodDates(statsDays);
  const periodEntries = dates.map((d) => entries[d]).filter(Boolean);
  const gratitudeCount = periodEntries.reduce((sum, e) => sum + (e.gratitude || []).filter((g) => g.trim()).length, 0);

  const fmt = (v, max, digits = 1) => (v == null ? '—' : `${v.toFixed(digits)}<span class="stat-max">/${max}</span>`);
  const fmtNumber = (v) => (v == null ? '—' : v.toFixed(1));
  const bodies = periodEntries.map((e) => e.body).filter(isBodyFilled);
  const sleepAvg = average(bodies.map((b) => b.sleepHours).filter((h) => h != null));
  const fmtScore = (v) => (v == null ? '—' : formatScore(Math.round(v * 10) / 10));
  const scores = periodStateScores(periodEntries);
  const pleasant = scores.length ? `${Math.round((scores.filter((s) => s.v > 0).length / scores.length) * 100)}%` : '—';

  const tiles = [
    { value: fmtScore(average(scores.map((s) => s.v))), label: 'Середня приємність' },
    { value: fmtScore(average(scores.map((s) => s.a))), label: 'Середня енергія' },
    { value: fmt(average(bodies.map(bodyIndex)), 100, 0), label: 'Індекс тіла' },
    { value: fmtNumber(average(bodies.map((b) => b.pain))), label: 'Середній біль (0–10)' },
    { value: sleepAvg == null ? '—' : formatHours(Math.round(sleepAvg * 10) / 10), label: 'Середній сон' },
    { value: pleasant, label: 'Приємних днів' },
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

  const pad = { left: 18, right: 18, top: 10, bottom: 24 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (dates.length === 1 ? plotW / 2 : (i / (dates.length - 1)) * plotW);
  // Шкали різні, тому малюємо частку від найгіршого до найкращого
  const y = (share) => pad.top + plotH - share * plotH;

  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillStyle = colors.text;
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  for (let share = 0; share <= 1; share += 0.25) {
    ctx.beginPath();
    ctx.moveTo(pad.left, y(share));
    ctx.lineTo(width - pad.right, y(share));
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const labelEvery = Math.ceil(dates.length / 7);
  dates.forEach((d, i) => {
    if ((dates.length - 1 - i) % labelEvery !== 0) return;
    const date = fromISODate(d);
    ctx.fillText(`${date.getDate()}.${String(date.getMonth() + 1).padStart(2, '0')}`, x(i), height - pad.bottom + 8);
  });

  const drawSeries = (color, shareAt) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    let prev = null;
    dates.forEach((d, i) => {
      const v = shareAt(entries[d]);
      if (v == null) return;
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

  drawSeries(styles.getPropertyValue('--accent-green').trim(), (entry) => (isBodyFilled(entry?.body) ? bodyIndex(entry.body) / 100 : null));
  drawSeries(styles.getPropertyValue('--accent-warm').trim(), (entry) => stateShare(entry, 'a'));
  drawSeries(styles.getPropertyValue('--accent').trim(), (entry) => stateShare(entry, 'v'));
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
    if (!data.entries || typeof data.entries !== 'object') throw new Error('bad format');
    const imported = migrateEntries(data.entries);
    const count = Object.keys(imported).length;
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
    body: existing.body || incoming.body || null,
    state: existing.state || incoming.state || null,
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
