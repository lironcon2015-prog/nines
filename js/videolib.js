/* מסך ספריית הסרטונים: הוספת קישור, כותרות, וסרטון-סרטון.

   הפעולה שצריכה להיות הכי קלה היא ההוספה — רואים סרטון באינסטגרם, מעתיקים
   את הקישור, ורוצים שהוא ייכנס בשתי נגיעות. לכן טופס ההוספה נפתח למעלה,
   הכתובת נדבקת מהלוח בכפתור אחד, והכותרת אינה חובה.

   במכשיר שמחובר בקוד קריאה אין טופס, אין "ערוך" ואין "מחק" — רק לראות
   ולנגן. ההסתרה כאן היא נוחות; האיסור עצמו יושב ב-videos.js ובסקריפט. */

import {
  listCategories, addCategory, renameCategory, removeCategory, countByCategory,
  listVideos, addVideo, updateVideo, removeVideo, categoryName,
  platformName, embedUrl, embedBlocked, isPortrait, playable,
  posterCandidates, needsPoster, needsDownload, thumbUrl, normalizeUrl, videoCount,
  readOnly, exportDoc, applyRemote, reload
} from './videos.js';
import { needsResolve, lookup, refreshMedia, fetchPoster, probe } from './preview.js';
import * as cloud from './cloud.js';
import * as posters from './posters.js';

const $ = id => document.getElementById(id);

/* פלטפורמות שהדף שלהן מצהיר על קובץ וידאו או ניתן לשיבוץ */
const FETCHABLE = new Set(['facebook', 'instagram', 'tiktok', 'youtube', 'x', 'vimeo']);

/* האם למשוך תצוגה מקדימה מהרשת */
const AUTO_KEY = 'k8:videos:auto';
const autoOn = () => { try { return localStorage.getItem(AUTO_KEY) !== 'off'; } catch (e) { return true; } };
const setAuto = on => { try { localStorage.setItem(AUTO_KEY, on ? 'on' : 'off'); } catch (e) { /* לא קריטי */ } };

/* הקטגוריה שמסוננת כרגע: null הכול · '' בלי כותרת · מזהה קטגוריה */
let filter = null;
let editing = null;      // מזהה הסרטון שנמצא בעריכה
let managing = false;    // האם פאנל ניהול הכותרות פתוח

/* כתובות blob: של התמונות השמורות, לפי מזהה סרטון. נבנות פעם אחת לפני
   הציור, כי הקריאה מ-IndexedDB אסינכרונית והציור אינו. */
const posterUrls = new Map();

/* מצב הסנכרון האחרון, למה שמוצג בפס העליון */
let syncState = { busy: false, at: 0, error: '', note: '' };

/** תאריך קצר — "היום", "אתמול", ואחר כך תאריך */
function whenText(ms) {
  const day = 24 * 60 * 60 * 1000;
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const diff = midnight.getTime() - new Date(ms).setHours(0, 0, 0, 0);
  if (diff <= 0) return 'היום';
  if (diff <= day) return 'אתמול';
  return new Date(ms).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
}

function agoText(ms) {
  if (!ms) return '';
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return 'לפני ' + mins + ' דק׳';
  const hours = Math.round(mins / 60);
  if (hours < 24) return 'לפני ' + hours + ' שע׳';
  return whenText(ms);
}

/* --- טופס ההוספה --- */

function fillCategorySelect(select, selected) {
  select.textContent = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'בלי כותרת';
  select.appendChild(none);
  listCategories().forEach(c => {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.name;
    if (c.id === selected) o.selected = true;
    select.appendChild(o);
  });
  const neu = document.createElement('option');
  neu.value = '__new';
  neu.textContent = '＋ כותרת חדשה…';
  /* גם "חדשה" נשמרת בבנייה מחדש — אחרת סינון תוך כדי הקלדת שם חדש היה
     מאפס את הבחירה ומשאיר שדה שם פתוח בלי כלום מאחוריו */
  if (selected === '__new') neu.selected = true;
  select.appendChild(neu);
}

function setError(msg) {
  const box = $('v-error');
  box.textContent = msg || '';
  box.hidden = !msg;
}

function resetForm() {
  $('v-url').value = '';
  $('v-title').value = '';
  $('v-note').value = '';
  $('v-newcat').value = '';
  $('v-newcat').hidden = true;
  setError('');
  $('v-form').dataset.editing = '';
  editing = null;
  $('v-save').textContent = 'הוסף לספרייה';
  $('v-cancel').hidden = true;
  $('v-formtitle').textContent = 'הוסף סרטון';
}

