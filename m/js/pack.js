/* החבילה המלאה: כל החוברות בקובץ JSON אחד, שנטען מהמכשיר ונשמר עליו.

   האתר עצמו מגיש חוברת אחת (הגרסאות לתפקיד) או כלום (השורש). מי שמקבל
   קישור לתפקיד וחותך את הכתובת חזרה לשורש לא מקבל את שאר התפקידים, אלא
   מסך שמבקש חבילה — והחבילה נמצאת רק אצל מי שהוריד אותה.

   זה שער בממשק ולא סוד: content/ מוגש מאותו אתר והמאגר פתוח, ולכן מי
   שיודע מה לחפש ימצא. השער עוצר ילד שמסתובב בכתובות, לא מי שמחפש. */

import { reveal } from './cloud.js';

const KEY = 'k8:pack';

/** החבילה ששמורה על המכשיר, או null */
export function readPack() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const pack = JSON.parse(raw);
    return valid(pack) ? pack : null;
  } catch (e) {
    return null;   /* חבילה פגומה — כאילו אין. המסך יבקש אותה שוב */
  }
}

export function hasPack() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
}

export function clearPack() {
  try { localStorage.removeItem(KEY); } catch (e) { /* לא קריטי */ }
}

function valid(p) {
  return !!p && typeof p === 'object'
    && Array.isArray(p.booklets) && p.booklets.length
    && p.booklets.every(b => b && b.id && Array.isArray(b.scenarios) && b.scenarios.length)
    && !!p.formations && typeof p.formations === 'object'
    && Object.keys(p.formations).length > 0;
}

/* מה בדיוק חסר. "החבילה אינה תקינה" שולח אותך לנחש, וכאן יש בדיוק שלוש
   דרכים שבהן קובץ יכול להיות לא זה: לא JSON, JSON של משהו אחר, או חבילה
   שנחתכה באמצע ההורדה. */
function why(p) {
  if (!p || typeof p !== 'object') return 'הקובץ אינו אובייקט JSON.';
  if (!Array.isArray(p.booklets)) return 'אין בקובץ רשימת booklets — כנראה שזה לא קובץ חבילה.';
  if (!p.booklets.length) return 'רשימת החוברות בקובץ ריקה.';
  if (!p.booklets.every(b => b && b.id && Array.isArray(b.scenarios) && b.scenarios.length)) {
    const bad = p.booklets.findIndex(b => !(b && b.id && Array.isArray(b.scenarios) && b.scenarios.length));
    return 'חוברת מספר ' + (bad + 1) + ' בקובץ בלי תרחישים — ייתכן שההורדה נקטעה.';
  }
  if (!p.formations || !Object.keys(p.formations).length) return 'אין בקובץ מערכים (formations).';
  return 'הקובץ אינו חבילה מוכרת.';
}

/** שומר חבילה מתוך טקסט. זורק שגיאה עם detail כשהיא אינה תקינה. */
export function savePack(text, source) {
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw fail('הקובץ אינו JSON תקין: ' + e.message, text, source);
  }
  if (!valid(parsed)) throw fail(why(parsed), text, source);

  try {
    localStorage.setItem(KEY, JSON.stringify(parsed));
  } catch (e) {
    /* המקום נגמר — בדרך כלל ספריית סרטונים גדולה על אותו מכשיר */
    throw fail('אין מקום לשמור את החבילה במכשיר (' + e.name + ').', '', source);
  }
  return parsed;
}

/* ההודעה מראה את מה שהתקבל בפועל: שם המקור, האורך, וההתחלה עם תווים
   בלתי נראים כקוד. קובץ שלם לא נכנס להודעה, ולכן ההתחלה — שם יושבת
   התשובה כשהורדתם דף HTML של שגיאה במקום JSON. */
function fail(message, text, source) {
  const err = new Error(message);
  const head = String(text || '').slice(0, 300);
  err.detail = [
    source ? 'מקור: ' + source : '',
    text ? 'אורך: ' + String(text).length + ' תווים' : '',
    head ? 'ההתחלה: ' + reveal(head) : ''
  ].filter(Boolean).join('\n');
  return err;
}

/* כתובת מתוך מה שהודבק. אותה מלכודת של cloud.js: כתובת שנשלחה בוואטסאפ
   מגיעה עם סימני כיווניות ושורות שנשברו, ולכן מחלצים ולא בודקים. */
const URLRE = /https?:\/\/[^\s"'<>]+/;

export function findPackUrl(raw) {
  const hit = String(raw || '').replace(/[​-‏‪-‮⁦-⁩﻿]/g, '').match(URLRE);
  return hit ? hit[0] : null;
}

/* רענון אוטומטי מהאתר. נקרא רק כשכבר יש חבילה במכשיר — הטעינה
   הראשונה נשארת ידנית, והיא השער: מי שפותח את הכתובת בלי חבילה לא
   מקבל כלום, וגם לא מקבל כפתור שמביא אותה.

   פסק זמן ולא המתנה: החבילה נטענת בפתיחה, וברשת גרועה במגרש עדיף
   התוכן שכבר במכשיר על מסך שתקוע. */
const REFRESH_TIMEOUT = 6000;

export async function refreshPack(url) {
  const stop = new AbortController();
  const t = setTimeout(() => stop.abort(), REFRESH_TIMEOUT);
  try {
    const res = await fetch(url, { cache: 'no-cache', signal: stop.signal });
    if (!res.ok) throw new Error(url + ' → ' + res.status);
    return savePack(await res.text(), url);
  } finally {
    clearTimeout(t);
  }
}

/** מוריד חבילה מכתובת ושומר אותה */
export async function fetchPack(raw) {
  const url = findPackUrl(raw);
  if (!url) {
    const err = new Error('לא מצאתי כתובת במה שהודבק.');
    err.detail = 'התקבל: ' + reveal(String(raw || ''));
    throw err;
  }
  let res;
  try {
    res = await fetch(url, { cache: 'no-cache' });
  } catch (e) {
    const err = new Error('לא הצלחתי להגיע לכתובת. ' + e.message);
    err.detail = 'הכתובת: ' + reveal(url);
    throw err;
  }
  const text = await res.text();
  if (!res.ok) {
    const err = new Error('הכתובת החזירה ' + res.status + '.');
    err.detail = 'הכתובת: ' + reveal(url) + '\nההתחלה: ' + reveal(text.slice(0, 300));
    throw err;
  }
  return savePack(text, url);
}
