/* הספרייה המשותפת והגדרות (⚙): המנוע, והמסך.

   המנוע: משיכה, מיזוג פריט מול פריט, ודחיפה חזרה רק כשיש מה לדחוף. המסך:
   שלושה מצבים לפי מי אתה — לא מחובר, בעלים, צופה. אותו קובץ כמו בספריית
   המתכונים (Recipes/js/sync.js), פחות הטקסטים וערכת הצבעים.

   צופה = הילד, שקיבל קישור הצטרפות: רואה ומנגן, לא מוסיף.
   ההפרדה נאכפת בסקריפט; הסתרת הכפתורים כאן היא נוחות. */

import * as cloud from './cloud.js';
import { reload, exportDoc, applyRemote, videoCount } from './videos.js';
import { probe } from './preview.js';
import { el, icon, agoText, confirmBox } from './ui.js';

export const state = { busy: false, at: 0, error: '' };
const listeners = new Set();
export function onSync(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const tell = changed => listeners.forEach(fn => fn(changed));

/* האם למשוך שם ותמונה מהרשת. ברירת המחדל כן: בלי זה אין תמונות ואין
   פתיחה של קישור מקוצר. מי שמעדיף שהקישורים לא יצאו מהמכשיר מכבה. */
const AUTO_KEY = 'k8:videos:auto';   // אותו מפתח כמו בגרסה הקודמת — הבחירה נשמרת
export const autoOn = () => { try { return localStorage.getItem(AUTO_KEY) !== 'off'; } catch (e) { return true; } };
const setAuto = on => { try { localStorage.setItem(AUTO_KEY, on ? 'on' : 'off'); } catch (e) { /* לא קריטי */ } };

/** משיכה, מיזוג, ודחיפה חזרה כשיש מה לדחוף */
export async function syncNow() {
  if (!cloud.isOn() || state.busy) return;
  state.busy = true;
  state.error = '';
  tell(false);
  let changed = false;
  try {
    const remote = await cloud.pull();
    changed = applyRemote(remote);
    /* צופה אינו דוחף לעולם. בעלים דוחף רק אם יש אצלו משהו מאוחר יותר
       ממה שבצד השני — אחרת כל פתיחה הייתה כותבת מחדש בלי סיבה. */
    if (!cloud.isViewer()) {
      const mine = exportDoc();
      if (changed || newerThan(mine, remote)) {
        const merged = await cloud.push(mine);
        if (merged && applyRemote(merged)) changed = true;
      }
    }
    state.at = Date.now();
  } catch (e) {
    state.error = String((e && e.message) || 'הסנכרון נכשל');
  } finally {
    state.busy = false;
    tell(changed);
  }
}

function newerThan(mine, remote) {
  if (!remote) return true;
  const stamp = list => new Map((list || []).map(x => [x.id, x.updatedAt || 0]));
  const theirVideos = stamp(remote.videos);
  const theirCats = stamp(remote.categories);
  const theirSessions = stamp(remote.sessions);
  const ahead = (list, map) => (list || []).some(x => (x.updatedAt || 0) > (map.get(x.id) || 0));
  /* אימון שנשמר ביומן הוא שינוי בלי אף סרטון — בלי השורה השלישית הוא היה
     נשאר בטלפון של המאמן ולא מגיע לבן */
  return ahead(mine.videos, theirVideos) || ahead(mine.categories, theirCats)
    || ahead(mine.sessions, theirSessions);
}

/* חיבור ראשון של מכשיר שכבר יש בו סרטונים: מה שכאן עולה, ומה ששם יורד */
async function firstSync() {
  const remote = await cloud.pull();
  applyRemote(remote);
  const merged = await cloud.push(exportDoc());
  if (merged) applyRemote(merged);
  state.at = Date.now();
  state.error = '';
}

/* --- המסך --- */

const SHORT = url => url.replace(/^https:\/\/script\.google\.com\/macros\/s\//, '…/');

function appBase() { return location.origin + location.pathname; }

function field(label, attrs) {
  const input = el('input.inp', Object.assign({ autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false' }, attrs));
  return { wrap: el('label.field', null, el('span', { text: label }), input), input };
}

/** prefill: {url, code} מקישור הצטרפות, או null. extra(root): עוד אזורים
    בסוף המסך — בתשיעיות, החבילה. */
export function mountSync(root, prefill, extra) {
  document.title = 'הגדרות — תשיעיות';
  const paint = () => {
    root.textContent = '';
    root.appendChild(el('a.back', { href: '#/' }, icon('back'), 'בית'));
    if (prefill) drawJoin(root, prefill, () => { prefill = null; paint(); });
    else if (cloud.isOwner()) drawOwner(root, paint);
    else if (cloud.isViewer()) drawViewer(root, paint);
    else drawSetup(root, paint);
    if (!prefill) drawLook(root);
    if (!cloud.isViewer() && !prefill) drawPrefs(root);
    if (!prefill && extra) extra(root);
  };
  paint();
  const off = onSync(() => { if (!root.hidden && cloud.isOn()) paint(); });
  return { destroy() { off(); root.textContent = ''; } };
}

function head(root, title, sub) {
  root.appendChild(el('div.page-head', null,
    el('div.crest', null, el('span', null, icon('cloud'))),
    el('div', null, el('h1', { text: title }), sub ? el('p', { text: sub }) : null)));
}

function errorBox() {
  const box = el('div.err', { hidden: true });
  return {
    box,
    show(e) {
      box.hidden = false;
      box.textContent = (e && e.message) || 'משהו לא עבד';
      /* מה שבאמת היה בשדה, בשלמותו ועם תווים בלתי נראים כקוד — כשכתובת
         נראית תקינה והבדיקה נכשלת, זו הדרך היחידה לראות למה */
      if (e && e.detail) box.appendChild(el('code', { text: e.detail }));
    },
    hide() { box.hidden = true; }
  };
}

function drawSetup(root, paint) {
  head(root, 'ספרייה משותפת', 'כרגע הסרטונים שמורים רק במכשיר הזה');
  const card = el('div.card.stack');
  root.appendChild(card);
  card.appendChild(el('p.hint', { text: 'ספריית הסרטונים יכולה לשבת בתיקיית דרייב שלך, ולהיראות זהה בטלפון שלך ובטלפון של הילד. אין התחברות לחשבון ואין סיסמה — רק כתובת של הסקריפט שהקמת, והקוד שלו.' }));
  const url = field('כתובת הסקריפט', { type: 'url', inputmode: 'url', placeholder: 'https://script.google.com/macros/s/…/exec' });
  url.input.classList.add('ltr');
  const code = field('קוד הכתיבה', { type: 'text', placeholder: 'הקוד שהסקריפט הדפיס ביומן' });
  code.input.classList.add('ltr');
  const err = errorBox();
  const go = el('button.btn.gold.wide', { type: 'button', text: 'חיבור' });
  go.onclick = async () => {
    err.hide();
    go.disabled = true;
    go.textContent = 'בודק…';
    try {
      const found = await cloud.ping(url.input.value, code.input.value);
      cloud.setConfig(found);
      reload();
      await firstSync();
      tell(true);
      paint();
    } catch (e) {
      err.show(e);
      go.disabled = false;
      go.textContent = 'חיבור';
    }
  };
  card.append(url.wrap, code.wrap, err.box, go);

  const how = el('details.box.card');
  how.appendChild(el('summary', { text: 'איך מקימים את הסקריפט — פעם אחת' }));
  const ol = el('ol.how');
  [
    'script.google.com ← פרויקט חדש, והדבקת כל הקוד מהקובץ apps-script/Code.gs שבריפו nines.',
    'בחירת הפונקציה setup למעלה ← ▶ הפעלה, ואישור ההרשאות. היא יוצרת בדרייב את התיקייה "תשיעיות" ואת הקודים, ומדפיסה ביומן את קוד הכתיבה.',
    'פריסה ← פריסה חדשה ← אפליקציית אינטרנט. הרצה בשם: אני. מי יש לו גישה: כל מי שיש לו הקישור.',
    'העתקת הכתובת שמסתיימת ב-‎/exec, והדבקה כאן עם קוד הכתיבה.'
  ].forEach(t => ol.appendChild(el('li', { text: t })));
  how.appendChild(ol);
  how.appendChild(el('p.hint', { text: 'בעדכון של הסקריפט בהמשך — עורכים את הפריסה הקיימת (גרסה חדשה), לא יוצרים פריסה חדשה. פריסה חדשה מקבלת כתובת אחרת.' }));
  root.appendChild(el('h2.section-title', { text: 'הקמה' }));
  root.appendChild(how);

  /* הצטרפות לספרייה של מישהו אחר — למשל מכשיר שני שרק צופה */
  root.appendChild(el('h2.section-title', { text: 'קיבלת קישור הצטרפות?' }));
  const other = el('div.card.stack');
  const link = field('הקישור שקיבלת', { type: 'text', placeholder: 'הדבקת הקישור' });
  const perr = errorBox();
  const join = el('button.btn.wide', { type: 'button', text: 'הצטרפות' });
  join.onclick = () => {
    const found = cloud.decodeJoin(link.input.value);
    if (!found) {
      perr.show({ message: 'הקישור לא נראה תקין. העתק אותו שוב, שלם, מההודעה.', detail: cloud.reveal(link.input.value) });
      return;
    }
    root.textContent = '';
    root.appendChild(el('a.back', { href: '#/' }, icon('back'), 'בית'));
    drawJoin(root, found, paint);
  };
  other.append(link.wrap, perr.box, join);
  root.appendChild(other);
}

function drawJoin(root, found, done) {
  head(root, 'הצטרפות לספרייה', 'אחרי ההצטרפות תראה את אותם סרטונים, ותוכל לנגן כל אחד');
  const card = el('div.card.stack');
  card.appendChild(el('dl.facts', null, el('dt', { text: 'הספרייה' }), el('dd.num', { text: SHORT(found.url) })));
  const keep = videoCount();
  if (keep) card.appendChild(el('p.hint', { text: keep + ' הסרטונים ששמורים כאן עכשיו לא יימחקו. הם ימתינו, ויחזרו אם תתנתק.' }));
  const err = errorBox();
  const go = el('button.btn.gold.wide', { type: 'button', text: 'הצטרפות' });
  go.onclick = async () => {
    err.hide();
    go.disabled = true;
    go.textContent = 'מצטרף…';
    try {
      const conf = await cloud.ping(found.url, found.code);
      cloud.setConfig(conf);
      reload();
      if (conf.mode === 'owner') await firstSync();
      else { applyRemote(await cloud.pull()); state.at = Date.now(); }
      tell(true);
      location.hash = '#/v';
    } catch (e) {
      err.show(e);
      go.disabled = false;
      go.textContent = 'הצטרפות';
    }
  };
  card.append(err.box, go, el('button.btn.quiet.wide', { type: 'button', text: 'לא עכשיו', onclick: () => { location.hash = '#/'; } }));
  root.appendChild(card);
  return done;
}

function statusLine() {
  if (state.busy) return 'מסנכרן…';
  if (state.error) return state.error;
  return state.at ? 'סונכרן ' + agoText(state.at) : 'עוד לא סונכרן בביקור הזה';
}

function drawOwner(root, paint) {
  const conf = cloud.config();
  head(root, 'הספרייה משותפת', conf.name || 'ספרייה משותפת');
  const card = el('div.card.stack');
  card.appendChild(el('dl.facts', null,
    el('dt', { text: 'מצב' }), el('dd', { text: statusLine() }),
    el('dt', { text: 'סרטונים' }), el('dd.num', { text: String(videoCount()) }),
    el('dt', { text: 'הסקריפט' }), el('dd.num', { text: SHORT(conf.url) })));
  const now = el('button.btn.wide', { type: 'button', disabled: state.busy }, icon('sync'), 'סנכרון עכשיו');
  now.onclick = () => syncNow();
  card.appendChild(now);
  root.appendChild(card);

  /* קישור צפייה: נושא את הכתובת ואת קוד הקריאה. מי שמקבל רואה ומנגן,
     ולא מוסיף, עורך או מוחק. כדי לסנכרן מכשיר שני *שלך* (עם עריכה)
     מתחברים בו עם הכתובת וקוד הכתיבה, לא עם הקישור הזה. */
  root.appendChild(el('h2.section-title', { text: 'הקישור לשליחה לילד' }));
  const share = el('div.card.stack');
  const link = appBase() + '#/join/' + cloud.joinPayload(conf.readCode);
  share.append(
    el('p.hint', { text: 'מי שמקבל את הקישור רואה את כל הספרייה ומנגן, אבל לא מוסיף, לא עורך ולא מוחק. אל תשים בה משהו שלא היית שולח בוואטסאפ. למכשיר שני שלך — חיבור עם הכתובת וקוד הכתיבה.' }),
    el('div.link-out', { text: link })
  );
  const row = el('div.acts');
  if (navigator.share) {
    row.appendChild(el('button.btn', { type: 'button', text: 'שליחה', onclick: () => {
      navigator.share({ title: 'ספריית הסרטונים', text: 'הצטרף לספריית הסרטונים שלנו', url: link }).catch(() => { /* ביטול */ });
    } }));
  }
  const copy = el('button.btn', { type: 'button', text: 'העתקה' });
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(link); copy.textContent = 'הועתק'; }
    catch (e) { copy.textContent = 'סמנו והעתיקו ידנית'; }
    setTimeout(() => { copy.textContent = 'העתקה'; }, 1800);
  };
  row.appendChild(copy);
  share.appendChild(row);
  root.appendChild(share);

  root.appendChild(disconnectBtn('ניתוק המכשיר הזה', 'לנתק? הסרטונים שכבר כאן יישארו, וההוספות החדשות לא יגיעו לצד השני.', paint));
}

function drawViewer(root, paint) {
  const conf = cloud.config();
  head(root, 'מחובר לספרייה משותפת', conf.name || 'ספרייה משותפת');
  const card = el('div.card.stack');
  card.appendChild(el('dl.facts', null,
    el('dt', { text: 'מצב' }), el('dd', { text: statusLine() }),
    el('dt', { text: 'התפקיד שלך' }), el('dd', { text: 'צפייה בלבד' }),
    el('dt', { text: 'סרטונים' }), el('dd.num', { text: String(videoCount()) })));
  card.appendChild(el('button.btn.wide', { type: 'button', onclick: () => syncNow() }, icon('sync'), 'סנכרון עכשיו'));
  root.appendChild(card);
  root.appendChild(disconnectBtn('התנתקות', 'להתנתק? הספרייה המשותפת תיעלם מכאן, ומה שהיה במכשיר לפני כן יחזור.', paint));
}

function disconnectBtn(label, ask, paint) {
  const wrap = el('div', { style: 'margin-top:1rem' });
  const b = el('button.btn.quiet.wide', { type: 'button', text: label });
  b.onclick = () => {
    b.hidden = true;
    wrap.appendChild(confirmBox(ask, label, () => {
      cloud.disconnect();
      reload();
      state.at = 0; state.error = '';
      tell(true);
      paint();
    }, () => { b.hidden = false; }));
  };
  wrap.appendChild(b);
  return wrap;
}

/* --- ערכת הצבעים ---
   בהיר כברירת מחדל: ילדים קוראים את החוברת גם בחוץ, ומסך בהיר קריא יותר
   בשמש. כהה — בחירה, נשמרת במכשיר. הסקריפט הקטן ב-index.html קורא אותה
   לפני הציור הראשון, כדי שלא יהיה הבזק בהיר. */
const THEME_KEY = 'k8:theme';
export function applyTheme(dark) {
  if (dark) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#0A1321' : '#F3F5F9';
  try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (e) { /* לא קריטי */ }
}

function drawLook(root) {
  root.appendChild(el('h2.section-title', { text: 'תצוגה' }));
  const card = el('div.card.stack');
  const dark = document.documentElement.dataset.theme === 'dark';
  const sw = el('input', { type: 'checkbox', id: 'pref-dark', checked: dark });
  sw.onchange = () => applyTheme(sw.checked);
  card.appendChild(el('label.switch', { for: 'pref-dark' }, sw, 'מצב כהה'));
  card.appendChild(el('p.hint', { text: 'בהיר קריא יותר בשמש, במגרש. כהה נוח יותר בערב.' }));
  root.appendChild(card);
}

function drawPrefs(root) {
  root.appendChild(el('h2.section-title', { text: 'הוספת סרטון' }));
  const card = el('div.card.stack');
  const sw = el('input', { type: 'checkbox', id: 'pref-auto', checked: autoOn() });
  sw.onchange = () => setAuto(sw.checked);
  card.appendChild(el('label.switch', { for: 'pref-auto' }, sw, 'להביא שם ותמונה מהקישור אוטומטית'));
  card.appendChild(el('p.hint', { text: 'כשכבוי, הקישור לא יוצא מהמכשיר לשום שירות — אבל לא יהיו תמונות, וקישור מקוצר לא ינוגן בתוך האפליקציה.' }));
  /* כשמשהו לא עובד בטלפון מסוים — מה כל שירות ענה ותוך כמה זמן */
  const out = el('div', { hidden: true });
  const check = el('button.btn.sm', { type: 'button', text: 'בדיקת השירותים' });
  check.onclick = async () => {
    check.disabled = true;
    check.textContent = 'בודק…';
    const lines = await probe();
    out.hidden = false;
    out.textContent = '';
    const ul = el('ul.how');
    lines.forEach(l => ul.appendChild(el('li', { text: l })));
    out.appendChild(ul);
    check.disabled = false;
    check.textContent = 'בדיקה שוב';
  };
  card.append(check, out);
  root.appendChild(card);
}

