// Моделі оцінки психологічного стану. Кожна має однаковий інтерфейс:
//   isFilled(data)     — чи достатньо даних, щоб перейти далі
//   render(el, data, onChange) — малює крок оцінки
//   summary(data)      — { color, title, details[] } для підсумку дня
//   historyText(data)  — короткий рядок для історії
//   valence(data)      — приємність від -1 до 1 (для графіка)

// ---------- Циркумплекс (Russell) + емоційна гранулярність ----------

const CIRCUMPLEX_ZONES = {
  red: {
    name: 'Напруга', hint: 'неприємно, багато енергії', dot: '🔴', valence: -0.7,
    color: '#E24B4A', bg: 'rgba(226, 75, 74, 0.16)', text: '#F5A3A2',
    words: ['Напружено', 'Неспокійно', 'Роздратовано', 'Стривожено', 'Перевантажено', 'Збентежено', 'Злісно', 'Страшно', 'Панічно', 'Люто'],
  },
  yellow: {
    name: 'Підйом', hint: 'приємно, багато енергії', dot: '🟡', valence: 0.8,
    color: '#EF9F27', bg: 'rgba(239, 159, 39, 0.16)', text: '#FAC775',
    words: ['Зацікавлено', 'Бадьоро', 'Оптимістично', 'Впевнено', 'Радісно', 'Натхненно', 'Грайливо', 'Захоплено', 'Піднесено', 'Ейфорично'],
  },
  blue: {
    name: 'Спад', hint: 'неприємно, мало енергії', dot: '🔵', valence: -0.8,
    color: '#378ADD', bg: 'rgba(55, 138, 221, 0.16)', text: '#9CC7F2',
    words: ['Втомлено', 'Нудно', 'Розчаровано', 'Сумно', 'Самотньо', 'Апатично', 'Пригнічено', 'Безнадійно', 'Порожньо', 'Виснажено'],
  },
  green: {
    name: 'Спокій', hint: 'приємно, мало енергії', dot: '🟢', valence: 0.6,
    color: '#1D9E75', bg: 'rgba(29, 158, 117, 0.18)', text: '#8FE0C4',
    words: ['Спокійно', 'Врівноважено', 'Розслаблено', 'Задоволено', 'Затишно', 'Безпечно', 'Вдячно', 'Умиротворено', 'Ніжно', 'Блаженно'],
  },
  neutral: {
    name: 'Нейтрально', hint: 'ні добре, ні погано', dot: '⚪', valence: 0,
    color: '#9a9a9a', bg: 'rgba(154, 154, 154, 0.16)', text: '#d0d0d0',
    words: [],
  },
};

const CIRCUMPLEX_MAX_WORDS = 3;

// Який екран кроку показувати: сітку зон чи слова обраної зони
let circumplexScreen = 'zones';

