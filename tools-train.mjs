/* בדיקות מקצה לקצה למסך האימון — בדפדפן אמיתי, עם שעון מדומה.

   המסך הזה נשבר במגרש ולא בקוד: לחיצה כפולה של אצבע עם כדור ביד, טלפון
   שננעל, אפליקציה שהאייפון סגר ברקע, חזרה לתרגיל שכבר בוצע. כל תרחיש כאן
   הוא אחת מהדרכים האלה, ורובם נכשלו בפועל לפני 13.22.

   הרצה: node tools-train.mjs            (השורש)
         node tools-train.mjs all        (השורש, w/ ו-m/)
   צריך Playwright ו-Chromium. בלעדיהם — מדלג ואומר את זה, ולא נכשל. */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const pw = await import('playwright').catch(() => import('/opt/node-tools/node_modules/playwright/index.mjs')).catch(() => null);
if (!pw) { console.log('· Playwright אינו זמין — בדיקות האימון לא רצו'); process.exit(0); }

/* --- שרת קבצים --- */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, path.endsWith('/') ? path + 'index.html' : path);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;

/* --- נתונים --- */
const T0 = new Date('2026-11-17T17:00:00').getTime();
const VIDEO = { id: 'v1', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', full: null, posterKind: null, posterUrl: null, posterRef: null, media: null, mediaAt: 0, platform: 'youtube', title: 'בעיטה לשער', note: '', category: null, at: T0, updatedAt: T0 };
const base = { video: null, note: '', minutes: 5, work: 30, rest: 15, rounds: 6, sets: 3, reps: 8, unit: '', limit: 0 };
const D = {
  time: (id, minutes = 1, x = {}) => ({ ...base, id, title: 'זמן ' + id, kind: 'time', minutes, ...x }),
  interval: (id, work = 10, rest = 5, rounds = 2, x = {}) => ({ ...base, id, title: 'אינטרוול ' + id, kind: 'interval', work, rest, rounds, ...x }),
  reps: (id, sets = 3, reps = 8, x = {}) => ({ ...base, id, title: 'חזרות ' + id, kind: 'reps', sets, reps, ...x }),
  chal: (id, limit = 0, x = {}) => ({ ...base, id, title: 'אתגר ' + id, kind: 'challenge', unit: 'קפיצות', limit, ...x })
};
const docOf = (drills, more = {}) => ({
  v: 2, updatedAt: T0, categories: [], videos: [VIDEO],
  sessions: [{ id: 't1', status: 'template', at: T0, updatedAt: T0, title: 'טכניקה', date: '', goal: '', note: '', drills }, ...(more.sessions || [])]
});
const FOUR = () => [D.time('a', 1), D.time('b', 1), D.time('c', 1), D.time('d', 1)];

/* --- רתמה --- */
let browser;
async function open(variant, doc, opt = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: opt.viewport || { width: 390, height: 844 }, locale: 'he-IL', hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String((e && e.stack) || e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.clock.install({ time: T0 });
  await page.addInitScript(() => {
    /* צפצופים נרשמים, כדי לבדוק שהם נשמעים — ולא נשמעים — בזמן הנכון */
    window.__beeps = [];
    const AC = window.AudioContext;
    if (AC) {
      const orig = AC.prototype.createOscillator;
      AC.prototype.createOscillator = function () {
        const o = orig.call(this);
        const start = o.start.bind(o);
        o.start = t => { window.__beeps.push(Math.round(o.frequency.value)); return start(t); };
        return o;
      };
    }
  });
  await page.addInitScript(([d, cloud]) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.clear();
      localStorage.setItem(cloud && cloud.mode === 'viewer' ? 'k8:videos:shared' : 'k8:videos', JSON.stringify(d));
      if (cloud) localStorage.setItem('k8:cloud', JSON.stringify(cloud));
      sessionStorage.setItem('seeded', '1');
    }
  }, [doc, opt.cloud || null]);
  if (opt.route) await page.route('**/macros/**', opt.route);
  await page.goto(ORIGIN + '/' + (variant === 'root' ? '' : variant + '/') + 'index.html' + (opt.hash || '#/v/a'));
  await page.waitForSelector('#plan:not([hidden])', { timeout: 8000 });
  await page.clock.pauseAt(T0 + 1000);
  return { ctx, page, errors };
}

const L = page => page.evaluate(() => {
  const X = document.querySelector('.live');
  if (!X) return null;
  const t = s => { const e = X.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; };
  return {
    layers: document.querySelectorAll('.live').length,
    sum: !!X.querySelector('.lsum'),
    menu: !!X.querySelector('.lmenu'),
    title: t('.ltitle'), count: t('.lcount'), total: t('.ltotal'),
    phase: t('.tphase'), big: t('.tbig'), rnd: t('.rnd'), tcount: t('.tcount'), clock: t('.lclock b'),
    foot: t('.lfoot .btn'), next: t('.lnext'),
    prog: [...X.querySelectorAll('.lprog button')].map(b => b.className || '-').join(','),
    current: [...X.querySelectorAll('.lprog button')].findIndex(b => b.getAttribute('aria-current') === 'step'),
    labels: [...X.querySelectorAll('.lmain button')].map(b => (b.getAttribute('aria-label') || b.textContent).replace(/\s+/g, ' ').trim()),
    dots: [...X.querySelectorAll('.ldots i')].map(i => (i.className === 'on' ? 1 : 0)).join(''),
    navPrev: X.querySelector('.lnav') ? X.querySelectorAll('.lnav')[0].disabled : null,
    navNext: X.querySelector('.lnav') ? X.querySelectorAll('.lnav')[1].disabled : null,
    text: X.innerText.replace(/\s+/g, ' ')
  };
});
const store = page => page.evaluate(() => JSON.parse(localStorage.getItem('k8:videos')));
const runOf = async page => (await store(page)).sessions.filter(s => !s.deleted && s.status === 'plan').sort((a, b) => b.at - a.at)[0] || null;
const beeps = page => page.evaluate(() => { const b = window.__beeps.filter(f => f !== 440); window.__beeps = []; return b; });
const wait = (page, ms) => page.clock.runFor(ms);
const settle = page => page.waitForTimeout(60);   // "חזרה" בהיסטוריה נוחתת בזמן אמת

async function tap(page, label, opt = {}) {
  const scope = opt.scope || '.live';
  const sel = page.locator(scope + ` button[aria-label="${label}"]`).or(page.locator(scope + ' button', { hasText: label }));
  const n = await sel.count();
  if (!n) throw new Error('אין כפתור "' + label + '" — ' + JSON.stringify(await L(page)));
  await sel.first().click(opt.dbl ? { clickCount: 1 } : undefined);
  if (opt.dbl) await sel.first().click().catch(() => {});
  await page.clock.runFor(opt.after === undefined ? 700 : opt.after);   // calm: 600ms
}
async function start(page) {
  await page.locator('.tplrow button', { hasText: 'להתחיל' }).first().click();
  await wait(page, 700);
  await settle(page);
}
async function seg(page, i) {
  await page.locator('.live .lprog button').nth(i).click();
  await wait(page, 700);
}
async function exitLive(page) {
  await tap(page, 'עצירת האימון');
  await tap(page, 'לצאת — ולהמשיך אחר כך');
  await settle(page);
}
async function kill(page, ms) {
  await page.evaluate(() => window.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true));
  const now = await page.evaluate(() => Date.now());
  await page.clock.setSystemTime(now + ms);
  await page.reload();
  await page.waitForSelector('#plan:not([hidden])');
  await page.clock.runFor(300);
}
async function hidden(page, ms) {
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const now = await page.evaluate(() => Date.now());
  await page.clock.setSystemTime(now + ms);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await wait(page, 300);
}

