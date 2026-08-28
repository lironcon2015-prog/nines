/* תשיעיות — הספרייה המשותפת.
 *
 * סקריפט אחד שיושב על תיקיית דרייב שלך, ומשרת את שני הטלפונים. הוא נפרס
 * כ"הרצה בשמי · גישה לכל מי שיש לו הקישור", ולכן הוא רץ בהרשאות שלך —
 * ואף אחד משני הצדדים אינו מתחבר לשום חשבון. אין OAuth, אין מסך הרשאות,
 * ואין מסד נתונים: קובץ JSON אחד ותיקיית תמונות.
 *
 * שני קודים ולא אחד:
 *   קוד הכתיבה — יושב על הטלפון שלך. מוסיף, עורך ומוחק.
 *   קוד הקריאה — נשלח לילד בתוך הקישור. רואה ומנגן, ולא יותר.
 * ההפרדה נאכפת כאן, בשרת, ולא רק במסכים של האפליקציה.
 *
 * שניהם נוצרים לבד בהרצה הראשונה, יחד עם התיקייה, ונשמרים במאפייני
 * הסקריפט. אין מה למלא כאן ואין מה להמציא — קוד אקראי של עשרים תווים
 * חזק מכל דבר שאדם בוחר, ואי אפשר לשכוח להחליף אותו.
 *
 * ================= הקמה, פעם אחת =================
 *  1. script.google.com → פרויקט חדש → הדבק את כל הקובץ הזה.
 *  2. בחר למעלה את הפונקציה setup ולחץ ▶ הפעלה. אשר את ההרשאות.
 *     ביומן (למטה) יופיעו התיקייה שנוצרה וקוד הכתיבה שלך.
 *  3. פריסה → פריסה חדשה → סוג: אפליקציית אינטרנט.
 *     "הרצה בשם": אני.   "מי יש לו גישה": כל מי שיש לו הקישור.
 *  4. העתק את הכתובת שמסתיימת ב-/exec, והדבק אותה באפליקציה יחד עם
 *     קוד הכתיבה — מסך הבית → "ספרייה משותפת".
 *
 * ================= עדכון בהמשך =================
 * ערוך את הפריסה הקיימת (פריסה → נהל פריסות → עיפרון → גרסה: חדשה).
 * אל תיצור פריסה חדשה — היא מקבלת כתובת אחרת, ושני הטלפונים מאבדים את
 * הספרייה. הקודים והתיקייה נשמרים בין עדכונים.
 */

/* השם שמוצג בפס העליון בשני הטלפונים. היחיד שאפשר לשנות כאן, ואפשר גם
   פשוט להשאיר. */
var LIBRARY_NAME = 'הספרייה שלנו';

var FOLDER_NAME = 'תשיעיות';
var DOC_NAME = 'library.json';
var POSTER_DIR = 'posters';

/* ===================== הקמה =====================
   הרץ פעם אחת מהעורך. אפשר להריץ שוב בכל רגע — היא אינה יוצרת שוב מה
   שכבר קיים, והיא הדרך לראות שוב את קוד הכתיבה אם שכחת אותו. */

function setup() {
  var codes = codes_();
  var dir = folder();
  var lines = [
    '',
    '  ✓ הכול מוכן.',
    '',
    '  התיקייה נוצרה בדרייב שלך:',
    '     ' + dir.getName() + '  —  ' + dir.getUrl(),
    '',
    '  ┌─────────────────────────────────────────────',
    '  │ קוד הכתיבה — זה מה שמדביקים באפליקציה שלך:',
    '  │',
    '  │    ' + codes.write,
    '  │',
    '  │ אל תשלח אותו לאף אחד.',
    '  └─────────────────────────────────────────────',
    '',
    '  קוד הקריאה נוצר גם הוא, והאפליקציה שותלת אותו לבד בתוך הקישור',
    '  שנשלח לילד. אין צורך להעתיק אותו.',
    '',
    '  עכשיו: פריסה → פריסה חדשה → אפליקציית אינטרנט,',
    '  "הרצה בשם: אני" ו-"גישה: כל מי שיש לו הקישור".',
    '  ואז הדבק באפליקציה את הכתובת שמסתיימת ב-/exec ואת קוד הכתיבה.',
    ''
  ].join('\n');
  Logger.log(lines);
  return lines;
}

/* אם קוד דלף — הרץ את זה, והרץ אחר כך setup כדי לראות את החדש. הילד
   יצטרך קישור הצטרפות חדש; הספרייה עצמה אינה נוגעת. */
function resetCodes() {
  props().deleteProperty('writeCode');
  props().deleteProperty('readCode');
  return setup();
}

function props() {
  return PropertiesService.getScriptProperties();
}

/* הקודים נוצרים פעם אחת ונשמרים. עשרים תווים אקראיים — מי שמחזיק בקוד
   נכנס, ולכן הוא לא צריך להיות משהו שאדם בחר. */