/** פותח את הטופס עם ערכים — מקישור ששותף, או לעריכת סרטון קיים */
function openForm(values, video) {
  if (readOnly()) return;
  const form = $('v-form');
  form.open = true;
  if (video) {
    editing = video.id;
    form.dataset.editing = video.id;
    $('v-url').value = video.url;
    $('v-title').value = video.title;
    $('v-note').value = video.note;
    fillCategorySelect($('v-cat'), video.category || '');
    $('v-save').textContent = 'שמור שינויים';
    $('v-cancel').hidden = false;
    $('v-formtitle').textContent = 'עריכת סרטון';
  } else if (values) {
    if (values.url) $('v-url').value = values.url;
    if (values.title) $('v-title').value = values.title;
  }
  setError('');
}

/* --- פס הסנכרון --- */

function renderSync(repaint) {
  const box = $('v-sync');
  box.textContent = '';
  if (!cloud.isOn()) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.className = 'vsync' + (syncState.error ? ' bad' : '');

  const dot = document.createElement('span');
  dot.className = 'dot' + (syncState.busy ? ' busy' : syncState.error ? ' off' : '');
  box.appendChild(dot);

  const label = document.createElement('span');
  const conf = cloud.config();
  label.textContent = syncState.busy ? 'מסנכרן…'
    : syncState.error ? syncState.error
    : (conf.name || 'ספרייה משותפת') + (cloud.isViewer() ? ' · צפייה בלבד' : '');
  box.appendChild(label);

  const when = document.createElement('span');
  when.className = 'when';
  when.textContent = syncState.note || (syncState.at ? 'עודכן ' + agoText(syncState.at) : '');
  box.appendChild(when);

  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'vsyncgo';
  again.textContent = 'סנכרן';
  again.disabled = syncState.busy;
  again.onclick = () => syncNow(repaint, true);
  box.appendChild(again);
}

/** משיכה, מיזוג, ודחיפה חזרה כשיש מה לדחוף */
async function syncNow(repaint, loud) {
  if (!cloud.isOn() || syncState.busy) return;
  syncState.busy = true;
  syncState.error = '';
  renderSync(repaint);
  try {
    const remote = await cloud.pull();
    const changed = applyRemote(remote);
    /* צופה אינו דוחף לעולם. בעלים דוחף רק אם המיזוג המקומי הוסיף משהו
       שאין בצד השני — אחרת כל פתיחה הייתה כותבת מחדש בלי סיבה. */
    if (!cloud.isViewer()) {
      const mine = exportDoc();
      if (changed || newerThan(mine, remote)) {
        const merged = await cloud.push(mine);
        if (merged) applyRemote(merged);
      }
    }
    syncState.at = Date.now();
    syncState.note = '';
    await loadPosterUrls();
    repaint();
  } catch (e) {
    syncState.error = String((e && e.message) || 'הסנכרון נכשל');
    if (!loud) syncState.note = 'ננסה שוב בפתיחה הבאה';
  } finally {
    syncState.busy = false;
    if (!$('videos').hidden) renderSync(repaint);
  }
}

/* יש לי משהו שאין להם? מספיק פריט אחד עם updatedAt מאוחר מהצד השני. */
function newerThan(mine, remote) {
  if (!remote) return true;
  const stamp = list => new Map((list || []).map(x => [x.id, x.updatedAt || 0]));
  const theirVideos = stamp(remote.videos);
  const theirCats = stamp(remote.categories);
  const ahead = (list, map) => (list || []).some(x => (x.updatedAt || 0) > (map.get(x.id) || 0));
  return ahead(mine.videos, theirVideos) || ahead(mine.categories, theirCats);
}

/* --- שורת הסינון --- */

function renderFilters(repaint) {
  const rail = $('v-chips');
  rail.textContent = '';
  const counts = countByCategory();
  const total = videoCount();

  const chip = (label, value, n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(filter === value));
    b.textContent = label;
    if (n !== null) {
      const c = document.createElement('span');
      c.className = 'chipn';
      c.textContent = n;
      b.appendChild(c);
    }
    b.onclick = () => { filter = value; repaint(); };
    rail.appendChild(b);
  };

  chip('הכול', null, total);
  listCategories().forEach(c => chip(c.name, c.id, counts[c.id] || 0));
  /* "בלי כותרת" מוצג רק כשיש שם משהו — אחרת זו רק עוד כפתור ריק */
  if (counts['']) chip('בלי כותרת', '', counts['']);
}

/* --- ניהול הכותרות --- */