class Fail extends Error {}
function ok(cond, what, info) {
  if (!cond) throw new Fail(what + (info === undefined ? '' : ' — ' + (typeof info === 'string' ? info : JSON.stringify(info))));
}
const secsOf = text => { const m = /(\d+):(\d\d)/.exec(text || ''); return m ? +m[1] * 60 + +m[2] : NaN; };

/* --- התרחישים --- */
const S = [];
const T = (name, fn, opt) => S.push({ name, fn, opt: opt || {} });

/* פתיחה וזמן */
T('פתיחה: תרגיל ראשון, 1 / 4, הפס מסמן אותו', async p => {
  await start(p);
  const l = await L(p);
  ok(l && l.title.includes('זמן a') && l.count === '1 מתוך 4' && l.current === 0 && l.phase === 'מוכן' && l.big === '1:00', 'מסך פתיחה', l);
  ok(l.navPrev === true && l.navNext === false, 'הקודם כבוי בראשון, הבא דולק', l);
}, { drills: FOUR });

T('השהיה עוצרת את שעון התרגיל, והמשך ממשיך מאותו מקום', async p => {
  await start(p);
  await tap(p, 'התחלה');
  await wait(p, 10000);
  const a = await L(p);
  ok(a.phase === 'רץ' && secsOf(a.big) <= 50 && secsOf(a.big) >= 48, 'רץ 10 שניות', a);
  await tap(p, 'השהיה');
  const b = await L(p);
  await wait(p, 15000);
  const c = await L(p);
  ok(c.big === b.big && c.phase === 'בהשהיה', 'בהשהיה השעון עומד', [b.big, c.big, c.phase]);
  ok(c.labels.includes('להמשיך'), 'הכפתור אומר "להמשיך"', c.labels);
  await tap(p, 'להמשיך');
  await wait(p, 5000);
  const d = await L(p);
  ok(secsOf(d.big) < secsOf(c.big) - 4, 'ממשיך לרוץ אחרי ההשהיה', [c.big, d.big]);
}, { drills: FOUR });

T('זמן האימון ממשיך גם בהשהיה של תרגיל', async p => {
  await start(p);
  await tap(p, 'התחלה');
  await tap(p, 'השהיה');
  const a = secsOf((await L(p)).total);
  await wait(p, 20000);
  const b = secsOf((await L(p)).total);
  ok(b - a >= 19 && b - a <= 21, 'הכולל רץ', [a, b]);
}, { drills: FOUR });

T('לחיצה כפולה על ▶ לא משהה מיד', async p => {
  await start(p);
  await p.locator('.live .lbig').dblclick();
  await wait(p, 3000);
  const l = await L(p);
  ok(l.phase === 'רץ', 'עדיין רץ', l);
}, { drills: FOUR });

T('תרגיל זמן שנגמר: צפצוף סיום, "הסתיים", נשאר על המסך עם "לתרגיל הבא"', async p => {
  await start(p);
  await tap(p, 'התחלה');
  await beeps(p);
  await wait(p, 61000);
  const l = await L(p);
  const b = await beeps(p);
  ok(l.phase === 'הסתיים' && l.big === '0:00' && l.title.includes('זמן a'), 'נגמר ונשאר', l);
  ok(l.foot.includes('לתרגיל הבא') && l.prog.startsWith('done now'), 'הבא בזהב, הפס ירוק', l);
  ok(b.join() === '880,880,880,988,988,1319', '3-2-1 וסיום', b);
  const r = await runOf(p);
  ok(r.drills[0].done && r.drills[0].secs === 60, 'בוצע, והזמן לא יותר מהמתוכנן', r.drills[0]);
}, { drills: FOUR });

T('"שוב מההתחלה" אחרי שנגמר — רץ מיד מהזמן המלא', async p => {
  await start(p);
  await tap(p, 'התחלה');
  await wait(p, 61000);
  await tap(p, 'שוב מההתחלה');
  await wait(p, 5000);
  const l = await L(p);
  ok(l.phase === 'רץ' && secsOf(l.big) >= 54 && secsOf(l.big) <= 56, 'רץ שוב', l);
  ok(l.prog.startsWith('done now'), 'נשאר מסומן כבוצע', l.prog);
}, { drills: FOUR });

T('"מההתחלה" בהשהיה — חוזר לזמן המלא ומחכה', async p => {
  await start(p);
  await tap(p, 'התחלה');
  await wait(p, 20000);
  await tap(p, 'השהיה');
  await tap(p, 'מההתחלה');
  await wait(p, 3000);
  const l = await L(p);
  ok(l.big === '1:00' && l.phase === 'מוכן', 'מאופס', l);
}, { drills: FOUR });

/* מעבר בין תרגילים */
T('"סיימנו" מסמן ועובר לבא', async p => {
  await start(p);
  await tap(p, 'סיימנו');
  const l = await L(p);
  const r = await runOf(p);
  ok(l.title.includes('זמן b') && l.count === '2 מתוך 4' && r.drills[0].done && !r.drills[1].done, 'עבר', [l, r.drills.map(d => !!d.done)]);
}, { drills: FOUR });

T('לחיצה כפולה על "סיימנו" — תרגיל אחד בלבד', async p => {
  await start(p);
  await p.locator('.live .lfoot .btn').dblclick();
  await wait(p, 700);
  const l = await L(p);
  const r = await runOf(p);
  ok(l.count === '2 מתוך 4' && r.drills.map(d => !!d.done).join() === 'true,false,false,false', 'רק אחד סומן', [l.count, r.drills.map(d => !!d.done)]);
}, { drills: FOUR });

T('חזרה לתרגיל שסומן "סיימנו": מסומן כעכשווי, ▶ מריץ את השעון', async p => {
  await start(p);
  await tap(p, 'התחלה');
  await wait(p, 10000);
  await tap(p, 'סיימנו');
  await tap(p, 'הקודם ברשימה');
  const a = await L(p);
  ok(a.title.includes('זמן a') && a.current === 0 && a.prog.startsWith('done now'), 'חזר, ומסומן כעכשווי', a);
  ok(a.phase === 'בהשהיה' && a.labels.includes('להמשיך'), 'בהשהיה עם "להמשיך"', a);
  await tap(p, 'להמשיך');
  await wait(p, 5000);
  const b = await L(p);
  ok(b.phase === 'רץ' && secsOf(b.big) < secsOf(a.big) - 4, 'השעון זז (היה נתקע)', [a.big, b.big, b.phase]);
  await tap(p, 'השהיה');
  const c = await L(p);
  await wait(p, 5000);
  ok((await L(p)).big === c.big, 'וגם נעצר', c);
}, { drills: FOUR });

T('חיצים: הבא בלי לסמן, הקודם חוזר; כבויים בקצוות', async p => {
  await start(p);
  await tap(p, 'הבא ברשימה');
  await tap(p, 'הבא ברשימה');
  await tap(p, 'הבא ברשימה');
  const a = await L(p);
  ok(a.count === '4 מתוך 4' && a.navNext === true && a.navPrev === false, 'בסוף', a);
  const r = await runOf(p);
  ok(r.drills.every(d => !d.done), 'שום תרגיל לא סומן', r.drills.map(d => !!d.done));
  await tap(p, 'הקודם ברשימה');
  ok((await L(p)).count === '3 מתוך 4', 'אחורה אחד');
}, { drills: FOUR });