function codes_() {
  var p = props();
  var write = p.getProperty('writeCode');
  var read = p.getProperty('readCode');
  if (!write) { write = 'w-' + token_(); p.setProperty('writeCode', write); }
  if (!read) { read = 'r-' + token_(); p.setProperty('readCode', read); }
  return { write: write, read: read };
}

function token_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 20);
}

/* ===================== נקודת הכניסה ===================== */

/* בקשה חוצת-מקור עם Content-Type של JSON מפעילה בדיקה מקדימה (OPTIONS)
   ש-Apps Script אינו יודע לענות עליה. האפליקציה שולחת לכן text/plain,
   וזה מגיע לכאן כטקסט גולמי שאנחנו מפענחים בעצמנו. */
function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return out({ ok: false, error: 'בקשה פגומה' });
  }
  return handle(body);
}

/* GET נשאר כדי שאפשר יהיה לבדוק את הכתובת מהדפדפן: הדבקת הכתובת עם
   ?op=ping&k=… אומרת מיד אם הפריסה חיה והקוד נכון. */
function doGet(e) {
  return handle((e && e.parameter) || {});
}

function handle(body) {
  try {
    var role = roleOf(body.k);
    if (!role) return out({ ok: false, error: 'הקוד אינו מוכר' });

    switch (body.op) {
      case 'ping':    return out(ping(role));
      case 'get':     return out({ ok: true, doc: readDoc() });
      case 'put':     return out(put(role, body.doc));
      case 'preview': return out(preview(body.url));
      case 'poster':  return out(poster(role, body));
      default:        return out({ ok: false, error: 'פעולה לא מוכרת: ' + body.op });
    }
  } catch (err) {
    return out({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function out(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function roleOf(code) {
  var given = String(code || '');
  var mine = codes_();
  /* השוואה באורך קבוע, כדי שזמן התשובה לא יסגיר כמה תווים התאימו */
  if (equals(given, mine.write)) return 'owner';
  if (equals(given, mine.read)) return 'viewer';
  return null;
}

function equals(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function ping(role) {
  var answer = { ok: true, mode: role, name: LIBRARY_NAME };
  /* קוד הקריאה מוחזר רק לבעלים — זה מה שהוא שולח הלאה, והצופה לא צריך
     אותו ולא מקבל אותו */
  if (role === 'owner') answer.readCode = codes_().read;
  return answer;
}

/* ===================== המסמך ===================== */

/* התיקייה נוצרת לבד בפעם הראשונה, ומזהה שלה נשמר. אין מה ליצור ביד
   ואין מזהה להעתיק. אם מחקת אותה בטעות — תיווצר חדשה. */
function folder() {
  var p = props();
  var id = p.getProperty('folderId');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* נמחקה */ }
  }
  /* נעילה, כי שתי בקשות שמגיעות יחד בפעם הראשונה היו יוצרות שתי
     תיקיות, ואחת מהן הייתה נשארת יתומה */
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    id = p.getProperty('folderId');
    if (id) {
      try { return DriveApp.getFolderById(id); } catch (err) { /* נמחקה */ }
    }
    var made = DriveApp.createFolder(FOLDER_NAME);
    p.setProperty('folderId', made.getId());
    return made;
  } finally {
    lock.releaseLock();
  }
}

function docFile() {
  var found = folder().getFilesByName(DOC_NAME);
  return found.hasNext() ? found.next() : null;
}

function readDoc() {
  var file = docFile();
  if (!file) return { v: 2, updatedAt: 0, categories: [], videos: [] };
  try {
    var parsed = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
    if (parsed && parsed.videos && parsed.categories) return parsed;
  } catch (err) { /* קובץ פגום — מתחילים מחדש ולא מפילים את הכול */ }
  return { v: 2, updatedAt: 0, categories: [], videos: [] };
}

function writeDoc(doc) {
  var text = JSON.stringify(doc);
  var file = docFile();
  if (file) file.setContent(text);
  else folder().createFile(DOC_NAME, text, MimeType.PLAIN_TEXT);
  return doc;
}

function put(role, incoming) {
  if (role !== 'owner') return { ok: false, error: 'הקוד הזה הוא לצפייה בלבד' };
  if (!incoming || !incoming.videos) return { ok: false, error: 'לא הגיע מסמך' };

  /* התיקייה נוצרת לפני הנעילה ולא בתוכה: היצירה נועלת בעצמה, ונעילה
     בתוך נעילה על אותו מנעול הייתה תוקעת את הכתיבה הראשונה עד שייגמר
     פסק הזמן. אחרי הקריאה הזאת היא כבר קיימת, ו-readDoc לא ינעל. */
  folder();

  /* נעילה, כי שני טלפונים יכולים לדחוף באותה שנייה. בלי זה, מי שכתב
     שני יקרא מסמך שקדם לכתיבה של הראשון וידרוס אותה. */
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var merged = merge(readDoc(), incoming);
    merged.updatedAt = Date.now();
    writeDoc(merged);
    return { ok: true, doc: merged };
  } finally {
    lock.releaseLock();
  }
}

/* מיזוג פריט מול פריט לפי updatedAt — בדיוק אותו אלגוריתם שרץ באפליקציה
   (mergeInto ב-videos.js), כדי ששני הצדדים יגיעו לאותה תוצאה. מסמך מול
   מסמך לא היה מספיק: הוא היה מוחק הוספה של צד אחד רק כי לשני היה חותם
   זמן מאוחר יותר. */
function merge(base, incoming) {
  base.categories = mergeList(base.categories || [], incoming.categories || []);
  base.videos = mergeList(base.videos || [], incoming.videos || []);
  return base;
}

function mergeList(mine, theirs) {
  var by = {};
  var order = [];
  function add(item) {
    if (!item || !item.id) return;
    if (!(item.id in by)) order.push(item.id);
    var have = by[item.id];
    if (!have || (item.updatedAt || 0) > (have.updatedAt || 0)) by[item.id] = item;
  }
  mine.forEach(add);
  theirs.forEach(add);
  return order.map(function (id) { return by[id]; });
}

/* ===================== תצוגה מקדימה =====================
   זה מה שהחליף את ארבעת השירותים החינמיים. UrlFetchApp אינו כפוף
   ל-CORS בכלל, אין לו מגבלת בקשות מעשית (20,000 ביום בחשבון רגיל),
   והוא הולך אחרי הפניות — כלומר גם קישור מקוצר של פייסבוק נפתח. */

function preview(url) {
  if (!url) return { ok: false, error: 'בלי כתובת' };
  var res;
  try {
    res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      /* בלי User-Agent של דפדפן, פייסבוק ואינסטגרם מחזירות דף ריק בלי
         תגיות og — וזה נראה בדיוק כמו סרטון פרטי */
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WhatsApp/2.0)' }
    });
  } catch (err) {
    return { ok: false, error: 'לא הצלחנו להגיע לכתובת' };
  }
  var html = res.getContentText();
  return {
    ok: true,
    full: meta(html, ['og:url']) || link(html) || res.getHeaders()['Location'] || url,
    title: meta(html, ['og:title', 'twitter:title']),
    image: meta(html, ['og:image', 'og:image:secure_url', 'twitter:image']),
    media: meta(html, ['og:video:secure_url', 'og:video:url', 'og:video', 'twitter:player:stream'])
  };
}

