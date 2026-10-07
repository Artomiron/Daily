// Фізичний стан — чотири короткі питання на основі PROMIS Global Physical Health
// (загальне фізичне здоров'я, втома, біль 0–10) та Consensus Sleep Diary (сон).
// Дані дня: { health, fatigue, pain, painAreas, sleepHours, sleepQuality }

const BODY_HEALTH = [
  { value: 1, emoji: '🤒', text: 'Погано' },
  { value: 2, emoji: '😕', text: 'Посередньо' },
  { value: 3, emoji: '🙂', text: 'Добре' },
  { value: 4, emoji: '😊', text: 'Дуже добре' },
  { value: 5, emoji: '💪', text: 'Відмінно' },
];

const BODY_FATIGUE = [
  { value: 1, emoji: '⚡', text: 'Немає' },
  { value: 2, emoji: '🙂', text: 'Легка' },
  { value: 3, emoji: '😐', text: 'Помірна' },
  { value: 4, emoji: '🥱', text: 'Сильна' },
  { value: 5, emoji: '🪫', text: 'Дуже сильна' },
];

const BODY_SLEEP_QUALITY = [
  { value: 1, emoji: '😫', text: 'Дуже погано' },
  { value: 2, emoji: '😕', text: 'Погано' },
  { value: 3, emoji: '😐', text: 'Нормально' },
  { value: 4, emoji: '🙂', text: 'Добре' },
  { value: 5, emoji: '😴', text: 'Чудово' },
];

const BODY_PAIN_AREAS = ['Голова', 'Шия', 'Плечі', 'Спина', 'Поперек', 'Груди', 'Живіт', 'Руки', 'Ноги', 'Суглоби', 'М\'язи', 'Зуби'];

const SLEEP_MIN = 0;
const SLEEP_MAX = 14;
const SLEEP_STEP = 0.5;
const SLEEP_DEFAULT = 7.5;

function isBodyFilled(body) {
  return Boolean(body && body.health && body.fatigue && Number.isInteger(body.pain) && body.sleepQuality);
}

// Індекс тіла 0–100: середнє чотирьох складових, кожна від 0 (найгірше) до 1 (найкраще)
function bodyIndex(body) {
  if (!isBodyFilled(body)) return null;
  const parts = [
    (body.health - 1) / 4,
    (5 - body.fatigue) / 4,
    (10 - body.pain) / 10,
    (body.sleepQuality - 1) / 4,
  ];
  return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100);
}

function findBodyLevel(levels, value) {
  return levels.find((l) => l.value === value);
}

function formatHours(hours) {
  return `${String(hours).replace('.', ',')} год`;
}

// Колір болю: зелений → жовтий → червоний
function painColor(value) {
  const hue = 130 - (value / 10) * 130;
  return `hsl(${hue}, 65%, 50%)`;
}

function bodySummaryParts(body) {
  const parts = [
    `Самопочуття: ${findBodyLevel(BODY_HEALTH, body.health).text.toLowerCase()}`,
    `Втома: ${findBodyLevel(BODY_FATIGUE, body.fatigue).text.toLowerCase()}`,
    body.pain ? `Біль ${body.pain}/10${body.painAreas?.length ? ` (${body.painAreas.join(', ').toLowerCase()})` : ''}` : 'Без болю',
    `Сон: ${body.sleepHours != null ? `${formatHours(body.sleepHours)}, ` : ''}${findBodyLevel(BODY_SLEEP_QUALITY, body.sleepQuality).text.toLowerCase()}`,
  ];
  return parts;
}

function renderBody(el, body, onChange) {
  const data = body || {};
  el.innerHTML = `
    <p class="step-question">Як я почуваюсь фізично?</p>

    <div class="body-q">
      <div class="body-q-title">Загальне самопочуття тіла</div>
      <div class="scale body-health"></div>
    </div>

    <div class="body-q">
      <div class="body-q-title">Фізична втома</div>
      <div class="scale body-fatigue"></div>
    </div>

    <div class="body-q">
      <div class="body-q-title">Біль <span class="body-q-hint">0 — немає, 10 — найсильніший</span></div>
      <div class="pain-scale"></div>
      <div class="pain-areas" hidden>
        <div class="body-q-hint">Де болить?</div>
        <div class="chips"></div>
      </div>
    </div>

    <div class="body-q">
      <div class="body-q-title">Сон минулої ночі</div>
      <div class="sleep-hours">
        <button type="button" class="sleep-btn sleep-minus" aria-label="Менше">−</button>
        <span class="sleep-value"></span>
        <button type="button" class="sleep-btn sleep-plus" aria-label="Більше">+</button>
      </div>
      <div class="body-q-hint">Якість сну</div>
      <div class="scale body-sleep"></div>
    </div>`;

  const update = (changes) => onChange({ ...data, ...changes });

  const renderLevels = (selector, levels, field) => {
    const container = el.querySelector(selector);
    levels.forEach((level) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scale-btn' + (data[field] === level.value ? ' active' : '');
      btn.innerHTML = `<span class="scale-emoji">${level.emoji}</span><span class="scale-text">${level.text}</span>`;
      btn.addEventListener('click', () => update({ [field]: level.value }));
      container.appendChild(btn);
    });
  };

  renderLevels('.body-health', BODY_HEALTH, 'health');
  renderLevels('.body-fatigue', BODY_FATIGUE, 'fatigue');
  renderLevels('.body-sleep', BODY_SLEEP_QUALITY, 'sleepQuality');

  const painScale = el.querySelector('.pain-scale');
  for (let value = 0; value <= 10; value++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pain-btn' + (data.pain === value ? ' active' : '');
    btn.style.setProperty('--pain-color', painColor(value));
    btn.textContent = value;
    btn.addEventListener('click', () => update({ pain: value, painAreas: value ? data.painAreas || [] : [] }));
    painScale.appendChild(btn);
  }

  if (data.pain > 0) {
    const areas = el.querySelector('.pain-areas');
    areas.hidden = false;
    const chips = areas.querySelector('.chips');
    BODY_PAIN_AREAS.forEach((area) => {
      const selected = (data.painAreas || []).includes(area);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (selected ? ' active' : '');
      chip.textContent = area;
      chip.addEventListener('click', () => {
        const current = data.painAreas || [];
        update({ painAreas: selected ? current.filter((a) => a !== area) : [...current, area] });
      });
      chips.appendChild(chip);
    });
  }

  const sleepValue = el.querySelector('.sleep-value');
  sleepValue.textContent = data.sleepHours != null ? formatHours(data.sleepHours) : 'Скільки годин?';
  sleepValue.classList.toggle('empty', data.sleepHours == null);
  const changeSleep = (delta) => {
    const current = data.sleepHours ?? SLEEP_DEFAULT - delta;
    update({ sleepHours: Math.min(SLEEP_MAX, Math.max(SLEEP_MIN, current + delta)) });
  };
  el.querySelector('.sleep-minus').addEventListener('click', () => changeSleep(-SLEEP_STEP));
  el.querySelector('.sleep-plus').addEventListener('click', () => changeSleep(SLEEP_STEP));
}
