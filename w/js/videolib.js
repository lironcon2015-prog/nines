/* מסך ספריית הסרטונים: הסרטונים, החיפוש, הקטגוריות, ההוספה והנגן.

   אותו מסך כמו בספריית המתכונים (Recipes/js/library.js) — שם נבנה מחדש
   מהגרסה הקודמת של הקובץ הזה, ושני הצדדים צריכים להישאר זהים חוץ מהטקסטים.
   ההסבר המלא לכל מלכודת בנגינה ובתמונות: הפרק "ספריית הסרטונים" ב-README.

   הפעולה שצריכה להיות הכי קלה היא ההוספה: רואים סרטון באינסטגרם, מעתיקים
   קישור, "הדבק", "שמירה". השם והתמונה נמשכים לבד, והקטגוריה וההערה לא
   חובה. */

import {
  listCategories, addCategory, countByCategory, categoryName,
  listVideos, addVideo, updateVideo, removeVideo, getVideo, videoCount,
  platformName, detectPlatform, embedUrl, isPortrait, playable, mediaFresh,
  posterCandidates, needsPoster, needsDownload, needsUpload, thumbUrl, normalizeUrl,
  readOnly, reload
} from './videos.js';
import { needsResolve, lookup, refreshMedia, fetchPoster } from './preview.js';
import * as cloud from './cloud.js';
import * as posters from './posters.js';
import { state as sync, syncNow, onSync, autoOn } from './sync.js';
import { $, el, icon, toast, whenText, agoText, sheet, openLayer, onEscape, afterLayers, readClipboard } from './ui.js';

/* פלטפורמות שהדף שלהן מצהיר על קובץ וידאו או ניתן לשיבוץ */
const FETCHABLE = new Set(['facebook', 'instagram', 'tiktok', 'youtube', 'x', 'vimeo']);

/* רשת או לפי קטגוריה — הבחירה נשמרת במכשיר */
const VIEW_KEY = 'k8:videos:view';
const readView = () => { try { return localStorage.getItem(VIEW_KEY) === 'cats' ? 'cats' : 'grid'; } catch (e) { return 'grid'; } };
const saveView = v => { try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* לא קריטי */ } };

let filter = null;      // null הכול · '' בלי קטגוריה · מזהה קטגוריה
let query = '';
let view = readView();

/* כתובות blob: של התמונות השמורות, לפי מזהה סרטון. נבנות לפני הציור,
   כי IndexedDB אסינכרוני והציור אינו. */
const posterUrls = new Map();
/* סרטונים שהתמונה שלהם כבר הורדה מחדש מהתיקייה בביקור הזה — בלי זה
   תמונה שנכשלת גם אחרי ההורדה נכנסת ללולאה */
const redownloaded = new Set();

let root = null;
let repaintBody = () => {};

/* --- חיפוש --- */

/* בלי ניקוד ובלי הבדל אותיות סופיות, כדי ש"פסטה" ימצא "פַּסְטָה" ו"עוגת
   שוקולד" ימצא "עוגות שוקולד" לפחות בחלקו */
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
function fold(text) {
  return String(text || '').toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/[ךםןףץ]/g, c => FINALS[c]);
}

function matches(v, words) {
  const hay = fold([v.title, v.note, categoryName(v.category), platformName(v.platform)].join(' '));
  return words.every(w => hay.includes(w));
}

function shown() {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const base = listVideos(filter);
  return words.length ? base.filter(v => matches(v, words)) : base;
}

/* --- חלקי כרטיס --- */

function posterEl(v) {
  const box = el('div.pv');
  const sources = posterCandidates(v, posterUrls.get(v.id));
  /* במקום התמונה בלבד — שם הפלטפורמה וכפתור הניגון נשארים. פעם הכרטיס
     כולו התרוקן, ואי אפשר היה לדעת מאיפה הסרטון שאין לו תמונה. */
  const placeholder = () => {
    const ph = el('div.ph', { text: (v.title || '?').trim().charAt(0) });
    const old = box.querySelector('img');
    if (old) old.replaceWith(ph); else box.prepend(ph);
  };
  if (!sources.length) { placeholder(); return box; }
  const img = el('img', { alt: '', loading: 'lazy', decoding: 'async' });
  img.referrerPolicy = 'no-referrer';
  /* יורדים ברשימה: שמורה במכשיר → הכתובת המקורית → אות. תמונה שמורה לא
     נמחקת בגלל הצגה אחת שנכשלה (באייפון זה קורה ל-IndexedDB); כשיש עותק
     בתיקייה — מורידים אותו שוב, פעם אחת בביקור. */
  let at = 0;
  img.onerror = () => {
    if (++at < sources.length) { img.src = sources[at]; return; }
    placeholder();
    if (v.posterRef && cloud.isOn() && !redownloaded.has(v.id)) {
      redownloaded.add(v.id);
      posterUrls.delete(v.id);
      posters.drop(v.id).then(backfillPosters);
    }
  };
  img.src = sources[0];
  box.appendChild(img);
  return box;
}

function metaText(v, withCat) {
  const cat = withCat && v.category ? categoryName(v.category) : '';
  return [cat, whenText(v.at)].filter(Boolean).join(' · ');
}

function gridCard(v) {
  const pv = posterEl(v);
  pv.append(el('span.plat', { text: platformName(v.platform) }), el('span.playdot', null, icon('play')));
  return el('button.rc', { type: 'button', onclick: () => openPlayer(v.id) },
    pv, el('h4', { text: v.title }), el('div.meta', { text: metaText(v, true) }));
}

function listRow(v, withCat) {
  return el('button.lr', { type: 'button', onclick: () => openPlayer(v.id) },
    posterEl(v),
    el('div.tx', null,
      el('h4', { text: v.title }),
      v.note ? el('p', { text: v.note }) : null,
      el('div.meta', { text: [platformName(v.platform), metaText(v, withCat)].join(' · ') })));
}

/* --- המסך --- */

function header() {
  const conf = cloud.config();
  const line = el('p');
  if (!conf) {
    line.append('שמור במכשיר הזה · ');
    line.appendChild(el('b', { text: 'חיבור לדרייב' }));
  } else if (sync.busy) {
    line.textContent = 'מסנכרן…';
  } else if (sync.error) {
    line.className = 'bad';
    line.appendChild(el('b', { text: 'הסנכרון נכשל' }));
    line.append(' · נסו שוב');
  } else {
    line.append(sync.at ? 'סונכרן ' + agoText(sync.at) + ' · ' : '');
    line.appendChild(el('b', { text: readOnly() ? 'צפייה בלבד' : 'דרייב' }));
  }
  const text = el('div.top-text', null, el('h1', { text: (conf && conf.name) || 'הסרטונים' }), line);
  const top = el('header.top', null, el('div.crest', null, el('span', null, icon('vid'))), text);
  if (conf) {
    const s = el('button.icon-btn' + (sync.busy ? '.spin' : ''), { type: 'button', 'aria-label': 'סנכרון עכשיו', onclick: () => syncNow() }, icon('sync'));
    top.appendChild(s);
  }
  top.appendChild(el('a.icon-btn', { href: '#/s', 'aria-label': 'הגדרות וסנכרון' }, icon('gear')));
  /* השורה עצמה לחיצה: כשאין חיבור — זו ההזמנה, וכשיש שגיאה — זה ההסבר */
  line.style.cursor = 'pointer';
  line.onclick = () => { location.hash = '#/s'; };
  return top;
}