T('נגיעה במקטע בפס קופצת לתרגיל', async p => {
  await start(p);
  await seg(p, 2);
  const l = await L(p);
  ok(l.count === '3 מתוך 4' && l.current === 2 && l.title.includes('זמן c'), 'קפץ', l);
}, { drills: FOUR });

T('מעבר תרגיל עוצר את השעון הקודם, והזמן שלו נשמר', async p => {
  await start(p);
  await tap(p, 'התחלה');
  await wait(p, 10000);
  const a = (await L(p)).big;
  await tap(p, 'הבא ברשימה');
  await wait(p, 20000);
  await tap(p, 'הקודם ברשימה');
  const b = await L(p);
  ok(b.phase === 'בהשהיה' && Math.abs(secsOf(b.big) - secsOf(a)) <= 1, 'עמד בזמן שלא היינו בו', [a, b.big, b.phase]);
}, { drills: FOUR });

T('"לתרגיל הבא" מדלג על מה שכבר בוצע, אל הבא שעוד לא נעשה', async p => {
  await start(p);
  await tap(p, 'סיימנו');   // a ✓ → b
  await tap(p, 'סיימנו');   // b ✓ → c
  await seg(p, 0);           // חזרה ל-a
  const a = await L(p);
  ok(a.next.includes('זמן c'), 'השורה התחתונה אומרת לאן', a.next);
  await tap(p, 'לתרגיל הבא', { scope: '.live .lfoot' });
  ok((await L(p)).title.includes('זמן c'), 'דילג על b', (await L(p)).title);
}, { drills: FOUR });

T('"סיימנו" בתרגיל האחרון — לסיכום', async p => {
  await start(p);
  await seg(p, 3);
  const a = await L(p);
  ok(a.next.includes('סיום האימון'), 'אומר שאחרי זה סיום', a.next);
  await tap(p, 'סיימנו');
  const l = await L(p);
  ok(l.sum && l.text.includes('1 מתוך 4'), 'סיכום', l.text.slice(0, 120));
}, { drills: FOUR });

/* עבודה/מנוחה */
T('עבודה/מנוחה: שלבים, סבבים וצפצופים בזמן', async p => {
  await start(p);
  await tap(p, 'התחלה', { after: 300 });
  await beeps(p);
  const seen = [];
  for (let i = 0; i < 26; i++) { await wait(p, 1000); const l = await L(p); seen.push(l.phase + ' ' + l.big + ' ' + l.rnd); }
  ok(seen[0] === 'עבודה 0:09 סבב 1 מתוך 2' && seen[10] === 'מנוחה 0:04 סבב 1 מתוך 2' && seen[15] === 'עבודה 0:09 סבב 2 מתוך 2' && seen[25].startsWith('הסתיים'), 'ציר הזמן', seen);
  const b = await beeps(p);
  ok(b.join() === '880,880,880,587,880,880,880,1175,880,880,880,988,988,1319', 'צפצופים', b);
}, { drills: () => [D.interval('i', 10, 5, 2), D.time('a')] });

T('עבודה/מנוחה: השהיה במנוחה נשארת במנוחה', async p => {
  await start(p);
  await tap(p, 'התחלה', { after: 12000 });
  await tap(p, 'השהיה');
  const a = await L(p);
  await wait(p, 10000);
  const b = await L(p);
  ok(a.big === b.big && b.phase === 'בהשהיה' && b.rnd === 'סבב 1 מתוך 2', 'עומד במנוחה', [a, b]);
  await tap(p, 'להמשיך', { after: 4000 });
  ok((await L(p)).phase === 'עבודה', 'חזר לעבודה בזמן', await L(p));
}, { drills: () => [D.interval('i', 10, 5, 2), D.time('a')] });

T('עבודה/מנוחה בלי מנוחה: צפצוף עבודה בכל סבב', async p => {
  await start(p);
  await tap(p, 'התחלה', { after: 0 });
  await beeps(p);
  await wait(p, 21500);
  const b = await beeps(p);
  ok(b.filter(f => f === 1175).length === 2 && b.slice(-3).join() === '988,988,1319', 'שני מעברים וסיום', b);
}, { drills: () => [D.interval('i', 7, 0, 3), D.time('a')] });

/* חזרות וסטים */
T('סט הושלם: סט 2 מתוך 3, נקודה, צפצוף קצר', async p => {
  await start(p);
  await beeps(p);
  await tap(p, 'הושלם');
  const l = await L(p);
  ok(l.big === 'סט 2 מתוך 3' && l.dots === '100', 'מעבר סט', l);
  ok((await beeps(p)).join() === '880', 'צפצוף', null);
}, { drills: () => [D.reps('r', 3), D.time('a')] });

T('לחיצה כפולה על "סט הושלם" — סט אחד', async p => {
  await start(p);
  await p.locator('.live .lhuge').dblclick();
  await wait(p, 700);
  const l = await L(p);
  const r = await runOf(p);
  ok(l.big === 'סט 2 מתוך 3' && r.drills[0].setsDone === 1, 'נספר פעם אחת', [l.big, r.drills[0].setsDone]);
}, { drills: () => [D.reps('r', 3), D.time('a')] });

T('הסט האחרון: בוצע, צפצוף סיום, ואפשר לבטל אותו', async p => {
  await start(p);
  await tap(p, 'הושלם'); await tap(p, 'הושלם');
  await beeps(p);
  await tap(p, 'הושלם');
  const a = await L(p);
  ok(a.big === 'כל הסטים' && a.dots === '111' && a.foot.includes('לתרגיל הבא') && a.labels.includes('ביטול הסט האחרון'), 'הושלם, עם ביטול', a);
  ok((await beeps(p)).join() === '988,988,1319', 'צפצוף סיום');
  await tap(p, 'ביטול הסט האחרון');
  const b = await L(p);
  const r = await runOf(p);
  ok(b.big === 'סט 3 מתוך 3' && !r.drills[0].done && r.drills[0].setsDone === 2 && b.foot.includes('סיימנו'), 'בוטל, ולא בוצע עוד', [b, r.drills[0]]);
}, { drills: () => [D.reps('r', 3), D.time('a')] });

T('מנוחה בין סטים: ספירה לאחור, 3-2-1, וצפצוף לסט הבא', async p => {
  await start(p);
  await tap(p, 'הושלם', { after: 0 });
  await beeps(p);
  const a = await L(p);
  ok(a.phase === 'מנוחה' && a.big === '0:30' && a.text.includes('ואז סט 2 מתוך 3'), 'מנוחה', a);
  await wait(p, 20300);
  ok((await L(p)).big === '0:10', 'סופרת', (await L(p)).big);
  await wait(p, 10500);
  const b = await L(p);
  ok(b.big === 'סט 2 מתוך 3' && !b.phase, 'נגמרה — הסט הבא', b);
  ok((await beeps(p)).join() === '880,880,880,1175', '3-2-1 ועבודה');
}, { drills: () => [D.reps('r', 3, 8, { setRest: 30 }), D.time('a')] });