function renderManage(repaint) {
  const box = $('v-manage');
  box.hidden = !managing;
  box.textContent = '';
  if (!managing) return;

  const counts = countByCategory();
  listCategories().forEach(c => {
    const row = document.createElement('div');
    row.className = 'catrow';

    const name = document.createElement('span');
    name.className = 'catname';
    name.textContent = c.name;

    const n = document.createElement('span');
    n.className = 'catn';
    n.textContent = (counts[c.id] || 0) + ' סרטונים';

    const rename = document.createElement('button');
    rename.type = 'button';
    rename.textContent = 'שנה שם';
    rename.onclick = () => {
      const next = prompt('שם חדש לכותרת', c.name);
      if (next && next.trim()) { renameCategory(c.id, next); repaint(); }
    };

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'danger';
    del.textContent = 'מחק';
    del.onclick = () => {
      const has = counts[c.id] || 0;
      const ask = has
        ? `למחוק את "${c.name}"? ${has} סרטונים יעברו ל"בלי כותרת" ולא יימחקו.`
        : `למחוק את "${c.name}"?`;
      if (!confirm(ask)) return;
      removeCategory(c.id);
      if (filter === c.id) filter = null;
      repaint();
    };

    row.append(name, n, rename, del);
    box.appendChild(row);
  });

  const add = document.createElement('div');
  add.className = 'catadd';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'כותרת חדשה — למשל בעיטות חופשיות';
  const go = document.createElement('button');
  go.type = 'button';
  go.textContent = 'הוסף כותרת';
  const submit = () => {
    if (!input.value.trim()) return;
    addCategory(input.value);
    repaint();
  };
  go.onclick = submit;
  input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
  add.append(input, go);
  box.appendChild(add);
}

/* --- רשימת הסרטונים --- */

function renderList(repaint) {
  const list = $('v-list');
  list.textContent = '';
  const videos = listVideos(filter);

  if (!videos.length) {
    const empty = document.createElement('p');
    empty.className = 'vempty';
    empty.textContent = videoCount()
      ? 'אין כאן סרטונים בכותרת הזאת עדיין.'
      : readOnly()
        ? 'הספרייה המשותפת עדיין ריקה. סרטונים שיתווספו אצל מי ששיתף יופיעו כאן.'
        : 'עוד אין סרטונים. העתק קישור מיוטיוב, אינסטגרם או פייסבוק והדבק אותו למעלה.';
    list.appendChild(empty);
    return;
  }

  videos.forEach(v => list.appendChild(videoCard(v, repaint)));
}

