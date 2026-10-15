// Спільні елементи інтерфейсу: тост зі «Скасувати» та закриття шторок свайпом униз.

// ---------- Тост зі «Скасувати» ----------
// Замість підтверджень «Ви впевнені?» дія виконується одразу, а тост кілька секунд пропонує її скасувати.

const UNDO_DURATION = 5000;
let undoTimer = null;
let undoAction = null;

function showUndo(text, onUndo) {
  const toast = document.getElementById('undo-toast');
  document.getElementById('undo-text').textContent = text;
  undoAction = onUndo;
  toast.hidden = false;
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');
  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndo, UNDO_DURATION);
}

function hideUndo() {
  clearTimeout(undoTimer);
  undoAction = null;
  const toast = document.getElementById('undo-toast');
  toast.classList.remove('show');
  toast.hidden = true;
}

document.getElementById('undo-btn').addEventListener('click', () => {
  const action = undoAction;
  hideUndo();
  if (action) action();
});

// ---------- Шторки: «ручка» і свайп униз ----------
// Тягнути можна за верхню частину (ручку й рядок навігації), щоб не заважати прокрутці вмісту.

const SHEET_CLOSE_DISTANCE = 110;

function attachSheetDrag(sheet, close) {
  const panel = sheet.querySelector('.sheet-panel');
  const grips = sheet.querySelectorAll('.sheet-handle, .sheet-nav');
  let startY = null;
  let dy = 0;

  const onStart = (e) => {
    if (e.target.closest('button, input')) return;
    startY = e.touches[0].clientY;
    dy = 0;
    panel.style.transition = 'none';
  };
  const onMove = (e) => {
    if (startY == null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    panel.style.transform = `translateY(${dy}px)`;
  };
  const onEnd = () => {
    if (startY == null) return;
    startY = null;
    panel.style.transition = 'transform 0.22s ease-out';
    if (dy > SHEET_CLOSE_DISTANCE) {
      panel.style.transform = 'translateY(100%)';
      setTimeout(() => {
        close();
        panel.style.transform = '';
        panel.style.transition = '';
      }, 200);
    } else {
      panel.style.transform = '';
    }
  };

  grips.forEach((grip) => {
    grip.addEventListener('touchstart', onStart, { passive: true });
    grip.addEventListener('touchmove', onMove, { passive: true });
    grip.addEventListener('touchend', onEnd);
    grip.addEventListener('touchcancel', onEnd);
  });
}

// ---------- Смужка тижня ----------
// Спільна для «Сьогодні» й «Задач»: місяць (тап — системний календар), «Сьогодні», стрілки тижнів
// і 7 днів із крапкою стану. Свайп по смужці гортає тижні. Працює з глобальними currentDate і setDate.
//   statusFor(date) → 'none' | 'open' | 'done' — колір крапки під днем
//   extra — елемент, який стане в кінець рядка (наприклад, кнопка магазину)

const WEEK_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function weekStart(date) {
  const day = fromISODate(date).getDay();
  return shiftDate(date, -((day + 6) % 7));
}

function createWeekPicker(root, { statusFor, extra } = {}) {
  root.classList.add('week-picker');
  root.innerHTML = `
    <div class="week-head">
      <label class="month-picker">
        <span class="week-month"></span>
        <svg class="month-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>
        <input type="date" class="week-date-input" aria-label="Обрати дату">
      </label>
      <button type="button" class="week-today" hidden>Сьогодні</button>
      <button type="button" class="week-nav week-prev" aria-label="Попередній тиждень">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <button type="button" class="week-nav week-next" aria-label="Наступний тиждень">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>
    <div class="week-strip" role="tablist" aria-label="Дні тижня"></div>`;
  if (extra) root.querySelector('.week-head').appendChild(extra);

  const input = root.querySelector('.week-date-input');
  const strip = root.querySelector('.week-strip');

  root.querySelector('.week-prev').addEventListener('click', () => setDate(shiftDate(currentDate, -7)));
  root.querySelector('.week-next').addEventListener('click', () => setDate(shiftDate(currentDate, 7)));
  root.querySelector('.week-today').addEventListener('click', () => setDate(todayISO()));
  input.addEventListener('change', () => {
    if (input.value) setDate(input.value);
  });
  // На десктопі прозоре поле дати не відкриває календар саме — допомагаємо
  input.addEventListener('click', () => {
    try {
      input.showPicker?.();
    } catch {}
  });

  let touchX = null;
  strip.addEventListener('touchstart', (e) => {
    touchX = e.touches[0].clientX;
  }, { passive: true });
  strip.addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) setDate(shiftDate(currentDate, dx < 0 ? 7 : -7));
  });

  function render() {
    const today = todayISO();
    const selected = fromISODate(currentDate);
    const month = selected.toLocaleDateString('uk-UA', { month: 'long' });
    const year = selected.getFullYear() !== new Date().getFullYear() ? ` ${selected.getFullYear()}` : '';
    root.querySelector('.week-month').textContent = capitalize(month) + year;
    root.querySelector('.week-today').hidden = currentDate === today;
    input.value = currentDate;

    strip.innerHTML = '';
    const start = weekStart(currentDate);
    for (let i = 0; i < 7; i++) {
      const date = shiftDate(start, i);
      const d = fromISODate(date);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', date === currentDate);
      btn.className = 'week-day' + (date === currentDate ? ' selected' : '') + (date === today ? ' today' : '');
      btn.innerHTML = `
        <span class="week-day-name">${WEEK_SHORT[d.getDay()]}</span>
        <span class="week-day-num">${d.getDate()}</span>
        <span class="week-day-dot ${statusFor ? statusFor(date) : 'none'}"></span>`;
      btn.setAttribute('aria-label', capitalize(formatLongDate(date)));
      btn.addEventListener('click', () => setDate(date));
      strip.appendChild(btn);
    }
  }

  return { render };
}

// ---------- Клавіатура і шторки ----------
// На iOS і в Android Chrome клавіатура не зменшує сторінку, а лише ховає її низ, тож прикріплена
// до низу шторка опиняється під клавіатурою. Стежимо за видимою областю (visualViewport) і передаємо
// її в CSS: шторки займають рівно видиму частину екрана й стоять над клавіатурою.

function trackVisibleViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const update = () => {
    root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    root.style.setProperty('--vv-height', `${vv.height}px`);
    // Клавіатура відкрита, якщо видима область помітно нижча за вікно
    root.classList.toggle('keyboard-open', window.innerHeight - vv.height > 120);
    // Поле, в яке друкують, тримаємо у видимій частині шторки
    const field = document.activeElement;
    if (field?.closest?.('.sheet-panel') && /^(INPUT|TEXTAREA)$/.test(field.tagName)) {
      field.scrollIntoView({ block: 'nearest' });
    }
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}

trackVisibleViewport();