T('"בלי מנוחה" מדלג; סט בזמן מנוחה נספר ומתחיל מנוחה חדשה', async p => {
  await start(p);
  await tap(p, 'הושלם');
  await tap(p, 'בלי מנוחה');
  ok((await L(p)).big === 'סט 2 מתוך 3', 'דילג');
  await tap(p, 'הושלם');
  await wait(p, 5000);
  await tap(p, 'הושלם');
  const l = await L(p);
  ok(l.dots === '111' && l.big === 'כל הסטים' && !l.phase, 'הסט האחרון — בלי מנוחה אחריו', l);
}, { drills: () => [D.reps('r', 3, 8, { setRest: 30 }), D.time('a')] });

T('יצאנו מתרגיל באמצע מנוחה וחזרנו אחרי שנגמרה — בלי צפצוף מאוחר', async p => {
  await start(p);
  await tap(p, 'הושלם');
  await tap(p, 'הבא ברשימה');
  await beeps(p);
  await wait(p, 40000);
  await tap(p, 'הקודם ברשימה');
  const l = await L(p);
  ok(l.big === 'סט 2 מתוך 3', 'המנוחה נגמרה', l);
  ok(!(await beeps(p)).includes(1175), 'שקט');
}, { drills: () => [D.reps('r', 3, 8, { setRest: 30 }), D.time('a')] });

T('חזרה לתרגיל חזרות שסומן "סיימנו" באמצע — אפשר להמשיך סטים', async p => {
  await start(p);
  await tap(p, 'הושלם');
  await tap(p, 'סיימנו');
  await tap(p, 'הקודם ברשימה');
  await tap(p, 'הושלם');
  const r = await runOf(p);
  ok(r.drills[0].setsDone === 2 && r.drills[0].done, 'נספר', r.drills[0]);
}, { drills: () => [D.reps('r', 3), D.time('a')] });

/* אתגר */
T('אתגר: +1 מהיר נספר כל פעם; −1 לא יורד מאפס; הקלדה', async p => {
  await start(p);
  for (let i = 0; i < 6; i++) await p.locator('.live .lplus').click();
  ok((await L(p)).tcount === '6', 'שש', (await L(p)).tcount);
  for (let i = 0; i < 8; i++) await p.locator('.live button[aria-label="אחד פחות"]').click();
  ok((await L(p)).tcount === '0', 'אפס', (await L(p)).tcount);
  await p.locator('.live #l-type').fill('17');
  await p.locator('.live #l-type').press('Enter');
  await p.locator('.live .ltitle').click();
  await wait(p, 300);
  ok((await L(p)).tcount === '17', 'הוקלד', (await L(p)).tcount);
}, { drills: () => [D.chal('c', 0), D.time('a')] });

T('אתגר בזמן: +1 מפעיל שעון; בסוף — "הזמן נגמר", בוצע, ועדיין סופר', async p => {
  await start(p);
  await p.locator('.live .lplus').click();
  await beeps(p);
  await wait(p, 31000);
  const l = await L(p);
  const r = await runOf(p);
  ok(l.text.includes('הזמן נגמר') && r.drills[0].done && r.drills[0].secs === 30, 'נגמר', [l.text.slice(0, 80), r.drills[0]]);
  ok((await beeps(p)).slice(-3).join() === '988,988,1319', 'צפצוף סיום');
  await p.locator('.live .lplus').click();
  ok((await L(p)).tcount === '2', 'סופר אחרי הזמן');
  await tap(p, 'ניסיון חדש');
  const b = await L(p);
  ok(b.tcount === '0' && b.clock === '0:30', 'ניסיון חדש', b);
}, { drills: () => [D.chal('c', 30), D.time('a')] });

T('אתגר: השיא מהיומן, ו"שיא חדש!" כשעוברים אותו', async p => {
  await start(p);
  const a = await L(p);
  ok(a.text.includes('השיא: 3'), 'שיא קודם', a.text.slice(0, 100));
  for (let i = 0; i < 4; i++) await p.locator('.live .lplus').click();
  ok((await L(p)).text.includes('שיא חדש!'), 'שיא חדש');
}, { drills: () => [D.chal('c', 0), D.time('a')], more: { sessions: [{ id: 'j1', status: 'done', at: T0 - 9e7, updatedAt: T0 - 9e7, endedAt: T0 - 9e7, title: 'קודם', date: '2026-11-10', drills: [{ ...D.chal('c', 0), done: true, result: 3 }] }] } });

/* עצירה, יציאה וסיכום */
T('"עצירה" פותחת שאלה; "לא, ממשיכים" — השעון לא נעצר', async p => {
  await start(p);
  await tap(p, 'התחלה');
  await tap(p, 'עצירת האימון');
  const a = await L(p);
  ok(a.menu && a.text.includes('לעצור את האימון?'), 'תפריט', a.text.slice(0, 80));
  await wait(p, 5000);
  await tap(p, 'לא, ממשיכים');
  const b = await L(p);
  ok(!b.menu && b.phase === 'רץ' && secsOf(b.big) <= 54, 'ממשיך', b);
}, { drills: FOUR });

T('תרגיל שנגמר בזמן שתפריט העצירה פתוח — התפריט נשאר', async p => {
  await start(p);
  await tap(p, 'התחלה');
  await wait(p, 55000);
  await tap(p, 'עצירת האימון');
  await wait(p, 8000);
  const l = await L(p);
  ok(l.menu && l.phase === 'הסתיים', 'תפריט פתוח, התרגיל נגמר מתחתיו', l);
}, { drills: FOUR });

T('"לצאת — ולהמשיך אחר כך": נסגר, "באמצע" ברשימה, וחוזרים בדיוק לאותו מקום', async p => {
  await start(p);
  await tap(p, 'סיימנו');
  await tap(p, 'התחלה');
  await wait(p, 12000);
  const a = await L(p);
  await exitLive(p);
  ok(!(await L(p)), 'נסגר');
  const list = await p.locator('#plan').innerText();
  ok(list.includes('באמצע · טכניקה') && list.includes('1 מתוך 4'), 'כרטיס "באמצע"', list.slice(0, 150));
  await wait(p, 60000);
  await p.locator('.runcard button', { hasText: 'להמשיך' }).click();
  await wait(p, 700);
  const b = await L(p);
  ok(b.title.includes('זמן b') && b.phase === 'בהשהיה' && Math.abs(secsOf(b.big) - secsOf(a.big)) <= 1, 'אותו תרגיל, אותו זמן', [a.big, b.big, b.phase]);
  ok(Math.abs(secsOf(b.total) - secsOf(a.total)) <= 3, 'הזמן בחוץ לא נספר', [a.total, b.total]);
}, { drills: FOUR });

T('"לסיים": סיכום עם מה שנעשה; "חזרה לאימון" מחזירה לאותו תרגיל', async p => {
  await start(p);
  await tap(p, 'סיימנו');
  await tap(p, 'עצירת האימון');
  await tap(p, 'לסיים');
  const a = await L(p);
  ok(a.sum && a.text.includes('1 מתוך 4 תרגילים'), 'סיכום', a.text.slice(0, 100));
  const t1 = secsOf(a.text);
  await wait(p, 30000);
  await tap(p, 'חזרה לאימון');
  const b = await L(p);
  ok(!b.sum && b.title.includes('זמן b'), 'חזר לאימון', b);
  ok(Math.abs(secsOf(b.total) - t1) <= 2, 'הזמן בסיכום לא נספר', [t1, b.total]);
  const r = await runOf(p);
  ok(!r.endedAt, 'ההרצה פתוחה שוב', r.endedAt);
}, { drills: FOUR });

