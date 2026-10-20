/* חלקים קטנים שכל המסכים משתמשים בהם: בניית אלמנטים, הודעה קופצת,
   שכבות (גיליון, נגן) שנסגרות ב"חזרה", ונעילת גלילה שעובדת באייפון. */

export const $ = id => document.getElementById(id);

/** el('div.card', {onclick}, child, 'text') */
export function el(spec, attrs, ...kids) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on')) node[k] = v;
      else if (k === 'text') node.textContent = v;
      else if (k in node && typeof v !== 'string') node[k] = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
  }
  kids.flat().forEach(kid => {
    if (kid === null || kid === undefined || kid === false) return;
    node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  });
  return node;
}

export function icon(name, cls) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'i' + (cls ? ' ' + cls : ''));
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.appendChild(use);
  return svg;
}

/* --- הודעה קופצת --- */
let toastTimer = 0;
export function toast(text, action) {
  const box = $('toast');
  box.textContent = '';
  box.appendChild(el('span', { text }));
  if (action) box.appendChild(el('button', { type: 'button', text: action.label, onclick: () => { hideToast(); action.run(); } }));
  box.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 6000 : 2600);
}
function hideToast() { $('toast').classList.remove('on'); }

/* --- תאריכים --- */
export function whenText(ms) {
  const day = 24 * 60 * 60 * 1000;
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const diff = midnight.getTime() - new Date(ms).setHours(0, 0, 0, 0);
  if (diff <= 0) return 'היום';
  if (diff <= day) return 'אתמול';
  return new Date(ms).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
}

export function agoText(ms) {
  if (!ms) return '';
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return 'לפני ' + mins + ' דק׳';
  const hours = Math.round(mins / 60);
  if (hours < 24) return 'לפני ' + hours + ' שע׳';
  return whenText(ms);
}

/* --- נעילת גלילה ---
   overflow:hidden על ה-body אינו נועל את סאפרי בטלפון (nines נפל בזה
   פעמיים). מקבעים את הדף עצמו במקום שבו הוא נראה, ומחזירים בסגירה. */
let locks = 0;
let lockedAt = 0;
function lock() {
  if (locks++) return;
  lockedAt = window.scrollY || 0;
  Object.assign(document.body.style, { position: 'fixed', top: -lockedAt + 'px', left: '0', right: '0', width: '100%' });
}
function unlock() {
  if (!locks || --locks) return;
  Object.assign(document.body.style, { position: '', top: '', left: '', right: '', width: '' });
  window.scrollTo(0, lockedAt);
}

/* --- שכבות ---
   כל שכבה פתוחה מחזיקה צעד אחד בהיסטוריה, כך ש"חזרה" בטלפון סוגרת אותה
   ולא יוצאת מהאפליקציה. סגירה בכפתור מורידה את הצעד בעצמה.

   history.back() הוא אסינכרוני: pushState שנשלח מיד אחריו (סגירת הנגן
   ופתיחת העריכה בלחיצה אחת) נוחת לפני החזרה, והחזרה מורידה אותו במקום
   את הישן — הגיליון החדש נסגר ברגע שנפתח. לכן פתיחה חדשה מחכה עד שכל
   החזרות שנשלחו נחתו (afterLayers). */
const layers = [];
let pendingBacks = 0;
let waiting = [];

window.addEventListener('popstate', () => {
  if (pendingBacks) {
    pendingBacks--;
    if (!pendingBacks) { const run = waiting; waiting = []; run.forEach(fn => fn()); }
    return;
  }
  const top = layers.pop();
  if (top) top.close(true);
});

export function afterLayers(fn) {
  if (pendingBacks) waiting.push(fn); else fn();
}

/** פותח שכבה. close(fromBack) מסיר אותה מהמסך. מחזיר פונקציית סגירה. */
export function openLayer(remove) {
  const layer = { close: null };
  let closed = false;
  layer.close = fromBack => {
    if (closed) return;
    closed = true;
    remove();
    unlock();
    if (!fromBack) {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
      if (history.state && history.state.rcLayer) { pendingBacks++; history.back(); }
    }
  };
  lock();
  layers.push(layer);
  try { history.pushState({ rcLayer: layers.length }, '', location.href); } catch (e) { /* בלי היסטוריה — סוגרים בכפתור */ }
  return () => layer.close(false);
}

export function closeAllLayers() {
  while (layers.length) layers[layers.length - 1].close(false);
}

export function onEscape(fn) {
  const h = e => { if (e.key === 'Escape') fn(); };
  document.addEventListener('keydown', h);
  return () => document.removeEventListener('keydown', h);
}

/** גיליון תחתון. מחזיר {body, close}. */
export function sheet(title, build) {
  const scrim = el('div.scrim');
  const box = el('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const head = el('div.sheet-head', null, el('h2', { text: title }));
  const shut = el('button.icon-btn', { type: 'button', 'aria-label': 'סגירה' }, icon('x'));
  head.appendChild(shut);
  const body = el('div');
  box.append(el('div.grab'), head, body);
  let offKey = null;
  const close = openLayer(() => {
    if (offKey) offKey();
    scrim.classList.remove('on');
    box.classList.remove('on');
    setTimeout(() => { scrim.remove(); box.remove(); }, 260);
  });
  scrim.onclick = close;
  shut.onclick = close;
  offKey = onEscape(close);
  document.body.append(scrim, box);
  requestAnimationFrame(() => { scrim.classList.add('on'); box.classList.add('on'); });
  build(body, close);
  return { body, close };
}

/** אישור בתוך הדף — confirm() לא קיים בכל מקום ולא נראה כמו האפליקציה */
export function confirmBox(text, yes, onYes, onNo) {
  const box = el('div.confirm', null, el('span', { text }));
  const row = el('div.row');
  row.append(
    el('button.btn.sm', { type: 'button', text: yes, onclick: onYes }),
    el('button.btn.sm.quiet', { type: 'button', text: 'ביטול', onclick: () => { box.remove(); if (onNo) onNo(); } })
  );
  box.appendChild(row);
  return box;
}

/** הדבקה מהלוח. באייפון מופיעה בועת "הדבק" — זה תקין. */
export async function readClipboard() {
  try {
    return (await navigator.clipboard.readText()) || '';
  } catch (e) {
    return null;
  }
}
