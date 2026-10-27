/* תצוגה מקדימה של קישור: הכתובת המלאה, שם הסרטון והתמונה שלו.

   זה מה שוואטסאפ מציג כשמדביקים בו קישור, והוא מגיע מאותו מקום: תגיות
   og:title ו-og:image בדף של הסרטון. דף אינו יכול לקרוא דף מדומיין אחר
   (CORS), ולכן צריך שירות שמושך אותו במקומנו ומחזיר את מה שמצא. אותו
   שירות פותר גם קישור מקוצר — fb.watch ו-facebook.com/share הם הפניות,
   והנגן המשובץ של פייסבוק אינו הולך אחריהן.

   כשהספרייה המשותפת מוגדרת, הסקריפט שבדרייב הוא השירות: הוא רץ בחשבון
   שלך, אין לו מגבלת בקשות מעשית, והוא לא כפוף ל-CORS בכלל. ארבעת
   השירותים החינמיים נשארים מתחתיו כנפילה, למי שעדיין לא הקים סקריפט —
   כל אחד מהם נופל לפעמים ולכל אחד יש עיוורון אחר. */

import { normalizeUrl, embedUrl, detectPlatform, thumbUrl } from './videos.js';
import * as cloud from './cloud.js';

const TIMEOUT = 8000;
/* תקרה לכל החיפוש. בלי זה, ארבעה ספקים תקועים היו מחזיקים את כפתור
   השמירה ארבעים שניות — והמשתמש מחכה מול הטלפון כל הזמן הזה. */
const BUDGET = 15000;

/* AbortSignal.timeout קיים רק מ-Safari 16, ובאייפון ישן יותר הוא זורק
   מיד — כלומר כל הספקים נכשלים בבת אחת עוד לפני שיצאה בקשה אחת.
   AbortController קיים מאז ומתמיד, ולכן הפסק הזמן נבנה ידנית. */
function withTimeout(url, ms, init) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, ms || TIMEOUT);
  const options = Object.assign({}, init, ctrl ? { signal: ctrl.signal } : {});
  return fetch(url, options).finally(() => clearTimeout(timer));
}

const PROVIDERS = [
  {
    id: 'microlink',
    build: u => 'https://api.microlink.io/?url=' + encodeURIComponent(u),
    read: async res => {
      const json = await res.json();
      const d = (json && json.data) || {};
      return {
        full: d.url || null,
        title: d.title || null,
        image: (d.image && d.image.url) || (d.logo && d.logo.url) || null,
        /* הקובץ עצמו. זה מה שמאפשר לנגן בלי הנגן של פייסבוק. */
        media: (d.video && d.video.url) || null
      };
    }
  },
  {
    id: 'jina',
    /* JSON ולא הטקסט: ב-JSON מגיעות תגיות ה-meta של הדף (metadata), ובהן
       og:image. בטקסט אין אותן, והתמונה הראשונה בו היא סמל של פייסבוק
       (static.xx.fbcdn.net/rsrc.php) — היא זו שנשמרה, וכשגם microlink
       מיצה את המכסה היומית, סרטון מפייסבוק נשאר בלי תמונה (אוקטובר 2026) */
    build: u => 'https://r.jina.ai/' + u,
    init: { headers: { Accept: 'application/json' } },
    read: async res => {
      const json = await res.json();
      const d = (json && json.data) || {};
      const meta = d.metadata || {};
      const text = d.content || '';
      const line = re => { const m = text.match(re); return m ? m[1].trim() : null; };
      return {
        /* og:url היא הכתובת אחרי ההפניה; d.url היא מה שביקשנו — בקישור שיתוף זו ההפניה עצמה */
        full: meta['og:url'] || d.url || null,
        title: meta['og:title'] || d.title || null,
        image: meta['og:image'] || meta['twitter:image'] || contentImage(text),
        media: meta['og:video:secure_url'] || meta['og:video'] || line(/(https?:\/\/[^\s")]+\.mp4[^\s")]*)/)
      };
    }
  },
  {
    id: 'allorigins',
    build: u => 'https://api.allorigins.win/get?url=' + encodeURIComponent(u),
    read: async res => {
      const json = await res.json();
      const html = (json && json.contents) || '';
      return Object.assign(fromHtml(html), {
        full: (json && json.status && json.status.url) || fromHtml(html).full
      });
    }
  },
  {
    id: 'codetabs',
    build: u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
    read: async res => fromHtml(await res.text())
  }
];

