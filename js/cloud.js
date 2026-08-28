/* הספרייה המשותפת: תיקיית דרייב שלך, וסקריפט קטן שיושב עליה.

   הסקריפט (Apps Script) נפרס כ"הרצה בשמי · גישה לכל מי שיש לו הקישור",
   ולכן הוא רץ בהרשאות של בעל התיקייה — ואף אחד משני הטלפונים אינו מתחבר
   לשום חשבון. אין OAuth, אין מסך הרשאות, ואין מסד נתונים: מסמך אחד
   ותמונות, בתיקייה אחת. ראה apps-script/README.md.

   שני קודים ולא אחד. קוד הכתיבה יושב על הטלפון של ההורה, קוד הקריאה הוא
   מה שנשלח לילד — ומי שמחזיק בו יכול לראות ולנגן, אבל לא להוסיף, לערוך
   או למחוק. ההפרדה נאכפת בסקריפט ולא רק במסך, אחרת היא לא הפרדה. */

const KEY = 'k8:cloud';

/* Apps Script מתעורר לאט כשלא פנו אליו זמן מה. עשרים שניות הן ההפרש בין
   "איטי" לבין "לא עונה", ובפחות מזה סנכרון תקין היה נכשל בפתיחה הראשונה
   של היום — דווקא זו שבה יש הכי הרבה מה למשוך. */
const TIMEOUT = 20000;

/* בקשה חוצת-מקור עם Content-Type של JSON מפעילה בדיקה מקדימה (OPTIONS)
   ש-Apps Script אינו עונה עליה, והבקשה נכשלת עוד לפני שהגיעה. text/plain
   הופך אותה ל"בקשה פשוטה" שנשלחת ישירות, והסקריפט מפענח JSON בעצמו.
   זו התבנית המקובלת מול Apps Script, לא עקיפה. */
const PLAIN = { 'Content-Type': 'text/plain;charset=utf-8' };

/* הדבקה מתוך טקסט בעברית מביאה איתה סימני כיווניות בלתי-נראים — LRM,
   RLM, ותווי בידוד — ולפעמים גם רוחב-אפס. הם אינם רווחים, ולכן trim
   אינו נוגע בהם, והם שברו את בדיקת הכתובת ואת השוואת הקוד על תו שאי
   אפשר לראות בשדה. זה קורה בדיוק כשמעתיקים את הכתובת מתוך הודעה
   בעברית, שזו הדרך הסבירה ביותר להגיע לכאן. */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/* iOS מחליף לפעמים מקף במקף טיפוגרפי. מזהה של פריסה ושל קוד בנויים
   מ-base64url, שבו המקף חוקי והמקף הטיפוגרפי אינו קיים כלל. */
const DASHES = /[\u2010-\u2015\u2212]/g;

function tidy(text) {
  return String(text || '').replace(INVISIBLE, '').replace(DASHES, '-').trim();
}

let conf = read();

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.url && parsed.code) return parsed;
  } catch (e) { /* מצב פרטי או הגדרה פגומה — כאילו לא מחובר */ }
  return null;
}

/** ההגדרה הנוכחית: {url, code, mode, name, at} או null */
export function config() {
  return conf ? Object.assign({}, conf) : null;
}

export function isOn() {
  return !!conf;
}

/** האם המכשיר הזה רואה בלבד. ברירת המחדל בטוחה: לא מחובר = לא צופה. */
export function isViewer() {
  return !!conf && conf.mode === 'viewer';
}

export function isOwner() {
  return !!conf && conf.mode === 'owner';
}

export function setConfig(next) {
  conf = next ? Object.assign({ at: Date.now() }, next) : null;
  try {
    if (conf) localStorage.setItem(KEY, JSON.stringify(conf));
    else localStorage.removeItem(KEY);
  } catch (e) { /* לא קריטי — יעבוד עד סגירת האפליקציה */ }
  return conf;
}

export function disconnect() {
  setConfig(null);
}

/* --- הבקשה עצמה --- */

function withTimeout(url, options) {
  /* AbortSignal.timeout קיים רק מסאפרי 16, ובאייפון ישן יותר הוא זורק
     מיד — כלומר כל בקשה "נכשלת" עוד לפני שיצאה. */
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, TIMEOUT);
  const opts = Object.assign({ redirect: 'follow' }, options || {});
  if (ctrl) opts.signal = ctrl.signal;
  return fetch(url, opts).finally(() => clearTimeout(timer));
}