T('"סגירה" מהסיכום: "לסיכום ושמירה ביומן" ברשימה, ונפתח שוב לסיכום', async p => {
  await start(p);
  await seg(p, 3);
  await tap(p, 'סיימנו');
  await tap(p, 'סגירה — אפשר לשמור ביומן אחר כך');
  await settle(p);
  ok(!(await L(p)), 'נסגר');
  await p.locator('.runcard button', { hasText: 'לסיכום' }).click();
  await wait(p, 700);
  ok((await L(p)).sum, 'סיכום');
}, { drills: FOUR });

T('שמירה ביומן: ציון והערה נשמרים, היומן נפתח, האימון השמור נשאר נקי', async p => {
  await start(p);
  await tap(p, 'התחלה');
  await wait(p, 61000);
  await tap(p, 'לתרגיל הבא', { scope: '.live .lfoot' });
  await tap(p, 'עצירת האימון');
  await tap(p, 'לסיים');
  await p.locator('.live .res').first().locator('button', { hasText: '4' }).click();
  await p.locator('.live #s-note').fill('טוב מאוד');
  await tap(p, 'שמירה ביומן');
  await settle(p); await wait(p, 300); await settle(p);
  ok(!(await L(p)), 'נסגר');
  const d = await store(p);
  const j = d.sessions.find(s => s.status === 'done');
  ok(j && j.drills[0].score === 4 && j.note === 'טוב מאוד' && j.drills[0].done && j.totalSecs >= 61, 'ביומן', j);
  const t = d.sessions.find(s => s.id === 't1');
  ok(t.drills.every(x => !x.done && !x.secs && !x.score), 'השמור נקי', t.drills);
  ok(!d.sessions.some(s => !s.deleted && s.status === 'plan'), 'אין "באמצע"');
  const h = await p.evaluate(() => location.hash);
  ok(h === '#/v/h/' + j.id, 'נפתח היומן', h);
}, { drills: FOUR });

T('Escape בתפריט העצירה סוגר רק את התפריט', async p => {
  await start(p);
  await tap(p, 'עצירת האימון');
  await p.keyboard.press('Escape');
  await wait(p, 300);
  const l = await L(p);
  ok(l && !l.menu, 'רק התפריט נסגר', l);
}, { drills: FOUR });

T('סרטון: שעון התרגיל עוצר והכולל ממשיך; Escape סוגר רק את הנגן', async p => {
  await start(p);
  await tap(p, 'התחלה');
  await wait(p, 5000);
  const a = await L(p);
  await p.locator('.live .lvid').click();
  await wait(p, 500);
  ok(await p.evaluate(() => !!document.querySelector('.player')), 'נגן');
  await wait(p, 20000);
  await p.keyboard.press('Escape');
  await wait(p, 700); await settle(p);
  const b = await L(p);
  ok(b && !(await p.evaluate(() => !!document.querySelector('.player'))), 'הנגן נסגר, האימון נשאר', b);
  ok(Math.abs(secsOf(b.big) - secsOf(a.big)) <= 2, 'שעון התרגיל עמד', [a.big, b.big]);
  ok(secsOf(b.total) - secsOf(a.total) >= 19, 'הכולל רץ', [a.total, b.total]);
  ok(b.phase === 'רץ', 'וממשיך לרוץ אחרי הנגן', b.phase);
}, { drills: () => [D.time('a', 1, { video: 'v1' }), D.time('b')] });

/* עמידות */
T('לחיצה כפולה על "להמשיך אותו" — שכבה אחת', async p => {
  await start(p);
  await exitLive(p);
  await p.locator('.tplrow button', { hasText: 'להתחיל' }).click();
  await wait(p, 400);
  await p.locator('.sheet button', { hasText: 'להמשיך אותו' }).dblclick();
  await wait(p, 1500); await settle(p); await wait(p, 300);
  const l = await L(p);
  ok(l && l.layers === 1, 'שכבה אחת', l && l.layers);
}, { drills: FOUR });

T('לחיצה כפולה על "לבטל אותו ולהתחיל" — הרצה אחת, בלי אימון שמור כפול', async p => {
  await start(p);
  await exitLive(p);
  await p.locator('.tplrow button', { hasText: 'להתחיל' }).click();
  await wait(p, 400);
  await p.locator('.sheet button', { hasText: 'לבטל אותו' }).dblclick();
  await wait(p, 1500); await settle(p); await wait(p, 300);
  const l = await L(p);
  const d = await store(p);
  const live = d.sessions.filter(s => !s.deleted);
  ok(l && l.layers === 1, 'שכבה אחת', l && l.layers);
  ok(live.filter(s => s.status === 'plan').length === 1 && live.filter(s => s.status === 'template').length === 1, 'הרצה אחת ושמור אחד', live.map(s => s.status));
}, { drills: FOUR });

T('האפליקציה נסגרה באמצע תרגיל רץ — נפתחת שוב לאימון, והתרגיל המשיך', async p => {
  await start(p);
  await tap(p, 'התחלה');
  await wait(p, 10000);
  const a = await L(p);
  await kill(p, 20000);
  const b = await L(p);
  ok(b && b.title.includes('זמן a'), 'נפתח לבד', b);
  ok(b.phase === 'רץ' && secsOf(b.big) <= secsOf(a.big) - 18 && secsOf(b.big) >= secsOf(a.big) - 25, 'התרגיל המשיך לרוץ', [a.big, b.big, b.phase]);
  ok(secsOf(b.total) >= secsOf(a.total) + 18, 'הזמן הכולל כולל את הפער', [a.total, b.total]);
}, { drills: FOUR, slow: true });

T('נסגרה לפני יותר משלוש שעות — לא נפתחת לבד, והזמן לא מתנפח', async p => {
  await start(p);
  await tap(p, 'התחלה');
  await wait(p, 10000);
  const a = await L(p);
  await kill(p, 4 * 3600 * 1000);
  ok(!(await L(p)), 'לא נפתח לבד');
  await p.locator('.runcard button', { hasText: 'להמשיך' }).click();
  await wait(p, 700);
  const b = await L(p);
  ok(b && secsOf(b.total) - secsOf(a.total) <= 6, 'ארבע השעות לא נספרו', [a.total, b && b.total]);
  ok(b.phase !== 'רץ', 'התרגיל לא רץ לבד', b.phase);
}, { drills: FOUR, slow: true });

T('טלפון נעול 2 דקות: התרגיל המשיך, נגמר — בלי צפצופים מאוחרים, וזמן לא יותר מהמתוכנן', async p => {
  await start(p);
  await tap(p, 'התחלה');
  await wait(p, 5000);
  await beeps(p);
  await hidden(p, 120000);
  const l = await L(p);
  const r = await runOf(p);
  ok(l.phase === 'הסתיים' && r.drills[0].done && r.drills[0].secs === 60, 'נגמר, ונרשם 1:00', [l.phase, r.drills[0].secs]);
  ok((await beeps(p)).length === 0, 'בלי צפצופים מאוחרים');
}, { drills: FOUR });

T('מסך פתוח ברקע כל הלילה — הלילה אינו זמן אימון', async p => {
  await start(p);
  await tap(p, 'התחלה');
  await wait(p, 10000);
  const a = secsOf((await L(p)).total);
  await hidden(p, 8 * 3600 * 1000);
  const l = await L(p);
  ok(secsOf(l.total) - a <= 3, 'הכולל לא קפץ', [a, l.total]);
  ok(l.phase !== 'רץ', 'התרגיל לא רץ', l.phase);
}, { drills: FOUR });

