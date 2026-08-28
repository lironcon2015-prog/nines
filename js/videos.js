/* ספריית הסרטונים.

   סרטון שראית באינסטגרם או ביוטיוב נשמר כאן כקישור, לא כקובץ — האפליקציה
   אינה מעלה וידאו לשום מקום, והצפייה עצמה נעשית מול הפלטפורמה המקורית.

   הכול יושב במסמך אחד, כי זה מה שמסתנכרן: מסמך שלם עולה ויורד בשלמותו,
   ולכל פריט בתוכו יש מזהה קבוע ו-updatedAt משלו, כדי שמיזוג יכריע פריט
   מול פריט ולא רק מסמך מול מסמך.

   שני מסמכים ולא אחד, לפי מי אתה: מי שמחובר בקוד קריאה רואה את המסמך
   המשותף, והמסמך המקומי שלו ממתין ללא שינוי מתחתיו. כך ילד שמצטרף רואה
   בדיוק את הספרייה של ההורה, ואם ינותק — מה שהיה לו חוזר.

   התמונות עצמן אינן כאן אלא ב-IndexedDB (posters.js). כאן נשמר רק מה
   שצריך כדי למצוא אותן: איזה סוג תמונה יש, ואיפה היא בספרייה המשותפת. */

import * as cloud from './cloud.js';
import * as posters from './posters.js';

const LOCAL_KEY = 'k8:videos';
const SHARED_KEY = 'k8:videos:shared';
const DOC_VERSION = 2;

/* שלוש הכותרות שאיתן מתחילים. אפשר להוסיף, לשנות שם ולמחוק — ולכן הן
   נשמרות כרשומות עם מזהה, ולא כמחרוזות: שינוי שם לא מיתם את הסרטונים. */
const SEED = ['אימוני טכניקה', 'אימוני טקטיקה', 'אימוני כושר'];

/* מחיקה אינה הסרה מיידית אלא סימון. בלי זה, סרטון שמחקת היה קם לתחייה
   מהמכשיר השני בסנכרון הבא — הוא עדיין קיים שם, ולמיזוג אין דרך לדעת
   שהוא נמחק ולא שנוסף. אחרי חודש הסימון עצמו נמחק. */
const TOMB_DAYS = 30;

const now = () => Date.now();
const uid = () => now().toString(36) + Math.random().toString(36).slice(2, 7);

function emptyDoc() {
  return {
    v: DOC_VERSION,
    updatedAt: now(),
    categories: SEED.map(name => ({ id: uid(), name, at: now(), updatedAt: now() })),
    videos: []
  };
}

function activeKey() {
  return cloud.isViewer() ? SHARED_KEY : LOCAL_KEY;
}

function readDoc(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.categories) && Array.isArray(parsed.videos)) return parsed;
    }
  } catch (e) { /* מצב פרטי או מסמך פגום — מתחילים מחדש */ }
  /* המצטרף מתחיל ריק ולא עם שלוש כותרות משלו — הן יגיעו מהסנכרון */
  return key === SHARED_KEY
    ? { v: DOC_VERSION, updatedAt: 0, categories: [], videos: [] }
    : emptyDoc();
}

let doc = readDoc(activeKey());

/** נטען מחדש אחרי חיבור או ניתוק, כי המסמך הפעיל התחלף */
export function reload() {
  doc = readDoc(activeKey());
  return doc;
}

function save() {
  doc.updatedAt = now();
  try {
    localStorage.setItem(activeKey(), JSON.stringify(doc));
  } catch (e) {
    /* המסמך כבר אינו נושא תמונות, ולכן הוא קטן בסדר גודל ממה שהיה ואין
       כאן מה לזרוק. אם בכל זאת אין מקום — עדיף לשמור בלי המצבות הישנות
       מאשר לא לשמור בכלל. */
    purgeTombstones(0);
    try { localStorage.setItem(activeKey(), JSON.stringify(doc)); } catch (e2) { /* ויתרנו */ }
  }
  return doc;
}

