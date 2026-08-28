/* טעינת התוכן, ניתוב בין המסכים, והתקנה כאפליקציה.
   כתובות: #/ ספרייה · #/b/<חוברת> · #/b/<חוברת>/<תרחיש> */

import { mountBooklet } from './booklet.js';
import { renderLibrary } from './library.js';
import { mountQuiz, buildQuestions } from './quiz.js';
import { mountVideos } from './videolib.js';
import { mountShare } from './sharelib.js';
import { migrate } from './videos.js';
import * as cloud from './cloud.js';
import { migrateLegacy, dailyPicks } from './store.js';

const $ = id => document.getElementById(id);

/* קישור שהגיע משיתוף חיצוני, ממתין למסך הסרטונים */
let shared = null;

/* פרטי הצטרפות שהגיעו בקישור, ממתינים למסך הספרייה המשותפת */
let joining = null;

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

function parseHash() {
  /* הכתובת מגיעה מקודדת כשיש בה תווים לא-לטיניים, ולכן מפענחים לפני ההשוואה */
  const dec = x => { try { return decodeURIComponent(x); } catch (e) { return x; } };
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(dec);
  if (parts[0] === 'b' && parts[1]) return { view: 'booklet', id: parts[1], scenario: parts[2] || null };
  if (parts[0] === 'q' && parts[1]) return { view: 'quiz', id: parts[1], scenario: parts[2] || null };
  /* האימון הקצר. התרחישים נבחרים בכל כניסה מחדש ולכן אינם בכתובת */
  if (parts[0] === 't' && parts[1]) return { view: 'train', id: parts[1] };
  if (parts[0] === 'v') return { view: 'videos' };
  if (parts[0] === 's') return { view: 'share' };
  /* קישור הצטרפות שנשלח בוואטסאפ. הכתובת וקוד הקריאה יושבים בתוכו,
     ולכן אין מה להקליד — הוא נפתח ישר במסך האישור. */
  if (parts[0] === 'join' && parts[1]) return { view: 'share', join: parts[1] };
  if (parts[0] === 'x' && parts[1]) return { view: 'shared', data: parts[1] };
  return { view: 'library' };
}

/* תרחיש בודד שנשלח בקישור מהעורך — מגיע מקודד בכתובת, בלי לפרסם כלום.
   נעטף בחוברת סינתטית כדי שמסך החוברת יוכל להציג אותו כמו כל תרחיש. */
function decodeShared(data) {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  const { r, f, t, s } = JSON.parse(new TextDecoder().decode(bytes));
  return {
    id: 'shared', solo: true, role: r, formation: f, mark: String(r),
    eyebrow: 'תרחיש ששותף', title: s.title || t || 'תרחיש', lede: s.sub || '',
    scenarios: [s]
  };
}