function videoCard(v, repaint) {
  const card = document.createElement('div');
  card.className = 'vcard';

  /* התמונה של הסרטון, כמו בתצוגה מקדימה של קישור בוואטסאפ. כשיש תמונה
     הכרטיס נפתח לרוחב והיא יושבת מעל הטקסט; כשאין, נשאר אריח צר עם שם
     הפלטפורמה, כדי שכרטיס בלי תמונה לא ייקח גובה של כרטיס עם תמונה. */
  const sources = posterCandidates(v, posterUrls.get(v.id));
  if (sources.length) card.classList.add('wide');

  const thumb = document.createElement('div');
  thumb.className = 'vthumb p-' + v.platform;
  const tile = () => {
    card.classList.remove('wide');
    thumb.textContent = platformName(v.platform);
  };
  if (sources.length) {
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    /* יורדים ברשימה: תמונה שמורה במכשיר, אחריה הכתובת המקורית, ורק אם
       גם היא נפלה — האריח. וכשהכול נפל, הכרטיס נכנס לתור ההשלמה במקום
       להישאר ריק לנצח: זו הייתה הסיבה שתמונה שנשברה לא חזרה מעצמה. */
    let at = 0;
    img.onerror = () => {
      if (++at < sources.length) { img.src = sources[at]; return; }
      tile();
      posters.drop(v.id);
      posterUrls.delete(v.id);
    };
    img.src = sources[0];
    thumb.appendChild(img);
  } else {
    tile();
  }

  const body = document.createElement('div');
  body.className = 'vbody';

  const meta = document.createElement('div');
  meta.className = 'vmeta';
  meta.textContent = platformName(v.platform);
  const cat = v.category ? categoryName(v.category) : '';
  if (cat) {
    const tag = document.createElement('span');
    tag.className = 'vtag';
    tag.textContent = cat;
    meta.appendChild(tag);
  }
  const when = document.createElement('span');
  when.className = 'vwhen';
  when.textContent = whenText(v.at);
  meta.appendChild(when);

  const h3 = document.createElement('h3');
  h3.textContent = v.title;

  body.append(meta, h3);

  if (v.note) {
    const note = document.createElement('p');
    note.className = 'vnote';
    note.textContent = v.note;
    body.appendChild(note);
  }

  const acts = document.createElement('div');
  acts.className = 'vacts';

  /* "פתח" מעביר לאפליקציה המקורית — נשאר גם כשיש נגן, כי בטלפון הצפייה
     שם נוחה, וחלק מהפלטפורמות ממילא חוסמות שיבוץ. */
  const open = document.createElement('a');
  open.className = 'vopen';
  open.href = v.url;
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  open.textContent = 'פתח';
  acts.appendChild(open);

  /* הנגן נפתח כשכבה מעל הדף ולא בתוך הכרטיס.
     ניסיתי קודם לפתוח אותו במקום, ואז לגלול אותו למרכז — וזה נכשל שוב
     ושוב: בזמן הגלילה עוד אין לווידאו גובה, אחרי הטעינה הכול זז, ומתחת
     לכרטיס יושבים עוד כרטיסים שמזיזים אותו. שכבה עוקפת את כל החישוב
     הזה: היא ממורכזת מעצם הבנייה, אף פעם לא צריך לגלול אליה, והסרטון
     גם גדול בהרבה על מסך טלפון. סגירה מחזירה בדיוק לאותו מקום.

     סדר הניסיונות: קודם קובץ הווידאו עצמו בנגן שלנו, ורק אם אין —
     הנגן המשובץ של הפלטפורמה. הקובץ עדיף בכל מובן: הוא מתנגן בלי
     אפליקציה ובלי חשבון, ואין לו דעה על קישור מקוצר.

     הכול עובד זהה במכשיר שרואה בלבד: הניגון נגזר מהקישור ומהקובץ
     שבמסמך, ולא ממי שהוסיף אותו. */
  const embed = embedUrl(playable(v));
  const canFetch = autoOn() && FETCHABLE.has(v.platform);
  if (v.media || embed || canFetch) {
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'vplay';
    play.textContent = 'נגן כאן';

    const showFile = src => {
      const el = document.createElement('video');
      el.src = src;
      el.controls = true;
      el.playsInline = true;
      el.preload = 'metadata';
      el.autoplay = true;
      const still = posterUrls.get(v.id);
      if (still) el.poster = still;
      /* כתובת חתומה שפגה בינתיים — מרעננים פעם אחת ומנסים שוב, ורק
         אחר כך נופלים לנגן המשובץ */
      let retried = false;
      el.onerror = async () => {
        if (retried) { fallback(); return; }
        retried = true;
        const fresh = await refreshMedia(v.url);
        if (fresh.media && fresh.media !== src) {
          if (!readOnly()) updateVideo(v.id, { media: fresh.media });
          el.src = fresh.media;
          el.load();
          return;
        }
        fallback();
      };
      openOverlay(el, v);
    };

    const showEmbed = src => {
      const el = document.createElement('iframe');
      el.src = src;
      el.title = v.title;
      el.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      el.allowFullscreen = true;
      el.referrerPolicy = 'strict-origin-when-cross-origin';
      if (isPortrait(playable(v))) el.classList.add('tall');
      openOverlay(el, v);
    };

    /* כישלון אינו נעילה: תקלת רשת רגעית לא צריכה להשאיר כפתור מת עד
       שמרעננים את הדף. */
    const fallback = () => {
      closeOverlay();
      if (embed) { showEmbed(embed); return; }
      play.textContent = 'לא נטען — נסה שוב';
    };

    play.onclick = async () => {
      /* מנגנים מיד ממה שכבר יש, בלי לפנות לרשת. קובץ ישן אינו סיבה
         להמתנה: אם הכתובת שלו פגה, onerror מרענן ומנסה שוב תוך כדי. */
      if (v.media) { showFile(v.media); return; }
      if (embed) { showEmbed(embed); return; }

      /* רק כשאין לנו כלום — אז שווה לחכות */
      let lastLog = [];
      if (canFetch) {
        play.disabled = true;
        play.textContent = 'מכין…';
        const fresh = await refreshMedia(v.url);
        lastLog = fresh.log;
        play.disabled = false;
        play.textContent = 'נגן כאן';
        if (fresh.media) {
          if (!readOnly()) updateVideo(v.id, { media: fresh.media, full: fresh.full || undefined });
          v.media = fresh.media;
          showFile(fresh.media);
          return;
        }
        if (fresh.full) {
          if (!readOnly()) updateVideo(v.id, { full: fresh.full });
          showEmbed(embedUrl(fresh.full));
          return;
        }
      }
      play.textContent = 'לא נטען — נסה שוב';
      /* הדיווח נכתב פעם אחת, גם אם לוחצים שוב ושוב */
      if (!body.querySelector('.vlog')) body.appendChild(report(lastLog));
    };
    acts.appendChild(play);
  }

  const why = (embed || v.media || canFetch) ? null : embedBlocked(playable(v));

  if (!readOnly()) {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'vedit';
    edit.textContent = 'ערוך';
    edit.onclick = () => {
      openForm(null, v);
      $('v-form').scrollIntoView({ block: 'start' });
    };
    acts.appendChild(edit);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'vdel';
    del.textContent = 'מחק';
    del.onclick = () => {
      if (!confirm('למחוק את "' + v.title + '" מהספרייה?')) return;
      removeVideo(v.id);
      posterUrls.delete(v.id);
      if (editing === v.id) resetForm();
      repaint();
      syncNow(repaint);
    };
    acts.appendChild(del);
  }

  body.appendChild(acts);
  if (why) {
    const note = document.createElement('p');
    note.className = 'vwhy';
    note.textContent = why;
    /* קישור שנשמר לפני שהפותח היה קיים, או שהפתיחה נכשלה אז — כאן אפשר
       לנסות שוב בלי למחוק ולהוסיף מחדש */
    if (needsResolve(v.url) && !readOnly()) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'vretry';
      retry.textContent = 'נסה לפתוח את הקישור';
      retry.onclick = async () => {
        retry.disabled = true;
        retry.textContent = 'פותח…';
        const got = await lookup(v.url);
        if (got.full) {
          updateVideo(v.id, { full: got.full });
          await savePoster(v.id, got.image, []);
          await loadPosterUrls();
          repaint();
          return;
        }
        retry.disabled = false;
        retry.textContent = 'לא הצלחנו — נסה שוב';
        note.appendChild(report(got.log));
      };
      note.append(' ');
      note.appendChild(retry);
    }
    body.appendChild(note);
  }
  card.append(thumb, body);
  return card;
}

