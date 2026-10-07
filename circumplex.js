// Психологічний стан за циркумплексною моделлю афекту (Russell) з емоційною гранулярністю.
// Кожне слово має місце на сітці: v — приємність, a — енергія, обидві від -5 до +5
// (як у Mood Meter). Бали дня — середнє вибраних слів.

const CIRCUMPLEX_ZONES = {
  red: {
    name: 'Напруга', hint: 'неприємно, багато енергії', dot: '🔴',
    color: '#E24B4A', bg: 'rgba(226, 75, 74, 0.16)', text: '#F5A3A2',
    words: [
      { text: 'Напружено', v: -1, a: 2 },
      { text: 'Неспокійно', v: -2, a: 2 },
      { text: 'Збентежено', v: -2, a: 3 },
      { text: 'Роздратовано', v: -3, a: 3 },
      { text: 'Стривожено', v: -3, a: 4 },
      { text: 'Перевантажено', v: -4, a: 3 },
      { text: 'Злісно', v: -4, a: 4 },
      { text: 'Страшно', v: -4, a: 5 },
      { text: 'Люто', v: -5, a: 4 },
      { text: 'Панічно', v: -5, a: 5 },
    ],
  },
  yellow: {
    name: 'Підйом', hint: 'приємно, багато енергії', dot: '🟡',
    color: '#EF9F27', bg: 'rgba(239, 159, 39, 0.16)', text: '#FAC775',
    words: [
      { text: 'Зацікавлено', v: 1, a: 2 },
      { text: 'Бадьоро', v: 1, a: 3 },
      { text: 'Оптимістично', v: 2, a: 2 },
      { text: 'Впевнено', v: 3, a: 2 },
      { text: 'Радісно', v: 3, a: 3 },
      { text: 'Грайливо', v: 3, a: 4 },
      { text: 'Натхненно', v: 4, a: 3 },
      { text: 'Захоплено', v: 4, a: 4 },
      { text: 'Піднесено', v: 5, a: 4 },
      { text: 'Ейфорично', v: 5, a: 5 },
    ],
  },
  blue: {
    name: 'Спад', hint: 'неприємно, мало енергії', dot: '🔵',
    color: '#378ADD', bg: 'rgba(55, 138, 221, 0.16)', text: '#9CC7F2',
    words: [
      { text: 'Нудно', v: -1, a: -2 },
      { text: 'Втомлено', v: -1, a: -3 },
      { text: 'Розчаровано', v: -2, a: -2 },
      { text: 'Сумно', v: -3, a: -2 },
      { text: 'Самотньо', v: -3, a: -3 },
      { text: 'Апатично', v: -2, a: -4 },
      { text: 'Пригнічено', v: -4, a: -3 },
      { text: 'Виснажено', v: -3, a: -5 },
      { text: 'Безнадійно', v: -5, a: -4 },
      { text: 'Порожньо', v: -4, a: -5 },
    ],
  },
  green: {
    name: 'Спокій', hint: 'приємно, мало енергії', dot: '🟢',
    color: '#1D9E75', bg: 'rgba(29, 158, 117, 0.18)', text: '#8FE0C4',
    words: [
      { text: 'Спокійно', v: 1, a: -2 },
      { text: 'Задоволено', v: 2, a: -1 },
      { text: 'Врівноважено', v: 2, a: -2 },
      { text: 'Вдячно', v: 3, a: -1 },
      { text: 'Розслаблено', v: 2, a: -3 },
      { text: 'Затишно', v: 3, a: -2 },
      { text: 'Безпечно', v: 3, a: -3 },
      { text: 'Ніжно', v: 4, a: -2 },
      { text: 'Умиротворено', v: 4, a: -4 },
      { text: 'Блаженно', v: 5, a: -4 },
    ],
  },
  neutral: {
    name: 'Нейтрально', hint: 'ні добре, ні погано', dot: '⚪',
    color: '#9a9a9a', bg: 'rgba(154, 154, 154, 0.16)', text: '#d0d0d0',
    words: [],
  },
};

const CIRCUMPLEX_MAX_WORDS = 3;
const CIRCUMPLEX_RANGE = 5;

// Який екран кроку показувати: сітку зон чи слова обраної зони
let circumplexScreen = 'zones';

function isStateFilled(state) {
  return Boolean(state && (state.zone === 'neutral' || (state.zone && state.words?.length)));
}

// Бали стану: середнє координат вибраних слів, з точністю до 0.5
function stateScores(state) {
  if (!isStateFilled(state) || state.zone === 'neutral') return { v: 0, a: 0 };
  const words = CIRCUMPLEX_ZONES[state.zone].words.filter((w) => state.words.includes(w.text));
  const avg = (key) => Math.round((words.reduce((sum, w) => sum + w[key], 0) / words.length) * 2) / 2;
  return { v: avg('v'), a: avg('a') };
}