function searchBox() {
  const input = el('input', { type: 'search', id: 'q', placeholder: 'חיפוש בשם, בהערה או בקטגוריה', enterkeyhint: 'search', value: query });
  input.setAttribute('autocomplete', 'off');
  const clear = el('button.clear', { type: 'button', 'aria-label': 'ניקוי החיפוש', hidden: !query }, icon('x'));
  input.oninput = () => { query = input.value; clear.hidden = !query; repaintBody(); };
  clear.onclick = () => { query = ''; input.value = ''; clear.hidden = true; repaintBody(); input.focus(); };
  return el('label.search', null, icon('search'), input, clear);
}

function rail() {
  const counts = countByCategory();
  const box = el('div.chips', { role: 'toolbar', 'aria-label': 'קטגוריות' });
  const chip = (label, value, n) => box.appendChild(el('button.chip', {
    type: 'button', 'aria-pressed': String(filter === value),
    onclick: () => { filter = filter === value && value !== null ? null : value; repaintBody(); }
  }, label, el('b', { text: String(n) })));
  chip('הכל', null, videoCount());
  listCategories().forEach(c => chip(c.name, c.id, counts[c.id] || 0));
  /* "בלי קטגוריה" רק כשיש שם משהו */
  if (counts['']) chip('בלי קטגוריה', '', counts['']);
  box.appendChild(el('a.chip.ghost', { href: '#/v/c' }, icon('tag'), readOnly() ? 'קטגוריות' : 'ניהול'));
  return el('div.rail', null, box);
}

function viewSeg() {
  const b = (id, name, label) => el('button', {
    type: 'button', 'aria-pressed': String(view === id), 'aria-label': label,
    onclick: () => { view = id; saveView(id); repaintBody(); }
  }, icon(name));
  return el('div.view-seg', null, b('grid', 'grid', 'רשת'), b('cats', 'rows', 'לפי קטגוריה'));
}

function emptyState() {
  if (videoCount()) {
    return el('div.empty', null, el('h3', { text: query ? 'לא נמצא' : 'אין כאן סרטונים עדיין' }),
      el('p', { text: query ? 'נסו מילה אחרת, או חיפוש בכל הקטגוריות.' : 'סרטון חדש שנשמר בקטגוריה הזאת יופיע כאן.' }));
  }
  if (readOnly()) {
    return el('div.empty', null, icon('vid'), el('h3', { text: 'הספרייה עדיין ריקה' }),
      el('p', { text: 'סרטונים שיתווספו אצל מי ששיתף יופיעו כאן.' }));
  }
  return el('div.empty', null, icon('vid'), el('h3', { text: 'הסרטון הראשון' }),
    el('p', { text: 'ראית תרגיל או מהלך ביוטיוב, באינסטגרם או בטיקטוק? העתק את הקישור ולחץ על "סרטון".' }));
}

function body() {
  const frag = el('div');
  frag.appendChild(rail());
  const items = shown();
  const title = query ? 'תוצאות חיפוש'
    : filter === null ? 'כל הסרטונים'
    : filter === '' ? 'בלי קטגוריה' : categoryName(filter);
  frag.appendChild(el('div.bar', null, el('h2', { text: title }), el('span.n', { text: String(items.length) }), viewSeg()));

  if (!items.length) { frag.appendChild(emptyState()); return frag; }

  if (view === 'grid') {
    const grid = el('div.grid');
    items.forEach(v => grid.appendChild(gridCard(v)));
    frag.appendChild(grid);
    return frag;
  }

  /* לפי קטגוריה: כשמסתכלים על הכול — אזור לכל קטגוריה, שלושה בכל אחד
     ו"הכל ›". כשמסננים או מחפשים — רשימה אחת. */
  if (filter !== null || query) {
    const list = el('div.list', { style: 'margin-top:.8rem' });
    items.forEach(v => list.appendChild(listRow(v, filter === null)));
    frag.appendChild(list);
    return frag;
  }
  const groups = listCategories().map(c => ({ id: c.id, name: c.name, items: listVideos(c.id) }));
  groups.push({ id: '', name: 'בלי קטגוריה', items: listVideos('') });
  groups.filter(g => g.items.length).forEach(g => {
    const more = g.items.length > 3
      ? el('button.n', { type: 'button', onclick: () => { filter = g.id; repaintBody(); window.scrollTo(0, 0); } }, 'הכל ' + g.items.length + ' ›')
      : el('span.n', { text: String(g.items.length) });
    frag.appendChild(el('div.sec', null, icon('vid'), el('h3', { text: g.name }), more));
    const list = el('div.list');
    g.items.slice(0, 3).forEach(v => list.appendChild(listRow(v, false)));
    frag.appendChild(list);
  });
  return frag;
}

/* תמונה שכבר נטענה לא נטענת שוב. כל ציור בונה כרטיסים חדשים, ו-<img> חדש
   מופיע ריק לרגע ואז "קופץ" — גם כשהכתובת זהה (בעל הריפו: "יש קפיצה של
   התמונות"). לכן לפני הציור נאספות התמונות הטעונות, ואחריו כל <img> חדש עם
   אותה כתובת מוחלף בישן, כמו שהוא. אותו פתרון כמו keepImages בגבעתיים. */
function keepImages(scope, build) {
  const loaded = new Map();
  scope.querySelectorAll('img').forEach(i => { if (i.complete && i.naturalWidth) loaded.set(i.src, i); });
  build();
  scope.querySelectorAll('img').forEach(i => {
    const old = loaded.get(i.src);
    if (old && old !== i) { loaded.delete(i.src); i.replaceWith(old); }
  });
}

/* מצב הסנכרון משתנה פעמיים בכל פתיחה (מתחיל, נגמר). זה משנה רק את השורה
   שבכותרת — אין סיבה לבנות בגללו את כל הכרטיסים מחדש. */
function paintHeader() {
  const h = root && root.querySelector('header.top');
  if (h) h.replaceWith(header());
}

function paint() {
  if (!root) return;
  keepImages(root, paintAll);
}

function paintAll() {
  const keepFocus = document.activeElement && document.activeElement.id === 'q';
  root.textContent = '';
  root.appendChild(header());
  root.appendChild(searchBox());
  const holder = el('div');
  root.appendChild(holder);
  repaintBody = () => keepImages(holder, () => {
    /* קטגוריה שנמחקה בינתיים (גם ממכשיר אחר) — חוזרים להכול */
    if (filter && !categoryName(filter)) filter = null;
    holder.textContent = '';
    holder.appendChild(body());
  });
  repaintBody();
  if (keepFocus) $('q').focus();
  $('fab').hidden = readOnly();
}