/* --- שכבת הנגן ---
   אחת בלבד בכל רגע, ולכן היא מודול ולא חלק מהכרטיס. */

let overlay = null;
let pushed = false;   // האם הוספנו צעד להיסטוריה עבור השכבה
let lockedAt = 0;     // המקום שאליו חוזרים אחרי הצפייה

/* נעילת גלילה שעובדת גם באייפון.
   overflow:hidden על ה-body אינו נועל את סאפרי בטלפון — הדף ממשיך לזוז
   מתחת לשכבה, ואז גם השכבה עצמה נראית מוזזת וצריך לגלול אליה. הדרך
   היחידה שעובדת היא לקבע את הדף עצמו: position:fixed עם top שלילי בגובה
   הגלילה הנוכחית. הדף נשאר בדיוק איפה שהוא נראה, אבל מפסיק להיות ניתן
   לגלילה — ולכן inset:0 של השכבה נמדד מול מה שבאמת רואים. */
function lockScroll() {
  lockedAt = window.scrollY || window.pageYOffset || 0;
  document.body.style.position = 'fixed';
  document.body.style.top = -lockedAt + 'px';
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}

function unlockScroll() {
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  window.scrollTo(0, lockedAt);
}

export function closeOverlay(fromBack) {
  if (!overlay) return;
  /* עצירה מפורשת: אלמנט שנמחק מה-DOM ממשיך לפעמים להשמיע */
  const media = overlay.querySelector('video');
  if (media) { media.pause(); media.removeAttribute('src'); media.load(); }
  overlay.remove();
  overlay = null;
  unlockScroll();
  document.removeEventListener('keydown', onKey);
  window.removeEventListener('popstate', onBack);
  /* סגירה בכפתור או ב-Escape מוחקת גם את הצעד שהוספנו, אחרת "אחורה"
     היה נראה כאילו הוא לא עושה כלום */
  if (pushed && !fromBack) history.back();
  pushed = false;
}

function onKey(e) {
  if (e.key === 'Escape') closeOverlay();
}

/* "אחורה" בטלפון סוגר את הנגן ולא יוצא מהמסך — זה מה שמצפים לו כשמשהו
   פתוח מעל הדף. הצעד נוסף על אותה כתובת, כך שהניתוב אינו מרגיש בו. */
function onBack() {
  closeOverlay(true);
}

