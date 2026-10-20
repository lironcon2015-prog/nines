/* החבילה המלאה — במסך ההגדרות.

   בדף הבית היא מופיעה רק כשאין חבילה בכלל, כי אז היא כל מה שיש לעשות.
   אחרי שנטענה היא פעולה של פעם בהרבה זמן (להחליף, להסיר), ולכן היא כאן.
   העדכון עצמו יורד לבד בפתיחה (app.js); הכרטיס הזה אומר אם זה הצליח. */

import { savePack, fetchPack, clearPack } from './pack.js';
import { el, confirmBox } from './ui.js';

/** pack: {gated, loaded, version, siteVersion} מ-app.js */
export function drawPack(root, pack) {
  if (!pack || !pack.loaded) return;
  const stale = pack.siteVersion && pack.siteVersion !== pack.version;

  root.appendChild(el('h2.section-title', { text: 'החבילה' }));
  const card = el('div.card.stack');
  card.appendChild(el('dl.facts', null,
    el('dt', { text: 'גרסה במכשיר' }), el('dd.num', { text: pack.version || '—' }),
    el('dt', { text: 'גרסה באתר' }), el('dd.num', { text: pack.siteVersion || '—' })));
  /* ההפרש עדיין כאן — ההורדה האוטומטית נכשלה. בלי השורה הזאת זה נראה
     בדיוק כמו "אין עדכון". */
  card.appendChild(el('p.hint', { text: stale
    ? 'יש תוכן חדש, והוא לא ירד למכשיר. פתח שוב עם רשת, או טען את הקובץ.'
    : 'החבילה שמורה במכשיר ועובדת גם בלי רשת. עדכון יורד לבד כשיש חדש.' }));

  const err = el('div.err', { hidden: true });
  const show = e => { err.hidden = false; err.textContent = e.detail ? e.message + '\n' + e.detail : e.message; };
  /* אחרי טעינה מרעננים: התוכן נקרא בפתיחה, וכל מסך שכבר עומד מחזיק את הישן */
  const done = () => { location.hash = '#/'; location.reload(); };

  const input = el('input', { type: 'file', id: 'pack-file2', accept: '.json,application/json', hidden: true });
  input.onchange = async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    try { savePack(await f.text(), f.name + ' · ' + f.size + ' בתים'); done(); } catch (e) { show(e); }
  };
  const pick = el('button.btn', { type: 'button', text: 'החלפת קובץ', onclick: () => input.click() });

  const urlRow = el('div.row', { hidden: true });
  const url = el('input.inp.ltr', { type: 'url', id: 'pack-url2', inputmode: 'url', placeholder: 'https://…/pack/all.json' });
  url.setAttribute('autocomplete', 'off');
  const load = el('button.btn', { type: 'button', text: 'טען' });
  load.onclick = async () => {
    err.hidden = true;
    load.disabled = true;
    try { await fetchPack(url.value); done(); } catch (e) { show(e); } finally { load.disabled = false; }
  };
  urlRow.append(url, load);
  const byUrl = el('button.btn', { type: 'button', text: 'מכתובת', onclick: () => { urlRow.hidden = !urlRow.hidden; if (!urlRow.hidden) url.focus(); } });

  const drop = el('button.btn.quiet', { type: 'button', text: 'הסרת החבילה מהמכשיר' });
  drop.onclick = () => {
    drop.hidden = true;
    card.appendChild(confirmBox('להסיר את החבילה? התפקידים ייעלמו עד שתטען אותה שוב.', 'הסרה',
      () => { clearPack(); done(); }, () => { drop.hidden = false; }));
  };

  card.append(el('div.two', null, pick, byUrl), urlRow, input, err, drop);
  root.appendChild(card);
}
