/* התקדמות ששמורה על המכשיר.
   בגרסה הקודמת הסימונים נשמרו לפי מיקום התרחיש במערך, כך שכל הוספה או
   שינוי סדר היו מזיזים אותם לתרחישים אחרים. כאן הם נשמרים לפי מזהה קבוע. */

const KEY = 'k8:progress';        // { bookletId: [scenarioId, ...] }
const LEGACY_KEY = 'k8:learned';  // הפורמט הישן: מערך של אינדקסים
const ME_KEY = 'k8:me';           // מספר החולצה של הילד

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) { /* מצב פרטי או אחסון מלא — ממשיכים בלי לשמור */ }
}

let progress = readJSON(KEY, {});

/** העברת הסימונים מהפורמט הישן, פעם אחת, לפי סדר התרחישים המקורי */
export function migrateLegacy(bookletId, scenarioIds) {
  const legacy = readJSON(LEGACY_KEY, null);
  if (!Array.isArray(legacy)) return false;
  if (!progress[bookletId]) {
    progress[bookletId] = legacy
      .map(i => scenarioIds[i])
      .filter(Boolean);
    writeJSON(KEY, progress);
  }
  try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* לא קריטי */ }
  return true;
}

export function isLearned(bookletId, scenarioId) {
  return (progress[bookletId] || []).includes(scenarioId);
}

export function toggleLearned(bookletId, scenarioId) {
  const list = progress[bookletId] || [];
  progress[bookletId] = list.includes(scenarioId)
    ? list.filter(x => x !== scenarioId)
    : list.concat(scenarioId);
  writeJSON(KEY, progress);
  return progress[bookletId].includes(scenarioId);
}

export function learnedCount(bookletId) {
  return (progress[bookletId] || []).length;
}

export function resetBooklet(bookletId) {
  delete progress[bookletId];
  writeJSON(KEY, progress);
}

/* --- התרחיש האחרון שנצפה בכל חוברת, כדי להמשיך מאיפה שהפסיק --- */
const LAST_KEY = 'k8:last';
let last = readJSON(LAST_KEY, {});

export function setLast(bookletId, scenarioId) {
  if (last[bookletId] === scenarioId) return;
  last[bookletId] = scenarioId;
  writeJSON(LAST_KEY, last);
}

export function getLast(bookletId) {
  return last[bookletId] || null;
}

/* --- תוצאות המבדק, לפי מזהה תרחיש כמו ההתקדמות --- */
const QUIZ_KEY = 'k8:quiz';
let quiz = readJSON(QUIZ_KEY, {});

export function saveQuizResult(bookletId, scenarioId, grade, offMeters) {
  const book = quiz[bookletId] || (quiz[bookletId] = {});
  const prev = book[scenarioId];
  const better = !prev || rank(grade) > rank(prev.grade);
  book[scenarioId] = {
    grade: better ? grade : prev.grade,
    meters: better ? +offMeters.toFixed(1) : prev.meters,
    last: grade,
    /* מתי נענה לאחרונה — כדי שהאימון היומי יוכל להעדיף את מה שלא נגעו בו
       מזמן. רשומות מגרסה קודמת אין להן at, והן נחשבות הישנות ביותר. */
    at: Date.now(),
    tries: (prev ? prev.tries : 0) + 1
  };
  writeJSON(QUIZ_KEY, quiz);
}

const rank = g => (g === 'exact' ? 2 : g === 'close' ? 1 : 0);

/* --- האימון של היום ---
   מבדק של שלוש-עשרה שאלות הוא יותר מדי לילד בערב אחרי אימון, ומבחן שנעשה
   פעם אחת אינו מלמד. שלוש שאלות שנבחרות לפי מה שפוספס הן חזרה מרווחת:
   קודם מה שנכשל, אחר כך מה שעוד לא נוסה, ולבסוף מה שהצליח מזמן. */

export function dailyPicks(bookletId, ids, n = 3) {
  const book = quiz[bookletId] || {};
  const tier = r => {
    if (!r) return 1;                      /* עוד לא נוסה */
    if (r.last === 'far') return 0;        /* פוספס בפעם האחרונה */
    if (r.last === 'close') return 0.5;
    return 2;                              /* מדויק — חזרה, לא תרגול */
  };
  return ids
    .map(id => ({ id, t: tier(book[id]), at: (book[id] && book[id].at) || 0 }))
    .sort((a, b) => a.t - b.t || a.at - b.at)
    .slice(0, n)
    .map(x => x.id);
}

/** האם כבר נענה משהו בחוברת — קובע אם הכפתור אומר "התחל" או "המשך" */
export function quizTouched(bookletId) {
  return Object.keys(quiz[bookletId] || {}).length > 0;
}

/** כמה תרחישים נענו במדויק בחוברת */
export function quizSummary(bookletId) {
  const book = quiz[bookletId] || {};
  const ids = Object.keys(book);
  return { done: ids.length, exact: ids.filter(k => book[k].grade === 'exact').length };
}

export function resetQuiz(bookletId) {
  delete quiz[bookletId];
  writeJSON(QUIZ_KEY, quiz);
}

/* --- הצד שבו משחקים: R כברירת מחדל, L משקף את כל התרחישים --- */
const SIDE_KEY = 'k8:side';

export function isMirrored() {
  try { return localStorage.getItem(SIDE_KEY) === 'L'; } catch (e) { return false; }
}

export function setMirrored(on) {
  try { localStorage.setItem(SIDE_KEY, on ? 'L' : 'R'); } catch (e) { /* לא קריטי */ }
}

/* האם הצד כבר נבחר על המכשיר. בנייה לתפקיד אחד יכולה להגיע עם צד מוכן
   (defaultSide), אבל רק כברירת מחדל בפתיחה הראשונה — אחרי שהילד נגע
   במתג, הבחירה שלו גוברת ואסור לדרוס אותה בכל טעינה. */
export function hasSide() {
  try { return localStorage.getItem(SIDE_KEY) !== null; } catch (e) { return false; }
}

/* --- מספר החולצה של הילד ---
   משמש לסידור הספרייה: החוברת של התפקיד שלו עולה ראשונה ומסומנת.
   אינו קובע את צביעת הדיאגרמות — את השחקן המודגש קובעת החוברת, כי
   התרחישים מתארים תפקיד מסוים.

   שלושה מצבים, ולכן צריך גם hasMyNumber: לא נשאל עדיין · בחר מספר ·
   בחר לדלג (0). בלי ההבחנה הזאת השאלה הייתה חוזרת בכל פתיחה. */

export function hasMyNumber() {
  try { return localStorage.getItem(ME_KEY) !== null; } catch (e) { return false; }
}

/** מספר החולצה, או 0 אם בחר לדלג */
export function getMyNumber() {
  const v = parseInt(localStorage.getItem(ME_KEY) || '', 10);
  return Number.isFinite(v) ? v : 0;
}

/** null מוחק את הבחירה ומחזיר את השאלה */
export function setMyNumber(n) {
  try {
    if (n === null) localStorage.removeItem(ME_KEY);
    else localStorage.setItem(ME_KEY, String(n));
  } catch (e) { /* לא קריטי */ }
}