function formatScore(n) {
  const abs = Number.isInteger(n) ? Math.abs(n) : Math.abs(n).toFixed(1);
  return n > 0 ? `+${abs}` : n < 0 ? `−${abs}` : '0';
}

function resetStateScreen(state) {
  circumplexScreen = state?.zone && state.zone !== 'neutral' ? 'words' : 'zones';
}

function setZoneVars(el, zone) {
  el.style.setProperty('--zone-color', zone.color);
  el.style.setProperty('--zone-bg', zone.bg);
  el.style.setProperty('--zone-text', zone.text);
}

function renderState(el, state, onChange) {
  if (circumplexScreen === 'words' && state?.zone && state.zone !== 'neutral') {
    renderStateWords(el, state, onChange);
  } else {
    renderStateZones(el, state, onChange);
  }
}

function renderStateZones(el, state, onChange) {
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
    btn.className = 'cx-zone' + (state?.zone === key ? ' active' : '');
    setZoneVars(btn, zone);
    btn.innerHTML = `<b>${zone.name}</b><span>${zone.hint}</span>`;
    btn.addEventListener('click', () => {
      const words = state?.zone === key ? state.words : [];
      circumplexScreen = 'words';
      onChange({ zone: key, words });
    });
    zones.appendChild(btn);
  });

  const neutral = document.createElement('button');
  neutral.type = 'button';
  neutral.className = 'cx-neutral' + (state?.zone === 'neutral' ? ' active' : '');
  neutral.textContent = 'Рівно';
  neutral.title = 'Нейтрально: ні добре, ні погано';
  neutral.addEventListener('click', () => onChange({ zone: 'neutral', words: [] }));
  zones.appendChild(neutral);
}

function renderStateWords(el, state, onChange) {
  const zone = CIRCUMPLEX_ZONES[state.zone];
  el.innerHTML = `
    <div class="cx-words-head">
      <span class="cx-pill"></span>
      <button type="button" class="text-btn cx-back">← Інша зона</button>
    </div>
    <p class="step-question">Як саме?</p>
    <p class="card-hint">Оберіть 1–${CIRCUMPLEX_MAX_WORDS} слова, від легшого до сильнішого</p>
    <div class="chips"></div>
    <div class="cx-scores"></div>`;
  const pill = el.querySelector('.cx-pill');
  pill.textContent = zone.name;
  setZoneVars(pill, zone);

  el.querySelector('.cx-back').addEventListener('click', () => {
    circumplexScreen = 'zones';
    onChange(state);
  });

  const chips = el.querySelector('.chips');
  zone.words.forEach((word) => {
    const selected = state.words.includes(word.text);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (selected ? ' active' : '');
    setZoneVars(chip, zone);
    chip.textContent = word.text;
    chip.addEventListener('click', () => {
      let words = state.words;
      if (selected) words = words.filter((w) => w !== word.text);
      else if (words.length < CIRCUMPLEX_MAX_WORDS) words = [...words, word.text];
      else return;
      onChange({ ...state, words });
    });
    chips.appendChild(chip);
  });

  const scoresEl = el.querySelector('.cx-scores');
  if (isStateFilled(state)) {
    const { v, a } = stateScores(state);
    scoresEl.innerHTML = `<span>Приємність <b>${formatScore(v)}</b></span><span>Енергія <b>${formatScore(a)}</b></span>`;
  } else {
    scoresEl.textContent = 'Бали з\'являться, щойно оберете слово';
  }
}

// Маленька мапа стану: точка на сітці приємність × енергія
function stateMiniMap(state, size = 64) {
  const { v, a } = stateScores(state);
  const half = size / 2;
  const x = half + (v / CIRCUMPLEX_RANGE) * (half - 6);
  const y = half - (a / CIRCUMPLEX_RANGE) * (half - 6);
  const quad = (key, qx, qy) => `<rect x="${qx}" y="${qy}" width="${half - 1}" height="${half - 1}" rx="4" fill="${CIRCUMPLEX_ZONES[key].bg}"/>`;
  return `
    <svg class="cx-map" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      ${quad('red', 0, 0)}${quad('yellow', half + 1, 0)}${quad('blue', 0, half + 1)}${quad('green', half + 1, half + 1)}
      <circle cx="${x}" cy="${y}" r="5" fill="${CIRCUMPLEX_ZONES[state.zone].color}" stroke="#fff" stroke-width="1.5"/>
    </svg>`;
}