const circumplexModel = {
  id: 'circumplex',
  name: 'Циркумплекс',

  isFilled(data) {
    return Boolean(data && (data.zone === 'neutral' || (data.zone && data.words?.length)));
  },

  resetScreen(data) {
    circumplexScreen = data?.zone && data.zone !== 'neutral' ? 'words' : 'zones';
  },

  render(el, data, onChange) {
    if (circumplexScreen === 'words' && data?.zone && data.zone !== 'neutral') {
      this.renderWords(el, data, onChange);
    } else {
      this.renderZones(el, data, onChange);
    }
  },

  renderZones(el, data, onChange) {
    el.innerHTML = `
      <p class="step-question">Як я почуваюсь психологічно?</p>
      <p class="card-hint">Оберіть зону, найближчу до стану</p>
      <div class="cx-grid">
        <div class="cx-axis cx-axis-v">більше енергії ↑</div>
        <div class="cx-zones"></div>
        <div class="cx-axis cx-axis-h">приємніше →</div>
      </div>`;
    const zones = el.querySelector('.cx-zones');
    ['red', 'yellow', 'blue', 'green'].forEach((key) => {
      const zone = CIRCUMPLEX_ZONES[key];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cx-zone' + (data?.zone === key ? ' active' : '');
      btn.style.setProperty('--zone-color', zone.color);
      btn.style.setProperty('--zone-bg', zone.bg);
      btn.style.setProperty('--zone-text', zone.text);
      btn.innerHTML = `<b>${zone.name}</b><span>${zone.hint}</span>`;
      btn.addEventListener('click', () => {
        const words = data?.zone === key ? data.words : [];
        circumplexScreen = 'words';
        onChange({ zone: key, words });
      });
      zones.appendChild(btn);
    });

    const neutral = document.createElement('button');
    neutral.type = 'button';
    neutral.className = 'cx-neutral' + (data?.zone === 'neutral' ? ' active' : '');
    neutral.textContent = 'Рівно';
    neutral.title = 'Нейтрально: ні добре, ні погано';
    neutral.addEventListener('click', () => onChange({ zone: 'neutral', words: [] }));
    zones.appendChild(neutral);
  },

  renderWords(el, data, onChange) {
    const zone = CIRCUMPLEX_ZONES[data.zone];
    el.innerHTML = `
      <div class="cx-words-head">
        <span class="cx-pill"></span>
        <button type="button" class="text-btn cx-back">← Інша зона</button>
      </div>
      <p class="step-question">Як саме?</p>
      <p class="card-hint">Оберіть 1–${CIRCUMPLEX_MAX_WORDS} слова, від легшого до сильнішого</p>
      <div class="chips"></div>`;
    const pill = el.querySelector('.cx-pill');
    pill.textContent = zone.name;
    pill.style.setProperty('--zone-color', zone.color);
    pill.style.setProperty('--zone-bg', zone.bg);
    pill.style.setProperty('--zone-text', zone.text);

    el.querySelector('.cx-back').addEventListener('click', () => {
      circumplexScreen = 'zones';
      onChange(data);
    });

    const chips = el.querySelector('.chips');
    zone.words.forEach((word) => {
      const selected = data.words.includes(word);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (selected ? ' active' : '');
      chip.style.setProperty('--zone-color', zone.color);
      chip.style.setProperty('--zone-bg', zone.bg);
      chip.style.setProperty('--zone-text', zone.text);
      chip.textContent = word;
      chip.addEventListener('click', () => {
        let words = data.words;
        if (selected) words = words.filter((w) => w !== word);
        else if (words.length < CIRCUMPLEX_MAX_WORDS) words = [...words, word];
        else return;
        onChange({ ...data, words });
      });
      chips.appendChild(chip);
    });
  },

  summary(data) {
    const zone = CIRCUMPLEX_ZONES[data.zone];
    return { color: zone.color, title: zone.name, details: data.words };
  },

  historyText(data) {
    const zone = CIRCUMPLEX_ZONES[data.zone];
    return `${zone.dot} ${data.words.length ? data.words.join(', ') : zone.name}`;
  },

  valence(data) {
    return CIRCUMPLEX_ZONES[data.zone].valence;
  },
};

// ---------- PAD (Мехрабіан): приємність, енергія, контроль ----------

const PAD_AXES = [
  { key: 'p', name: 'Приємність', min: 'Неприємно', max: 'Приємно' },
  { key: 'a', name: 'Енергія', min: 'В\'яло', max: 'Збуджено' },
  { key: 'd', name: 'Контроль', min: 'Безсило', max: 'Керую ситуацією' },
];

const PAD_RANGE = 4;

// Вісім октантів моделі — темпераменти Мехрабіана
const PAD_OCTANTS = {
  '+++': { emoji: '🤩', name: 'Піднесення', hint: 'Радісно, енергійно, усе під контролем' },
  '++-': { emoji: '😍', name: 'Захоплення', hint: 'Приємне хвилювання, але від мене мало що залежить' },
  '+-+': { emoji: '😌', name: 'Розслабленість', hint: 'Спокійно, впевнено, приємно' },
  '+--': { emoji: '🙂', name: 'Лагідність', hint: 'Спокійно й приємно, пливу за течією' },
  '-++': { emoji: '😠', name: 'Ворожість', hint: 'Злість, роздратування, готовність діяти' },
  '-+-': { emoji: '😰', name: 'Тривога', hint: 'Напруга й страх, ситуація не під контролем' },
  '--+': { emoji: '😒', name: 'Відстороненість', hint: 'Холодно, байдуже, тримаю дистанцію' },
  '---': { emoji: '😞', name: 'Пригніченість', hint: 'Сумно, нудно, сил і впливу мало' },
};