/** האם צריך לפנות החוצה בשביל הכתובת עצמה (ולא רק בשביל תמונה) */
export function needsResolve(url) {
  const platform = detectPlatform(url).id;
  if (!['facebook', 'instagram', 'tiktok'].includes(platform)) return false;
  return !embedUrl(url);
}

/** מה שידוע על הקישור. השדות שלא נמצאו חוזרים null, והשאר עדיין שימושי. */
export async function lookup(url, opts) {
  const wantMedia = !!(opts && opts.media);
  const out = { full: null, title: null, image: thumbUrl(url), media: null, log: [] };
  /* מתי אפשר להפסיק: יש שם, יש תמונה, ויש **דרך אחת** לנגן — הקובץ
     עצמו, או נגן משובץ שכבר עכשיו אפשר לבנות מהכתובת. קישור יוטיוב
     נסגר כך אחרי בקשה אחת: אין לו og:video, ואין שום טעם להעיר בגללו
     עוד שלושה שירותים ולהמתין להם. */
  const playable = () => out.media || embedUrl(url) || (out.full && embedUrl(out.full));
  /* לפני ניגון רק הקובץ נחשב. בלי זה, באינסטגרם — שתמיד יש לה נגן
     משובץ — החיפוש נעצר אחרי שם ותמונה מהספק הראשון, ואף ספק אחר לא
     נשאל על הקובץ. הנגן המשובץ שלהם לרוב לא מנגן ("Watch on Instagram")
     ושולח לאינסטגרם — בדיוק מה שבעל הריפו נתקל בו. */
  const enough = wantMedia ? () => !!out.media : () => out.title && out.image && playable();

  /* הסקריפט והספק הראשון יוצאים **ביחד**, וחוזרים ברגע שיש מספיק — ממי
     שענה ראשון. פעם הסקריפט יצא לבד ראשון: Apps Script מתעורר לאט (עד
     עשרים שניות), ואינסטגרם חוסמת שרתים ולכן הוא החזיר הרבה פעמים חצי
     תשובה — ורק אחרי כל ההמתנה הזאת נשלח הספק שהיה עונה בשנייה. ספריית
     המתכונים בלי סקריפט הייתה מהירה פי כמה מ-nines עם סקריפט, באותו קוד.
     המחיר: microlink נשאל גם כשיש סקריפט, ויש לו מכסה יומית — הסקריפט
     נשאר לצידו, כך שגם כשהמכסה נגמרת לא הפסדנו כלום. */
  let done = false;
  const deadline = new Promise(resolve => setTimeout(() => {
    if (!done) out.log.push('נגמר הזמן');
    resolve();
  }, BUDGET));
  const pending = [];
  if (cloud.isOn()) pending.push(viaScript(url, out));
  /* הקובץ — כולם מיד: מישהו לחץ ▶ ומחכה, ואין טעם לחכות לראשון */
  pending.push(...(wantMedia ? PROVIDERS : PROVIDERS.slice(0, 1)).map(p => visit(p, url, out)));
  await Promise.race([until(pending, enough), deadline]);

  /* לא הספיק — שאר הספקים, ביחד ולא בזה אחר זה: בטור, שני ספקים תקועים
     אכלו שש-עשרה שניות לפני שהשלישי בכלל התחיל */
  if (!enough() && !wantMedia) {
    pending.push(...PROVIDERS.slice(1).map(p => visit(p, url, out)));
    await Promise.race([until(pending, enough), deadline]);
  }
  done = true;
  return out;
}

/** רק הקובץ, לרענון לפני ניגון — כתובת של קובץ בפייסבוק פגה אחרי שעות.
    full: הכתובת המלאה, כשכבר ידועה (קישור שיתוף של פייסבוק הוא הפניה).
    blocked: אינסטגרם לא מרשה לנגן את הסרטון מחוץ לה (ראה igMedia). */