/* --- גיליון ההוספה והעריכה --- */

export function openEditor(prefill, video) {
  if (readOnly()) return;
  afterLayers(() => buildEditor(prefill, video));
}

function buildEditor(prefill, video) {
  const editing = video ? video.id : null;
  let picked = video ? (video.category || '') : (filter && filter !== '' ? filter : '');
  let found = null;          // מה שהתצוגה המקדימה מצאה לקישור שבשדה
  let foundFor = '';         // לאיזה קישור
  let titleTouched = !!video;
  let lookingUp = null;

  sheet(video ? 'עריכת סרטון' : 'סרטון חדש', (box, close) => {
    const form = el('form', { novalidate: true });
    const url = el('input.inp.ltr', { type: 'url', id: 'f-url', inputmode: 'url', placeholder: 'https://www.instagram.com/reel/…', value: video ? video.url : (prefill && prefill.url ? (normalizeUrl(prefill.url) || prefill.url) : '') });
    url.setAttribute('autocomplete', 'off');
    const paste = el('button.btn', { type: 'button' }, icon('clip'), 'הדבק');
    const preview = el('div', { hidden: true });
    const title = el('input.inp', { type: 'text', id: 'f-title', placeholder: 'השם נמשך מהקישור — אפשר לשנות', value: video ? video.title : ((prefill && prefill.title) || '') });
    if (prefill && prefill.title) titleTouched = true;
    const note = el('textarea.inp', { id: 'f-note', rows: 3, placeholder: 'שורה אחת שתזכיר לך למה שמרת אותו' });
    note.value = video ? video.note : '';
    const pick = el('div.pick');
    const newCat = el('input.inp', { type: 'text', id: 'f-newcat', placeholder: 'שם הקטגוריה החדשה', hidden: true });
    const err = el('div.err', { hidden: true });
    const save = el('button.btn.gold.wide', { type: 'submit', text: video ? 'שמירת שינויים' : 'שמירה' });

    const paintPick = () => {
      pick.textContent = '';
      const c = (label, id) => pick.appendChild(el('button.chip', {
        type: 'button', 'aria-pressed': String(picked === id),
        onclick: () => { picked = picked === id ? '' : id; newCat.hidden = picked !== '__new'; if (picked === '__new') newCat.focus(); paintPick(); }
      }, label));
      listCategories().forEach(cat => c(cat.name, cat.id));
      c('+ חדשה', '__new');
    };
    paintPick();

    const showError = (msg, log) => {
      err.textContent = msg || '';
      err.hidden = !msg;
      if (log) err.appendChild(report(log));
    };

    const showFound = () => {
      preview.textContent = '';
      if (!found) { preview.hidden = true; return; }
      const fake = { id: '_', title: found.title || '', posterUrl: found.image || null, url: foundFor, full: found.full };
      preview.hidden = false;
      preview.appendChild(el('div.found', null, posterEl(fake),
        el('div', null, el('b', { text: found.title || 'לא נמצא שם — אפשר להקליד' }),
          el('small', { text: platformName(detectPlatform(foundFor).id) + (found.image ? ' · יש תמונה' : ' · בלי תמונה') }))));
    };

    /* התצוגה המקדימה רצה ברגע שיש קישור תקין, ולא רק בשמירה: השם מופיע
       בשדה לפני שלוחצים, ואפשר לתקן אותו */
    const runLookup = async () => {
      const clean = normalizeUrl(url.value);
      if (!clean || !autoOn() || clean === foundFor) return lookingUp;
      foundFor = clean;
      found = null;
      preview.hidden = false;
      preview.textContent = '';
      preview.appendChild(el('p.hint', { text: 'מביא שם ותמונה…' }));
      const mine = lookup(clean).then(got => {
        if (foundFor !== clean) return got;
        found = got;
        if (got.title && !titleTouched) title.value = got.title;
        showFound();
        return got;
      });
      lookingUp = mine;
      return mine;
    };

    paste.onclick = async () => {
      const text = await readClipboard();
      if (text === null) { showError('הדפדפן לא נתן גישה ללוח. אפשר להדביק ידנית בשדה.'); url.focus(); return; }
      if (!text) { showError('הלוח ריק. העתיקו קישור מהאפליקציה ונסו שוב.'); return; }
      url.value = text.trim();
      showError('');
      runLookup();
    };
    url.addEventListener('change', runLookup);
    url.addEventListener('paste', () => setTimeout(runLookup, 0));
    title.addEventListener('input', () => { titleTouched = !!title.value.trim(); });

    form.onsubmit = async e => {
      e.preventDefault();
      showError('');
      const clean = normalizeUrl(url.value);
      if (!clean) {
        showError('הקישור לא נראה תקין. מעתיקים מהאפליקציה "העתקת קישור" ומדביקים כאן.');
        if (url.value) err.appendChild(el('code', { text: cloud.reveal(url.value) }));
        return;
      }
      let category = picked;
      if (category === '__new') {
        const made = addCategory(newCat.value);
        if (!made) { showError('תנו שם לקטגוריה החדשה, או בחרו קיימת.'); newCat.focus(); return; }
        category = made.id;
      }
      const fields = { url: clean, title: title.value, note: note.value, category: category || null };

      /* הקישור השתנה (או חדש) — מחכים לתצוגה המקדימה פעם אחת לפני השמירה */
      const changedUrl = !video || clean !== video.url;
      let got = null;
      if (changedUrl && autoOn()) {
        save.disabled = true;
        save.textContent = 'מביא תמונה ושם…';
        got = (await runLookup()) || found;
        save.disabled = false;
        save.textContent = video ? 'שמירת שינויים' : 'שמירה';
        if (got) {
          if (got.full) fields.full = got.full;
          if (got.media) fields.media = got.media;
          if (got.title && !fields.title.trim()) fields.title = got.title;
          fields.posterUrl = got.image || null;
        }
      }

      const saved = editing ? updateVideo(editing, fields) : addVideo(fields);
      if (!saved) { showError('לא הצלחנו לשמור. נסו שוב.'); return; }
      close();
      paint();
      toast(editing ? 'נשמר' : 'נוסף לסרטונים');

      /* התמונה אחרי הסרטון: הכרטיס מופיע מיד, והתמונה נכנסת כשהיא מוכנה */
      if (got && got.image) {
        await savePoster(saved.id, got.image, got.log);
        await loadPosterUrls();
        paint();
      }
      syncNow();
      if (needsResolve(saved.url) && !saved.full && changedUrl && autoOn()) {
        toast('נשמר, אבל הקישור המקוצר לא נפתח — "פתיחה" עובד, הנגינה בתוך האפליקציה לא');
      }
    };

    form.append(
      el('label.field', null, el('span', { text: 'קישור' }), el('div.row', null, url, paste)),
      preview,
      el('label.field', null, el('span', { text: 'שם' }), title),
      el('div.field', null, el('span', { text: 'קטגוריה' }), pick),
      newCat,
      el('label.field', null, el('span', { text: 'הערה (לא חובה)' }), note),
      err,
      el('div.sheet-go', null, save)
    );
    box.appendChild(form);

    if (url.value && !video) runLookup();
    else if (!url.value) setTimeout(() => url.focus(), 280);
  });
}