async function call(op, payload, target) {
  const at = target || conf;
  if (!at || !at.url || !at.code) throw new Error('הספרייה המשותפת אינה מוגדרת');
  const body = Object.assign({ op, k: at.code }, payload || {});
  let res;
  try {
    res = await withTimeout(at.url, { method: 'POST', headers: PLAIN, body: JSON.stringify(body) });
  } catch (e) {
    /* "Failed to fetch" באנגלית אינו אומר למשתמש כלום, והוא גם מכסה שני
       מצבים שונים לגמרי: אין רשת, או שהפריסה אינה פתוחה לכל מי שיש לו
       הקישור ולכן גוגל חוסמת את הבקשה עוד לפני שהיא מגיעה לסקריפט. */
    if (e && e.name === 'AbortError') {
      throw new Error('הסקריפט לא ענה בתוך ' + (TIMEOUT / 1000) + ' שניות. נסה שוב — פנייה ראשונה אחרי הפסקה איטית.');
    }
    throw new Error('לא הצלחנו להגיע לסקריפט. בדוק שיש רשת, ושבפריסה '
      + '"מי יש לו גישה" מוגדר ל"כל מי שיש לו הקישור".');
  }
  if (!res.ok) throw new Error('השרת ענה ' + res.status
    + (res.status === 401 || res.status === 403
      ? ' — הפריסה אינה פתוחה לכל מי שיש לו הקישור, או ש"הרצה בשם" אינו מוגדר אליך.'
      : ''));
  let json;
  try {
    json = JSON.parse(await res.text());
  } catch (e) {
    /* תשובה שאינה JSON היא כמעט תמיד דף שגיאה של גוגל — בדרך כלל כתובת
       של פריסה שכבר לא קיימת. עדיף לומר את זה מאשר "לא הצלחנו". */
    throw new Error('הכתובת לא החזירה תשובה תקינה. ודא שהיא מסתיימת ב-/exec ושהפריסה עדיין קיימת.');
  }
  if (!json || json.ok !== true) throw new Error((json && json.error) || 'הבקשה נדחתה');
  return json;
}

/* מחלצים ולא בודקים.

   הגרסה הקודמת בדקה את הכתובת מול ביטוי מעוגן משני צדדיה, ואז כל תו
   מיותר — נראה או לא — הפיל אותה כולה. זה נכשל שוב ושוב על כתובת שהייתה
   תקינה לגמרי, וההודעה אמרה "הכתובת שגויה" כשהיא לא הייתה.

   כאן מחפשים את הכתובת **בתוך** מה שהודבק. מה שנמצא הוא בהגדרה נקי:
   הצורה של כתובת פריסה ידועה במדויק, והמזהה הוא base64url בלבד. רווח
   בהתחלה, שורה חדשה באמצע, מרכאות, סימן כיווניות או טקסט שנדבק מסביב —
   כולם פשוט אינם חלק מההתאמה, ואין צורך לחזות כל אחד מהם מראש.

   זה גם מחמיר יותר ולא פחות: קודם התקבלה כל כתובת ב-script.google.com
   שהסתיימה ב-exec, ועכשיו רק כתובת פריסה בצורתה המדויקת. הקוד שלך אינו
   נשלח לשום מקום אחר. */
const EXEC = /https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/;

/* כל רווח נמחק לפני החיפוש, ולא רק בקצוות: העתקה של כתובת ארוכה מתוך
   טקסט גולש שוברת אותה לשתי שורות, והשורה החדשה נוחתת באמצע המזהה.
   כתובת אינה מכילה רווח לעולם, ולכן זה בטוח — והביטוי אינו מעוגן
   בהתחלה, כך שגם טקסט שנדבק מסביב אינו מפריע. */
const SPACE = /\s+/g;

/** כתובת הפריסה מתוך מה שהודבק, או null */
export function findExec(raw) {
  const hit = tidy(raw).replace(SPACE, '').match(EXEC);
  return hit ? hit[0] : null;
}

/* קוד אינו מכיל רווח — הוא נוצר בסקריפט כ-w- או r- ועשרים תווי base64url.
   אותה מלכודת של שורה שנשברה, ואותו פתרון. */
function tidyCode(raw) {
  return tidy(raw).replace(SPACE, '');
}

/* תו שאי אפשר לראות הוא בדיוק מה שמפיל בדיקה כזאת, ולכן הוא חייב להופיע
   בדיווח. כל מה שאינו ASCII נראה מוחלף בקוד שלו. */
function reveal(text) {
  return String(text).replace(/[^\x20-\x7E]/g, c => '⟨' + c.codePointAt(0).toString(16).toUpperCase() + '⟩');
}

/* הודעה שאפשר לפעול לפיה: מה בדיוק לא נמצא, וכל מה שהיה בשדה — בשלמותו
   ובלי חיתוך. חיתוך ב-60 תווים הסתיר בדיוק את הזנב שבו הבעיה. */