T('אנדרואיד: ברקע 4 שעות עם טיימרים מואטים (פעם בדקה) — לא נספר', async p => {
  await start(p);
  await tap(p, 'התחלה');
  await wait(p, 10000);
  const a = await L(p);
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  for (let i = 0; i < 240; i++) await p.clock.fastForward(60000);
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await wait(p, 500);
  const b = await L(p);
  ok(secsOf(b.total) - secsOf(a.total) <= 3, 'ארבע השעות לא נספרו', [a.total, b.total]);
  ok(b.phase !== 'רץ', 'התרגיל לא רץ', b);
}, { drills: FOUR });

T('אנדרואיד: ברקע 2 דקות עם טיימרים מואטים — כמו טלפון נעול, נספר', async p => {
  await start(p);
  await tap(p, 'התחלה');
  await wait(p, 10000);
  const a = await L(p);
  await beeps(p);
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  for (let i = 0; i < 2; i++) await p.clock.fastForward(60000);
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await wait(p, 500);
  const b = await L(p);
  const r = await runOf(p);
  ok(secsOf(b.total) - secsOf(a.total) >= 119, 'הדקות נספרו', [a.total, b.total]);
  ok(b.phase === 'הסתיים' && r.drills[0].secs === 60, 'התרגיל נגמר ב-1:00', [b.phase, r.drills[0].secs]);
  ok((await beeps(p)).length === 0, 'בלי צפצופים מאוחרים');
}, { drills: FOUR });

T('עמוד האימון השמור: "באמצע" עם "להמשיך"', async p => {
  await p.locator('.tplmain').first().click();
  await wait(p, 500); await settle(p);
  await p.locator('.plan-go').click();
  await wait(p, 700);
  await exitLive(p);
  const t = await p.locator('#plan').innerText();
  ok(t.includes('באמצע · טכניקה'), 'כרטיס בעמוד', t.slice(0, 120));
  await p.locator('.runcard button', { hasText: 'להמשיך' }).click();
  await wait(p, 700);
  ok(await L(p), 'נפתח');
}, { drills: FOUR });

T('בעלים עם ספרייה משותפת איטית: יציאה וחזרה תוך כדי סנכרון — ההרצה שלמה', async p => {
  await start(p);
  await tap(p, 'סיימנו');
  await tap(p, 'התחלה');
  await wait(p, 5000);
  await exitLive(p);
  await p.locator('.runcard button', { hasText: 'להמשיך' }).click();
  await wait(p, 700);
  await wait(p, 5000);
  await p.waitForTimeout(1500);   // התשובה מהסקריפט מגיעה בזמן אמת
  await wait(p, 2000);
  const l = await L(p);
  const r = await runOf(p);
  ok(l && l.title.includes('זמן b') && r.drills[0].done && r.cur === 1, 'המצב נשמר', [l && l.title, r && r.cur]);
}, {
  drills: FOUR,
  cloud: { url: 'https://script.google.com/macros/s/AKfycbTEST_x/exec', code: 'w1', mode: 'owner', name: 'בדיקה' },
  route: async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    await new Promise(r => setTimeout(r, 800));
    route.fulfill({ status: 200, contentType: 'text/plain', body: JSON.stringify({ ok: true, doc: body.doc || null }) });
  }
});

T('צופה (הבן): רואה את האימונים, בלי "להתחיל"', async p => {
  const t = await p.locator('#plan').innerText();
  ok(t.includes('טכניקה') && !(await p.locator('.tplrow button', { hasText: 'להתחיל' }).count()), 'בלי הרצה', t.slice(0, 100));
}, {
  drills: FOUR,
  cloud: { url: 'https://script.google.com/macros/s/AKfycbTEST_x/exec', code: 'r1', mode: 'viewer', name: 'בדיקה' },
  route: route => route.fulfill({ status: 200, contentType: 'text/plain', body: JSON.stringify({ ok: true, doc: null }) })
});

/* עריכה */
T('עריכה: מנוחה בין סטים בתרגיל ישן (בלי השדה) — בלי NaN, ונשמרת', async p => {
  await p.locator('.tplmain').first().click();
  await wait(p, 500); await settle(p);
  await p.locator('.drill .dbody').first().click();
  await wait(p, 400);
  const row = p.locator('.sheet .stp', { hasText: 'מנוחה בין סטים' });
  ok(await row.count(), 'יש שורה', null);
  ok((await row.locator('b').innerText()) === 'בלי', 'מתחיל מ"בלי"');
  await row.locator('button[aria-label$="יותר"]').click();
  await row.locator('button[aria-label$="יותר"]').click();
  ok((await row.locator('b').innerText()) === '30 שנ׳', '30', await row.locator('b').innerText());
  await p.locator('.sheet button', { hasText: 'שמירה' }).click();
  await wait(p, 500); await settle(p);
  const d = await store(p);
  ok(d.sessions[0].drills[0].setRest === 30, 'נשמר', d.sessions[0].drills[0]);
}, { drills: () => { const r = D.reps('r'); delete r.setRest; return [r]; } });

T('עריכה: "שמירה" כפולה לתרגיל חדש — נוסף פעם אחת', async p => {
  await p.locator('.tplmain').first().click();
  await wait(p, 500); await settle(p);
  await p.locator('.plan-add button', { hasText: 'תרגיל בלי סרטון' }).click();
  await wait(p, 400);
  await p.locator('.sheet #d-title').fill('חימום');
  await p.locator('.sheet button', { hasText: 'שמירה' }).dblclick();
  await wait(p, 600); await settle(p);
  const d = await store(p);
  ok(d.sessions[0].drills.filter(x => x.title === 'חימום').length === 1, 'אחד', d.sessions[0].drills.map(x => x.title));
}, { drills: FOUR });

T('מחיקה בשתי לחיצות: לחיצה כפולה מהירה אינה אישור', async p => {
  await start(p);
  await exitLive(p);
  const drop = p.locator('.runcard button', { hasText: 'לבטל' });
  await drop.dblclick();
  await wait(p, 100);
  ok((await runOf(p)), 'לא בוטל בלחיצה כפולה');
  await wait(p, 600);
  await drop.click();
  await wait(p, 300);
  ok(!(await runOf(p)), 'בוטל בלחיצה השנייה');
}, { drills: FOUR });

/* עוד מסלולים */
T('אימון שכולו סטים: כל הסטים בכל התרגילים, עד הסיכום', async p => {
  await start(p);
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 2; i++) await tap(p, 'הושלם');
    const l = await L(p);
    ok(l.big === 'כל הסטים' && l.count === (k + 1) + ' מתוך 3', 'תרגיל ' + (k + 1), l);
    await tap(p, k < 2 ? 'לתרגיל הבא' : 'סיום האימון', { scope: '.live .lfoot' });
  }
  const l = await L(p);
  ok(l.sum && l.text.includes('3 מתוך 3') && l.text.includes('2 מתוך 2 סטים'), 'סיכום מלא', l.text.slice(0, 200));
}, { drills: () => [D.reps('a', 2), D.reps('b', 2), D.reps('c', 2)] });