/* --- הנגן ---
   אותו נגן כמו בספריית המתכונים (Recipes/js/player.js), בלי המתכון: הסרטון
   הוא המסך, מקצה לקצה, וכל השאר צף עליו — ✕ ⛶ למעלה, הקטגוריה, השם וההערה
   למטה על הצללה, והפעולות בעמודה בצד; מחיקה רק מאחורי ⋯.

   · באינסטגרם, בפייסבוק ובטיקטוק מנגנים את קובץ הווידאו עצמו — הנגן המשובץ
     שלהם הוא דף שלם, עם כותרת, לייקים ותגובות. כשאין קובץ — הנגן שלהם,
     חתוך לחלון של הסרטון. יוטיוב, וימאו ודרייב — הנגן המשובץ, הוא נקי.
   · רילס שאינסטגרם חוסמת מחוץ לה (זכויות, כמעט תמיד על המוזיקה): אין קובץ,
     והנגן שלה רק שולח אליה בלחיצה. לכן במקומו — התמונה, הסבר, ו"פתיחה
     באינסטגרם" כבחירה. הבדיקה ב-preview.js (igMedia).
   · בקובץ שלנו, כמו ביוטיוב: נגיעה מראה את הפקדים והסרטון ממשיך — 10 שניות
     אחורה וקדימה, עצירה, והקו בתחתית נגרר. נגיעה כפולה בצד ימין — 10
     קדימה, בשמאל — 10 אחורה. לחיצה ארוכה — מהירות כפולה. הזמן משמאל
     לימין, כמו בכל נגן.

   מה שנשאר מהנגן הקודם: הנגינה מתחילה רק ב-▶ (כך גם הקול מותר), ובלי
   "הבאה אוטומטית" (autoOn כבוי) הקישור לא יוצא לשום שירות — רק הנגן
   המשובץ. */

/* הנגן המשובץ של אלה הוא דף שלם — מנגנים אצלם רק את הקובץ */
const CHROME = new Set(['instagram', 'facebook', 'tiktok']);

function openPlayer(id) {
  afterLayers(() => buildPlayer(id));
}

