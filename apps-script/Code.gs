/* תשיעיות — הספרייה המשותפת.
 *
 * סקריפט אחד שיושב על תיקיית דרייב שלך, ומשרת את שני הטלפונים. הוא נפרס
 * כ"הרצה בשמי · גישה לכל מי שיש לו הקישור", ולכן הוא רץ בהרשאות שלך —
 * ואף אחד משני הצדדים אינו מתחבר לשום חשבון. אין OAuth, אין מסך הרשאות,
 * ואין מסד נתונים: קובץ JSON אחד ותיקיית תמונות.
 *
 * שני קודים ולא אחד:
 *   WRITE_CODE — יושב על הטלפון שלך. מוסיף, עורך ומוחק.
 *   READ_CODE  — מה שנשלח לילד. רואה ומנגן, ולא יותר.
 * ההפרדה נאכפת כאן, בשרת, ולא רק במסכים של האפליקציה.
 *
 * ================= הקמה, פעם אחת =================
 *  1. פתח תיקייה חדשה בדרייב בשם "תשיעיות". מזהה התיקייה הוא מה שמופיע
 *     בכתובת אחרי folders/ — למשל drive.google.com/drive/folders/1AbC…
 *  2. script.google.com → פרויקט חדש → הדבק את כל הקובץ הזה.
 *  3. מלא כאן למטה: FOLDER_ID, WRITE_CODE, READ_CODE, LIBRARY_NAME.
 *     שני הקודים צריכים להיות ארוכים ולא ניחושים — מי שמחזיק בקוד נכנס.
 *  4. פריסה → פריסה חדשה → סוג: אפליקציית אינטרנט.
 *     "הרצה בשם": אני.   "מי יש לו גישה": כל מי שיש לו הקישור.
 *  5. אשר את ההרשאות (זה החשבון שלך מול הסקריפט שלך, פעם אחת).
 *  6. העתק את הכתובת שמסתיימת ב-/exec והדבק אותה באפליקציה,
 *     במסך "ספרייה משותפת".
 *
 * ================= עדכון בהמשך =================
 * ערוך את הפריסה הקיימת (פריסה → נהל פריסות → עיפרון → גרסה: חדשה).
 * אל תיצור פריסה חדשה — היא מקבלת כתובת אחרת, ושני הטלפונים מאבדים את
 * הספרייה.
 */

var FOLDER_ID    = 'הדבק-כאן-את-מזהה-התיקייה';
var WRITE_CODE   = 'החלף-אותי-בקוד-כתיבה-ארוך';
var READ_CODE    = 'החלף-אותי-בקוד-קריאה-ארוך';
var LIBRARY_NAME = 'הספרייה שלנו';

var DOC_NAME = 'library.json';
var POSTER_DIR = 'posters';

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
  /* השוואה באורך קבוע, כדי שזמן התשובה לא יסגיר כמה תווים התאימו */
  if (equals(given, WRITE_CODE)) return 'owner';
  if (equals(given, READ_CODE)) return 'viewer';
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
  if (role === 'owner') answer.readCode = READ_CODE;
  return answer;
}

/* ===================== המסמך ===================== */

function folder() {
  return DriveApp.getFolderById(FOLDER_ID);
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