/** המסמך כולו — מה שנשלח לספרייה המשותפת */
export function exportDoc() {
  return JSON.parse(JSON.stringify(doc));
}

/** האם המכשיר הזה רואה בלבד. כל פעולת כתיבה נעצרת כאן. */
export function readOnly() {
  return cloud.isViewer();
}

/* --- מעבר מגרסה 1 ---
   בגרסה הקודמת התמונה ישבה בתוך המסמך כמחרוזת data URI. היא עוברת
   ל-IndexedDB כמו שהיא, ולא נזרקת: זו תמונה תקינה שכבר שולמה עליה רשת.
   מה שהיה כתובת ולא תמונה מסומן כחסר, וההשלמה ברקע תביא אותו. */
export async function migrate() {
  for (const key of [LOCAL_KEY, SHARED_KEY]) {
    let target;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      target = JSON.parse(raw);
    } catch (e) { continue; }
    if (!target || !Array.isArray(target.videos) || target.v >= DOC_VERSION) continue;

    for (const v of target.videos) {
      const old = v.poster;
      delete v.poster;
      if (typeof old === 'string' && old.startsWith('data:')) {
        const blob = dataUrlToBlob(old);
        if (blob && await posters.put(v.id, blob)) { v.posterKind = 'blob'; continue; }
      }
      /* כתובת שנשמרה בטעות בשדה התמונה — היא עדיין שווה ניסיון הצגה,
         אבל היא אינה תמונה שמורה ולכן הכרטיס נכנס לתור ההשלמה */
      if (typeof old === 'string' && /^https?:/.test(old) && !v.posterUrl) v.posterUrl = old;
      v.posterKind = null;
    }
    target.v = DOC_VERSION;
    try { localStorage.setItem(key, JSON.stringify(target)); } catch (e) { /* לא קריטי */ }
  }
  doc = readDoc(activeKey());
  purgeTombstones();
}