function padOctant(data) {
  if (PAD_AXES.every((axis) => Math.abs(data[axis.key]) <= 1)) {
    return { emoji: '😐', name: 'Нейтрально', hint: 'Близько до центру за всіма осями' };
  }
  const key = PAD_AXES.map((axis) => (data[axis.key] >= 0 ? '+' : '-')).join('');
  return PAD_OCTANTS[key];
}

function formatSigned(n) {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

const padModel = {
  id: 'pad',
  name: 'PAD',

  isFilled(data) {
    return Boolean(data && PAD_AXES.every((axis) => Number.isInteger(data[axis.key])));
  },

  render(el, data, onChange) {
    const values = data || { p: 0, a: 0, d: 0 };
    el.innerHTML = `
      <p class="step-question">Як я почуваюсь психологічно?</p>
      <p class="card-hint">Посуньте кожен повзунок. Центр — нейтрально</p>
      <div class="pad-sliders"></div>
      <div class="pad-result">
        <span class="pad-emoji"></span>
        <div><div class="pad-name"></div><div class="pad-hint"></div></div>
      </div>`;

    const result = el.querySelector('.pad-result');
    const showResult = (v) => {
      const octant = padOctant(v);
      result.classList.toggle('empty', !data);
      el.querySelector('.pad-emoji').textContent = data ? octant.emoji : '🎚️';
      el.querySelector('.pad-name').textContent = data ? octant.name : 'Ще не оцінено';
      el.querySelector('.pad-hint').textContent = data ? octant.hint : 'Торкніться повзунків, щоб зафіксувати стан';
    };

    const sliders = el.querySelector('.pad-sliders');
    PAD_AXES.forEach((axis) => {
      const row = document.createElement('div');
      row.className = 'pad-row';
      row.innerHTML = `
        <div class="pad-row-head"><span>${axis.name}</span><b class="pad-value"></b></div>
        <input type="range" min="${-PAD_RANGE}" max="${PAD_RANGE}" step="1" class="pad-range pad-${axis.key}">
        <div class="pad-row-ends"><span>${axis.min}</span><span>${axis.max}</span></div>`;
      const input = row.querySelector('input');
      const valueEl = row.querySelector('.pad-value');
      input.value = values[axis.key];
      valueEl.textContent = data ? formatSigned(values[axis.key]) : '';

      input.addEventListener('input', () => {
        values[axis.key] = Number(input.value);
        valueEl.textContent = formatSigned(values[axis.key]);
        data = { ...values };
        showResult(values);
        onChange({ ...values }, { silent: true });
      });
      sliders.appendChild(row);
    });

    showResult(values);
  },

  summary(data) {
    const octant = padOctant(data);
    return {
      color: data.p >= 0 ? '#9b7dff' : '#E24B4A',
      title: `${octant.emoji} ${octant.name}`,
      details: PAD_AXES.map((axis) => `${axis.name} ${formatSigned(data[axis.key])}`),
    };
  },

  historyText(data) {
    const octant = padOctant(data);
    return `${octant.emoji} ${octant.name}`;
  },

  valence(data) {
    return data.p / PAD_RANGE;
  },
};

// ---------- Колесо емоцій Плутчика ----------

// Порядок — за колом, починаючи згори за годинниковою стрілкою
const PLUTCHIK_EMOTIONS = [
  { id: 'joy', levels: ['Безтурботність', 'Радість', 'Екстаз'], color: '#F5D547', ink: '#3d3300', valence: 1 },
  { id: 'trust', levels: ['Прийняття', 'Довіра', 'Захоплення'], color: '#9BD66B', ink: '#1d3a08', valence: 0.6 },
  { id: 'fear', levels: ['Острах', 'Страх', 'Жах'], color: '#3FA34D', ink: '#06260c', valence: -0.8 },
  { id: 'surprise', levels: ['Розсіяність', 'Здивування', 'Приголомшення'], color: '#46B3D9', ink: '#062f3d', valence: 0 },
  { id: 'sadness', levels: ['Задумливість', 'Сум', 'Горе'], color: '#4F7FD9', ink: '#0b1f45', valence: -1 },
  { id: 'disgust', levels: ['Нудьга', 'Огида', 'Відраза'], color: '#A066D3', ink: '#2a0b45', valence: -0.7 },
  { id: 'anger', levels: ['Роздратування', 'Гнів', 'Лють'], color: '#E2504C', ink: '#3d0605', valence: -0.8 },
  { id: 'anticipation', levels: ['Інтерес', 'Очікування', 'Пильність'], color: '#F29A3E', ink: '#3d1f00', valence: 0.3 },
];

// Первинні діади — поєднання сусідніх емоцій
const PLUTCHIK_DYADS = {
  'joy+trust': 'Любов',
  'trust+fear': 'Покора',
  'fear+surprise': 'Трепет',
  'surprise+sadness': 'Несхвалення',
  'sadness+disgust': 'Каяття',
  'disgust+anger': 'Зневага',
  'anger+anticipation': 'Агресивність',
  'anticipation+joy': 'Оптимізм',
};

const PLUTCHIK_MAX = 3;
// Радіуси кілець: від центру — сильна, базова, слабка інтенсивність
const PLUTCHIK_RINGS = [[26, 66], [66, 108], [108, 150]];

function plutchikName(id, level) {
  return PLUTCHIK_EMOTIONS.find((e) => e.id === id).levels[level - 1];
}

function plutchikDyads(emotions) {
  return Object.entries(PLUTCHIK_DYADS)
    .filter(([pair]) => pair.split('+').every((id) => emotions[id]))
    .map(([, name]) => name);
}

function mixWithWhite(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift) => Math.round(((n >> shift) & 255) * (1 - amount) + 255 * amount);
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

function polar(r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [r * Math.cos(rad), r * Math.sin(rad)];
}

function ringSegmentPath(r1, r2, a1, a2) {
  const [x1, y1] = polar(r2, a1);
  const [x2, y2] = polar(r2, a2);
  const [x3, y3] = polar(r1, a2);
  const [x4, y4] = polar(r1, a1);
  return `M${x1},${y1} A${r2},${r2} 0 0 1 ${x2},${y2} L${x3},${y3} A${r1},${r1} 0 0 0 ${x4},${y4} Z`;
}

const plutchikModel = {
  id: 'plutchik',
  name: 'Плутчик',

  isFilled(data) {
    return Boolean(data && Object.keys(data.emotions || {}).length);
  },

  render(el, data, onChange) {
    const emotions = data?.emotions || {};
    el.innerHTML = `
      <p class="step-question">Які емоції я відчуваю?</p>
      <p class="card-hint">До ${PLUTCHIK_MAX} емоцій. Ближче до центру — сильніше</p>
      <svg class="pl-wheel" viewBox="-155 -155 310 310" role="group" aria-label="Колесо емоцій"></svg>
      <div class="pl-selected"></div>`;

    const svg = el.querySelector('svg');
    const ns = 'http://www.w3.org/2000/svg';
    const hasSelection = Object.keys(emotions).length > 0;

    PLUTCHIK_EMOTIONS.forEach((emotion, i) => {
      const center = -90 + i * 45;
      const a1 = center - 21;
      const a2 = center + 21;
      const selectedLevel = emotions[emotion.id];

      [3, 2, 1].forEach((level, ringIndex) => {
        const [r1, r2] = PLUTCHIK_RINGS[ringIndex];
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', ringSegmentPath(r1, r2, a1, a2));
        // Як в оригіналі: що слабша емоція, то блідіший колір
        path.setAttribute('fill', mixWithWhite(emotion.color, [0.55, 0.28, 0][level - 1]));
        const isSelected = selectedLevel === level;
        path.setAttribute('fill-opacity', !hasSelection || isSelected ? 1 : 0.35);
        path.setAttribute('class', 'pl-seg' + (isSelected ? ' active' : ''));
        path.setAttribute('aria-label', emotion.levels[level - 1]);
        path.addEventListener('click', () => {
          const next = { ...emotions };
          if (isSelected) delete next[emotion.id];
          else if (next[emotion.id] || Object.keys(next).length < PLUTCHIK_MAX) next[emotion.id] = level;
          else return;
          onChange({ emotions: next });
        });
        svg.appendChild(path);
      });

      // Підпис базової емоції в середньому кільці
      const [tx, ty] = polar(87, center);
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', tx);
      text.setAttribute('y', ty);
      text.setAttribute('class', 'pl-label');
      text.setAttribute('fill', emotion.ink);
      text.textContent = emotion.levels[1];
      svg.appendChild(text);
    });

    const selected = el.querySelector('.pl-selected');
    const ids = Object.keys(emotions);
    if (!ids.length) {
      selected.innerHTML = '<p class="card-hint pl-empty">Торкніться сегмента колеса</p>';
      return;
    }
    const chips = document.createElement('div');
    chips.className = 'chips';
    ids.forEach((id) => {
      const emotion = PLUTCHIK_EMOTIONS.find((e) => e.id === id);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pl-chip';
      chip.style.background = emotion.color;
      chip.style.color = emotion.ink;
      chip.textContent = `${plutchikName(id, emotions[id])} ✕`;
      chip.addEventListener('click', () => {
        const next = { ...emotions };
        delete next[id];
        onChange({ emotions: next });
      });
      chips.appendChild(chip);
    });
    selected.appendChild(chips);

    const dyads = plutchikDyads(emotions);
    if (dyads.length) {
      const p = document.createElement('p');
      p.className = 'card-hint pl-dyads';
      p.textContent = `Разом це: ${dyads.join(', ')}`;
      selected.appendChild(p);
    }
  },

  summary(data) {
    const ids = Object.keys(data.emotions);
    const first = PLUTCHIK_EMOTIONS.find((e) => e.id === ids[0]);
    const dyads = plutchikDyads(data.emotions);
    return {
      color: first.color,
      title: ids.map((id) => plutchikName(id, data.emotions[id])).join(', '),
      details: dyads.map((d) => `Разом: ${d}`),
    };
  },

  historyText(data) {
    return `🌸 ${Object.keys(data.emotions).map((id) => plutchikName(id, data.emotions[id])).join(', ')}`;
  },

  valence(data) {
    const ids = Object.keys(data.emotions);
    // Сильніші емоції важать більше
    let sum = 0;
    let weight = 0;
    ids.forEach((id) => {
      const level = data.emotions[id];
      sum += PLUTCHIK_EMOTIONS.find((e) => e.id === id).valence * level;
      weight += level;
    });
    return weight ? sum / weight : 0;
  },
};

// ---------- Реєстр моделей ----------

const PSYCH_MODELS = [circumplexModel, padModel, plutchikModel];
const STORAGE_PSYCH_MODEL = 'daily-psych-model';

function getPsychModel() {
  let id = null;
  try {
    id = localStorage.getItem(STORAGE_PSYCH_MODEL);
  } catch {}
  return PSYCH_MODELS.find((m) => m.id === id) || PSYCH_MODELS[0];
}

function setPsychModel(id) {
  try {
    localStorage.setItem(STORAGE_PSYCH_MODEL, id);
  } catch {}
}

// Модель для показу запису: обрана, якщо вона заповнена, інакше перша заповнена
function psychModelForEntry(entry) {
  const psych = entry.psych || {};
  const active = getPsychModel();
  if (active.isFilled(psych[active.id])) return active;
  return PSYCH_MODELS.find((m) => m.isFilled(psych[m.id])) || null;
}