export async function refreshMedia(url, full) {
  const platform = detectPlatform(url).id;
  if (platform === 'instagram') {
    const ig = await igMedia(url);
    /* לא ענה — אין מה לחפש אצל השאר: og:video לא קיים באינסטגרם */
    return { media: ig.media, blocked: ig.blocked, full: null, log: ig.log };
  }
  if (platform === 'facebook') {
    const fb = await fbMedia(full || url);
    if (fb.media) return { media: fb.media, blocked: false, full: null, log: fb.log };
    const found = await lookup(url, { media: true });
    /* קישור שיתוף בלי כתובת מלאה: החיפוש פתר אותה — עכשיו הנגן המשובץ */
    if (!found.media && found.full && found.full !== full) {
      const again = await fbMedia(found.full);
      found.media = again.media;
      fb.log.push(...again.log);
    }
    return { media: found.media, blocked: false, full: found.full, log: fb.log.concat(found.log) };
  }
  const found = await lookup(url, { media: true });
  return { media: found.media, blocked: false, full: found.full, log: found.log };
}

/* --- פייסבוק: הקובץ מהנגן המשובץ ---
   הנגן המשובץ של פייסבוק בונה באייפון <video> בלי playsinline ועם
   playinfullscreen — כל ניגון בו נפתח בנגן של המערכת, בלי הנגן שלנו ובלי
   המחוות. og:video אין, ולכן אף ספק לא מצא קובץ, והנגן נפל אליו תמיד (נבדק,
   אוקטובר 2026). אבל הדף שלו (plugins/video.php) נושא את הקובץ עצמו:
   "hd_src" ו-"sd_src", גם לרילס (/reel/<id>), H.264 עם התחלה מיידית, וה-CDN
   מתיר ניגון מכל מקור. אותו מסלול כמו באינסטגרם: jina, X-Return-Format: html. */
async function fbMedia(href) {
  if (!embedUrl(href)) return { media: null, blocked: false, log: ['פייסבוק: אין כתובת מלאה'] };
  return firstFile([viaServerFile(href), viaScriptFile(href), fbJina(href)]);
}

async function fbJina(href) {
  const out = { media: null, blocked: false, log: [] };
  const page = embedUrl(href);
  try {
    const res = await withTimeout('https://r.jina.ai/' + page, TIMEOUT, { headers: { 'X-Return-Format': 'html' } });
    if (!res.ok) { out.log.push('jina: ' + res.status); return out; }
    out.media = fbSrc(await res.text());
    out.log.push('jina: ' + (out.media ? 'קובץ' : 'בלי קובץ'));
  } catch (e) {
    out.log.push('jina: ' + reason(e));
  }
  return out;
}

/* "hd_src":"https:\/\/video…mp4?…" — מחרוזת JSON. HD קודם (720p): רואים בו
   את הרגל על הכדור; SD הוא 360p */
