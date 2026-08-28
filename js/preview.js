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
function withTimeout(url, ms) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, ms || TIMEOUT);
  const options = ctrl ? { signal: ctrl.signal } : {};
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
    build: u => 'https://r.jina.ai/' + u,
    read: async res => {
      const text = await res.text();
      const line = re => { const m = text.match(re); return m ? m[1].trim() : null; };
      return {
        /* הכותרת של הקורא היא השורה הראשונה, והכתובת הסופית מגיעה אחריה */
        full: line(/^URL Source:\s*(\S+)/m),
        title: line(/^Title:\s*(.+)$/m),
        image: line(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/),
        media: line(/(https?:\/\/[^\s")]+\.mp4[^\s")]*)/)
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
export async function lookup(url) {
  const out = { full: null, title: null, image: thumbUrl(url), media: null, log: [] };
  /* מתי אפשר להפסיק: יש שם, יש תמונה, ויש **דרך אחת** לנגן — הקובץ
     עצמו, או נגן משובץ שכבר עכשיו אפשר לבנות מהכתובת. קישור יוטיוב
     נסגר כך אחרי בקשה אחת: אין לו og:video, ואין שום טעם להעיר בגללו
     עוד שלושה שירותים ולהמתין להם. */
  const playable = () => out.media || embedUrl(url) || (out.full && embedUrl(out.full));
  const enough = () => out.title && out.image && playable();

  /* הסקריפט שלך קודם. הוא היחיד שאינו מוגבל בבקשות ואינו נופל לסירוגין,
     ולכן כשהוא מצליח אין שום סיבה להעיר אף אחד אחר. */
  if (cloud.isOn()) {
    try {
      const got = await cloud.preview(url);
      take(got, url, out);
      out.log.push('הסקריפט שלך: ' + found(out));
    } catch (e) {
      out.log.push('הסקריפט שלך: ' + reason(e));
    }
    if (enough()) return out;
  }

  /* הספק הראשון לבדו, כי בדרך כלל הוא מספיק — ואז יצאה בקשה אחת בלבד.
     רק אם הוא לא סגר את העניין, נשלחים השאר, וביחד ולא בזה אחר זה:
     בטור, שני ספקים תקועים אכלו שש-עשרה שניות לפני שהשלישי בכלל התחיל. */
  await visit(PROVIDERS[0], url, out);
  if (!enough()) {
    const rest = PROVIDERS.slice(1).map(p => visit(p, url, out));
    await Promise.race([
      Promise.all(rest),
      new Promise(resolve => setTimeout(() => { out.log.push('נגמר הזמן'); resolve(); }, BUDGET))
    ]);
  }
  return out;
}

/** רק הקובץ, לרענון לפני ניגון — כתובת של קובץ בפייסבוק פגה אחרי שעות */
export async function refreshMedia(url) {
  const found = await lookup(url);
  return { media: found.media, full: found.full, log: found.log };
}

async function visit(provider, url, out) {
  try {
    const res = await withTimeout(provider.build(url));
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
  if (!out.title && got.title) out.title = clean_title(got.title);
  if (!out.image && got.image) out.image = normalizeUrl(got.image);
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
      const res = await withTimeout(provider.build(target));
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

/* "וידאו | פייסבוק" ושאר הזנבות שהפלטפורמה מוסיפה לשם — לא שם של סרטון */
function clean_title(raw) {
  return String(raw)
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