function openOverlay(node, video) {
  closeOverlay();

  overlay = document.createElement('div');
  overlay.className = 'vlayer';
  /* לחיצה על הרקע סוגרת — הדרך המהירה ביותר לצאת בטלפון */
  overlay.onclick = e => { if (e.target === overlay) closeOverlay(); };

  const box = document.createElement('div');
  box.className = 'vbox';

  const bar = document.createElement('div');
  bar.className = 'vbar';
  const name = document.createElement('span');
  name.textContent = video.title;
  const shut = document.createElement('button');
  shut.type = 'button';
  shut.className = 'vshut';
  shut.setAttribute('aria-label', 'סגור');
  shut.textContent = '×';
  shut.onclick = closeOverlay;
  bar.append(name, shut);

  /* מה שקורה בתוך נגן משובץ שייך לפייסבוק, והדף אינו יכול לקרוא אותו —
     גם לא כדי לדעת שהוצג "Video unavailable". לכן דרך היציאה כתובה
     מראש ולא מחכה לזיהוי שאי אפשר לעשות. */
  const out = document.createElement('p');
  out.className = 'vout';
  out.append('לא נטען? ');
  const link = document.createElement('a');
  link.href = video.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'פתח אותו בפלטפורמה';
  out.appendChild(link);

  box.append(bar, node, out);
  overlay.appendChild(box);
  /* הנעילה לפני ההוספה: כך השכבה נמדדת כבר מול דף מקובע */
  lockScroll();
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey);
  try {
    history.pushState({ vplayer: true }, '', location.hash);
    pushed = true;
    window.addEventListener('popstate', onBack);
  } catch (e) { /* בלי היסטוריה — סוגרים בכפתור, ברקע או ב-Escape */ }
  shut.focus();
}

/* --- התמונות ---

   שלוש דרכים להשיג תמונה, לפי כמה הן עולות: מה שכבר שמור במכשיר, מה
   שיושב בתיקייה המשותפת וצריך רק להוריד, ומה שצריך למשוך מהרשת מחדש. */

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

/** מביאה תמונה, מקטינה ושומרת. מחזירה true אם באמת נשמרה. */
async function savePoster(id, src, log) {
  if (!src) return false;
  /* כשיש סקריפט, הוא מושך את התמונה ושומר אותה בתיקייה באותה פנייה —
     ואז גם המכשיר השני יקבל אותה בלי לפנות לאינסטגרם בעצמו. */
  if (cloud.isOn() && !cloud.isViewer()) {
    try {
      const got = await cloud.grabPoster(id, src);
      if (got && got.blob) {
        const small = await posters.shrink(got.blob);
        if (small && await posters.put(id, small)) {
          updateVideo(id, { posterKind: 'blob', posterUrl: src, posterRef: got.ref });
          return true;
        }
      }
    } catch (e) {
      if (log) log.push('תמונה · הסקריפט שלך נכשל');
    }
  }
  const blob = await fetchPoster(src, log);
  const small = blob ? await posters.shrink(blob) : null;
  if (small && await posters.put(id, small)) {
    if (!readOnly()) updateVideo(id, { posterKind: 'blob', posterUrl: src });
    return true;
  }
  /* גם כשלא הצלחנו לשמור — הכתובת נשמרת, כי היא עדיין שווה ניסיון הצגה
     אחד. מה שהיא לא, זה תחליף לתמונה שמורה: posterKind נשאר ריק, והכרטיס
     יחזור לתור בפתיחה הבאה. */
  if (!readOnly()) updateVideo(id, { posterUrl: src });
  return false;
}

/* השלמת תמונות חסרות, בשקט וברקע.
   שמונה בכל פתיחה ולא הכול בבת אחת: ספרייה של שלושים סרטונים בלי תמונות
   הייתה יורה שלושים בקשות ברגע אחד ונחסמת. הורדה מהתיקייה המשותפת זולה
   בהרבה ממשיכה מהרשת, ולכן היא קודמת ומקבלת מכסה גדולה יותר. */
const BACKFILL = 8;
const DOWNLOAD = 20;

let filling = false;

async function backfillPosters(repaint) {
  if (filling) return;
  filling = true;
  try {
    let saved = await loadPosterUrls();
    let changed = false;

    /* קודם מה שכבר שמור בתיקייה — פנייה אחת קצרה לכל תמונה, בלי לגעת
       באינסטגרם בכלל. זה גם המסלול היחיד של מכשיר שרואה בלבד. */
    if (cloud.isOn()) {
      for (const v of needsDownload(saved).slice(0, DOWNLOAD)) {
        try {
          const blob = await cloud.getPoster(v.posterRef);
          if (blob && await posters.put(v.id, blob)) { changed = true; saved.add(v.id); }
        } catch (e) { break; }   /* הסקריפט לא עונה — אין טעם להמשיך */
      }
    }

    if (autoOn() && !readOnly()) {
      const todo = needsPoster(saved).slice(0, BACKFILL);
      for (const v of todo) {
        const known = v.posterUrl || thumbUrl(v.full || v.url);
        const src = known || (await lookup(v.url)).image;
        if (await savePoster(v.id, src, null)) { changed = true; saved.add(v.id); }
      }
    }

    if (changed) {
      await loadPosterUrls();
      /* המסך אולי כבר הוחלף בינתיים — מציירים מחדש רק אם הוא עדיין כאן */
      if (!$('videos').hidden) repaint();
      if (cloud.isOn() && !cloud.isViewer()) syncNow(repaint);
    }
  } finally {
    filling = false;
  }
}

