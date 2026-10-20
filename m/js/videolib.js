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
  platformName, detectPlatform, embedUrl, embedBlocked, isPortrait, playable, mediaFresh,
  posterCandidates, needsPoster, needsDownload, needsUpload, thumbUrl, normalizeUrl,
  readOnly, reload
} from './videos.js';
import { needsResolve, lookup, refreshMedia, fetchPoster } from './preview.js';
import * as cloud from './cloud.js';
import * as posters from './posters.js';
import { state as sync, syncNow, onSync, autoOn } from './sync.js';
import { $, el, icon, toast, whenText, agoText, sheet, openLayer, onEscape, afterLayers, confirmBox, readClipboard } from './ui.js';

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
  const placeholder = () => {
    box.textContent = '';
    box.appendChild(el('div.ph', { text: (v.title || '?').trim().charAt(0) }));
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

function paint() {
  if (!root) return;
  const keepFocus = document.activeElement && document.activeElement.id === 'q';
  root.textContent = '';
  root.appendChild(header());
  root.appendChild(searchBox());
  const holder = el('div');
  root.appendChild(holder);
  repaintBody = () => {
    /* קטגוריה שנמחקה בינתיים (גם ממכשיר אחר) — חוזרים להכול */
    if (filter && !categoryName(filter)) filter = null;
    holder.textContent = '';
    holder.appendChild(body());
  };
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
   שכבה מעל הדף ולא חלק מהכרטיס (nines: גלילה של נגן בתוך כרטיס למרכז
   נכשלה שוב ושוב). הנגן ממלא את מה שנשאר בין הכותרת לפרטים. */

function openPlayer(id) {
  afterLayers(() => buildPlayer(id));
}

function buildPlayer(id) {
  const v = getVideo(id);
  if (!v) return;
  const embed = embedUrl(playable(v));
  const canFetch = autoOn() && FETCHABLE.has(v.platform);
  const name = platformName(v.platform);

  const layer = el('div.player', { role: 'dialog', 'aria-modal': 'true', 'aria-label': v.title });
  const shut = el('button.icon-btn', { type: 'button', 'aria-label': 'סגירה' }, icon('x'));
  const stage = el('div.stage');
  let offKey = null;
  const close = openLayer(() => {
    if (offKey) offKey();
    /* עצירה מפורשת: אלמנט שנמחק ממשיך לפעמים להשמיע */
    const media = layer.querySelector('video');
    if (media) { media.pause(); media.removeAttribute('src'); media.load(); }
    layer.remove();
  });
  shut.onclick = close;
  offKey = onEscape(close);

  const openOut = el('a.btn', { href: v.url, target: '_blank', rel: 'noopener noreferrer' }, icon('ext'), 'פתיחה ב' + name);

  const msg = text => {
    const m = el('p.msg', null, text + ' ');
    m.appendChild(el('a', { href: v.url, target: '_blank', rel: 'noopener noreferrer', text: 'פתיחה ב' + name }));
    return m;
  };

  const showFile = src => {
    stage.textContent = '';
    const vid = el('video', { src, controls: true, playsInline: true, preload: 'metadata', autoplay: true });
    vid.setAttribute('playsinline', '');
    const still = posterUrls.get(v.id);
    if (still) vid.poster = still;
    /* כתובת חתומה שפגה — מרעננים פעם אחת, ורק אז נופלים לנגן המשובץ */
    let retried = false;
    vid.onerror = async () => {
      if (retried) { fallback(); return; }
      retried = true;
      const fresh = await refreshMedia(v.url);
      if (fresh.media && fresh.media !== src) {
        if (!readOnly()) updateVideo(v.id, { media: fresh.media });
        vid.src = fresh.media;
        vid.load();
        return;
      }
      fallback();
    };
    stage.appendChild(vid);
  };

  const showEmbed = src => {
    stage.textContent = '';
    const frame = el('iframe', { src, title: v.title, allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share', allowFullscreen: true });
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    if (isPortrait(playable(v))) frame.classList.add('tall');
    stage.appendChild(frame);
    /* מה שקורה בתוך הנגן המשובץ שייך לפלטפורמה ואי אפשר לקרוא אותו —
       לכן דרך היציאה כתובה מראש בכפתור למטה */
  };

  const fallback = () => {
    if (embed) { showEmbed(embed); return; }
    cover('לא הצלחנו לנגן כאן.');
  };

  /* מצב התחלתי: התמונה, וכפתור ניגון גדול. הנגינה מתחילה בלחיצה — כך גם
     הקול מותר, וגם לא נשלחת בקשה לפלטפורמה בכל פתיחה של סרטון. */
  const cover = why => {
    stage.textContent = '';
    const still = posterCandidates(v, posterUrls.get(v.id))[0];
    if (still) {
      const img = el('img.cover', { alt: '', src: still });
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => img.remove();
      stage.appendChild(img);
    }
    const playable_ = v.media || embed || canFetch;
    if (playable_ && !why) {
      const big = el('button.big.glass', { type: 'button', 'aria-label': 'ניגון' }, icon('play'));
      big.onclick = () => play(big);
      stage.appendChild(big);
    } else {
      stage.appendChild(msg(why || embedBlocked(playable(v)) || 'אי אפשר לנגן את הקישור הזה בתוך האפליקציה.'));
    }
  };

  const play = async big => {
    /* הנגן המשובץ קודם: הוא נבנה מהקישור הקבוע ולא פג. הקובץ עצמו רק
       כשאין נגן משובץ (קישור מקוצר), כי הכתובת שלו פגה אחרי שעות. */
    if (embed) { showEmbed(embed); return; }
    if (v.media && mediaFresh(v)) { showFile(v.media); return; }
    if (canFetch) {
      big.disabled = true;
      big.classList.add('spin');
      const fresh = await refreshMedia(v.url);
      if (fresh.media) {
        if (!readOnly()) updateVideo(v.id, { media: fresh.media, full: fresh.full || undefined });
        v.media = fresh.media;
        showFile(fresh.media);
        return;
      }
      if (fresh.full && embedUrl(fresh.full)) {
        if (!readOnly()) updateVideo(v.id, { full: fresh.full });
        showEmbed(embedUrl(fresh.full));
        return;
      }
    }
    if (v.media) { showFile(v.media); return; }
    cover('לא הצלחנו לנגן כאן.');
  };

  cover();

  const bottom = el('div.player-bot');
  const tags = el('div.tags');
  if (v.category && categoryName(v.category)) tags.appendChild(el('span.chip', { 'aria-pressed': 'true', text: categoryName(v.category) }));
  tags.append(name + ' · נשמר ' + whenText(v.at));
  bottom.appendChild(tags);
  if (v.note) bottom.appendChild(el('p.note', { text: v.note }));
  const acts = el('div.acts', null, openOut);
  if (!readOnly()) {
    const edit = el('button.btn.icon', { type: 'button', 'aria-label': 'עריכה', onclick: () => { close(); openEditor(null, getVideo(v.id)); } }, icon('pen'));
    const del = el('button.btn.icon', { type: 'button', 'aria-label': 'מחיקה' }, icon('trash'));
    del.onclick = () => {
      acts.hidden = true;
      bottom.appendChild(confirmBox('למחוק את "' + v.title + '"?', 'מחיקה', () => {
        removeVideo(v.id);
        posterUrls.delete(v.id);
        close();
        paint();
        toast('נמחק');
        syncNow();
      }, () => { acts.hidden = false; }));
    };
    acts.append(edit, del);
  }
  bottom.appendChild(acts);

  layer.append(el('div.player-top', null, el('b', { text: v.title }), shut), stage, bottom);
  document.body.appendChild(layer);
  shut.focus();
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
        } catch (e) { break; }
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
  paint();
  loadPosterUrls().then(paint);
  offSync = onSync(changed => {
    if (!root || root.hidden) return;
    if (changed) loadPosterUrls().then(() => { paint(); backfillPosters(); });
    else paint();
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
