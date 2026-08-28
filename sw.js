/* Service Worker.

   הקוד מוגש cache-first מתוך מטמון שנושא מספר גרסה. זה מכוון: אם כל קובץ
   היה נשלף מהרשת בנפרד, אפשר היה לקבל index.html חדש עם app.js ישן — סט
   קבצים שלא מתאים לעצמו ונופל. מטמון אחד לכל גרסה מבטיח שכל הקוד שנטען
   הוא מאותה גרסה בדיוק.

   הטריות מגיעה מכיוון אחר: הדפדפן בודק את sw.js בכל ניווט, ומשגרסה חדשה
   מותקנת היא משתלטת מיד (skipWaiting + claim), והדף מרענן את עצמו פעם אחת
   (ראה controllerchange ב-app.js). כך עדכון שפורסם מגיע למכשיר בפתיחה
   הבאה, בלי רענון ידני.

   תוכן (content/*.json) — מהרשת קודם, עם נפילה למטמון. ראה contentFirst. */

/* שם המטמון נגזר מגרסה אחת, כדי שכל שינוי קוד ינקה גם את מטמון התוכן.
   בלי זה, תוכן שנשמר בגרסה קודמת יכול להגיע לקוד חדש שמצפה למבנה אחר.
   הוספת תרחיש לא נוגעת בקובץ הזה, ולכן היא עדיין לא דורשת העלאת גרסה. */
const VERSION = 'v31';
const SHELL = 'nines-shell-' + VERSION;
const CONTENT = 'nines-content-' + VERSION;

const ASSETS = [
  './', './index.html', './css/app.css',
  './js/app.js', './js/pitch.js', './js/store.js',
  './js/booklet.js', './js/library.js', './js/quiz.js', './js/terms.js',
  './js/videos.js', './js/videolib.js', './js/preview.js',
  './js/cloud.js', './js/posters.js', './js/sharelib.js',
  './editor.html', './css/editor.css', './js/editor.js',
  './fonts.css', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/logo.svg',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
  './fonts/suez-one-hebrew-400-normal.woff2', './fonts/suez-one-latin-400-normal.woff2',
  './fonts/assistant-hebrew-400-normal.woff2', './fonts/assistant-latin-400-normal.woff2',
  './fonts/assistant-hebrew-600-normal.woff2', './fonts/assistant-latin-600-normal.woff2',
  './fonts/assistant-hebrew-700-normal.woff2', './fonts/assistant-latin-700-normal.woff2',
  './fonts/heebo-hebrew-700-normal.woff2', './fonts/heebo-latin-700-normal.woff2',
  './fonts/heebo-hebrew-900-normal.woff2', './fonts/heebo-latin-900-normal.woff2'
];

const CONTENT_ASSETS = [
  './content/booklets.json', './content/formations.json',
  './content/kesher-6.json', './content/kesher-8.json',
  './content/left-back.json', './content/winger.json'
];

/* cache:'reload' מכריח שליפה מהשרת. בלי זה אפשר למלא מטמון חדש
   מעותקים ישנים שיושבים במטמון ה-HTTP של הדפדפן */
const fresh = url => new Request(url, { cache: 'reload' });

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(ASSETS.map(fresh));
    await caches.open(CONTENT)
      .then(c => c.addAll(CONTENT_ASSETS.map(fresh)))
      .catch(() => {});
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== CONTENT).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.includes('/content/')) e.respondWith(contentFirst(req));
  else e.respondWith(cacheFirst(req));
});

const timeout = ms => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

/* תוכן מהרשת כשאפשר, כדי שתרחיש שהוספת יופיע כבר בפתיחה הראשונה.
   אחרי CONTENT_TIMEOUT נופלים למטמון, כך שרשת גרועה במגרש לא תתקע —
   וכשאין רשת בכלל, האפליקציה עובדת מהמטמון כרגיל. */
const CONTENT_TIMEOUT = 2500;

async function contentFirst(req) {
  const cache = await caches.open(CONTENT);
  const net = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  try {
    return await Promise.race([net, timeout(CONTENT_TIMEOUT)]);
  } catch (e) {
    return (await cache.match(req)) || net;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}