T('"סיימנו" באמצע סבב עבודה/מנוחה — עוצר, מסמן, עובר', async p => {
  await start(p);
  await tap(p, 'התחלה', { after: 12000 });
  await tap(p, 'סיימנו');
  await wait(p, 10000);
  const r = await runOf(p);
  const l = await L(p);
  ok(r.drills[0].done && Math.abs(r.drills[0].secs - 12) < 1.5 && l.title.includes('זמן a') && l.phase === 'מוכן', 'נעצר ב-12 שניות', [r.drills[0].secs, l.phase]);
}, { drills: () => [D.interval('i', 10, 5, 3), D.time('a')] });

T('יציאה בהשהיה וחזרה — עדיין בהשהיה, אותו זמן', async p => {
  await start(p);
  await tap(p, 'התחלה', { after: 15000 });
  await tap(p, 'השהיה');
  const a = await L(p);
  await exitLive(p);
  await p.locator('.runcard button', { hasText: 'להמשיך' }).click();
  await wait(p, 5000);
  const b = await L(p);
  ok(b.phase === 'בהשהיה' && b.big === a.big, 'כמו שהיה', [a.big, b.big, b.phase]);
}, { drills: FOUR });

T('אימון אחר בזמן שיש "באמצע": "לבטל ולהתחיל" — ההרצה החדשה מהשמור השני', async p => {
  await start(p);
  await tap(p, 'סיימנו');
  await exitLive(p);
  await p.locator('.tplrow', { hasText: 'כושר' }).locator('button', { hasText: 'להתחיל' }).click();
  await wait(p, 400);
  await p.locator('.sheet button', { hasText: 'לבטל אותו' }).click();
  await wait(p, 900); await settle(p); await wait(p, 300);
  const l = await L(p);
  const d = await store(p);
  const runs = d.sessions.filter(x => !x.deleted && x.status === 'plan');
  ok(l && l.title.includes('ריצה') && runs.length === 1 && runs[0].from === 't2' && runs[0].drills.every(x => !x.done), 'חדש ונקי', [l && l.title, runs.map(x => x.from)]);
}, { drills: FOUR, more: { sessions: [{ id: 't2', status: 'template', at: T0, updatedAt: T0, title: 'כושר', date: '', goal: '', note: '', drills: [D.time('x', 2, { title: 'ריצה' })] }] } });

T('האימון השמור נמחק באמצע ההרצה — ההרצה נמשכת ונשמרת ביומן', async p => {
  await start(p);
  await tap(p, 'סיימנו');
  await exitLive(p);
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('k8:videos')); d.sessions.find(x => x.id === 't1').deleted = true; localStorage.setItem('k8:videos', JSON.stringify(d)); });
  await p.reload(); await p.waitForSelector('#plan:not([hidden])'); await wait(p, 300);
  await p.locator('.runcard button', { hasText: 'להמשיך' }).click();
  await wait(p, 700);
  await tap(p, 'עצירת האימון');
  await tap(p, 'לסיים');
  await tap(p, 'שמירה ביומן');
  await settle(p); await wait(p, 300); await settle(p);
  const j = (await store(p)).sessions.find(x => x.status === 'done');
  ok(j && j.drills[0].done, 'ביומן', j);
}, { drills: FOUR });

T('הסרטון נמחק מהספרייה — התרגיל בלי כרטיס סרטון, בלי שגיאה', async p => {
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('k8:videos')); d.videos[0].deleted = true; localStorage.setItem('k8:videos', JSON.stringify(d)); });
  await p.reload(); await p.waitForSelector('#plan:not([hidden])'); await wait(p, 300);
  await start(p);
  const has = await p.evaluate(() => !!document.querySelector('.live .lvid'));
  ok(!has && (await L(p)).title.includes('זמן a'), 'בלי כרטיס', has);
  await tap(p, 'התחלה', { after: 3000 });
  ok((await L(p)).phase === 'רץ', 'רץ');
}, { drills: () => [D.time('a', 1, { video: 'v1' }), D.time('b')] });

T('"לסיים" בלי אף תרגיל — סיכום 0, ונשמר ביומן', async p => {
  await start(p);
  await tap(p, 'עצירת האימון');
  await tap(p, 'לסיים');
  ok((await L(p)).text.includes('0 מתוך 4'), 'אפס');
  await tap(p, 'שמירה ביומן');
  await settle(p); await wait(p, 300); await settle(p);
  const t = await p.locator('#plan').innerText();
  ok(t.includes('0 מתוך 4 תרגילים'), 'ביומן', t.slice(0, 200));
}, { drills: FOUR });

T('שיא חדש באתגר — בסיכום ובשיאים של היומן', async p => {
  await start(p);
  for (let i = 0; i < 5; i++) await p.locator('.live .lplus').click();
  await wait(p, 700);
  await tap(p, 'סיימנו');
  await tap(p, 'עצירת האימון');
  await tap(p, 'לסיים');
  ok((await L(p)).text.includes('שיא חדש: אתגר c 5 (היה 3)'), 'בסיכום', (await L(p)).text.slice(0, 160));
  await tap(p, 'שמירה ביומן');
  await settle(p); await wait(p, 300); await settle(p);
  await p.evaluate(() => { location.hash = '#/v/h'; });
  await wait(p, 300); await settle(p);
  const t = await p.locator('#plan').innerText();
  ok(/שיאים[\s\S]*אתגר c[\s\S]*5 קפיצות/.test(t), 'ביומן', t.slice(0, 200));
}, { drills: () => [D.chal('c', 0), D.time('a')], more: { sessions: [{ id: 'j1', status: 'done', at: T0 - 9e7, updatedAt: T0 - 9e7, endedAt: T0 - 9e7, title: 'קודם', date: '2026-11-10', drills: [{ ...D.chal('c', 0), done: true, result: 3 }] }] } });

T('"חזרה" של הטלפון (אנדרואיד) סוגרת את האימון כמו "לצאת", ולא נפתח לבד אחר כך', async p => {
  await start(p);
  await tap(p, 'התחלה', { after: 5000 });
  await p.evaluate(() => history.back());
  await settle(p); await wait(p, 300);
  ok(!(await L(p)), 'נסגר');
  const r = await runOf(p);
  ok(r && !r.liveAt && !r.tickAt, 'לא מסומן כפתוח', r && [r.liveAt, r.tickAt]);
  await p.reload(); await p.waitForSelector('#plan:not([hidden])'); await wait(p, 300);
  ok(!(await L(p)), 'לא נפתח לבד');
}, { drills: FOUR });

T('"חזרה" של הטלפון כשתפריט העצירה או הנגן פתוחים — שכבה אחת בכל פעם', async p => {
  await start(p);
  await p.locator('.live .lvid').click();
  await wait(p, 500);
  await p.evaluate(() => history.back());
  await settle(p); await wait(p, 300);
  ok(await L(p) && !(await p.evaluate(() => !!document.querySelector('.player'))), 'רק הנגן נסגר');
}, { drills: () => [D.time('a', 1, { video: 'v1' }), D.time('b')] });

/* בניית האימון */
async function openPlan(p) {
  await p.locator('.tplmain').first().click();
  await wait(p, 500); await settle(p);
}
const order = async p => (await store(p)).sessions.find(x => x.id === 't1').drills.map(d => d.id).join('');

T('בנייה: גרירה בנקודות משנה את הסדר, ונשמר', async p => {
  await openPlan(p);
  const g = p.locator('.drill .grip').nth(0);
  const b = await g.boundingBox();
  const t = await p.locator('.drill').nth(2).boundingBox();
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + (t.y + t.height * 0.75 - b.y) * i / 8);
  await p.mouse.up();
  await wait(p, 300);
  ok(await order(p) === 'bcad', 'a עבר לשלישי', await order(p));
}, { drills: FOUR });