function explain(raw) {
  const clean = tidy(raw);
  if (!clean) return { message: 'לא הודבקה כתובת.', detail: '' };
  const message = clean.indexOf('script.google.com') >= 0
    ? 'זו כתובת של Apps Script, אבל לא כתובת פריסה. היא צריכה להיראות כך: '
      + 'script.google.com/macros/s/<מזהה>/exec — ולא /dev ולא כתובת של העורך.'
    : 'לא מצאתי בשדה כתובת פריסה של Apps Script.';
  /* הערך הגולמי ולא המנוקה. מה שהניקוי הסיר אינו הסיבה לכישלון, ואם
     נציג את המנוקה נסתיר שוב בדיוק את מה שצריך לראות. */
  return { message, detail: reveal(String(raw || '').slice(0, 400)) };
}

/** בדיקת כתובת וקוד. מחזירה {mode,name} — מי שהקוד הזה הופך אותך להיות. */
export async function ping(url, code) {
  const clean = findExec(url);
  if (!clean) {
    const why = explain(url);
    const err = new Error(why.message);
    err.detail = why.detail;
    throw err;
  }
  const at = { url: clean, code: tidyCode(code) };
  const out = await call('ping', null, at);
  /* קוד הקריאה מוחזר רק לבעלים — זה מה שהוא שולח הלאה, והצופה אינו
     צריך אותו ואינו מקבל אותו. */
  return Object.assign(at, { mode: out.mode, name: out.name || '', readCode: out.readCode || '' });
}

/** המסמך המשותף כפי שהוא בדרייב */
export async function pull() {
  const out = await call('get');
  return out.doc || null;
}

/** מיזוג מסמך מקומי לתוך המשותף. מחזירה את התוצאה הממוזגת. */
export async function push(doc) {
  if (isViewer()) throw new Error('המכשיר הזה במצב צפייה בלבד');
  const out = await call('put', { doc });
  return out.doc || null;
}

/** תצוגה מקדימה בצד השרת: שם, תמונה, קובץ וכתובת סופית, בלי CORS ובלי
    מגבלת בקשות של שירות חיצוני. */
export async function preview(url) {
  const out = await call('preview', { url });
  return {
    full: out.full || null,
    title: out.title || null,
    image: out.image || null,
    media: out.media || null
  };
}

/** מעלה תמונה לתיקייה ומחזירה מזהה קובץ, כדי שהמכשיר השני ימשוך אותה */
export async function putPoster(id, blob) {
  if (isViewer()) return null;
  const data = await toBase64(blob);
  if (!data) return null;
  const out = await call('poster', { id, data, mime: blob.type || 'image/jpeg' });
  return out.ref || null;
}

/** מוריד תמונה שמורה מהתיקייה לפי המזהה שבמסמך */
export async function getPoster(ref) {
  const out = await call('poster', { ref });
  return out.data ? fromBase64(out.data, out.mime || 'image/jpeg') : null;
}

/** הסקריפט מושך את התמונה בעצמו, שומר אותה בתיקייה, ומחזיר גם את
    הבייטים. פנייה אחת במקום שתיים, וה-CDN של אינסטגרם לא צריך להסכים
    לכלום — הבקשה יוצאת מגוגל ולא מהדפדפן. */
export async function grabPoster(id, src) {
  if (isViewer()) return null;
  const out = await call('poster', { id, src });
  const blob = out.data ? fromBase64(out.data, out.mime || 'image/jpeg') : null;
  return blob ? { blob, ref: out.ref || null } : null;
}

/* --- קוד ההצטרפות ---
   הילד לא מקליד כתובת של Apps Script באורך מאה תווים. הקישור נושא את
   הכתובת ואת קוד הקריאה ביחד, מקודדים, ונפתח ישירות במסך ההצטרפות. */

export function joinPayload(readCode) {
  if (!conf) return '';
  const data = JSON.stringify({ u: conf.url, k: readCode || conf.code });
  return base64url(new TextEncoder().encode(data));
}

export function decodeJoin(text) {
  const raw = tidy(text);
  if (!raw) return null;
  /* מתקבל גם קישור שלם שהודבק, לא רק המטען עצמו */
  const inHash = raw.match(/#\/join\/([A-Za-z0-9_-]+)/);
  const token = inHash ? inHash[1] : raw.replace(/^.*#\/join\//, '');
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    const { u, k } = JSON.parse(new TextDecoder().decode(bytes));
    return u && k ? { url: u, code: k } : null;
  } catch (e) {
    return null;
  }
}

function base64url(bytes) {
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toBase64(blob) {
  return new Promise(resolve => {
    if (!blob) { resolve(null); return; }
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const text = String(reader.result || '');
      const comma = text.indexOf(',');
      resolve(comma < 0 ? null : text.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function fromBase64(data, mime) {
  try {
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch (e) {
    return null;
  }
}