/* מה כל שירות ענה. לא למשתמש הרגיל — אבל כשמשהו לא עובד בטלפון מסוים
   ואי אפשר לשחזר אותו, זו הדרך היחידה לדעת מה בעצם קרה. */
function report(log) {
  const box = document.createElement('details');
  box.className = 'vlog';
  const sum = document.createElement('summary');
  sum.textContent = 'מה קרה?';
  box.appendChild(sum);
  const list = document.createElement('ul');
  ((log && log.length) ? log : ['לא נשלחה אף בקשה']).forEach(line => {
    const li = document.createElement('li');
    li.textContent = line;
    list.appendChild(li);
  });
  box.appendChild(list);
  return box;
}

/* --- הרכבת המסך --- */

/** prefill: {url,title} מקישור ששותף לאפליקציה, או null */
export function mountVideos(prefill) {
  /* מצב המכשיר יכול היה להשתנות במסך השיתוף, ואיתו גם המסמך הפעיל */
  reload();
  const viewer = readOnly();

  const repaint = () => {
    renderSync(repaint);
    renderFilters(repaint);
    renderManage(repaint);
    renderList(repaint);
    if (viewer) return;
    /* בחירת הקטגוריה בטופס נבנית מחדש כי ייתכן שנוספה או נמחקה כותרת */
    const keep = editing ? ($('v-cat').value) : ($('v-cat').value || defaultCat());
    fillCategorySelect($('v-cat'), keep);
  };

  /* כשמסננים לפי כותרת, סרטון חדש שייך כנראה לאותה כותרת */
  const defaultCat = () => (filter && filter !== '' ? filter : '');

  document.title = 'ספריית הסרטונים — תשיעיות';
  $('videos').classList.toggle('viewer', viewer);
  $('v-form').hidden = viewer;
  $('v-managego').hidden = viewer;
  $('v-lede').textContent = viewer
    ? 'הספרייה המשותפת. אפשר לראות ולנגן כל סרטון; ההוספה והעריכה נעשות במכשיר ששיתף.'
    : 'מדביקים קישור מיוטיוב, אינסטגרם, פייסבוק או טיקטוק, ובוחרים כותרת.';
  $('v-foot').textContent = cloud.isOn()
    ? 'הספרייה נשמרת בתיקיית דרייב משותפת, והצפייה עצמה נעשית בפלטפורמה שממנה הגיע הסרטון.'
    : 'הסרטונים נשמרים על המכשיר הזה בלבד. הקישורים לא מועלים לשום מקום, והצפייה עצמה נעשית בפלטפורמה שממנה הגיע הסרטון.';

  if (!viewer) {
    /* ברירת המחדל היא כן: בלי זה אין תמונות ואין פתיחת קישור מקוצר.
       מי שמעדיף שהקישורים לא יצאו מהמכשיר מכבה, וזה נזכר. */
    $('v-auto').checked = autoOn();
    $('v-auto').onchange = () => setAuto($('v-auto').checked);
    resetForm();
    fillCategorySelect($('v-cat'), defaultCat());
  }

  /* "כותרת חדשה…" בבחירה פותח שדה טקסט במקום לקפוץ לפאנל הניהול */
  const onCatChange = () => {
    const neu = $('v-cat').value === '__new';
    $('v-newcat').hidden = !neu;
    if (neu) $('v-newcat').focus();
  };
  $('v-cat').addEventListener('change', onCatChange);

  const onPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) { $('v-url').value = text.trim(); setError(''); }
    } catch (e) {
      setError('הדפדפן לא נתן גישה ללוח. אפשר להדביק ידנית בשדה.');
    }
  };
  $('v-paste').addEventListener('click', onPaste);

  const onSubmit = async e => {
    e.preventDefault();
    const url = $('v-url').value;
    if (!normalizeUrl(url)) {
      setError('הקישור לא נראה תקין. הדבק כתובת מלאה, למשל https://www.youtube.com/watch?v=…');
      return;
    }
    let category = $('v-cat').value;
    if (category === '__new') {
      const made = addCategory($('v-newcat').value);
      if (!made) { setError('תן שם לכותרת החדשה, או בחר כותרת קיימת.'); return; }
      category = made.id;
    }
    const fields = {
      url,
      title: $('v-title').value,
      note: $('v-note').value,
      category: category || null
    };

    /* התצוגה המקדימה נמשכת פעם אחת, לפני השמירה: היא מביאה את הכתובת
       המלאה, את שם הסרטון ואת התמונה שלו. הכפתור מדווח, כי זו השהיה של
       שנייה-שתיים שהמשתמש רואה. */
    let log = [];
    let image = null;
    if ($('v-auto').checked) {
      const label = $('v-save').textContent;
      $('v-save').disabled = true;
      $('v-save').textContent = 'מביא תמונה ושם…';
      const got = await lookup(normalizeUrl(url));
      log = got.log;
      image = got.image;
      if (got.full) fields.full = got.full;
      /* הקובץ נשמר כבר עכשיו, כדי שהלחיצה על "נגן" תהיה מיידית */
      if (got.media) fields.media = got.media;
      /* שם שהוקלד ידנית מנצח את מה שהפלטפורמה קוראת לסרטון */
      if (got.title && !fields.title) fields.title = got.title;
      fields.posterUrl = image || null;
      $('v-save').disabled = false;
      $('v-save').textContent = label;
    }

    const saved = editing ? updateVideo(editing, fields) : addVideo(fields);
    if (!saved) { setError('לא הצלחנו לשמור את הקישור.'); return; }
    const wasEditing = !!editing;
    const stuck = needsResolve(saved.url) && !saved.full;
    resetForm();
    fillCategorySelect($('v-cat'), saved.category || '');
    repaint();

    /* התמונה נשמרת אחרי הסרטון ולא לפניו: כך הכרטיס מופיע מיד, והתמונה
       נכנסת אליו כשהיא מוכנה. */
    if (image) {
      await savePoster(saved.id, image, log);
      await loadPosterUrls();
      repaint();
    }
    syncNow(repaint);

    if (!wasEditing) $('v-form').open = true;
    /* נשמר, אבל בלי כתובת מלאה — עדיף לומר את זה מיד מאשר להשאיר את
       הכרטיס בלי כפתור ניגון בלי הסבר */
    if (stuck) {
      setError('הסרטון נשמר, אבל לא הצלחנו לפתוח את הקישור המקוצר לכתובת מלאה. "פתח" עובד, ובכרטיס יש "נסה לפתוח את הקישור".');
      $('v-error').appendChild(report(log));
    }
  };
  $('v-formel').addEventListener('submit', onSubmit);

  const onCancel = () => { resetForm(); fillCategorySelect($('v-cat'), defaultCat()); };
  $('v-cancel').addEventListener('click', onCancel);

  const onCheck = async () => {
    $('v-check').disabled = true;
    $('v-check').textContent = 'בודק…';
    const lines = await probe();
    const box = $('v-checkout');
    box.hidden = false;
    box.textContent = '';
    const list = document.createElement('ul');
    lines.forEach(line => {
      const li = document.createElement('li');
      li.textContent = line;
      list.appendChild(li);
    });
    box.appendChild(list);
    $('v-check').disabled = false;
    $('v-check').textContent = 'בדוק שוב';
  };
  $('v-check').addEventListener('click', onCheck);

  const onManage = () => {
    managing = !managing;
    $('v-managego').setAttribute('aria-expanded', String(managing));
    repaint();
  };
  $('v-managego').addEventListener('click', onManage);

  /* חזרה למסך אחרי שהטלפון היה נעול היא הרגע הטוב ביותר לסנכרן: המשתמש
     בדיוק פתח את הספרייה כדי לראות מה יש בה. */
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !$('videos').hidden) syncNow(repaint);
  };
  document.addEventListener('visibilitychange', onVisible);

  repaint();
  loadPosterUrls().then(repaint);
  if (cloud.isOn()) syncNow(repaint).then(() => backfillPosters(repaint));
  else backfillPosters(repaint);

  /* בספרייה מלאה הרשימה היא מה שרוצים לראות, ולכן הטופס מקופל. בספרייה
     ריקה, ובקישור שהגיע משיתוף, ההוספה היא כל הסיבה שנכנסת לכאן. */
  if (!viewer) {
    $('v-form').open = videoCount() === 0;
    if (prefill && (prefill.url || prefill.title)) openForm(prefill, null);
  }

  return {
    /* מקשי חצים מדלגים בין תרחישים במסכים האחרים; כאן אין מה לדלג */
    go() {},
    destroy() {
      $('v-cat').removeEventListener('change', onCatChange);
      $('v-paste').removeEventListener('click', onPaste);
      $('v-formel').removeEventListener('submit', onSubmit);
      $('v-cancel').removeEventListener('click', onCancel);
      $('v-check').removeEventListener('click', onCheck);
      $('v-managego').removeEventListener('click', onManage);
      document.removeEventListener('visibilitychange', onVisible);
      closeOverlay();
      managing = false;
      resetForm();
    }
  };
}
