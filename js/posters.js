/* התמונות של הכרטיסים, כ-Blob ב-IndexedDB.

   קודם הן ישבו בתוך מסמך ה-localStorage כמחרוזת data URI, וזה נכשל בשלוש
   דרכים בבת אחת: base64 מנפח כל תמונה בשליש, כל שמירה של סרטון כתבה מחדש
   את כל התמונות ביחד, ומעל כ-5MB השמירה נכשלה — ואז save() זרקה תמונות
   מהישן לחדש רק כדי שהמסמך ייכנס. IndexedDB מחזיק מאות מגה, שומר בייטים
   כבייטים, וכל תמונה נכתבת בנפרד.

   התמונה נשמרת לפי מזהה הסרטון, ולכן היא נמחקת איתו ואינה משותפת בין
   סרטונים. ההצגה היא דרך כתובת blob: — כתובת מקומית שלא פגה, לא נשלחת
   לרשת, ולא תלויה בשום שרת. */

const DB_NAME = 'k8';
const DB_VERSION = 1;
const STORE = 'posters';

/* כתובות blob: שנוצרו בהפעלה הזאת. אחת לכל סרטון, כדי שציור מחדש של
   הרשימה לא ייצור כתובת חדשה בכל פעם ולא ידלוף זיכרון. */
const urls = new Map();

let opening = null;

function open() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (!self.indexedDB) { reject(new Error('אין IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB נכשל'));
    /* מצב פרטי בסאפרי חוסם לפעמים בלי לזרוק — עדיף לוותר מאשר להיתקע */
    req.onblocked = () => reject(new Error('IndexedDB חסום'));
  }).catch(err => { opening = null; throw err; });
  return opening;
}

function run(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.onabort = () => reject(tx.error);
    if (req) {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } else {
      tx.oncomplete = () => resolve();
    }
  }));
}

/** שומרת תמונה לסרטון. מחזירה false אם האחסון לא זמין — ולא זורקת. */
export async function put(id, blob) {
  if (!id || !blob) return false;
  try {
    await run('readwrite', store => store.put(blob, id));
    /* כתובת ישנה כבר אינה מצביעה על התמונה הנכונה */
    forget(id);
    return true;
  } catch (e) {
    return false;
  }
}

/** כתובת blob: להצגה, או null אם אין תמונה שמורה */
export async function url(id) {
  if (!id) return null;
  if (urls.has(id)) return urls.get(id);
  try {
    const blob = await run('readonly', store => store.get(id));
    if (!blob) return null;
    const made = URL.createObjectURL(blob);
    urls.set(id, made);
    return made;
  } catch (e) {
    return null;
  }
}

/** הבייטים עצמם — להעלאה לספרייה המשותפת */
export async function blob(id) {
  if (!id) return null;
  try { return (await run('readonly', store => store.get(id))) || null; } catch (e) { return null; }
}

/** אילו מזהים כבר שמורים. לבדיקה מהירה של רשימה שלמה בבת אחת. */
export async function saved() {
  try {
    const keys = await run('readonly', store => store.getAllKeys());
    return new Set(keys || []);
  } catch (e) {
    return new Set();
  }
}

export async function drop(id) {
  forget(id);
  try { await run('readwrite', store => store.delete(id)); } catch (e) { /* לא קריטי */ }
}

/** ניקוי תמונות של סרטונים שכבר אינם בספרייה */
export async function keepOnly(ids) {
  try {
    const keys = await run('readonly', store => store.getAllKeys());
    const keep = new Set(ids);
    for (const key of keys || []) {
      if (!keep.has(key)) await drop(key);
    }
  } catch (e) { /* לא קריטי */ }
}

function forget(id) {
  const old = urls.get(id);
  if (old) { URL.revokeObjectURL(old); urls.delete(id); }
}

/* --- הקטנה ---
   הכרטיס תופס את רוחב המסך, ובטלפון עם צפיפות של שלושה פיקסלים זה כאלף
   פיקסלים אמיתיים. 720 הוא הגבול שמתחתיו התמונה נראית מרוחה בדיוק במקום
   שבו היא אמורה לספר מה הסרטון.

   הקלט הוא Blob ולא כתובת, וזה כל ההבדל מהגרסה הקודמת: כתובת blob: היא
   מאותו מקור, ולכן הבד לעולם אינו "מלוכלך" ו-CORS מפסיק להיות תנאי
   לשמירה. זו הייתה הסיבה שתמונות של אינסטגרם ופייסבוק לא נשמרו מעולם. */

const WIDTH = 720;
const QUALITY = 0.72;

export function shrink(source) {
  return new Promise(resolve => {
    if (!source) { resolve(null); return; }
    const src = URL.createObjectURL(source);
    const img = new Image();
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(src);
      resolve(value);
    };
    /* תמונה פגומה שלא יורה לא onload ולא onerror לא תתקע את השמירה */
    const timer = setTimeout(() => finish(null), 8000);
    img.onerror = () => { clearTimeout(timer); finish(null); };
    img.onload = async () => {
      clearTimeout(timer);
      /* onload אומר שהבייטים הגיעו, לא שהתמונה פוענחה. ציור לפני הפענוח
         מייצר בד ריק, ובד ריק שנשמר כ-JPEG יוצא שחור. */
      if (img.decode) { try { await img.decode(); } catch (e) { /* נמשיך ונבדוק */ } }
      try {
        const scale = Math.min(1, WIDTH / img.naturalWidth);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        if (!canvas.width || !canvas.height) { finish(null); return; }
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        if (blank(ctx, canvas)) { finish(null); return; }
        canvas.toBlob(out => finish(out || null), 'image/jpeg', QUALITY);
      } catch (e) {
        finish(null);
      }
    };
    img.src = src;
  });
}

/* דגימה של תשע נקודות. תמונה אמיתית של מגרש כמעט לעולם אינה אחידה
   לגמרי, ובד שלא צויר עליו כלום הוא שקוף — כלומר אלפא אפס. */
function blank(ctx, canvas) {
  const xs = [0.1, 0.5, 0.9];
  let opaque = 0;
  let first = null;
  let varied = false;
  for (const x of xs) {
    for (const y of xs) {
      const px = ctx.getImageData(
        Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data;
      if (px[3] > 8) opaque++;
      const key = px[0] + ',' + px[1] + ',' + px[2];
      if (first === null) first = key;
      else if (key !== first) varied = true;
    }
  }
  return opaque === 0 || !varied;
}
