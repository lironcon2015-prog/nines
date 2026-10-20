/* ניהול הקטגוריות: הוספה, שינוי שם, מחיקה וסדר.

   קטגוריה נשמרת במזהה ולא בשם, ולכן שינוי שם לא מנתק סרטונים. מחיקה לא
   מוחקת סרטונים — הם עוברים ל"בלי קטגוריה". אותו מסך כמו בספריית הסרטונים.
   הסדר כאן הוא הסדר בשורת הקטגוריות ובאזורים במסך הראשי. */

import {
  listCategories, addCategory, renameCategory, removeCategory, reorderCategories,
  countByCategory, readOnly, reload
} from './videos.js';
import { syncNow, onSync } from './sync.js';
import { el, icon, toast, confirmBox } from './ui.js';

export function mountCategories(root) {
  reload();
  document.title = 'קטגוריות — תשיעיות';
  let editing = null;
  const viewer = readOnly();

  const changed = () => { paint(); syncNow(); };

  function paint() {
    root.textContent = '';
    root.appendChild(el('a.back', { href: '#/v' }, icon('back'), 'חזרה לסרטונים'));
    root.appendChild(el('div.page-head', null,
      el('div.crest', null, el('span', null, icon('tag'))),
      el('div', null, el('h1', { text: 'קטגוריות' }),
        el('p', { text: viewer ? 'הקטגוריות של הספרייה המשותפת' : 'גרירה בנקודות משנה את הסדר' }))));

    const counts = countByCategory();
    const list = el('div.card.rows');
    listCategories().forEach(c => list.appendChild(editing === c.id ? editRow(c, counts[c.id] || 0) : row(c, counts[c.id] || 0)));
    if (counts['']) {
      list.appendChild(el('div.mr.none', null, el('span.grip'), el('span.name', { text: 'בלי קטגוריה' }), el('span.n', { text: String(counts['']) })));
    }
    if (!list.childNodes.length) list.appendChild(el('p.hint', { style: 'padding:1rem 0', text: 'אין קטגוריות. הוסיפו אחת למטה.' }));
    root.appendChild(list);

    if (viewer) return;
    const input = el('input.inp', { type: 'text', id: 'c-new', placeholder: 'שם קטגוריה חדשה — למשל בעיטות חופשיות' });
    const add = () => {
      const made = addCategory(input.value);
      if (!made) { input.focus(); return; }
      toast('נוספה "' + made.name + '"');
      changed();
      const again = document.getElementById('c-new');
      if (again) again.focus();
    };
    input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
    root.appendChild(el('div.row', { style: 'margin-top:1rem' }, input, el('button.btn', { type: 'button', onclick: add }, icon('plus'), 'הוספה')));
    root.appendChild(el('p.hint', { style: 'margin-top:.8rem', text: 'מחיקת קטגוריה לא מוחקת סרטונים. הם עוברים ל"בלי קטגוריה".' }));
  }

  function row(c, n) {
    const r = el('div.mr', { 'data-id': c.id });
    const grip = el('button.grip', { type: 'button', 'aria-label': 'גרירה לשינוי הסדר' }, icon('grip'));
    if (viewer) grip.style.visibility = 'hidden';
    else wireDrag(grip, r);
    r.append(grip, el('span.name', { text: c.name }), el('span.n', { text: String(n) }));
    if (!viewer) {
      r.appendChild(el('button.icon-btn', { type: 'button', 'aria-label': 'עריכת ' + c.name, onclick: () => { editing = c.id; paint(); focusEdit(); } }, icon('pen')));
    }
    return r;
  }

  function editRow(c, n) {
    const r = el('div.mr.edit', { 'data-id': c.id });
    const input = el('input.inp', { type: 'text', id: 'c-edit', value: c.name });
    const save = () => {
      if (input.value.trim() && input.value.trim() !== c.name) { renameCategory(c.id, input.value); toast('השם שונה'); }
      editing = null;
      changed();
    };
    input.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { editing = null; paint(); }
    };
    const del = el('button.icon-btn', { type: 'button', 'aria-label': 'מחיקת ' + c.name }, icon('trash'));
    const tools = el('div.row', null,
      el('button.btn.sm.gold', { type: 'button', text: 'שמירה', onclick: save }),
      el('button.btn.sm.quiet', { type: 'button', text: 'ביטול', onclick: () => { editing = null; paint(); } }), del);
    del.onclick = () => {
      tools.hidden = true;
      const ask = n ? 'למחוק את "' + c.name + '"? ' + n + ' סרטונים יעברו ל"בלי קטגוריה" ולא יימחקו.' : 'למחוק את "' + c.name + '"?';
      r.appendChild(confirmBox(ask, 'מחיקה', () => {
        removeCategory(c.id);
        editing = null;
        toast('נמחקה "' + c.name + '"');
        changed();
      }, () => { tools.hidden = false; }));
    };
    r.append(input, tools);
    return r;
  }

  function focusEdit() {
    const input = document.getElementById('c-edit');
    if (input) { input.focus(); input.select(); }
  }

  /* גרירה באצבע על הנקודות. השורה זזה עם האצבע, ועוברת מקום כשהאצבע
     חוצה את אמצע השכנה. touch-action:none על הידית — אחרת הדף נגלל. */
  function wireDrag(grip, r) {
    grip.onpointerdown = e => {
      if (e.button) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const startY = e.clientY;
      const startTop = r.offsetTop;
      r.classList.add('dragging');
      const siblings = () => [...r.parentNode.querySelectorAll('.mr[data-id]')];
      const move = ev => {
        const all = siblings();
        const i = all.indexOf(r);
        const prev = all[i - 1];
        const next = all[i + 1];
        if (prev) { const b = prev.getBoundingClientRect(); if (ev.clientY < b.top + b.height / 2) r.parentNode.insertBefore(r, prev); }
        if (next) { const b = next.getBoundingClientRect(); if (ev.clientY > b.top + b.height / 2) r.parentNode.insertBefore(next, r); }
        r.style.transform = 'translateY(' + (ev.clientY - startY - (r.offsetTop - startTop)) + 'px)';
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        r.classList.remove('dragging');
        r.style.transform = '';
        const ids = siblings().map(x => x.dataset.id);
        const before = listCategories().map(c => c.id);
        if (ids.join() !== before.join()) { reorderCategories(ids); changed(); }
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    };
  }

  paint();
  const off = onSync(ch => { if (ch && !root.hidden && !editing) paint(); });
  return { destroy() { off(); root.textContent = ''; } };
}
