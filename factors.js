// Самоаналіз: що найбільше вплинуло на день. До двох факторів, у кожного напрям —
// допомогло чи завадило, плюс необов'язкове «Чому саме?».
// Дані дня: { items: [{ id, dir: 'up' | 'down' }], why: '' }

const FACTORS = [
  { id: 'sleep', emoji: '😴', name: 'Сон' },
  { id: 'work', emoji: '💼', name: 'Робота/навчання' },
  { id: 'relationships', emoji: '❤️', name: 'Стосунки' },
  { id: 'family', emoji: '🏡', name: 'Сім\'я' },
  { id: 'friends', emoji: '👯', name: 'Друзі' },
  { id: 'health', emoji: '🩺', name: 'Здоров\'я' },
  { id: 'sport', emoji: '🏃', name: 'Спорт/рух' },
  { id: 'food', emoji: '🍽️', name: 'Їжа' },
  { id: 'rest', emoji: '🛋️', name: 'Відпочинок' },
  { id: 'money', emoji: '💰', name: 'Гроші' },
  { id: 'weather', emoji: '🌦️', name: 'Погода' },
  { id: 'nature', emoji: '🌿', name: 'Природа' },
  { id: 'hobby', emoji: '🎨', name: 'Хобі' },
  { id: 'media', emoji: '📱', name: 'Соцмережі/новини' },
  { id: 'loneliness', emoji: '🫥', name: 'Самотність' },
  { id: 'other', emoji: '✳️', name: 'Інше' },
];

const FACTORS_MAX = 2;

const FACTOR_DIRECTIONS = {
  up: { emoji: '👍', text: 'Допомогло' },
  down: { emoji: '👎', text: 'Завадило' },
};

function findFactor(id) {
  return FACTORS.find((f) => f.id === id);
}

function isFactorsFilled(factors) {
  return Boolean(factors?.items?.length && factors.items.every((item) => item.dir));
}

function factorLabel(item) {
  const factor = findFactor(item.id);
  return `${FACTOR_DIRECTIONS[item.dir]?.emoji || ''} ${factor.emoji} ${factor.name}`.trim();
}

function renderFactors(el, factors, onChange) {
  const data = { items: factors?.items || [], why: factors?.why || '' };
  el.innerHTML = `
    <p class="step-question">Що найбільше вплинуло на мій день?</p>
    <p class="card-hint">Оберіть 1–${FACTORS_MAX} головні фактори</p>
    <div class="chips factor-chips"></div>
    <div class="factor-dirs"></div>
    <div class="factor-why" hidden>
      <label class="body-q-title" for="factor-why-input">Чому саме? <span class="body-q-hint">необов'язково</span></label>
      <textarea id="factor-why-input" rows="2" placeholder="Наприклад: нарешті закрив складне завдання"></textarea>
    </div>`;

  const chips = el.querySelector('.factor-chips');
  FACTORS.forEach((factor) => {
    const selected = data.items.some((item) => item.id === factor.id);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (selected ? ' active' : '');
    chip.textContent = `${factor.emoji} ${factor.name}`;
    chip.addEventListener('click', () => {
      let items = data.items;
      if (selected) items = items.filter((item) => item.id !== factor.id);
      else if (items.length < FACTORS_MAX) items = [...items, { id: factor.id, dir: null }];
      else return;
      onChange({ ...data, items });
    });
    chips.appendChild(chip);
  });

  const dirs = el.querySelector('.factor-dirs');
  data.items.forEach((item) => {
    const factor = findFactor(item.id);
    const row = document.createElement('div');
    row.className = 'factor-dir-row';
    row.innerHTML = `<span class="factor-dir-name"></span><div class="factor-dir-btns"></div>`;
    row.querySelector('.factor-dir-name').textContent = `${factor.emoji} ${factor.name}`;
    const btns = row.querySelector('.factor-dir-btns');
    Object.entries(FACTOR_DIRECTIONS).forEach(([dir, info]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `factor-dir-btn factor-dir-${dir}` + (item.dir === dir ? ' active' : '');
      btn.textContent = `${info.emoji} ${info.text}`;
      btn.addEventListener('click', () => {
        const items = data.items.map((i) => (i.id === item.id ? { ...i, dir } : i));
        onChange({ ...data, items });
      });
      btns.appendChild(btn);
    });
    dirs.appendChild(row);
  });

  const why = el.querySelector('.factor-why');
  why.hidden = !data.items.length;
  const whyInput = why.querySelector('textarea');
  whyInput.value = data.why;
  // Без перемальовування, щоб не збивати фокус під час набору
  whyInput.addEventListener('input', () => {
    data.why = whyInput.value;
    onChange({ ...data }, { silent: true });
  });
}

// Статистика факторів за період: скільки разів допомагали/заважали і середня приємність тих днів
function factorStats(periodEntries) {
  const stats = {};
  periodEntries.forEach((entry) => {
    if (!isFactorsFilled(entry.factors)) return;
    const v = isStateFilled(entry.state) ? stateScores(entry.state).v : null;
    entry.factors.items.forEach((item) => {
      const s = stats[item.id] || (stats[item.id] = { id: item.id, up: 0, down: 0, valences: [] });
      s[item.dir]++;
      if (v != null) s.valences.push(v);
    });
  });
  return Object.values(stats)
    .map((s) => ({ ...s, total: s.up + s.down }))
    .sort((a, b) => b.total - a.total);
}