async function boot() {
  /* התמונות עוברות מתוך המסמך ל-IndexedDB, ומצבות מגרסה קודמת מנוקות.
     חייב לרוץ לפני שמסך כלשהו קורא את הספרייה. */
  await migrate().catch(err => console.error(err));

  const index = await getJSON('content/booklets.json');
  const formations = await getJSON('content/formations.json');
  const booklets = (await Promise.all(
    index.booklets.map(b => getJSON(b.file).catch(err => { console.error(err); return null; }))
  )).filter(Boolean);
  if (!booklets.length) throw new Error('לא נטענה אף חוברת');

  /* לגרסה שקדמה לחוברות הייתה חוברת אחת בלבד; legacyBooklet אומר לאיזו
     מהן שייכים הסימונים הישנים. חייב לרוץ לפני שהספרייה מציגה מונים. */
  const legacyTarget = booklets.find(b => b.id === index.legacyBooklet) || booklets[0];
  migrateLegacy(legacyTarget.id, legacyTarget.scenarios.map(s => s.id));

  /* אם מסיבה כלשהי הגיע קובץ אינדקס מגרסה ישנה, עדיף ספרייה עם טקסט חסר
     מאשר מסך ריק — הכרטיסים עצמם נקראים מקבצי החוברות */
  const home = index.home || { eyebrow: '', title: 'החוברות', lede: '', foot: '' };
  let current = null;   // מסך החוברת הפעיל

  function openBooklet(id, scenarioId) {
    location.hash = '#/b/' + id + (scenarioId ? '/' + scenarioId : '');
  }

  function openQuiz(id) {
    location.hash = '#/q/' + id;
  }

  function openTrain(id) {
    location.hash = '#/t/' + id;
  }

  function screens(active) {
    ['library', 'booklet', 'quiz', 'videos', 'share'].forEach(id => { $(id).hidden = id !== active; });
  }

  function show(route) {
    if (current) { current.destroy(); current = null; }

    if (route.view === 'videos') {
      screens('videos');
      /* קישור ששותף לאפליקציה נצרך פעם אחת, כדי שרענון לא ימלא את הטופס שוב */
      const prefill = shared;
      shared = null;
      current = mountVideos(prefill);
      window.scrollTo(0, 0);
      return;
    }

    if (route.view === 'share') {
      screens('share');
      /* גם כאן פעם אחת: אחרי ההצטרפות רענון לא אמור לשאול שוב */
      const invite = route.join ? cloud.decodeJoin(route.join) : joining;
      joining = null;
      current = mountShare(invite);
      window.scrollTo(0, 0);
      return;
    }

    let booklet = null;
    if (route.view === 'booklet' || route.view === 'quiz' || route.view === 'train') {
      booklet = booklets.find(b => b.id === route.id);
      if (!booklet) {
        location.replace('#/');   // חוברת לא מוכרת — חזרה לספרייה
        return;
      }
    } else if (route.view === 'shared') {
      try {
        booklet = decodeShared(route.data);
      } catch (err) {
        console.error(err);
        location.replace('#/');   // קישור פגום
        return;
      }
    }

    if (route.view === 'quiz') {
      screens('quiz');
      const only = route.scenario ? [route.scenario] : [];
      /* onExit מריץ מחדש עם תת-קבוצה: "רק את אלה שפספסתי" */
      const start = subset => {
        if (current) current.destroy();
        current = mountQuiz(booklet, formations[booklet.formation], subset, start);
        window.scrollTo(0, 0);
      };
      start(only);
    } else if (route.view === 'train') {
      screens('quiz');
      const formation = formations[booklet.formation];
      /* רק תרחישים שבאמת נגזרת מהם שאלה נכנסים לבחירה, אחרת "שלושה
         תרחישים" היה יכול לצאת אחד */
      const askable = buildQuestions(booklet, formation).map(q => q.id);
      const start = subset => {
        if (current) current.destroy();
        /* קבוצה ריקה — "עוד שלושה": בוחרים מחדש לפי מה שפוספס עכשיו */
        const pick = subset && subset.length ? subset : dailyPicks(booklet.id, askable, 3);
        current = mountQuiz(booklet, formation, pick, start,
          { label: 'האימון של היום', short: true });
        window.scrollTo(0, 0);
      };
      start([]);
    } else if (booklet) {
      screens('booklet');
      const onScenario = booklet.solo ? null : id => {
        /* החלפת תרחיש מעדכנת את הכתובת בלי להוסיף צעד להיסטוריה,
           כדי שכפתור "אחורה" יחזור לספרייה ולא יעבור תרחיש-תרחיש */
        const want = '#/b/' + booklet.id + '/' + id;
        if (location.hash !== want) history.replaceState(null, '', want);
      };
      current = mountBooklet(booklet, formations[booklet.formation], route.scenario, onScenario, index.terms);
    } else {
      screens('library');
      renderLibrary(home, booklets, formations, openBooklet, openQuiz, openTrain, index.version);
    }
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', () => show(parseHash()));

  const params = new URLSearchParams(location.search);

  /* שיתוף אל האפליקציה (share_target ב-manifest): באנדרואיד אפשר ללחוץ
     "שתף" באינסטגרם או ביוטיוב ולבחור בתשיעיות, והקישור מגיע לכאן
     כפרמטרים. פותחים את ספריית הסרטונים עם הטופס מלא מראש.
     ?text= מגיע לפעמים כמשפט שהקישור בתוכו — הניקוי נעשה ב-videos.js. */
  if (params.has('url') || params.has('text')) {
    shared = { url: params.get('url') || params.get('text') || '', title: params.get('title') || '' };
    history.replaceState(null, '', location.pathname + '#/v');
  }

  /* ?b=<id> נתמך מהגרסה הקודמת. replaceState ולא location.replace,
     כדי לא לירות hashchange לפני שהמסך מוכן */
  const legacy = params.get('b');
  if (legacy && !location.hash) history.replaceState(null, '', '#/b/' + legacy);

  $('videosgo').onclick = () => { location.hash = '#/v'; };
  $('sharego').onclick = () => { location.hash = '#/s'; };

  document.documentElement.classList.remove('loading');
  $('state').style.display = 'none';
  show(parseHash());

  /* מקשי חצים — נרשם פעם אחת ומופנה למסך הפעיל */
  document.addEventListener('keydown', e => {
    if (!current) return;
    if (e.key === 'ArrowLeft') current.go(1);
    if (e.key === 'ArrowRight') current.go(-1);
  });
}

boot().catch(err => {
  console.error(err);
  $('state').textContent = 'לא הצלחנו לטעון את התרחישים. נסו לרענן את הדף.';
});

/* --- התקנה ואופליין --- */
let deferred = null;
const ib = $('install');
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferred = e;
  ib.style.display = 'block';
});
ib.onclick = async () => {
  if (!deferred) return;
  ib.style.display = 'none';
  deferred.prompt();
  deferred = null;
};
if ('serviceWorker' in navigator) {
  /* אם כבר היה service worker פעיל בפתיחה, וגרסה חדשה השתלטה תוך כדי —
     טוענים מחדש פעם אחת, כדי שעדכון שפורסם יופיע בלי שצריך לרענן ידנית */
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => reg.update())
      .catch(() => {});
  });
}