function meta(html, keys) {
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i].replace(/[:]/g, '\\:');
    var a = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + key + '["\'][^>]+content=["\']([^"\']+)["\']', 'i'));
    if (a) return decode(a[1]);
    var b = html.match(new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']' + key + '["\']', 'i'));
    if (b) return decode(b[1]);
  }
  return null;
}

function link(html) {
  var m = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  return m ? decode(m[1]) : null;
}

function decode(text) {
  return String(text).replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"');
}

/* ===================== התמונות =====================
   שלוש צורות לאותה פעולה, לפי מה שהגיע:
     {id, src}        — הסקריפט מושך את התמונה בעצמו ושומר אותה
     {id, data, mime} — הטלפון שלח תמונה מוכנה
     {ref}            — הורדה של תמונה ששמורה כבר

   המשיכה בצד הזה היא כל העניין: ה-CDN של אינסטגרם ופייסבוק אינו מחזיר
   כותרת CORS, ולכן דפדפן לא יכול לצייר את התמונה ולשמור אותה. השרת
   אינו דפדפן, ולכן זה פשוט עובד. */

function posterFolder() {
  var found = folder().getFoldersByName(POSTER_DIR);
  return found.hasNext() ? found.next() : folder().createFolder(POSTER_DIR);
}

function poster(role, body) {
  if (body.ref) {
    var file = DriveApp.getFileById(body.ref);
    var blob = file.getBlob();
    return {
      ok: true,
      ref: body.ref,
      mime: blob.getContentType(),
      data: Utilities.base64Encode(blob.getBytes())
    };
  }
  if (role !== 'owner') return { ok: false, error: 'הקוד הזה הוא לצפייה בלבד' };
  if (!body.id) return { ok: false, error: 'בלי מזהה סרטון' };

  var made = null;
  if (body.src) {
    var res = UrlFetchApp.fetch(body.src, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WhatsApp/2.0)' }
    });
    if (res.getResponseCode() >= 400) return { ok: false, error: 'התמונה לא נמשכה' };
    made = res.getBlob();
  } else if (body.data) {
    made = Utilities.newBlob(
      Utilities.base64Decode(body.data), body.mime || 'image/jpeg', body.id + '.jpg');
  }
  if (!made) return { ok: false, error: 'בלי תמונה' };
  made.setName(body.id + '.jpg');

  var dir = posterFolder();
  /* תמונה קודמת של אותו סרטון נמחקת, אחרת התיקייה מתמלאת בכפילויות
     ששום דבר כבר לא מצביע עליהן */
  var old = dir.getFilesByName(body.id + '.jpg');
  while (old.hasNext()) old.next().setTrashed(true);

  var saved = dir.createFile(made);
  return {
    ok: true,
    ref: saved.getId(),
    mime: made.getContentType(),
    data: Utilities.base64Encode(made.getBytes())
  };
}