export function fbSrc(html) {
  for (const key of ['hd_src', 'sd_src']) {
    const m = html.match(new RegExp('"' + key + '":"((?:\\\\.|[^"\\\\])*)"'));
    if (!m) continue;
    try {
      const file = JSON.parse('"' + m[1] + '"');
      if (/^https:\/\//.test(file)) return file;
    } catch (e) { /* מחרוזת פגומה — הבאה בתור */ }
  }
  return null;
}

/* --- אינסטגרם: הקובץ מהנגן המשובץ ---
   בדף של הרילס אין og:video, ולכן אף ספק לא מצא קובץ באינסטגרם (נבדק מול
   רילסים אמיתיים, אוקטובר 2026). הקובץ נמצא בנגן המשובץ — הדף שאינסטגרם
   עצמה מגישה לשיבוץ באתרים — בתוך contextJSON:
     gql_data.shortcode_media.video_url (בקרוסלה — בפריטים שבתוכה)
   כשאינסטגרם לא מרשה לנגן מחוץ לה (זכויות, כמעט תמיד על המוזיקה), אין שם
   קובץ, ו-context.copyright_blocked=true; הנגן שלה מראה אז "Watch on
   Instagram" ושולח אליה. את זה לא עוקפים — רק יודעים מראש ואומרים.

   jina מחזיר את הדף כמו שהוא (X-Return-Format: html) ומתיר את הכותרת הזו
   מהמקור שלנו, בשנייה. allorigins ו-codetabs נפלו באותה בדיקה (522). */
async function igMedia(url) {
  return firstFile([viaServerFile(url), viaScriptFile(url), igJina(url)]);
}

async function igJina(url) {
  const out = { media: null, blocked: false, log: [] };
  let id = null;
  try { const m = new URL(url).pathname.match(/\/(?:p|reels?|tv)\/([^/?#]+)/); id = m && m[1]; } catch (e) { /* כתובת פגומה */ }
  if (!id) { out.log.push('אינסטגרם: אין מזהה בכתובת'); return out; }
  const page = 'https://www.instagram.com/p/' + encodeURIComponent(id) + '/embed/captioned/';
  try {
    const res = await withTimeout('https://r.jina.ai/' + page, TIMEOUT, { headers: { 'X-Return-Format': 'html' } });
    if (!res.ok) { out.log.push('jina: ' + res.status); return out; }
    const data = embedData(await res.text());
    if (!data) { out.log.push('jina: בלי נתוני הנגן'); return out; }
    const media = data.gql_data && data.gql_data.shortcode_media;
    const file = media && (media.video_url || firstChildVideo(media));
    if (file && /^https:\/\//.test(file)) out.media = file;
    out.blocked = !out.media && !!(data.context && data.context.copyright_blocked);
    out.log.push('jina: ' + (out.media ? 'קובץ' : out.blocked ? 'חסום מחוץ לאינסטגרם' : 'בלי קובץ'));
  } catch (e) {
    out.log.push('jina: ' + reason(e));
  }
  return out;
}

/* "contextJSON":"{\"context\":…}" — מחרוזת JSON בתוך מחרוזת JSON */
function embedData(html) {
  const m = html.match(/"contextJSON":"((?:\\.|[^"\\])*)"/);
  if (!m) return null;
  try { return JSON.parse(JSON.parse('"' + m[1] + '"')); } catch (e) { return null; }
}

function firstChildVideo(media) {
  const kids = (media.edge_sidecar_to_children && media.edge_sidecar_to_children.edges) || [];
  const hit = kids.find(k => k && k.node && k.node.video_url);
  return hit ? hit.node.video_url : null;
}

/* --- שלושה מסלולים לקובץ, ביחד ---
   שרת הסרטונים בקלאודפלייר (server/ בריפו Recipes) — שרת שלך, ועונה בחלקיק
   שנייה. הסקריפט שלך בדרייב — גם שרת שלך, אבל מתעורר לאט. jina — בלי הקמה, אבל שירות חינמי לכולם: באוקטובר 2026 הוא חסם
   את אינסטגרם לכל מי שאינו רשום ("due to previous abuse"), והנגן נפל לנגן של
   אינסטגרם. הראשון שמביא קובץ זוכה, בלי לחכות לאיטי — הסקריפט מתעורר לאט.
   אף אחד לא הביא — "חסום" אם מישהו ראה חסימה של זכויות. */
function firstFile(routes) {
  const live = routes.filter(Boolean);
  const log = [];
  let left = live.length;
  let blocked = false;
  return new Promise(resolve => {
    live.forEach(route => route.then(r => {
      log.push(...r.log);
      if (r.media) { resolve({ media: r.media, blocked: false, log }); return; }
      blocked = blocked || !!r.blocked;
      if (--left === 0) resolve({ media: null, blocked, log });
    }));
  });
}

/** למה הקובץ לא הגיע, במילים — כשהנגן נופל לנגן שלהם. null כשאין מה להציע */
export function whyNoFile(log, name) {
  if ((log || []).some(line => /פעולה לא מוכרת: media/.test(line))) {
    return 'הסקריפט בדרייב צריך עדכון כדי לנגן כאן: פריסה ← ניהול פריסות ← עריכה ← גרסה חדשה';
  }
  /* השרת בקלאודפלייר הוא המסלול הראשי — כשגם הוא לא הביא, זה רגעי או סרטון מיוחד */
  return 'לא הצלחנו להביא את הקובץ כרגע, ולכן הנגן של ' + name + '. אפשר לנסות שוב בעוד רגע.';
}

/* על הדומיין שלך ולא על workers.dev: הסלולרי חוסם את workers.dev (כך ב-MGivatayim) */
const MEDIA_SERVER = 'https://media.lironcon.com';

function viaServerFile(url) {
  return withTimeout(MEDIA_SERVER + '/media?url=' + encodeURIComponent(url), TIMEOUT)
    .then(res => res.json())
    .then(got => got && got.ok
      ? { media: got.media || null, blocked: !!got.blocked, log: ['השרת: ' + (got.media ? 'קובץ' : got.blocked ? 'חסום מחוץ לאינסטגרם' : 'בלי קובץ')] }
      : { media: null, blocked: false, log: ['השרת: ' + ((got && got.error) || 'תשובה לא צפויה')] })
    .catch(e => ({ media: null, blocked: false, log: ['השרת: ' + reason(e)] }));
}

/** null כשאין סקריפט. סקריפט שעוד לא עודכן עונה "פעולה לא מוכרת: media" — וזה
    מה שיופיע ביומן, כרמז לעדכן את הפריסה */
function viaScriptFile(url) {
  if (!cloud.isOn()) return null;
  return cloud.media(url).then(
    got => ({ media: got.media, blocked: got.blocked, log: ['הסקריפט שלך: ' + (got.media ? 'קובץ' : got.blocked ? 'חסום מחוץ לאינסטגרם' : 'בלי קובץ')] }),
    e => ({ media: null, blocked: false, log: ['הסקריפט שלך: ' + reason(e)] }));
}

async function viaScript(url, out) {
  try {
    take(await cloud.preview(url), url, out);
    out.log.push('הסקריפט שלך: ' + found(out));
  } catch (e) {
    out.log.push('הסקריפט שלך: ' + reason(e));
  }
}

/* נגמר כשיש מספיק, או כשכולם ענו. visit ו-viaScript לעולם לא נדחים. */
function until(list, enough) {
  return new Promise(resolve => {
    let left = list.length;
    if (!left || enough()) { resolve(); return; }
    list.forEach(p => p.then(() => {
      left--;
      if (enough() || !left) resolve();
    }));
  });
}

async function visit(provider, url, out) {
  try {
    const res = await withTimeout(provider.build(url), TIMEOUT, provider.init);
    if (!res.ok) { out.log.push(provider.id + ': ' + res.status); return; }
    take(await provider.read(res), url, out);
    out.log.push(provider.id + ': ' + found(out));
  } catch (e) {
    out.log.push(provider.id + ': ' + reason(e));
  }
}

/* מה שספק אחד לא ידע, הבא מנסה להשלים — ולכן כל שדה נלקח רק אם הוא
   עדיין חסר, ואף ספק אינו דורס תשובה שכבר התקבלה. */
function take(got, url, out) {
  if (!got) return;
  /* כתובת מתקבלת רק אם הנגן באמת יודע לפתוח אותה, אחרת החלפנו קישור
     תקין באחר שגם הוא לא ינוגן */
  if (!out.full && got.full) {
    const clean = normalizeUrl(unwrap(got.full));
    if (clean && embedUrl(clean)) out.full = clean;
  }
  if (!out.media && got.media) {
    const file = normalizeUrl(got.media);
    /* og:video אינו תמיד קובץ: ביוטיוב ובטיקטוק הוא דף נגן, וניסיון
       לנגן דף HTML בתגית video נכשל בוודאות. מתקבל רק מה שנראה כמו
       קובץ וידאו אמיתי — וזה בדיוק מה שפייסבוק ואינסטגרם נותנות. */
    if (file && isVideoFile(file)) out.media = file;
  }
  if (!out.title && got.title && !junkTitle(got.title)) out.title = clean_title(got.title);
  if (!out.image && got.image && !siteIcon(got.image)) out.image = normalizeUrl(got.image);
}

/* כשפייסבוק מגישה לספק דף התחברות במקום הסרטון, הספק עונה בכל זאת: השם הוא
   שארית של הכתובת ("?mibextid=…") והתמונה סמל של האתר. נבדק מול microlink בקישור
   שיתוף, אוקטובר 2026 — וכיוון שהראשון לענות זוכה, הזבל חסם את התמונה האמיתית
   שהגיעה רגע אחריו. */
function siteIcon(src) {
  return /\/rsrc\.php\/|\/images\/icons\/|static\.xx\.fbcdn\.net\//.test(src);
}

function junkTitle(title) {
  const t = String(title).trim();
  return !t || /^[?&#]/.test(t) || /^https?:\/\//.test(t) || /^(facebook|instagram|log in|התחברות)/i.test(t);
}

function found(out) {
  return [
    out.media ? 'קובץ' : '', out.full ? 'כתובת' : '',
    out.title ? 'שם' : '', out.image ? 'תמונה' : ''
  ].filter(Boolean).join(' + ') || 'בלי כלום';
}

const VIDEO_FILE = /\.(mp4|m4v|webm|mov|m3u8|mpd)$/i;

function isVideoFile(url) {
  try { return VIDEO_FILE.test(new URL(url).pathname); } catch (e) { return false; }
}

/* נוסח השגיאה עצמו, ולא "לא נגיש" סתמי. כשארבעה ספקים נופלים באותה
   שנייה זו סיבה אחת משותפת ולא ארבע תקלות, וההבדל בין "Load failed"
   (הרשת או הדומיין חסומים) לבין שם של פונקציה חסרה הוא כל האבחנה. */
function reason(e) {
  if (!e) return 'נכשל';
  if (e.name === 'AbortError') return 'לא ענה בתוך ' + (TIMEOUT / 1000) + ' שניות';
  return ((e.name || 'שגיאה') + ': ' + (e.message || '')).trim().slice(0, 90);
}

/** בדיקה יזומה: מה כל שירות עונה על כתובת ידועה. לאבחון כשמשהו לא עובד. */
export async function probe() {
  const target = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const lines = [];
  if (cloud.isOn()) {
    const started = Date.now();
    try {
      await cloud.preview(target);
      lines.push('הסקריפט שלך: עונה (' + (Date.now() - started) + 'ms)');
    } catch (e) {
      lines.push('הסקריפט שלך: ' + reason(e));
    }
  } else {
    lines.push('הסקריפט שלך: לא מוגדר');
  }
  for (const provider of PROVIDERS) {
    const started = Date.now();
    try {
      const res = await withTimeout(provider.build(target), TIMEOUT, provider.init);
      const ms = Date.now() - started;
      lines.push(provider.id + ': ' + (res.ok ? 'עונה' : 'שגיאה ' + res.status) + ' (' + ms + 'ms)');
    } catch (e) {
      lines.push(provider.id + ': ' + reason(e));
    }
  }
  return lines;
}

/* --- הבאת התמונה עצמה ---

   כאן היה הכשל שגרם לתמונות להיעלם. הגרסה הקודמת טענה את התמונה בתגית
   img עם crossOrigin="anonymous" כדי לצייר אותה על בד; כשה-CDN של
   אינסטגרם ופייסבוק לא החזיר כותרת CORS — וזה הרוב — הטעינה נכשלה
   ונשמרה **הכתובת** במקום התמונה. הכתובת חתומה, היא פגה תוך ימים, ואז
   הכרטיס נשאר ריק בלי שאיש ידע למה.

   הפתרון הוא להביא קודם את הבייטים, ורק אחר כך לצייר: מ-Blob נבנית
   כתובת blob: שהיא מאותו מקור, ולכן הבד לעולם אינו מלוכלך ו-CORS מפסיק
   להיות תנאי. שלוש דרכים להשיג את הבייטים, לפי הסדר. */

const BYTE_PROXIES = [
  { id: 'allorigins', build: u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u) },
  { id: 'codetabs', build: u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u) }
];

/** הבייטים של התמונה, או null. log מקבל שורה לכל ניסיון. */
export async function fetchPoster(src, log) {
  if (!src) return null;
  const note = line => { if (log) log.push('תמונה · ' + line); };

  /* ישירות קודם: i.ytimg.com ורוב שרתי התמונות כן מרשים, וזו בקשה אחת
     בלי אף מתווך. הכישלון מהיר, ולכן זה לא עולה כמעט כלום. */
  try {
    const res = await withTimeout(src);
    if (res.ok) {
      const blob = await res.blob();
      if (blob && blob.size) { note('ישירות'); return blob; }
    }
  } catch (e) { /* חסום — ממשיכים למתווכים */ }

  for (const proxy of BYTE_PROXIES) {
    try {
      const res = await withTimeout(proxy.build(src));
      if (!res.ok) { note(proxy.id + ': ' + res.status); continue; }
      const blob = await res.blob();
      /* מתווך שנכשל מחזיר לפעמים דף שגיאה עם קוד 200. תמונה אמיתית היא
         image/* וגם אינה זעירה — שתי בדיקות זולות שחוסכות תמונה פגומה
         שנשמרת לתמיד. */
      if (blob && blob.size > 512 && /^image\//.test(blob.type || '')) { note(proxy.id); return blob; }
      note(proxy.id + ': לא תמונה');
    } catch (e) {
      note(proxy.id + ': ' + reason(e));
    }
  }
  return null;
}

/* --- שליפה מ-HTML גולמי --- */

function fromHtml(html) {
  if (typeof html !== 'string' || !html) return { full: null, title: null, image: null };
  const pick = keys => {
    for (const key of keys) {
      const a = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + key + '["\'][^>]+content=["\']([^"\']+)["\']', 'i'));
      if (a) return decode(a[1]);
      const b = html.match(new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']' + key + '["\']', 'i'));
      if (b) return decode(b[1]);
    }
    return null;
  };
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  /* דף ביניים שכל תוכנו הפניה — הכתובת יושבת בו כטקסט */
  const loose = html.match(/(https:\/\/(?:www\.)?(?:facebook\.com\/(?:reel|watch|[^/"'\s]+\/videos)|tiktok\.com\/@[^/"'\s]+\/video|instagram\.com\/(?:p|reel|tv))\/[^"'\s\\<>]+)/i);
  return {
    full: pick(['og:url']) || (canonical && decode(canonical[1])) || (loose && decode(loose[1])) || null,
    title: pick(['og:title', 'twitter:title']),
    image: pick(['og:image', 'og:image:secure_url', 'twitter:image']),
    /* הקובץ עצמו, כפי שהדף מצהיר עליו */
    media: pick(['og:video:secure_url', 'og:video:url', 'og:video', 'twitter:player:stream'])
  };
}

function decode(text) {
  return text.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"');
}

/* תמונה מתוך הטקסט, כשאין og:image — אבל לא סמלים ולוגואים של האתר עצמו,
   שבפייסבוק באים לפני כל תמונה אחרת */
function contentImage(text) {
  const re = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
  let m;
  while ((m = re.exec(text))) {
    if (!siteIcon(m[1])) return m[1];
  }
  return null;
}

/* "וידאו | פייסבוק" ושאר הזנבות שהפלטפורמה מוסיפה לשם — לא שם של סרטון.
   פייסבוק גם מקדימה לו "391K views · 6.3K reactions |" */
function clean_title(raw) {
  return String(raw)
    .replace(/\s+/g, ' ')
    .replace(/^[\d.,]+[KMB]?\s+views?\s*·\s*[\d.,]+[KMB]?\s+reactions?\s*\|\s*/i, '')
    .replace(/\s*[|·–-]\s*(Facebook|Instagram|TikTok|YouTube|Watch)\s*$/i, '')
    .trim()
    .slice(0, 120);
}

/* פייסבוק עוטפת לפעמים את היעד בדף התחברות, והכתובת האמיתית יושבת
   בפרמטר next. בלי הפתיחה הזאת היינו מוותרים על תשובה שהיא בעצם תקינה. */
function unwrap(raw) {
  let url;
  try { url = new URL(raw); } catch (e) { return raw; }
  const inner = url.searchParams.get('next') || url.searchParams.get('u');
  if (!inner) return url.toString();
  try { return new URL(inner).toString(); } catch (e) { return url.toString(); }
}
