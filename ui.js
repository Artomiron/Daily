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