T('בנייה: החלקה חושפת "מחיקה", ו"ביטול" מחזיר למקום', async p => {
  await openPlan(p);
  const r = await p.locator('.drill .dslide').nth(1).boundingBox();
  const y = r.y + r.height / 2;
  await p.mouse.move(r.x + r.width * 0.5, y);
  await p.mouse.down();
  for (let i = 1; i <= 6; i++) await p.mouse.move(r.x + r.width * 0.5 - 20 * i, y);
  await p.mouse.up();
  await wait(p, 300);
  await p.locator('.drill .ddel').nth(1).click();
  await wait(p, 300);
  ok(await order(p) === 'acd', 'נמחק', await order(p));
  await p.locator('#toast button', { hasText: 'ביטול' }).click();
  await wait(p, 300);
  ok(await order(p) === 'abcd', 'חזר למקום', await order(p));
}, { drills: FOUR });

T('בנייה: "+ מהסרטונים" — בוחרים, מוסיפים, וחוזרים לאימון', async p => {
  await openPlan(p);
  await p.locator('.plan-add button', { hasText: 'מהסרטונים' }).click();
  await wait(p, 500); await settle(p);
  await p.locator('#videos button.rc, #videos .rows button').first().click();
  await wait(p, 300);
  await p.locator('.pickbar button', { hasText: 'הוספה לאימון' }).click();
  await wait(p, 600); await settle(p); await wait(p, 300);
  const h = await p.evaluate(() => location.hash);
  const d = (await store(p)).sessions.find(x => x.id === 't1').drills;
  ok(h === '#/v/a/t1' && d.length === 5 && d[4].video === 'v1' && d[4].title === 'בעיטה לשער', 'נוסף', [h, d.length]);
}, { drills: FOUR });

T('בנייה: אימון ריק — "להתחיל" כבוי ואינו מתחיל', async p => {
  await openPlan(p);
  ok(await p.locator('.plan-go').isDisabled(), 'כבוי');
  ok(!(await p.locator('.tplrow button', { hasText: 'להתחיל' }).count()), 'אין "להתחיל" ברשימה');
}, { drills: () => [] });

T('בנייה: שכפול יוצר עותק נפרד; עריכה בעותק לא נוגעת במקור', async p => {
  await openPlan(p);
  await p.locator('.plan-foot button', { hasText: 'שכפול' }).click();
  await wait(p, 500); await settle(p);
  await p.locator('.drill .dbody').first().click();
  await wait(p, 400);
  await p.locator('.sheet #d-title').fill('שונה');
  await p.locator('.sheet button', { hasText: 'שמירה' }).click();
  await wait(p, 500); await settle(p);
  const d = await store(p);
  const t = d.sessions.filter(x => x.status === 'template');
  ok(t.length === 2 && t.find(x => x.id === 't1').drills[0].title === 'זמן a' && t.find(x => x.id !== 't1').drills[0].title === 'שונה', 'נפרד', t.map(x => x.drills[0].title));
}, { drills: FOUR });

T('יומן: "שמירה כאימון שמור" באותו שם מעדכן את הקיים, ואומר את זה', async p => {
  await start(p);
  await tap(p, 'סיימנו');
  await tap(p, 'עצירת האימון');
  await tap(p, 'לסיים');
  await tap(p, 'שמירה ביומן');
  await settle(p); await wait(p, 300); await settle(p);
  await p.locator('#plan button', { hasText: 'שמירה כאימון שמור' }).click();
  await wait(p, 400);
  ok((await p.locator('.sheet').innerText()).includes('יש כבר אימון שמור בשם הזה'), 'מזהיר מראש');
  await p.locator('.sheet button', { hasText: 'לעדכן את האימון השמור' }).click();
  await wait(p, 400);
  ok((await p.locator('#toast').innerText()).includes('עודכן'), 'אומר עודכן', await p.locator('#toast').innerText());
  const t = (await store(p)).sessions.filter(x => !x.deleted && x.status === 'template');
  ok(t.length === 1 && t[0].drills.every(d => !d.done), 'אחד, נקי', t.length);
}, { drills: FOUR });

/* תצוגה */
T('טלפון קטן (375×667): השורה התחתונה על המסך גם עם תוכן ארוך', async p => {
  await start(p);
  const r = await p.evaluate(() => { const f = document.querySelector('.live .lfoot').getBoundingClientRect(); return { bottom: f.bottom, top: f.top, vh: innerHeight }; });
  ok(r.bottom <= r.vh && r.top > r.vh / 2, 'נראית', r);
  const w = await p.evaluate(() => ({ sw: document.querySelector('.live').scrollWidth, cw: document.querySelector('.live').clientWidth }));
  ok(w.sw <= w.cw, 'בלי גלילה לרוחב', w);
}, { drills: () => [D.time('a', 5, { video: 'v1', title: 'בעיטות לשער ברגל חלשה מחוץ לרחבה', note: 'רק רגל שמאל, להסתכל על הכדור עד הסוף, ולסיים בכיוון השער — עשר פעמים מכל צד' }), D.time('b')], viewport: { width: 375, height: 667 } });

T('טלפון צר (320×568): בלי גלילה לרוחב, הכפתורים נגישים', async p => {
  await start(p);
  await seg(p, 1);
  const w = await p.evaluate(() => ({ sw: document.querySelector('.live').scrollWidth, cw: document.querySelector('.live').clientWidth, foot: document.querySelector('.live .lfoot').getBoundingClientRect().bottom, vh: innerHeight }));
  ok(w.sw <= w.cw && w.foot <= w.vh, 'נכנס', w);
  await tap(p, 'הושלם');
  const l = await L(p);
  ok(l.dots === '100' && l.phase === 'מנוחה', 'עובד', l);
}, { drills: () => [D.time('a'), D.reps('r', 3, 8, { setRest: 15 }), D.chal('c', 30)], viewport: { width: 320, height: 568 } });

/* --- הרצה --- */
const which = process.argv[2] === 'all' ? ['root', 'w', 'm'] : [process.argv[2] || 'root'];
/* node tools-train.mjs root "סטים" — רק תרחישים ששמם מכיל את זה */
const only = process.argv[3] || '';
browser = await pw.chromium.launch();
let bad = 0;
const t0 = Date.now();
for (const variant of which) {
  let n = 0;
  for (const sc of S) {
    if (only && !sc.name.includes(only)) continue;
    const drills = (sc.opt.drills || FOUR)();
    const { ctx, page, errors } = await open(variant, docOf(drills, sc.opt.more), sc.opt);
    let err = null;
    try { await sc.fn(page); } catch (e) { err = e; }
    if (!err && errors.length) err = new Error('שגיאות בדף: ' + errors.join(' | '));
    await ctx.close();
    n++;
    if (err) { bad++; console.log('✗ [' + variant + '] ' + sc.name + '\n    ' + String(err.message || err).slice(0, 1500)); }
  }
  console.log((bad ? '·' : '✓') + ' [' + variant + '] ' + n + ' תרחישים');
}
await browser.close();
server.close();
console.log(bad ? '✗ ' + bad + ' נכשלו' : '✓ האימון: כל התרחישים עברו (' + Math.round((Date.now() - t0) / 1000) + ' שנ׳)');
process.exit(bad ? 1 : 0);