function dataUrlToBlob(url) {
  try {
    const [head, data] = url.split(',');
    const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch (e) {
    return null;
  }
}

/* --- מצבות --- */

function purgeTombstones(days) {
  const cutoff = now() - (days === undefined ? TOMB_DAYS : days) * 24 * 60 * 60 * 1000;
  const gone = doc.videos.filter(v => v.deleted && v.updatedAt < cutoff).map(v => v.id);
  if (!gone.length && !doc.categories.some(c => c.deleted && c.updatedAt < cutoff)) return;
  doc.videos = doc.videos.filter(v => !(v.deleted && v.updatedAt < cutoff));
  doc.categories = doc.categories.filter(c => !(c.deleted && c.updatedAt < cutoff));
  gone.forEach(id => posters.drop(id));
}

/* --- מיזוג ---
   פריט מול פריט לפי updatedAt, ולא מסמך מול מסמך. זה מה שמונע את המצב
   שבו סרטון שהוא הוסיף מוחק סרטון שאתה הוספת באותה שעה. אותו אלגוריתם
   בדיוק רץ גם בסקריפט שבדרייב, כדי ששני הצדדים יגיעו לאותה תוצאה. */

export function mergeInto(base, incoming) {
  if (!incoming || !Array.isArray(incoming.videos)) return { doc: base, changed: false };
  let changed = false;
  const merge = (mine, theirs) => {
    const by = new Map();
    mine.forEach(item => by.set(item.id, item));
    theirs.forEach(item => {
      if (!item || !item.id) return;
      const have = by.get(item.id);
      if (!have) { by.set(item.id, item); changed = true; return; }
      if ((item.updatedAt || 0) > (have.updatedAt || 0)) { by.set(item.id, item); changed = true; }
    });
    return [...by.values()];
  };
  base.categories = merge(base.categories || [], incoming.categories || []);
  base.videos = merge(base.videos || [], incoming.videos || []);
  return { doc: base, changed };
}

/** ממזגת מסמך שהגיע מהספרייה המשותפת אל המסמך הפעיל, ושומרת */
export function applyRemote(remote) {
  if (!remote) return false;
  if (cloud.isViewer()) {
    /* צופה אינו ממזג אלא מקבל: המסמך המשותף הוא האמת, ואין לו שינויים
       משלו שאפשר לאבד. בלי זה, מחיקה אצל ההורה לא הייתה מגיעה אליו. */
    const same = doc.updatedAt === remote.updatedAt && doc.videos.length === remote.videos.length;
    doc = remote;
    doc.v = DOC_VERSION;
    save();
    return !same;
  }
  const { changed } = mergeInto(doc, remote);
  if (changed) save();
  purgeTombstones();
  return changed;
}

/* --- קטגוריות --- */

export function listCategories() {
  return doc.categories.filter(c => !c.deleted);
}

export function categoryName(id) {
  const c = doc.categories.find(x => x.id === id && !x.deleted);
  return c ? c.name : '';
}

/** מחזירה את הקטגוריה — קיימת או חדשה. שם שכבר קיים אינו נוצר פעמיים. */
export function addCategory(name) {
  if (readOnly()) return null;
  const clean = String(name || '').trim();
  if (!clean) return null;
  const same = doc.categories.find(c => c.name === clean && !c.deleted);
  if (same) return same;
  const cat = { id: uid(), name: clean, at: now(), updatedAt: now() };
  doc.categories.push(cat);
  save();
  return cat;
}

export function renameCategory(id, name) {
  if (readOnly()) return false;
  const clean = String(name || '').trim();
  const cat = doc.categories.find(c => c.id === id && !c.deleted);
  if (!cat || !clean) return false;
  cat.name = clean;
  cat.updatedAt = now();
  save();
  return true;
}

/** מחיקת כותרת אינה מוחקת סרטונים — הם עוברים ל"בלי כותרת" */
export function removeCategory(id) {
  if (readOnly()) return false;
  const cat = doc.categories.find(c => c.id === id && !c.deleted);
  if (!cat) return false;
  cat.deleted = true;
  cat.updatedAt = now();
  doc.videos.forEach(v => {
    if (v.category === id) { v.category = null; v.updatedAt = now(); }
  });
  save();
  return true;
}

export function countByCategory() {
  const counts = {};
  listVideos().forEach(v => {
    const k = v.category || '';
    counts[k] = (counts[k] || 0) + 1;
  });
  return counts;
}

/* --- סרטונים --- */

/** החדש למעלה: מה שהוספת עכשיו הוא מה שאתה מחפש */
export function listVideos(categoryId) {
  const all = doc.videos.filter(v => !v.deleted).sort((a, b) => b.at - a.at);
  if (categoryId === undefined || categoryId === null) return all;
  if (categoryId === '') return all.filter(v => !v.category);
  return all.filter(v => v.category === categoryId);
}

export function getVideo(id) {
  return doc.videos.find(v => v.id === id && !v.deleted) || null;
}

/** null אם הקישור אינו כתובת http/https תקינה, או אם אין הרשאת כתיבה */
export function addVideo({ url, title, note, category, full, posterUrl, posterKind, posterRef, media }) {
  if (readOnly()) return null;
  const clean = normalizeUrl(url);
  if (!clean) return null;
  const video = {
    id: uid(),
    url: clean,
    /* הכתובת המלאה שנפתחה מקישור מקוצר. הקישור המקורי נשמר כמו שהוא, כי
       הוא מה שרואים ב"פתח" והוא עובד; full משמש רק לנגן המשובץ. */
    full: full ? normalizeUrl(full) : null,
    /* 'blob' = התמונה שמורה במכשיר. null = אין, וההשלמה ברקע תביא אותה.
       בלי הסימן הזה אי אפשר להבחין בין תמונה שנשמרה לכתובת שפגה. */
    posterKind: posterKind || null,
    /* הכתובת המקורית, כנפילה בלבד. היא חתומה ופגה, ולכן אינה תחליף. */
    posterUrl: posterUrl || null,
    /* מזהה התמונה בתיקייה המשותפת, כדי שהמכשיר השני ימשוך אותה */
    posterRef: posterRef || null,
    /* קובץ הווידאו עצמו, כפי שהדף של הסרטון מצהיר עליו. הכתובת חתומה
       ופגה אחרי שעות, ולכן נשמר גם מתי — ראה mediaFresh. */
    media: media || null,
    mediaAt: media ? now() : 0,
    platform: detectPlatform(clean).id,
    title: String(title || '').trim() || defaultTitle(clean),
    note: String(note || '').trim(),
    category: category || null,
    at: now(),
    updatedAt: now()
  };
  doc.videos.unshift(video);
  save();
  return video;
}

export function updateVideo(id, patch) {
  if (readOnly()) return null;
  const video = doc.videos.find(v => v.id === id && !v.deleted);
  if (!video) return null;
  if (patch.url !== undefined) {
    const clean = normalizeUrl(patch.url);
    if (!clean) return null;
    /* כתובת חדשה מבטלת פתיחה קודמת — היא שייכת לקישור הישן */
    if (clean !== video.url) {
      video.full = null; video.posterUrl = null; video.posterKind = null;
      video.posterRef = null; video.media = null;
      posters.drop(video.id);
    }
    video.url = clean;
    video.platform = detectPlatform(clean).id;
  }
  if (patch.full !== undefined) video.full = patch.full ? normalizeUrl(patch.full) : null;
  if (patch.posterKind !== undefined) video.posterKind = patch.posterKind || null;
  if (patch.posterUrl !== undefined) video.posterUrl = patch.posterUrl || null;
  if (patch.posterRef !== undefined) video.posterRef = patch.posterRef || null;
  if (patch.media !== undefined) {
    video.media = patch.media || null;
    video.mediaAt = patch.media ? now() : 0;
  }
  if (patch.title !== undefined) video.title = String(patch.title).trim() || defaultTitle(video.url);
  if (patch.note !== undefined) video.note = String(patch.note).trim();
  if (patch.category !== undefined) video.category = patch.category || null;
  video.updatedAt = now();
  save();
  return video;
}

export function removeVideo(id) {
  if (readOnly()) return false;
  const video = doc.videos.find(v => v.id === id && !v.deleted);
  if (!video) return false;
  video.deleted = true;
  video.updatedAt = now();
  save();
  posters.drop(id);
  return true;
}

export function videoCount() {
  return listVideos().length;
}

/* --- התמונות ---
   שלוש דרגות, לפי הסדר: תמונה שמורה במכשיר · תמונה בתיקייה המשותפת
   שעוד לא ירדה · כתובת מקורית שאולי עוד עובדת. אם כל אלה נכשלו — אריח. */

/** מה חסר לו תמונה שמורה. זה מה שההשלמה ברקע עוברת עליו. */
export function needsPoster(savedIds) {
  return listVideos().filter(v => !(savedIds && savedIds.has(v.id)));
}

/** מה אפשר להוריד מהתיקייה המשותפת במקום למשוך שוב מהרשת */
export function needsDownload(savedIds) {
  return listVideos().filter(v => v.posterRef && !(savedIds && savedIds.has(v.id)));
}

/** כתובות התמונה של הכרטיס לפי סדר עדיפות. blobUrl מגיע מ-posters.url() */
export function posterCandidates(video, blobUrl) {
  return [blobUrl, video.posterUrl, thumbUrl(video.full || video.url)].filter(Boolean);
}

/* --- הקישור עצמו --- */

/* קישור שמועתק מאפליקציה מגיע לפעמים בלי http, ולפעמים עם זנב מעקב.
   מנקים את שניהם: בלי הסכימה new URL נופל, והזנב רק מאריך את הכתובת. */
const TRACKING = /^(utm_|fbclid$|igshid$|igsh$|si$|_r$|_t$|feature$)/;

export function normalizeUrl(raw) {
  let text = String(raw || '').trim();
  if (!text) return null;
  /* הדבקה מאפליקציה מביאה לפעמים משפט שלם עם הקישור בתוכו */
  const found = text.match(/https?:\/\/\S+/);
  if (found) text = found[0];
  else if (/^[\w-]+(\.[\w-]+)+\//.test(text)) text = 'https://' + text;
  let url;
  try { url = new URL(text); } catch (e) { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  [...url.searchParams.keys()].forEach(k => { if (TRACKING.test(k)) url.searchParams.delete(k); });
  return url.toString();
}

const PLATFORMS = [
  { id: 'youtube',   name: 'יוטיוב',    hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'] },
  { id: 'instagram', name: 'אינסטגרם',  hosts: ['instagram.com'] },
  { id: 'facebook',  name: 'פייסבוק',   hosts: ['facebook.com', 'fb.watch', 'fb.com'] },
  { id: 'tiktok',    name: 'טיקטוק',    hosts: ['tiktok.com'] },
  { id: 'x',         name: 'X',         hosts: ['x.com', 'twitter.com'] },
  { id: 'vimeo',     name: 'וימאו',     hosts: ['vimeo.com'] },
  { id: 'drive',     name: 'דרייב',     hosts: ['drive.google.com', 'photos.app.goo.gl', 'photos.google.com'] },
  { id: 'whatsapp',  name: 'וואטסאפ',   hosts: ['whatsapp.com'] }
];

const OTHER = { id: 'link', name: 'קישור' };

/** לפי הדומיין, עם התאמה גם לתת-דומיין (m.youtube.com, www.) */
export function detectPlatform(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch (e) { return OTHER; }
  const hit = PLATFORMS.find(p => p.hosts.some(h => host === h || host.endsWith('.' + h)));
  return hit || OTHER;
}

export function platformName(id) {
  const hit = PLATFORMS.find(p => p.id === id);
  return hit ? hit.name : OTHER.name;
}

/** כשלא הוקלדה כותרת — משהו קריא מהכתובת, עדיף על שורה ריקה */
function defaultTitle(url) {
  const p = detectPlatform(url);
  try {
    const path = new URL(url).pathname.split('/').filter(Boolean);
    const last = path[path.length - 1] || '';
    return last ? p.name + ' · ' + decodeURIComponent(last).slice(0, 40) : p.name;
  } catch (e) {
    return p.name;
  }
}

function youtubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    const v = u.searchParams.get('v');
    if (v) return v;
    const m = u.pathname.match(/\/(shorts|embed|live|v)\/([^/?#]+)/);
    return m ? m[2] : null;
  } catch (e) { return null; }
}

/** מזהה קובץ בדרייב, מכל אחת מצורות הקישור שגוגל מייצרת */
export function driveId(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('drive.google.com')) return null;
    const m = u.pathname.match(/\/file\/d\/([^/?#]+)/);
    if (m) return m[1];
    return u.searchParams.get('id');
  } catch (e) { return null; }
}

/** תמונה מוקטנת בלי רשת נוספת — קיימת רק ליוטיוב, ולכן היא נופלת בשקט */
export function thumbUrl(url) {
  const id = detectPlatform(url).id === 'youtube' ? youtubeId(url) : null;
  return id ? 'https://i.ytimg.com/vi/' + encodeURIComponent(id) + '/hqdefault.jpg' : null;
}

/* נגינה בתוך הדף — רק בפלטפורמות שמאפשרות זאת בלי סקריפט שלהן.
   כשאין, נשארים עם "פתח" שמעביר לאפליקציה המקורית. */
export function embedUrl(url) {
  const platform = detectPlatform(url).id;
  let u;
  try { u = new URL(url); } catch (e) { return null; }

  if (platform === 'youtube') {
    const id = youtubeId(url);
    return id ? 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?rel=0&playsinline=1' : null;
  }
  if (platform === 'instagram') {
    const m = u.pathname.match(/\/(p|reel|reels|tv)\/([^/?#]+)/);
    if (!m) return null;
    const kind = m[1] === 'reels' ? 'reel' : m[1];
    return 'https://www.instagram.com/' + kind + '/' + encodeURIComponent(m[2]) + '/embed';
  }
  if (platform === 'facebook') {
    /* התוסף של פייסבוק פותח רק כתובת מלאה של סרטון. קישור מקוצר —
       fb.watch או facebook.com/share/... — הוא הפניה, והתוסף אינו הולך
       אחריה: הוא מחזיר "Video unavailable" גם כשהסרטון עצמו תקין. */
    if (u.hostname.endsWith('fb.watch')) return null;
    if (/^\/share\//.test(u.pathname)) return null;
    const known = /\/videos\//.test(u.pathname)
      || /\/reel\/\d+/.test(u.pathname)
      || /\/posts\//.test(u.pathname)
      || u.pathname.startsWith('/watch')
      || u.pathname.startsWith('/video.php');
    if (!known) return null;
    return 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(url) + '&show_text=false';
  }
  if (platform === 'tiktok') {
    const m = u.pathname.match(/\/video\/(\d+)/);
    return m ? 'https://www.tiktok.com/embed/v2/' + m[1] : null;
  }
  /* דרייב: קליפים שצולמו במגרש. זה שיבוץ ולא הצמדת תמונה, ולכן הוא לא
     נפגע מהשינוי שגוגל עשתה בהצמדה חיצונית — הוא עובד לכל קובץ ששותף
     ל"כל מי שיש לו הקישור". */
  if (platform === 'drive') {
    const id = driveId(url);
    return id ? 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/preview' : null;
  }
  return null;
}

/* כתובת של קובץ בפייסבוק ובאינסטגרם חתומה ופגה. שלוש שעות הן הערכה
   שמרנית: מעבר להן מרעננים לפני הניגון במקום להראות נגן שנופל. */
const MEDIA_TTL = 3 * 60 * 60 * 1000;

export function mediaFresh(video) {
  return !!(video.media && Date.now() - (video.mediaAt || 0) < MEDIA_TTL);
}

/** הכתובת שהנגן מקבל: המלאה אם נפתחה, אחרת המקורית */
export function playable(video) {
  return video.full || video.url;
}

/* למה אין כפתור "נגן כאן". מוחזר רק כשהפלטפורמה בעצם יודעת לשבץ, אבל
   הקישור המסוים הזה לא — כדי שההסבר יופיע בדיוק במקום שבו הכפתור חסר. */
export function embedBlocked(url) {
  if (embedUrl(url)) return null;
  const platform = detectPlatform(url).id;
  let u;
  try { u = new URL(url); } catch (e) { return null; }

  if (platform === 'facebook') {
    if (u.hostname.endsWith('fb.watch') || /^\/share\//.test(u.pathname)) {
      return 'לא הצלחנו לפתוח את הקישור המקוצר הזה לכתובת מלאה, ולכן אין ניגון בתוך הדף. "פתח" עובד כרגיל.';
    }
    return 'פייסבוק מנגנת בתוך הדף רק סרטונים ציבוריים עם כתובת מלאה.';
  }
  if (platform === 'tiktok') return 'לא הצלחנו לפתוח את הקישור המקוצר הזה לכתובת מלאה. "פתח" עובד כרגיל.';
  if (platform === 'instagram') return 'אינסטגרם מנגנת בתוך הדף רק פוסטים ורילסים ציבוריים.';
  if (platform === 'drive') return 'הקובץ הזה בדרייב אינו משותף ל"כל מי שיש לו הקישור", ולכן אי אפשר לנגן אותו כאן.';
  return null;
}

/* רילסים וטיקטוק הם לאורך — מסגרת רחבה הייתה משאירה שתי רצועות שחורות */
export function isPortrait(url) {
  const platform = detectPlatform(url).id;
  if (platform === 'tiktok') return true;
  try {
    const path = new URL(url).pathname;
    if (platform === 'instagram') return /\/(reel|reels)\//.test(path);
    if (platform === 'facebook') return /\/reel\//.test(path);
  } catch (e) { /* כתובת פגומה — מסגרת רגילה */ }
  return false;
}