function buildPlayer(id) {
  const v = getVideo(id);
  if (!v) return;
  const name = platformName(v.platform);
  const owner = !readOnly();
  let fallback = embedUrl(playable(v));
  const embed = CHROME.has(v.platform) ? null : fallback;
  const canFetch = autoOn() && FETCHABLE.has(v.platform);

  const layer = el('div.player', { role: 'dialog', 'aria-modal': 'true', 'aria-label': v.title });
  const stage = el('div.stage');
  const still = posterCandidates(v, posterUrls.get(v.id))[0];

  /* שורת המערכת למעלה בצבע של הנגן, ולא בצבע הדף מעל סרטון שחור */
  const meta = document.querySelector('meta[name="theme-color"]');
  const tone = meta && meta.content;
  if (meta) meta.content = '#000000';

  let offKey = null;
  let video = null;
  const close = openLayer(() => {
    if (offKey) offKey();
    if (meta) meta.content = tone;
    if (fsEl()) leaveFull();
    /* עצירה מפורשת: אלמנט שנמחק ממשיך לפעמים להשמיע. null — כדי שרענון של
       קובץ שעוד בדרך לא ינגן ברקע אחרי הסגירה */
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); video = null; }
    layer.remove();
  });

  /* --- מה מנגנים ---
     file: קובץ הווידאו · embed: הנגן המשובץ · out: אין קובץ ואין נגן
     · blocked: אינסטגרם לא מרשה לנגן מחוץ לה · null: עוד לא ידוע */
  let mode = v.media && mediaFresh(v) ? 'file' : (embed ? 'embed' : null);
  let pending = null;
  const resolve = () => {
    if (mode || pending) return pending;
    if (!canFetch) { mode = fallback ? 'embed' : 'out'; return null; }
    pending = refreshMedia(v.url).then(got => {
      pending = null;
      if (got.media) {
        if (owner) updateVideo(v.id, { media: got.media });
        v.media = got.media; v.mediaAt = Date.now();
        mode = 'file';
      } else if (got.blocked) {
        mode = 'blocked';
      } else {
        /* קישור מקוצר (fb.watch): הכתובת המלאה פותחת את הנגן המשובץ */
        if (!fallback && got.full && embedUrl(got.full)) {
          if (owner) updateVideo(v.id, { full: got.full });
          fallback = embedUrl(got.full);
        }
        mode = fallback ? 'embed' : 'out';
      }
      paintCover();
    });
    return pending;
  };

  const cover = el('div.cover');
  if (still) {
    const img = el('img', { alt: '', src: still });
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => img.remove();
    cover.appendChild(img);
  }
  const bigPlay = el('button.bigp', { type: 'button', 'aria-label': 'ניגון' }, icon('play'));
  const outLink = el('a.out', { href: v.url, target: '_blank', rel: 'noopener noreferrer' }, icon('ext'), 'מתנגן ב' + name);
  const why = el('p.why', { text: name + ' לא מרשה לנגן את הסרטון הזה מחוץ ל' + name + ', בגלל זכויות יוצרים — בדרך כלל על המוזיקה שבו.' });
  const cta = el('div.cta', null, bigPlay, why, outLink);
  cover.appendChild(cta);
  const paintCover = () => {
    /* אין קובץ ואין נגן: ▶ עצמו פותח את הסרטון אצלם, והתווית אומרת לאן.
       חסום: אין ▶ בכלל — רק ההסבר, ויציאה כבחירה */
    const blocked = mode === 'blocked';
    bigPlay.hidden = blocked;
    why.hidden = !blocked;
    outLink.hidden = mode !== 'out' && !blocked;
    outLink.lastChild.textContent = (blocked ? 'פתיחה ב' : 'מתנגן ב') + name;
    bigPlay.classList.toggle('busy', !!pending);
  };
  paintCover();
  stage.appendChild(cover);
  /* יודעים מראש אם יש קובץ, כדי ש-▶ יתנהג נכון כבר בלחיצה הראשונה.
     ▶ מסתובב עד שיודעים — ובחסום מתחלף בהסבר */
  resolve();
  paintCover();

  /* --- הזמן: קו שאפשר לגרור, ומספרים --- */
  const fill = el('i');
  const knob = el('span.knob');
  const bubble = el('span.bubble.num');
  const nowAt = el('span.num');
  const total = el('span.num');
  /* tl ולא track: track הוא פס ההתקדמות בחוברת, והכלל שלו היה תופס גם כאן */
  const progress = el('div.progress', { hidden: true, role: 'slider', tabindex: '0', 'aria-label': 'מיקום בסרטון', 'aria-valuemin': '0' },
    el('div.tl', null, fill, knob, bubble), el('div.times', null, nowAt, total));

  const playFile = src => {
    video = el('video', { src, playsInline: true, preload: 'auto', autoplay: true });
    video.setAttribute('playsinline', '');
    if (still) video.poster = still;
    /* רק סרטון לאורך ממלא את המסך; לרוחב או מרובע נשאר שלם — במילוי נחתך
       ממנו יותר מחצי. video מתאפס כשהקובץ נכשל, ואירוע שכבר בתור עוד מגיע */
    video.addEventListener('loadedmetadata', () => { if (video) video.classList.toggle('wide', video.videoWidth >= video.videoHeight); });
    video.addEventListener('timeupdate', () => {
      if (!video || !video.duration) return;
      progress.hidden = false;
      if (!dragging) paintTime(video.currentTime);
    });
    video.addEventListener('pause', () => { layer.classList.add('paused'); toggleBtn.setAttribute('aria-label', 'המשך ניגון'); });
    video.addEventListener('play', () => { layer.classList.remove('paused'); toggleBtn.setAttribute('aria-label', 'עצירה'); });
    /* כתובת חתומה שפגה — מרעננים פעם אחת; לא הצליח — הנגן המשובץ */
    let retried = false;
    video.onerror = async () => {
      if (!video) return;
      if (retried) { toVideoOut(); return; }
      retried = true;
      const fresh = await refreshMedia(v.url);
      if (!video) return;
      if (fresh.media && fresh.media !== video.src) {
        if (owner) updateVideo(v.id, { media: fresh.media });
        video.src = fresh.media;
        video.load();
        video.play().catch(() => {});
        return;
      }
      toVideoOut(fresh.blocked);
    };
    stage.textContent = '';
    stage.appendChild(video);
    video.play().catch(() => layer.classList.add('paused'));
  };
  /* blocked: הנגן שלהם לא יעזור — רק ישלח אליהם, ולכן לא נופלים אליו */
  const toVideoOut = blocked => {
    if (video) { video.remove(); video = null; }
    progress.hidden = true;
    dragging = false;
    layer.classList.remove('paused', 'seeking', 'ctrl', 'fast');
    if (!blocked && fallback) { mode = 'embed'; playEmbed(fallback); paintRail(); return; }
    mode = blocked ? 'blocked' : 'out';
    stage.textContent = '';
    stage.appendChild(cover);
    paintCover();
    paintRail();
  };

  const clock = sec => {
    const n = Math.max(0, Math.floor(sec || 0));
    return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
  };
  const paintTime = t => {
    if (!video || !video.duration) return;
    const d = video.duration;
    const at = Math.min(100, Math.max(0, t / d * 100)) + '%';
    fill.style.width = at; knob.style.left = at; bubble.style.left = at;
    nowAt.textContent = clock(t); total.textContent = clock(d);
    bubble.textContent = clock(t) + ' / ' + clock(d);
    progress.setAttribute('aria-valuemax', String(Math.round(d)));
    progress.setAttribute('aria-valuenow', String(Math.round(t)));
    progress.setAttribute('aria-valuetext', clock(t) + ' מתוך ' + clock(d));
  };
  const jump = sec => {
    if (!video || !video.duration) return;
    video.currentTime = Math.min(video.duration - 0.05, Math.max(0, video.currentTime + sec));
    paintTime(video.currentTime);
  };
  /* גרירה: הסרטון נעצר בזמן הגרירה וממשיך אחריה, אם ניגן. fastSeek (סאפרי)
     קופץ למסגרת הקרובה — מהיר תוך כדי; בשחרור — הזמן המדויק. */
  let dragging = false;
  let resume = false;
  const timeAt = x => {
    const r = progress.firstChild.getBoundingClientRect();
    return Math.min(1, Math.max(0, (x - r.left) / r.width)) * video.duration;
  };
  const seekTo = (t, exact) => {
    if (!exact && video.fastSeek) video.fastSeek(t); else video.currentTime = t;
    paintTime(t);
  };
  progress.addEventListener('pointerdown', e => {
    if (!video || !video.duration) return;
    e.preventDefault();
    dragging = true;
    resume = !video.paused;
    /* הקו מתעבה לפני החישוב — המיקום נמדד על הקו שרואים */
    layer.classList.add('seeking');
    try { progress.setPointerCapture(e.pointerId); } catch (err) { /* דפדפן ישן — הגרירה עובדת גם בלי */ }
    video.pause();
    seekTo(timeAt(e.clientX));
  });
  progress.addEventListener('pointermove', e => { if (dragging && video) seekTo(timeAt(e.clientX)); });
  const endDrag = (e, commit) => {
    if (!dragging) return;
    dragging = false;
    layer.classList.remove('seeking');
    if (!video) return;
    if (commit) seekTo(timeAt(e.clientX), true);
    if (resume) video.play().catch(() => {});
    showCtrl();
  };
  progress.addEventListener('pointerup', e => endDrag(e, true));
  /* בלי commit: בביטול (שיחה נכנסת, מחווה של המערכת) המיקום של האצבע לא אמין */
  progress.addEventListener('pointercancel', e => endDrag(e, false));
  progress.addEventListener('keydown', e => {
    const step = e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0;
    if (!step) return;
    e.preventDefault();
    jump(step);
  });

  /* --- הפקדים: אחורה משמאל, ▶/❚❚ באמצע, קדימה מימין ---
     בעצירה תמיד; בניגון — אחרי נגיעה, ונעלמים אחרי שלוש שניות בלי מגע */
  let ctrlTimer = 0;
  const showCtrl = () => {
    layer.classList.add('ctrl');
    clearTimeout(ctrlTimer);
    ctrlTimer = setTimeout(() => { if (!dragging) layer.classList.remove('ctrl'); }, 3000);
  };
  const hideCtrl = () => { clearTimeout(ctrlTimer); layer.classList.remove('ctrl'); };
  const toggle = () => {
    if (!video) return;
    if (video.paused) video.play().catch(() => {}); else video.pause();
    showCtrl();
  };
  const toggleBtn = el('button.resume', { type: 'button', 'aria-label': 'עצירה', onclick: toggle }, icon('play', 'pl'), icon('pause', 'pz'));
  const mid = el('div.mid', null,
    el('button.skip', { type: 'button', 'aria-label': '10 שניות אחורה', onclick: () => { jump(-10); showCtrl(); } }, icon('back10'), el('span.num', { text: '10' })),
    toggleBtn,
    el('button.skip', { type: 'button', 'aria-label': '10 שניות קדימה', onclick: () => { jump(10); showCtrl(); } }, icon('fwd10'), el('span.num', { text: '10' })));

  /* מה שקרה בנגיעה כפולה ובלחיצה ארוכה — רואים מיד, ונעלם */
  const hint = el('div.seekhint', { 'aria-hidden': 'true' }, icon('fwd10', 'f'), icon('back10', 'b'), el('span.num'));
  let hintTimer = 0;
  const flash = (side, sum) => {
    hint.classList.toggle('fwd', side > 0);
    hint.lastChild.textContent = sum + ' שניות';
    hint.classList.remove('on');
    void hint.offsetWidth;
    hint.classList.add('on');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove('on'), 700);
  };
  const fastTag = el('div.fasttag', { 'aria-hidden': 'true' }, el('span.num', { text: '2×' }), icon('ff'));

  const playEmbed = src => {
    const frame = el('iframe', { src, title: v.title, allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share', allowFullscreen: true });
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    stage.textContent = '';
    /* אינסטגרם: רק החלון של הסרטון, בלי הכותרת, הלייקים והתגובות שלהם —
       החישוב ב-.igcrop ב-app.css */
    if (v.platform === 'instagram') {
      const box = el('div.igcrop', null, frame);
      /* בפוסט הקופסה בפרופורציה של התמונה (מרובע, 4:5, לרוחב), ולא יותר
         גבוהה מ-4:5. ברילס היא תמיד 4:5 — התמונה שלו 9:16 ולא תעזור. */
      const img = cover.querySelector('img');
      if (!isPortrait(playable(v)) && img && img.naturalWidth) {
        const r = Math.min(1.25, Math.max(0.52, img.naturalHeight / img.naturalWidth));
        box.style.setProperty('--ig-r', r.toFixed(3));
      }
      stage.appendChild(box);
      return;
    }
    if (isPortrait(playable(v))) frame.classList.add('tall');
    stage.appendChild(frame);
  };

  bigPlay.onclick = async () => {
    if (mode === 'out') { window.open(v.url, '_blank', 'noopener'); return; }
    if (!mode) {
      await resolve();
      /* אחרי המתנה לרשת הדפדפן כבר לא מתייחס לזה כלחיצה, ולא יפתח חלון —
         מתברר שאין קובץ? התווית "מתנגן ב…" מופיעה, ולוחצים שוב. חסום —
         ההסבר מופיע במקום ▶ */
      if (mode === 'out' || mode === 'blocked') return;
    }
    if (mode === 'file') playFile(v.media);
    else if (mode === 'embed') playEmbed(embed || fallback);
  };

  /* --- מחוות על הסרטון, כמו ביוטיוב ---
     נגיעה: הפקדים מופיעים או נעלמים (ובעצירה — ממשיכים). נגיעה כפולה: ימין
     10 קדימה, שמאל 10 אחורה, וכל נגיעה נוספת מיד אחריה — עוד 10. לחיצה
     ארוכה: מהירות כפולה כל עוד האצבע על המסך. הנגיעה הבודדת מחכה רגע
     (TAP), כדי לדעת שלא באה אחריה שנייה. */
  const TAP = 300;
  const HOLD = 450;
  let lastTap = null;
  let tapTimer = 0;
  let streak = null;
  let holdTimer = 0;
  let holding = false;
  const onVideo = e => video && e.target === video;
  const sideOf = x => { const r = stage.getBoundingClientRect(); return x - r.left > r.width / 2 ? 1 : -1; };
  const stopHold = () => {
    clearTimeout(holdTimer);
    if (holding && video) video.playbackRate = 1;
    holding = false;
    layer.classList.remove('fast');
  };
  stage.addEventListener('pointerdown', e => {
    if (!onVideo(e)) return;
    stopHold();
    if (!video.paused) holdTimer = setTimeout(() => {
      if (!video) return;
      holding = true;
      video.playbackRate = 2;
      layer.classList.add('fast');
    }, HOLD);
  });
  stage.addEventListener('pointerup', e => {
    if (!onVideo(e)) { stopHold(); return; }
    const held = holding;
    stopHold();
    if (held) return;
    const now = Date.now();
    const side = sideOf(e.clientX);
    if (streak && streak.side === side && now - streak.at < 800) {
      clearTimeout(tapTimer); lastTap = null;
      streak.at = now; streak.total += 10;
      jump(10 * side); flash(side, streak.total);
      return;
    }
    if (lastTap && lastTap.side === side && now - lastTap.at < TAP) {
      clearTimeout(tapTimer); lastTap = null;
      streak = { side, at: now, total: 10 };
      jump(10 * side); flash(side, 10);
      return;
    }
    streak = null;
    lastTap = { side, at: now };
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      lastTap = null;
      if (!video) return;
      if (video.paused) toggle();
      else if (layer.classList.contains('ctrl')) hideCtrl();
      else showCtrl();
    }, TAP);
  });
  stage.addEventListener('pointercancel', stopHold);
  /* לחיצה ארוכה באייפון פותחת תפריט של המערכת על הסרטון */
  stage.addEventListener('contextmenu', e => { if (video && e.target === video) e.preventDefault(); });

  /* --- מסך מלא: מסתיר את כל מה שצף, ובאייפון — המסך המלא של המערכת --- */
  let immersive = false;
  function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement; }
  const setImmersive = on => { immersive = on; layer.classList.toggle('immersive', on); };
  const enterFull = async () => {
    const canElement = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    if (video && !canElement && video.webkitEnterFullscreen) { try { video.webkitEnterFullscreen(); return; } catch (e) { /* נופלים למצב הממלא */ } }
    setImmersive(true);
    try {
      if (layer.requestFullscreen) await layer.requestFullscreen({ navigationUI: 'hide' });
      else if (layer.webkitRequestFullscreen) layer.webkitRequestFullscreen();
    } catch (e) { /* לא הורשה — המצב הממלא מספיק */ }
  };
  function leaveFull() {
    setImmersive(false);
    if (!fsEl()) return;
    try { const r = (document.exitFullscreen || document.webkitExitFullscreen).call(document); if (r && r.catch) r.catch(() => {}); } catch (e) { /* כבר יצא */ }
  }
  const onFs = () => { if (!fsEl() && immersive) setImmersive(false); };
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);

  /* סגירת הנגן סוגרת קודם את מה שפתוח מעליו (⋯). בלי זה הצעד שלו נשאר
     בהיסטוריה, ו"חזרה" הבאה בבית לא עשתה כלום. */
  let menuDone = null;
  const shutAll = () => {
    if (menuDone) menuDone();
    close();
  };
  const shut = el('button.ibtn', { type: 'button', 'aria-label': 'סגירה', onclick: () => shutAll() }, icon('x'));
  const full = el('button.ibtn', { type: 'button', 'aria-label': 'מסך מלא', onclick: enterFull }, icon('expand'));
  const exitFull = el('button.ibtn.exit-full', { type: 'button', 'aria-label': 'יציאה ממסך מלא', onclick: leaveFull }, icon('shrink'));
  const topov = el('div.topov', null, full, shut);

  /* --- הכיתוב: קטגוריה, שם, הערה --- */
  const cap = el('div.cap');
  const cat = v.category && categoryName(v.category);
  if (cat) cap.appendChild(el('span.chip', { 'aria-pressed': 'true', text: cat }));
  cap.appendChild(el('h2', { text: v.title }));
  if (v.note) {
    /* div ולא כפתור: באייפון הקיצור לשתי שורות לא עובד על כפתור. נגיעה פותחת
       את כולה, ועוד נגיעה מקצרת */
    const note = el('div.note', { text: v.note });
    note.onclick = () => note.classList.toggle('open');
    cap.appendChild(note);
  }

  /* --- העמודה בצד ---
     vside ולא side: side הוא השורה מתחת למגרש בחוברת */
  const railBtn = (ic, label, fn, href) => {
    const b = href
      ? el('a.ibtn', { href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': label }, icon(ic))
      : el('button.ibtn', { type: 'button', 'aria-label': label, onclick: fn }, icon(ic));
    return el('div.rb', null, b, el('span', { text: label }));
  };
  const rail = el('div.vside');
  const paintRail = () => {
    rail.textContent = '';
    /* כשאין נגן ▶ כבר פותח אצלם, ובחסום יש "פתיחה ב…" באמצע — אין צורך בשני
       כפתורים לאותו מקום */
    if (mode !== 'out' && mode !== 'blocked') rail.appendChild(railBtn('ext', name, null, v.url));
    if (owner) rail.appendChild(railBtn('pen', 'עריכה', () => { shutAll(); openEditor(null, getVideo(v.id)); }));
    rail.appendChild(railBtn('dots', 'עוד', () => openMenu()));
  };
  paintRail();
  /* כשמתברר שאין קובץ, גם העמודה מתעדכנת */
  if (pending) pending.then(() => { paintCover(); paintRail(); });

  /* --- ⋯ — תפריט פעולות, כמו בכל אפליקציה בטלפון. המחיקה בקבוצה משלה, למטה --- */
  function openMenu() {
    const dim = el('div.mdim');
    const menu = el('div.amenu', { role: 'menu' });
    const done = openLayer(() => { dim.remove(); menu.remove(); menuDone = null; });
    menuDone = done;
    dim.onclick = () => done();
    const item = (ic, text, fn, cls) => el('button.it' + (cls || ''), { type: 'button', onclick: fn }, icon(ic), text);
    const g1 = el('div.mgrp');
    if (owner) {
      g1.appendChild(item('pen', 'עריכת השם, הקטגוריה וההערה', () => { shutAll(); openEditor(null, getVideo(v.id)); }));
      g1.appendChild(item('tag', 'העברה לקטגוריה אחרת', () => {
        g1.textContent = '';
        [{ id: '', name: 'בלי קטגוריה' }, ...listCategories()].forEach(c => g1.appendChild(item(c.id === (v.category || '') ? 'check' : 'tag', c.name, () => {
          updateVideo(v.id, { category: c.id || null });
          v.category = c.id || null;
          done(); toast('הועבר ל"' + c.name + '"'); paint(); syncNow();
        })));
      }));
    }
    g1.appendChild(el('a.it', { href: v.url, target: '_blank', rel: 'noopener noreferrer', onclick: () => done() }, icon('ext'), 'פתיחה ב' + name));
    if (owner && !posterUrls.has(v.id)) {
      g1.appendChild(item('sync', 'להביא תמונה מחדש', () => {
        g1.textContent = '';
        g1.appendChild(el('div.it.plain', null, fixPoster(v, () => {})));
      }));
    }
    menu.appendChild(g1);
    if (owner) {
      const g2 = el('div.mgrp');
      const del = item('trash', 'מחיקת הסרטון', () => {
        /* לחיצה שנייה — אחרי שהכפתור אומר בדיוק מה יקרה */
        if (!del.classList.contains('sure')) { del.classList.add('sure'); del.lastChild.textContent = 'למחוק את "' + v.title + '"? לחיצה נוספת מוחקת'; return; }
        removeVideo(v.id);
        posterUrls.delete(v.id);
        shutAll();
        paint();
        toast('נמחק');
        syncNow();
      }, '.del');
      g2.appendChild(del);
      menu.appendChild(g2);
    }
    menu.appendChild(el('button.mcancel', { type: 'button', text: 'ביטול', onclick: () => done() }));
    layer.append(dim, menu);
  }

  /* Escape סוגר את השכבה העליונה בלבד, כמו "חזרה" */
  offKey = onEscape(() => {
    if (immersive) leaveFull();
    else if (menuDone) menuDone();
    else close();
  });
  layer.append(stage, el('div.scrim-t'), el('div.scrim-b'), hint, fastTag, topov, cap, rail, progress, mid, exitFull);
  document.body.appendChild(layer);
  shut.focus();

  /* ניקוי מאזיני המסך המלא כשהנגן נסגר */
  const obs = new MutationObserver(() => {
    if (layer.isConnected) return;
    document.removeEventListener('fullscreenchange', onFs);
    document.removeEventListener('webkitfullscreenchange', onFs);
    obs.disconnect();
  });
  obs.observe(document.body, { childList: true });
}

/* תמונה שלא נשמרה: חיפוש מחדש ביד, מתוך הנגן. ההשלמה ברקע מנסה לבד בכל
   פתיחה, אבל בשקט — כאן רואים מה כל שירות ענה ("מה קרה?"), וזו הדרך היחידה
   לדעת למה סרטון מסוים נשאר בלי תמונה. */
function fixPoster(v, after) {
  const line = el('div.fixposter', null, el('span', { text: 'לסרטון הזה אין תמונה שמורה.' }));
  const go = el('button.btn.sm', { type: 'button' }, icon('sync'), 'להביא שוב');
  go.onclick = async () => {
    go.disabled = true;
    go.textContent = 'מחפש…';
    const old = line.querySelector('details');
    if (old) old.remove();
    const got = await lookup(v.url);
    const log = got.log;
    if (got.full && !v.full) updateVideo(v.id, { full: got.full });
    if (got.media) updateVideo(v.id, { media: got.media });
    let ok = false;
    for (const src of [...new Set([got.image, thumbUrl(v.full || v.url), v.posterUrl].filter(Boolean))]) {
      if (await savePoster(v.id, src, log)) { ok = true; break; }
    }
    if (ok) {
      await loadPosterUrls();
      paint();
      line.replaceWith(el('p.hint', { text: 'התמונה נשמרה.' }));
      after();
      syncNow();
      return;
    }
    go.disabled = false;
    go.textContent = 'נסה שוב';
    line.firstChild.textContent = got.image ? 'נמצאה תמונה, אבל לא הצלחנו לשמור אותה.' : 'לא נמצאה תמונה לקישור הזה.';
    line.appendChild(report(log));
  };
  line.appendChild(go);
  return line;
}

/* --- התמונות ---
   שלוש דרכים להשיג תמונה, לפי כמה הן עולות: מה שכבר שמור במכשיר, מה
   שיושב בתיקייה בדרייב, ומה שצריך למשוך מהרשת. */

async function loadPosterUrls() {
  const saved = await posters.saved();
  posterUrls.clear();
  for (const v of listVideos()) {
    if (!saved.has(v.id)) continue;
    const url = await posters.url(v.id);
    if (url) posterUrls.set(v.id, url);
  }
  return saved;
}

/** מביאה תמונה, מקטינה ושומרת. true אם באמת נשמרה.

    הטלפון והסקריפט מביאים אותה ביחד, והראשון שמצליח קובע — הסקריפט
    מתעורר לאט ואינסטגרם חוסמת שרתים, ואין סיבה שהכרטיס יחכה לו. מה
    שהטלפון הביא עולה לתיקייה ברקע (cloudCopy). כמו ב-nines. */
async function savePoster(id, src, log) {
  if (!src) return false;
  const owner = cloud.isOn() && !cloud.isViewer();
  const byScript = owner
    ? cloud.grabPoster(id, src).catch(() => { if (log) log.push('תמונה · הסקריפט נכשל'); return null; })
    : Promise.resolve(null);
  const byPhone = fetchPoster(src, log);
  const got = await firstOf([
    byPhone.then(blob => (blob ? { blob, ref: null } : null)),
    byScript.then(g => (g && g.blob ? { blob: g.blob, ref: g.ref || null } : null))
  ]);
  const small = got ? await posters.shrink(got.blob) : null;
  if (small && await posters.put(id, small)) {
    if (!readOnly()) updateVideo(id, { posterKind: 'blob', posterUrl: src, posterRef: got.ref || undefined });
    if (owner && !got.ref) cloudCopy(id, byScript, small);
    return true;
  }
  if (!readOnly()) updateVideo(id, { posterUrl: src });
  return false;
}

/** הראשון שמחזיר משהו, או null כשכולם החזירו null */
function firstOf(list) {
  return new Promise(resolve => {
    let left = list.length;
    list.forEach(p => p.then(value => {
      if (value) resolve(value);
      else if (!--left) resolve(null);
    }));
  });
}

/* העותק בתיקייה, אחרי שהכרטיס כבר מוצג. נכשל? needsUpload יעלה בפתיחה הבאה. */
async function cloudCopy(id, byScript, blob) {
  try {
    const g = await byScript;
    const ref = (g && g.ref) || await cloud.putPoster(id, blob);
    if (ref && !readOnly()) { updateVideo(id, { posterRef: ref }); syncNow(); }
  } catch (e) { /* יעלה בהשלמה הבאה */ }
}

/* השלמת תמונות חסרות ברקע — מעט בכל פתיחה, לא הכול בבת אחת. הורדה
   מהתיקייה קודמת (זולה), העלאה אחרונה (כדי שגם מה שהובא עכשיו יעלה). */
const BACKFILL = 8;
const DOWNLOAD = 20;
const UPLOAD = 20;
let filling = false;

async function backfillPosters() {
  if (filling) return;
  filling = true;
  try {
    const saved = await loadPosterUrls();
    let changed = false;

    if (cloud.isOn()) {
      for (const v of needsDownload(saved).slice(0, DOWNLOAD)) {
        try {
          const blob = await cloud.getPoster(v.posterRef);
          const small = blob ? (await posters.shrink(blob)) || blob : null;
          if (small && await posters.put(v.id, small)) { changed = true; saved.add(v.id); }
        } catch (e) {
          /* הסקריפט סירב — הקובץ כבר לא בתיקייה. פעם זה עצר את כל ההורדות
             (break), ותמונה אחת שנמחקה השאירה את כל מה שאחריה בלי תמונה לתמיד.
             עכשיו: ממשיכים, ואצל הבעלים המזהה המת נמחק כדי שהתמונה תימשך מחדש. */
          if (e && e.refused) {
            if (!readOnly()) { updateVideo(v.id, { posterRef: null }); changed = true; }
            continue;
          }
          break;   /* הסקריפט לא עונה — אין טעם להמשיך */
        }
      }
    }

    if (autoOn() && !readOnly()) {
      for (const v of needsPoster(saved).slice(0, BACKFILL)) {
        const known = thumbUrl(v.full || v.url) || v.posterUrl;
        let ok = await savePoster(v.id, known, null);
        if (!ok) {
          const fresh = (await lookup(v.url)).image;
          if (fresh && fresh !== known) ok = await savePoster(v.id, fresh, null);
        }
        if (ok) { changed = true; saved.add(v.id); }
      }
    }

    if (cloud.isOn() && !cloud.isViewer()) {
      for (const v of needsUpload(saved).slice(0, UPLOAD)) {
        try {
          const blob = await posters.blob(v.id);
          const ref = blob ? await cloud.putPoster(v.id, blob) : null;
          if (ref) { updateVideo(v.id, { posterRef: ref }); changed = true; }
        } catch (e) { break; }
      }
    }

    if (changed) {
      await loadPosterUrls();
      if (root && !root.hidden) paint();
      if (cloud.isOn() && !cloud.isViewer()) syncNow();
    }
  } finally {
    filling = false;
  }
}

/* מה כל שירות ענה — לרגע שבו משהו לא עובד בטלפון מסוים */
function report(log) {
  const box = el('details.log', null, el('summary', { text: 'מה קרה?' }));
  const ul = el('ul');
  ((log && log.length) ? log : ['לא נשלחה אף בקשה']).forEach(line => ul.appendChild(el('li', { text: line })));
  box.appendChild(ul);
  return box;
}

/* --- הרכבה --- */

let offSync = null;
let onVisible = null;

/** prefill: {url,title} מקישור ששותף לאפליקציה, או null */
export function mountLibrary(node, prefill) {
  root = node;
  reload();
  document.title = 'ספריית הסרטונים — תשיעיות';
  $('fab').onclick = () => openEditor(null, null);
  /* ציור ראשון אחרי שידוע אילו תמונות שמורות במכשיר (IndexedDB, עשרות
     אלפיות שנייה) — ולא לפני: ציור מוקדם הציג את הכתובות המקוריות או אות,
     ומיד אחריו ציור שני עם התמונות השמורות. זו הייתה הקפיצה הראשונה. */
  loadPosterUrls().then(() => { if (root === node) paint(); });
  offSync = onSync(changed => {
    if (!root || root.hidden) return;
    if (changed) loadPosterUrls().then(() => { paint(); backfillPosters(); });
    else paintHeader();
  });
  /* חזרה לאפליקציה היא הרגע לסנכרן: בדיוק פתחו אותה כדי לראות מה יש */
  onVisible = () => { if (document.visibilityState === 'visible' && root && !root.hidden) syncNow(); };
  document.addEventListener('visibilitychange', onVisible);
  if (cloud.isOn()) syncNow().then(backfillPosters);
  else backfillPosters();
  if (prefill && (prefill.url || prefill.title)) openEditor(prefill, null);
  return {
    destroy() {
      if (offSync) offSync();
      document.removeEventListener('visibilitychange', onVisible);
      $('fab').hidden = true;
      root.textContent = '';
      root = null;
    }
  };
}
