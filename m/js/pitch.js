/* ציור המגרש: שחקנים, כדור, חיצים, אזורים — והרצת התנועה.
   מודול עצמאי — לא יודע דבר על ניווט, התקדמות או חוברות,
   כדי שגם מסך העריכה, המבדק והתמונות המוקטנות יוכלו להשתמש בו. */

const NS = 'http://www.w3.org/2000/svg';

export const el = (n, a = {}) => {
  const e = document.createElementNS(NS, n);
  for (const k in a) e.setAttribute(k, a[k]);
  return e;
};

/* קיצור החץ בקצוות כדי שלא ייגע בעיגול השחקן. נשאר לעורך בלבד, לאזורי
   התפיסה של החצים — הציור עצמו חותך לאורך העקומה (ראה arrowD). */
export function trim(a, b, t1, t2) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  return [[a[0] + dx / l * t1, a[1] + dy / l * t1], [b[0] - dx / l * t2, b[1] - dy / l * t2]];
}

/* קשת בין שתי נקודות. bend הוא סקלר יחיד: חיובי לצד אחד, שלילי לשני */
export function arc(a, b, bend) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  return `M${a[0]} ${a[1]} Q${mx - dy / l * bend} ${my + dx / l * bend} ${b[0]} ${b[1]}`;
}

/* המרת נקודת מגע או עכבר לקואורדינטות המגרש, מוגבלת לתוך גבולות המגרש.
   משותפת לעורך ולמבדק. */
export function svgPoint(svg, e) {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  const clamp = (v, lo, hi) => Math.round(Math.max(lo, Math.min(hi, v)));
  return [clamp(p.x, 20, 380), clamp(p.y, 20, 600)];
}

/* ---------- שיקוף לצד השני ----------
   לילד שמאלי כל התרחישים צריכים להיות בצד ההפוך. מיישמים את זה על
   הנתונים ולא על הציור, כדי שגם המבדק יעבוד: התשובות מגיעות משוקפות
   יחד עם הלוח, בלי מתמטיקה כפולה. */

const WIDTH = 400;
const mirrorX = x => WIDTH - x;

/* אילו מספרים מתחלפים ביניהם: אלה שמיקום ברירת המחדל שלהם הוא בבואה
   של השני. נגזר מהמערך עצמו, כדי שלא יהיה צורך לקבע 2↔5 ו-7↔11 בקוד
   ולתחזק רשימה לכל מערך חדש. */
const flipCache = new WeakMap();
function flipMap(formation) {
  if (flipCache.has(formation)) return flipCache.get(formation);
  const { order, base } = formation;
  const map = {};
  order.forEach(n => {
    const want = [mirrorX(base[n][0]), base[n][1]];
    const twin = order.find(m => Math.hypot(base[m][0] - want[0], base[m][1] - want[1]) <= 8);
    map[n] = twin != null ? twin : n;
  });
  flipCache.set(formation, map);
  return map;
}

/** מי השחקן המודגש כשהמגרש משוקף. בתפקיד מרכזי זה אותו מספר, ובתפקיד
    אגף זה התפקיד המקביל בצד השני — מגן שמאלי הופך למגן ימני. */
export function mirrorRole(formation, role) {
  return flipMap(formation)[role] != null ? flipMap(formation)[role] : role;
}

/* מילות צד. כשהמגרש מתהפך גם הטקסט חייב להתהפך, אחרת כתוב "המגן
   השמאלי אחראי על הרצועה השמאלית" בזמן שהשחקן מצויר באגף ימין.
   הביטוי מסודר מהצורה הארוכה לקצרה כדי ש"שמאלה" לא ייחתך ל"שמאל",
   והמבט קדימה מונע התאמה בתוך מילה ארוכה יותר. תחיליות (ה, מ, ל, ב)
   נשארות במקומן: "מימין" הופך ל"משמאל". */
const SIDE_PAIRS = [
  ['שמאליות', 'ימניות'], ['שמאליים', 'ימניים'],
  ['שמאלית', 'ימנית'], ['שמאלי', 'ימני'],
  ['שמאלה', 'ימינה'], ['שמאל', 'ימין']
];
const SIDE_SWAP = {};
SIDE_PAIRS.forEach(([l, r]) => { SIDE_SWAP[l] = r; SIDE_SWAP[r] = l; });
const SIDE_RE = new RegExp(
  '(' + Object.keys(SIDE_SWAP).sort((a, b) => b.length - a.length).join('|') + ')(?![א-ת])',
  'g'
);

/** מחליף ימין ושמאל בטקסט. ערך שאינו מחרוזת חוזר כמו שהוא. */
export function mirrorText(t) {
  return typeof t === 'string' ? t.replace(SIDE_RE, m => SIDE_SWAP[m]) : t;
}

/** עותק משוקף של התרחיש — גיאומטריה וגם טקסט. אינו נוגע במקור. */
export function mirrorScenario(s, formation) {
  const flip = flipMap(formation);
  const m = { ...s, pos: {} };

  /* מספר שומר על הצד המקובל שלו (2 מימין, 5 משמאל), ומה שמתהפך הוא
     האסימטריה של התרחיש — הצד שבו מתרחשת הפעולה */
  formation.order.forEach(n => {
    const src = flip[n];
    const p = (s.pos && s.pos[src]) || formation.base[src];
    m.pos[n] = [mirrorX(p[0]), p[1]];
  });

  m.ball = [mirrorX(s.ball[0]), s.ball[1]];
  if (s.ghosts) m.ghosts = s.ghosts.map(g => [mirrorX(g[0]), g[1]]);
  if (s.opp) m.opp = s.opp.map(o => [mirrorX(o[0]), o[1]]);
  if (s.shadow) m.shadow = s.shadow.map(p => [mirrorX(p[0]), p[1]]);
  if (s.zones) m.zones = s.zones.map(z => ({ ...z, x: mirrorX(z.x + z.w) }));
  /* סימן ה-bend מתהפך: הניצב שמכופף את הקשת מתהפך יחד עם המגרש */
  if (s.arrows) m.arrows = s.arrows.map(a => ({
    ...a,
    a: [mirrorX(a.a[0]), a.a[1]],
    b: [mirrorX(a.b[0]), a.b[1]],
    bend: -(a.bend || 0)
  }));

  ['chip', 'title', 'sub', 'mistake', 'cue'].forEach(k => {
    if (s[k] != null) m[k] = mirrorText(s[k]);
  });
  if (s.does) m.does = s.does.map(d => mirrorText(d));
  if (s.quiz) m.quiz = {
    ...s.quiz,
    ask: mirrorText(s.quiz.ask),
    why: mirrorText(s.quiz.why),
    options: (s.quiz.options || []).map(o => mirrorText(o))
  };
  return m;
}

/* 8 יחידות ציור = מטר אחד. נבדק מול רחבת העונשין בשרטוט:
   208 על 91 יחידות, כלומר 26 על 11.4 מטר — מידות רחבה בתשיעיות. */
export const PER_METER = 8;

/* ---------- עקומה ----------
   כל חץ הוא עקומה ריבועית אחת (a, b, bend), וכל השאר נגזר ממנה: החץ
   המצויר, המסלול שהשחקן רץ עליו והשובל שנשאר אחריו. בגרסה הקודמת החץ
   נחתך בקו ישר ונבנה מחדש כקשת אחרת, והשחקן רץ על קשת שלישית — ולכן
   הוא זז ליד החץ ולא עליו, והסטייה גדלה ככל שהחץ מכופף. */

const SEG = 40;   /* דגימות לטבלת האורכים — מספיק לעקומה ריבועית אחת */

const qpt = (a, c, b, t) => {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
};

function curve(a, b, bend) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  const c = [mx - dy / l * (bend || 0), my + dx / l * (bend || 0)];
  const lens = [0];
  let prev = a, acc = 0;
  for (let i = 1; i <= SEG; i++) {
    const p = qpt(a, c, b, i / SEG);
    acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    lens.push(acc);
    prev = p;
  }
  return { a, c, b, len: acc, lens };
}

/** הפרמטר t שבו העקומה עברה אורך L. לקשת אין פתרון סגור, ולכן טבלה. */
function tAt(cv, L) {
  if (L <= 0) return 0;
  if (L >= cv.len) return 1;
  let lo = 0, hi = SEG;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (cv.lens[m] < L) lo = m; else hi = m;
  }
  const f = (L - cv.lens[lo]) / ((cv.lens[hi] - cv.lens[lo]) || 1);
  return (lo + f) / SEG;
}

const ptAt = (cv, L) => qpt(cv.a, cv.c, cv.b, tAt(cv, L));

/** כיוון התנועה באורך L — לכדור שלרגלי המוביל */
function dirAt(cv, L) {
  const t = tAt(cv, L), u = 1 - t;
  const x = 2 * u * (cv.c[0] - cv.a[0]) + 2 * t * (cv.b[0] - cv.c[0]);
  const y = 2 * u * (cv.c[1] - cv.a[1]) + 2 * t * (cv.b[1] - cv.c[1]);
  const l = Math.hypot(x, y);
  return l ? [x / l, y / l] : [0, -1];
}

const r1 = v => Math.round(v * 10) / 10;

/** קטע מהעקומה בין שני אורכים — עקומה ריבועית בפני עצמה (בלוסום),
    כך שהקטע יושב בדיוק על המקור ולא רק קרוב אליו */
function subD(cv, L0, L1) {
  const t0 = tAt(cv, L0), t1 = tAt(cv, L1);
  const p0 = qpt(cv.a, cv.c, cv.b, t0), p2 = qpt(cv.a, cv.c, cv.b, t1);
  const u0 = 1 - t0, u1 = 1 - t1;
  const k0 = u0 * u1, k1 = u0 * t1 + t0 * u1, k2 = t0 * t1;
  const p1 = [k0 * cv.a[0] + k1 * cv.c[0] + k2 * cv.b[0], k0 * cv.a[1] + k1 * cv.c[1] + k2 * cv.b[1]];
  return `M${r1(p0[0])} ${r1(p0[1])} Q${r1(p1[0])} ${r1(p1[1])} ${r1(p2[0])} ${r1(p2[1])}`;
}

/* כמה לקצר בכל קצה כדי שהחץ לא ייגע בעיגולים. בחץ קצר מהקיצור עצמו
   הגרסה הקודמת הפכה את הכיוון — ראש החץ הצביע אחורה. כאן הקיצור מתכווץ. */
function trims(len, k) {
  let t1 = k === 'pass' ? 15 : 16, t2 = 17;
  const room = Math.max(0, len - 8);
  if (t1 + t2 > room) { const f = room / (t1 + t2); t1 *= f; t2 *= f; }
  return [t1, t2];
}

function arrowD(cv, k) {
  const [t1, t2] = trims(cv.len, k);
  return subD(cv, t1, cv.len - t2);
}

/* ---------- שלד המגרש ---------- */

/* ראשי החצים בצבע של החץ — הצבעים עצמם ב-CSS (head-hp וכו'), כדי שיתחלפו
   עם ערכת הצבעים (בהירה/כהה) בלי לבנות את המגרש מחדש.
   hp זהב (אתה, ואפשרויות) · hb מסירה · hg יריב · hm שחקן שלנו */
const HEADS = ['hp', 'hb', 'hg', 'hm'];

let uidSeq = 0;

/** בונה את שלד המגרש: קווים, ראשי חיצים, מילויים וקבוצות ריקות.
    כל מגרש מקבל מזהה משלו כדי ששני מגרשים באותו דף לא יתנגשו. */
export function buildPitch() {
  const uid = 'p' + (++uidSeq);
  const svg = el('svg', {
    class: 'pitch', viewBox: '0 0 400 620',
    role: 'img', 'aria-label': 'דיאגרמת מגרש תשיעיות'
  });
  svg.dataset.uid = uid;

  const defs = el('defs');
  for (const name of HEADS) {
    const m = el('marker', {
      id: `${name}-${uid}`, viewBox: '0 0 10 10', refX: 6.4, refY: 5,
      markerWidth: 4.4, markerHeight: 4.4, orient: 'auto-start-reverse'
    });
    m.appendChild(el('path', { d: 'M0 .6 L9.6 5 L0 9.4 L2.4 5 z', class: 'head-' + name }));
    defs.appendChild(m);
  }

  /* מילוי האסימונים: אור מלמעלה-שמאל, כמו אסימון אמיתי על לוח. הצבעים
     בעצירות מגיעים מ-CSS, ולכן מתחלפים עם ערכת הצבעים. */
  [['gm', 'tg-m'], ['go', 'tg-o'], ['gh', 'tg-h']].forEach(([id, cls]) => {
    const g = el('radialGradient', { id: `${id}-${uid}`, cx: '.36', cy: '.3', r: '.8' });
    g.appendChild(el('stop', { offset: '0', class: cls + '1' }));
    g.appendChild(el('stop', { offset: '1', class: cls + '2' }));
    defs.appendChild(g);
  });
  const light = el('radialGradient', { id: `gl-${uid}`, cx: '200', cy: '290', r: '400', gradientUnits: 'userSpaceOnUse' });
  light.appendChild(el('stop', { offset: '0', class: 'fl1' }));
  light.appendChild(el('stop', { offset: '1', class: 'fl2' }));
  defs.appendChild(light);
  const sh = el('filter', { id: `sh-${uid}`, x: '-50%', y: '-50%', width: '200%', height: '200%' });
  sh.appendChild(el('feDropShadow', { dx: 0, dy: 1.3, stdDeviation: 1.2, 'flood-color': '#060B14', 'flood-opacity': '.36' }));
  defs.appendChild(sh);
  const net = el('pattern', { id: `net-${uid}`, width: 4, height: 4, patternUnits: 'userSpaceOnUse' });
  net.appendChild(el('path', { d: 'M0 0H4M0 0V4', class: 'netl' }));
  defs.appendChild(net);
  svg.appendChild(defs);

  /* השוליים כהים מהדשא: המגרש נראה כמשטח, לא כצבע רקע */
  svg.appendChild(el('rect', { x: 0, y: 0, width: 400, height: 620, class: 'edge' }));
  svg.appendChild(el('rect', { x: 20, y: 20, width: 360, height: 580, class: 'field' }));
  /* פסי דשא כמו בגבעתיים: שמונה רצועות לסירוגין. הצבעים ב-CSS. */
  for (let i = 1; i < 8; i += 2) svg.appendChild(el('rect', { x: 20, y: 20 + i * 72.5, width: 360, height: 72.5, class: 'stripe' }));
  svg.appendChild(el('rect', { x: 20, y: 20, width: 360, height: 580, class: 'flight', fill: `url(#gl-${uid})` }));
  svg.appendChild(el('g', { class: 'g-zones' }));

  const lines = el('g', { class: 'pl' });
  const dot = (cx, cy) => el('circle', { cx, cy, r: 2.4, class: 'pdot' });
  lines.appendChild(el('rect', { x: 20, y: 20, width: 360, height: 580 }));
  lines.appendChild(el('line', { x1: 20, y1: 310, x2: 380, y2: 310 }));
  lines.appendChild(el('circle', { cx: 200, cy: 310, r: 52 }));
  lines.appendChild(dot(200, 310));
  lines.appendChild(el('rect', { x: 96, y: 509, width: 208, height: 91 }));
  lines.appendChild(el('rect', { x: 150, y: 562, width: 100, height: 38 }));
  lines.appendChild(dot(200, 525));
  lines.appendChild(el('rect', { x: 96, y: 20, width: 208, height: 91 }));
  lines.appendChild(el('rect', { x: 150, y: 20, width: 100, height: 38 }));
  lines.appendChild(dot(200, 95));
  /* קשת הרחבה: מעגל ברדיוס של מעגל האמצע סביב נקודת הפנדל, רק מה שמחוץ לרחבה */
  lines.appendChild(el('path', { d: 'M150.5 509 A52 52 0 0 1 249.5 509' }));
  lines.appendChild(el('path', { d: 'M150.5 111 A52 52 0 0 0 249.5 111' }));
  lines.appendChild(el('path', { d: 'M20 27 A7 7 0 0 0 27 20 M373 20 A7 7 0 0 0 380 27 M380 593 A7 7 0 0 0 373 600 M27 600 A7 7 0 0 0 20 593' }));
  svg.appendChild(lines);
  /* השערים מאחורי קו השער, עם רשת */
  svg.appendChild(el('rect', { x: 170, y: 600, width: 60, height: 8, rx: 1.5, class: 'goal', fill: `url(#net-${uid})` }));
  svg.appendChild(el('rect', { x: 170, y: 12, width: 60, height: 8, rx: 1.5, class: 'goal', fill: `url(#net-${uid})` }));

  ['g-ghosts', 'g-arrows', 'g-fx', 'g-opp', 'g-team', 'g-ball'].forEach(c => svg.appendChild(el('g', { class: c })));
  return svg;
}

/* ---------- מי עושה מה ----------
   מרחקי זיהוי. AT — שחקן עומד בנקודה. SAME — שני חצים מתכוונים לאותה
   נקודה, וזה סובלני יותר כי כל אחד מהם צויר בנפרד. BALL — הכדור לרגליו.
   SEQ — חץ אפשרות שממשיך את המהלך מהמקום שבו הכדור נמצא עכשיו.
   PRESS — לוחץ שמגיע אל מחזיק הכדור. RECV — מי מקבל מסירה, לכיתוב. */
const R_AT = 24, R_SAME = 32, R_BALL = 20, R_SEQ = 40, R_PRESS = 40, R_RECV = 36;

/* זמנים, באלפיות. TOUCH — נגיעה ראשונה לפני שהכדור ממשיך. RELEASE — מי
   שמסר ויוצא לריצה, יוצא מיד אחרי שהכדור עזב. */
const TOUCH = 260, RELEASE = 120, AFTER_CARRY = 140;

/* מהירויות ביחידות לאלפית. 0.06 הם כשבעה וחצי מטר לשנייה — ספרינט של
   ילד, במהירות אמיתית ולא מואצת. הגרסה הקודמת הריצה הכול בפחות מחצי
   שנייה, וזה מהיר מכדי שעין תעקוב. הגבולות שומרים על צעד קצר מלהבהב
   ועל ריצה ארוכה מלהימרח. */
const SPEED = { run: 0.06, carry: 0.056, pass: 0.15, shot: 0.22 };
const MIN = { run: 650, carry: 700, pass: 420, shot: 380 };
const MAX = { run: 3400, carry: 2700, pass: 1500, shot: 900 };
const MIN_TOTAL = 900;

/* מרחק מינימלי בין מרכזי אסימונים בסוף תנועה. לוחץ שרץ אל שחקן עוצר
   צמוד אליו ולא עליו — חץ הלחץ מסתיים בדיוק במקום שבו הנלחץ עומד.
   בין שתי קבוצות מותר מגע (לחץ, תיקול), בין שחקנים שלנו לא. */
const GAP_US = 25, GAP_THEM = 17;

/* הכדור לרגלי המוביל, לא מתחת למספר שלו */
const FEET = 9;

const closeTo = (a, b, r) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= r;
const span = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const durOf = (kind, len) => clamp(len / SPEED[kind], MIN[kind], MAX[kind]);

/* ריצה: יוצא לאט, מגיע לאט. מסירה: הכדור נבעט מהר ומאט — כמו כדור אמיתי. */
const easeRun = k => k * k * (3 - 2 * k);
/* הובלה שממשיכה בכיוון אחר (עקיפה ואז חיתוך פנימה) לא עוצרת באמצע:
   הראשונה מאיצה בלי להאט, השנייה ממשיכה באותה מהירות ומאטה בסוף */
const easeIn = k => k * k;
const easeOut = k => 1 - (1 - k) * (1 - k);
const moveK = (a, u) => (a.type === 'pass' ? easeBall(u)
  : a.ease === 'in' ? easeIn(u) : a.ease === 'out' ? easeOut(u) : easeRun(u));
const easeBall = k => 1 - (1 - k) * (1 - k);

/** האם הנקודה יושבת על הקטע בין שני קצוות החץ — לא עליהם, אלא בדרך */
function onSegment(p, a, b, r) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (!len2) return false;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  if (t <= 0.15 || t >= 0.85) return false;   /* הקצוות נבדקו כבר */
  return closeTo(p, [a[0] + dx * t, a[1] + dy * t], r);
}

/** לוע השער של היריב — חץ שנגמר כאן הוא בעיטה, לא מסירה */
const atGoal = p => p[1] < 62 && Math.abs(p[0] - 200) < 62;

/** האותיות של האפשרויות החלופיות בתרחיש (A, B, C). חץ מסומן הוא "או זה
    או זה" — אסור להריץ את שניהם יחד, כי השחקן לא יכול לעשות את שניהם. */
export function variantsOf(s) {
  const set = new Set();
  (s.arrows || []).forEach(a => { if (a.label) set.add(a.label); });
  return [...set].sort();
}

/* ---------- מי מצויר איפה, ומה זז מתי ----------
   טהור — בלי DOM — כדי שאפשר יהיה לבדוק אותו ב-node (tools-test.mjs).
   המגרש, העורך והמבדק משתמשים בו דרך createPitch. */

/* ---------- מי מצויר איפה ----------
   משותף לציור הסטטי ולהרצה: שניהם צריכים לדעת מי רץ על כל חץ —
   הציור כדי לצבוע את החץ בצבע של מי שרץ, וההרצה כדי להזיז אותו. */
function castOf(s, formation) {
  const { order, base } = formation;
  const posOf = n => (s.pos && s.pos[n]) || base[n];
  const opps = s.opp || [];
  const ghosts = s.ghosts || [];

  const mateNear = (p, r) => {
    let best = null, bd = r;
    order.forEach(n => { const d = span(posOf(n), p); if (d <= bd) { bd = d; best = n; } });
    return best;
  };
  const oppNear = (p, r) => {
    let best = -1, bd = r;
    opps.forEach((o, i) => { const d = span(o, p); if (d <= bd) { bd = d; best = i; } });
    return best;
  };

  /* חץ שנקודת התחלה מסומנת בשני קצותיו אינו תנועה אלא טווח: כך מצוירת
     מפת התפקיד, "בין כאן לכאן אתה חי". אין מה להריץ לאורכו. */
  const isRange = ar => ghosts.some(g => closeTo(g, ar.a, R_AT))
                     && ghosts.some(g => closeTo(g, ar.b, R_AT));

  /** מי זז על החץ. ריצה: קודם מי שמצויר בסופו (הרגע שאחרי), אחר כך
      בתחילתו (הרגע שלפני), ואז מי שמצויר באמצע הדרך.
      press: ה-README מגדיר אותו כתנועת יריב, אבל בתוכן הוא משמש גם
      לריצת לחץ של שחקן שלנו. מי שמצויר בתחילת החץ הוא מי שזז, ולא מי
      שבסופו — אחרת יריב שעומד ביעד היה נשאב אחורה אל נקודת ההתחלה. */
  const actor = ar => {
    if (ar.k === 'run') {
      if (isRange(ar)) return null;
      let n = mateNear(ar.b, R_AT);
      if (n == null) n = mateNear(ar.a, R_AT);
      if (n == null) n = order.find(m => onSegment(posOf(m), ar.a, ar.b, R_AT));
      return n != null ? { num: n } : null;
    }
    if (ar.k === 'press') {
      let i = oppNear(ar.a, R_AT);
      if (i >= 0) return { opp: i };
      const n = mateNear(ar.a, R_AT);
      if (n != null) return { num: n };
      i = oppNear(ar.b, R_AT);
      if (i >= 0) return { opp: i };
      i = opps.findIndex(o => onSegment(o, ar.a, ar.b, R_AT));
      return i >= 0 ? { opp: i } : null;
    }
    return null;
  };

  /* מי מחזיק בכדור בציור. יריב שעומד על הכדור גובר כשהוא קרוב יותר */
  const holderAt = p => {
    const n = mateNear(p, R_BALL), i = oppNear(p, R_BALL);
    if (n != null && (i < 0 || span(posOf(n), p) <= span(opps[i], p))) return { num: n };
    return i >= 0 ? { opp: i } : null;
  };

  return { posOf, opps, ghosts, mateNear, oppNear, isRange, actor, holder0: holderAt(s.ball) };
}

/** כדור שמצויר בדיוק על מרכז שחקן מוסתר מאחורי המספר שלו — וזה בדיוק
    השחקן שהילד צריך לזהות. מזיזים אותו לרגליים, לכיוון שאליו הקבוצה
    של המחזיק תוקפת. */
function restBall(s, C, order) {
  const b = s.ball;
  let best = null, bd = 8;
  order.forEach(n => { const d = span(C.posOf(n), b); if (d < bd) { bd = d; best = { p: C.posOf(n), dy: -1 }; } });
  (s.opp || []).forEach(o => { const d = span(o, b); if (d < bd) { bd = d; best = { p: o, dy: 1 }; } });
  return best ? [best.p[0], best.p[1] + best.dy * 12] : b;
}

const sameWho = (a, b) => !!a && !!b && (a.num != null ? a.num === b.num : a.opp === b.opp);
const keyOf = w => (w.num != null ? 'n' + w.num : 'o' + w.opp);

/* ---------- הרצת התרחיש ----------
   ילד בן 11 קורא תנועה טוב בהרבה משהוא קורא חץ מכופף — חץ הוא ייצוג
   מופשט שצריך ללמוד לקרוא. הנתונים כבר מחזיקים מסלול מלא (a, b, bend),
   ולכן אין כאן תוכן חדש: רק הזזת האסימונים לאורך מה שכבר משורטט.

   ההרצה היא פונקציה של הזמן בלבד: seek(t) מצייר את הרגע t מאפס, בלי
   מצב שמצטבר בין פריימים. כך גרירה בפס הזמן, השהיה, האטה וחזרה לשלב
   הם אותה פעולה, ואין סחיפה בין הכדור לשחקן. */

/**
 * מה זז בתרחיש, ומתי.
 *
 * הקושי אינו בציור אלא בתזמון: שרטוט אחד מחזיק כמה אירועים שקרו זה
 * אחר זה, והחיצים אינם אומרים מי קדם למי. הסדר נגזר כאן מהגיאומטריה —
 * מסירה מתחילה מהמקום שאליו הגיעה הקודמת, ריצה שמסתיימת בנקודת מסירה
 * חייבת להסתיים לפניה, וריצה שמסתיימת ביעד של מסירה מתוזמנת להגיע
 * יחד עם הכדור ולא לפניו או אחריו.
 *
 * @param {object} s תרחיש (משוקף כבר, אם צריך)
 * @param {string} [variant] האות של האפשרות החלופית להריץ
 */
export function choreograph(s, formation, hero, variant) {
  const { order, base } = formation;
  const C = castOf(s, formation);
  const { posOf, opps, ghosts } = C;
  const labels = variantsOf(s);
  const v = labels.length ? (labels.includes(variant) ? variant : labels[0]) : null;
  const all = (s.arrows || []).map((ar, i) => ({ ar, i }));
  const live = all.filter(x => !x.ar.label || x.ar.label === v);
  const other = all.filter(x => x.ar.label && x.ar.label !== v).map(x => x.i);

  const homeOf = w => (w.num != null ? posOf(w.num) : opps[w.opp]);
  const team = w => (w.opp != null ? 'opp' : w.num === hero ? 'hero' : 'mate');

  /* --- מי זז --- */
  const movers = [];
  live.forEach(({ ar, i }) => {
    const w = C.actor(ar);
    if (w) movers.push({ kind: ar.k, who: w, ar, i });
  });

  const passes = live.filter(x => x.ar.k === 'pass').map(({ ar, i }) => ({ type: 'pass', ar, i }));
  const opts = live.filter(x => x.ar.k === 'opt');

  /* --- שרשרת המסירות ---
     כל מסירה מתחילה מהמקום שאליו הגיעה הקודמת. בלי זה שתי מסירות
     באותו תרחיש רצות יחד ושתיהן מזיזות את אותו כדור — וזה נראה כאילו
     הכדור קופץ. הראש הוא מסירה שאף מסירה אחרת לא מגיעה אל תחילתה. */
  const R_LINK = 36;
  const nextOf = new Map(), hasPrev = new Set();
  passes.forEach(p => {
    const n = passes.find(o => o !== p && !hasPrev.has(o) && closeTo(o.ar.a, p.ar.b, R_LINK));
    if (n) { nextOf.set(p, n); hasPrev.add(n); }
  });
  const ordered = [];
  const heads = passes.filter(p => !hasPrev.has(p))
    .sort((x, y) => span(x.ar.a, s.ball) - span(y.ar.a, s.ball));
  heads.forEach(h => { for (let p = h; p && !ordered.includes(p); p = nextOf.get(p)) ordered.push(p); });
  passes.forEach(p => { if (!ordered.includes(p)) ordered.push(p); });

  /* --- מי מוביל את הכדור ---
     הכדור עוזב נקודה אם מסירה או אפשרות יוצאת ממנה. מי שרץ מנקודה כזאת
     מסר ויצא — הוא לא לוקח איתו את הכדור (הקיר, ההנחה אחורה). */
  const departs = p => passes.some(o => closeTo(o.ar.a, p, R_SAME)) || opts.some(o => closeTo(o.ar.a, p, R_SAME));
  const delivered = p => passes.some(o => closeTo(o.ar.b, p, R_SAME));
  movers.forEach(m => {
    if (m.kind !== 'run' && m.kind !== 'press') return;
    /* קיבל בנקודה שממנה הוא יוצא, וממשיך איתו */
    if (m.who.num != null) {
      const recv = passes.find(p => closeTo(p.ar.b, m.ar.a, R_SAME));
      if (recv && !departs(m.ar.a)) { m.carry = 'after'; m.recv = recv; return; }
    }
    /* הכדור לרגליו בציור ואף אחד לא מסר לו אותו: הוא מוביל מתחילת הריצה.
       זה נכון גם ליריב שמוביל — חץ press שיוצא ממחזיק הכדור. */
    if (sameWho(C.holder0, m.who) && !delivered(s.ball) && !departs(m.ar.a)) m.carry = 'start';
  });

  const chain = [];
  const headCarry = movers.find(m => m.carry === 'start');
  if (headCarry) chain.push({ type: 'carry', m: headCarry });
  ordered.forEach(p => {
    chain.push(p);
    movers.filter(m => m.carry === 'after' && m.recv === p).forEach(m => chain.push({ type: 'carry', m }));
  });

  /* מי נוגע בכדור בשלב כלשהו: המחזיק בציור, וכל מי שמקבל מסירה */
  const touches = n => (C.holder0 && C.holder0.num === n)
    || passes.some(p => closeTo(p.ar.b, posOf(n), R_SAME));

  /* --- חיצי אפשרות ---
     אפשרות שיוצאת מהמקום שבו הכדור נמצא בסוף השרשרת היא ההמשך של
     המהלך — המסירה החוזרת בקיר, ההנחה אחורה, הבעיטה. היא רצה אחרונה.
     אפשרות של שחקן בלי כדור היא ריצה שלו. אפשרות שיוצאת ממי שכבר מסר
     היא חלופה למסירה שכבר קרתה, ולכן נשארת מצוירת ולא רצה. */
  const statics = [];
  const ballEnd = () => {
    const last = chain[chain.length - 1];
    if (!last) return { p: s.ball, who: C.holder0, carried: false };
    if (last.type === 'pass') {
      const n = C.mateNear(last.ar.b, R_SAME + 8);
      /* מי שרץ לקבל עומד בסוף הריצה שלו, לא במקום שבו הוא מצויר */
      const runner = movers.find(m => !m.carry && m.who.num != null && closeTo(m.ar.b, last.ar.b, R_SAME));
      return { p: last.ar.b, who: runner ? runner.who : (n != null ? { num: n } : null), carried: false };
    }
    return { p: last.m.ar.b, who: last.m.who, carried: true, m: last.m };
  };
  opts.forEach(({ ar, i }) => {
    const end = ballEnd();
    if (end.who && end.who.num != null && closeTo(ar.a, end.p, R_SEQ)) {
      const toMate = C.mateNear(ar.b, R_SAME) != null
        || movers.some(m => !m.carry && m.who.num != null && closeTo(m.ar.b, ar.b, R_SAME));
      const shot = atGoal(ar.b);
      if (end.carried && !toMate && !shot) {
        /* ממשיך להוביל — העקיפה פנימה אחרי שעבר את המגן */
        const m = { kind: 'opt', who: end.m.who, ar, i, carry: 'cont', prev: end.m };
        movers.push(m);
        chain.push({ type: 'carry', m });
      } else {
        chain.push({ type: 'pass', ar, i, opt: true, shot });
      }
      return;
    }
    const n = C.mateNear(ar.a, R_AT);
    if (n != null && !touches(n)) { movers.push({ kind: 'opt', who: { num: n }, ar, i }); return; }
    statics.push(i);
  });
  all.forEach(({ ar, i }) => {
    if ((ar.k === 'run' || ar.k === 'press') && live.some(x => x.i === i) && !movers.some(m => m.i === i)) statics.push(i);
  });

  /* --- גיאומטריה ---
     מתחילים מנקודת ההתחלה המצוירת (העיגול המקווקו) ומסיימים במקום שבו
     השחקן מצויר, כשהוא מצויר בסוף החץ. כך הרגע האחרון של ההרצה הוא
     בדיוק הציור, בלי קפיצה. מי שמצויר באמצע החץ רץ עד סופו: שארית החץ
     היא לאן שהוא ממשיך, וזה בדיוק מה שהילד צריך לראות. */
  const ghostNear = p => ghosts.find(g => closeTo(g, p, R_AT));
  movers.forEach(m => {
    const home = homeOf(m.who);
    if (m.prev) m.from = m.prev.to;
    else m.from = ghostNear(m.ar.a) || (closeTo(home, m.ar.a, R_AT) ? home : m.ar.a);
    m.to = closeTo(home, m.ar.b, R_AT) && !closeTo(home, m.ar.a, R_AT) ? home : m.ar.b;
    m.cv = curve(m.from, m.to, m.ar.bend || 0);
    m.L = m.cv.len;
    m.team = team(m.who);
  });

  /* עצירה לפני התנגשות: מי שרץ אל שחקן אחר עוצר צמוד אליו */
  const lastOf = new Map();
  movers.forEach(m => lastOf.set(keyOf(m.who), m));
  const finals = [];
  order.forEach(n => { const m = lastOf.get('n' + n); finals.push({ key: 'n' + n, p: m ? m.to : posOf(n), opp: false }); });
  opps.forEach((o, i) => { const m = lastOf.get('o' + i); finals.push({ key: 'o' + i, p: m ? m.to : o, opp: true }); });
  movers.forEach(m => {
    if (lastOf.get(keyOf(m.who)) !== m) return;
    const me = keyOf(m.who), mineOpp = m.who.opp != null;
    let L = m.cv.len;
    finals.forEach(f => {
      if (f.key === me) return;
      const gap = Math.min(f.opp !== mineOpp ? GAP_THEM : GAP_US, span(m.from, f.p) * 0.8);
      while (L > 0 && span(ptAt(m.cv, L), f.p) < gap) L -= 1.5;
    });
    m.L = Math.max(0, L);
  });
  movers.forEach(m => {
    m.end = ptAt(m.cv, m.L);
    m.dur = durOf(m.carry ? 'carry' : 'run', m.L);
  });
  /* תנועה של אפס (התנגשות כבר בהתחלה) אינה תנועה */
  for (let k = movers.length - 1; k >= 0; k--) {
    const m = movers[k];
    if (m.L < 2 && !m.carry) { statics.push(m.i); movers.splice(k, 1); }
  }

  /* --- הכדור לאורך השרשרת --- */
  const feet = (p, d) => [p[0] + d[0] * FEET, p[1] + d[1] * FEET];
  let ball0 = restBall(s, C, order);
  if (chain.length) {
    const c0 = chain[0];
    if (c0.type === 'carry') ball0 = feet(c0.m.from, dirAt(c0.m.cv, 0));
    else {
      /* חץ שיוצא ממרכז המוסר — הכדור יוצא מהרגליים שלו, לא מתוך המספר.
         המוסר נמדד במקום שבו הוא עומד ברגע ההתחלה, לא במקום המצויר. */
      ball0 = c0.ar.a;
      const startOf = n => { const m = movers.find(x => x.who.num === n && !x.prev); return m ? m.from : posOf(n); };
      let by = null, bd = 10;
      order.forEach(n => { const d = span(startOf(n), c0.ar.a); if (d < bd) { bd = d; by = n; } });
      if (by != null) ball0 = feet(startOf(by), dirAt(curve(c0.ar.a, c0.ar.b, c0.ar.bend || 0), 0));
    }
  }
  let cursor = ball0;
  chain.forEach(c => {
    if (c.type === 'carry') {
      c.from = cursor;
      cursor = feet(c.m.end, dirAt(c.m.cv, c.m.L));
      c.to = cursor;
      return;
    }
    c.from = cursor;
    c.cv = curve(cursor, c.ar.b, c.ar.bend || 0);
    c.L = c.cv.len;
    c.dur = durOf(c.shot ? 'shot' : 'pass', c.L);
    c.to = c.ar.b;
    cursor = c.ar.b;
  });

  /* --- תזמון ---
     הכדור מכתיב את הסדר. כל מהלך של הכדור מתחיל אחרי הקודם ונגיעה
     ראשונה. מסירה מחכה למוסר שעוד רץ אליה, וליריב שלוחץ על המוסר —
     המסירה היא התשובה ללחץ. ריצה אל המסירה מסתיימת יחד איתה. */
  const ofChain = new Set(chain.filter(c => c.type === 'carry').map(c => c.m));
  const free = movers.filter(m => !ofChain.has(m));
  const lb = m => {
    /* מסר ויצא לריצה — יוצא ברגע שהכדור עזב */
    const rel = chain.find(c => c.type === 'pass' && c.start != null && closeTo(c.from, m.from, R_AT + 8));
    return rel ? rel.start + RELEASE : 0;
  };
  let ready = 0;
  chain.forEach((c, k) => {
    if (c.type === 'carry') {
      const pm = c.m.prev;
      if (pm) { pm.ease = 'in'; c.m.ease = 'out'; }
      c.start = c.m.start = k === 0 ? 0 : pm ? pm.start + pm.dur : ready;
      c.dur = c.m.dur;
      ready = c.start + c.dur + AFTER_CARRY;
      return;
    }
    let start = ready;
    const arrive = free.find(m => m.who.num != null && m.start == null && closeTo(m.end, c.from, R_SAME));
    if (arrive) { arrive.start = lb(arrive); start = Math.max(start, arrive.start + arrive.dur + 120); }
    /* הלוחץ מכוון אל המוסר — נמדד מול השחקן ולא מול הכדור, שיושב
       ברגליים שלו בצד שאליו הוא עומד למסור */
    const passer = C.mateNear(c.from, R_SAME);
    const press = free.find(m => m.who.opp != null && !m.carry
      && (closeTo(m.end, c.from, R_PRESS) || (passer != null && closeTo(m.end, posOf(passer), R_PRESS + 8))));
    if (press) { if (press.start == null) press.start = 0; start = Math.max(start, press.start + press.dur * 0.6); }
    const recv = free.find(m => m.who.num != null && m.start == null && m !== arrive && closeTo(m.end, c.to, R_SAME));
    if (recv) {
      const end = Math.max(start + c.dur, lb(recv) + recv.dur);
      c.start = end - c.dur;
      recv.start = end - recv.dur;
      recv.sync = c;
    } else c.start = start;
    ready = c.start + c.dur + TOUCH;
  });
  free.forEach(m => { if (m.start == null) m.start = lb(m); });

  const acts = movers.concat(chain.filter(c => c.type === 'pass'));
  let total = acts.length ? Math.max(...acts.map(a => a.start + a.dur)) : 0;
  /* הרצה שכולה מסירה קצרה אחת נגמרת לפני שהעין מצאה את הכדור. מותחים
     אותה כולה, באותו יחס, כדי שהסדר והתזמון בתוכה יישארו כמו שהם */
  if (total && total < MIN_TOTAL) {
    const f = MIN_TOTAL / total;
    movers.concat(chain).forEach(a => { a.start *= f; a.dur *= f; });
    total = MIN_TOTAL;
  }

  /* --- מסלולים לפי שחקן --- */
  const tracks = new Map();
  movers.forEach(m => {
    const k = keyOf(m.who);
    if (!tracks.has(k)) tracks.set(k, { key: k, who: m.who, acts: [] });
    tracks.get(k).acts.push(m);
  });
  tracks.forEach(t => t.acts.sort((a, b) => a.start - b.start));

  const plan = {
    variant: v, variants: labels, total, ball0, chain, movers, tracks, acts,
    statics: [...new Set(statics)], other
  };
  plan.steps = stepsOf(plan, s, formation, hero);
  return plan;
}

/* ---------- כיתוב לכל שלב ----------
   שורה אחת שאומרת מה קורה עכשיו, בשפה של ילד: "ה-8 מוסר ל-9 ורץ
   קדימה". נגזרת מאותם חיצים, ולכן אין כאן טקסט שצריך לתחזק. */
function stepsOf(P, s, formation, hero) {
  const { order, base } = formation;
  const C0 = castOf(s, formation);
  const posAt = (w, t) => {
    const tr = P.tracks.get(keyOf(w));
    return tr ? trackPos(tr, t) : (w.num != null ? ((s.pos && s.pos[w.num]) || base[w.num]) : (s.opp || [])[w.opp]);
  };
  const name = w => (w.opp != null ? 'היריב' : w.num === 1 ? 'השוער' : 'ה-' + w.num);
  const mateAt = (p, t, r) => {
    let best = null, bd = r;
    order.forEach(n => { const d = span(posAt({ num: n }, t), p); if (d <= bd) { bd = d; best = n; } });
    return best;
  };
  const dir = (a, b, them) => {
    const dx = b[0] - a[0], dy = (b[1] - a[1]) * (them ? -1 : 1);
    if (Math.abs(dy) >= Math.abs(dx) * 0.8) return dy < 0 ? 'fwd' : 'back';
    return 'side';
  };
  const given = [];   /* [מוסר, מקבל] — כדי לזהות מסירה חוזרת */

  const parts = [];
  P.chain.forEach(c => {
    if (c.type !== 'pass') return;
    const from = mateAt(c.from, c.start, 30);
    const to = mateAt(c.to, c.start + c.dur, R_RECV);
    const subj = from != null ? name({ num: from }) : 'הכדור';
    let verb;
    if (c.shot) verb = 'בועט לשער';
    else if (to != null && to !== from) {
      const back = given.some(([a, b]) => a === to && b === from);
      verb = (back ? 'מחזיר ל' : 'מוסר ל') + (to === 1 ? 'שוער' : '-' + to);
      given.push([from, to]);
    } else if (c.from[1] > 470 && c.from[0] > 90 && c.from[0] < 310 && c.L > 100) verb = 'מרחיק';
    else verb = c.to[1] < c.from[1] - c.L * 0.5 ? 'מוסר קדימה' : 'מוסר לחלל';
    parts.push({ t: c.start, subj, verb, hero: from === hero });
  });
  P.movers.forEach(m => {
    const them = m.who.opp != null;
    const d = dir(m.from, m.end, them);
    let verb;
    const inward = Math.abs(m.end[0] - 200) < Math.abs(m.from[0] - 200) - 20;
    if (m.carry) verb = them ? 'מוביל' : d === 'side' && inward ? 'חותך פנימה'
      : { fwd: 'מוביל קדימה', back: 'מוביל אחורה', side: 'מוביל לרוחב' }[d];
    else if (m.sync) verb = 'רץ לקבל';
    else if (them) {
      /* "לוחץ" רק כשהוא מגיע אל מי שמחזיק אצלנו בכדור. אחרת הוא רץ —
         לעומק, אל השער שלנו, או סתם לחלל */
      const h = C0.holder0;
      verb = h && h.num != null && closeTo(m.end, posAt(h, m.start + m.dur), R_PRESS) ? 'לוחץ'
        : d === 'fwd' ? 'רץ לעומק' : 'רץ';
    }
    /* רץ אל יריב שעומד עם הכדור — זה לחץ, גם כשהחץ צויר כריצה */
    else if (m.kind === 'press' || (C0.holder0 && C0.holder0.opp != null && !P.tracks.has('o' + C0.holder0.opp)
      && closeTo(m.end, (s.opp || [])[C0.holder0.opp], R_PRESS))) verb = 'לוחץ';
    else verb = { fwd: 'רץ קדימה', back: 'חוזר אחורה', side: 'זז לרוחב' }[d];
    parts.push({ t: m.start, subj: name(m.who), verb, hero: m.who.num === hero });
  });
  parts.sort((a, b) => a.t - b.t || (b.hero - a.hero));

  /* פעולות שמתחילות כמעט יחד הן שלב אחד */
  const steps = [];
  parts.forEach(p => {
    const last = steps[steps.length - 1];
    if (last && p.t - last.t0 < 260) last.parts.push(p);
    else steps.push({ t0: p.t, parts: [p] });
  });
  steps.forEach(st => {
    const out = [];
    st.parts.forEach(p => {
      const prev = out[out.length - 1];
      if (prev && prev.subj === p.subj) prev.verbs.push(p.verb);
      else out.push({ subj: p.subj, verbs: [p.verb] });
    });
    st.text = out.map(o => o.subj + ' ' + o.verbs.join(' ו')).join(' · ');
    delete st.parts;
  });
  return steps;
}

/** איפה השחקן ברגע t, לפי רשימת התנועות שלו */
function trackPos(tr, t) {
  let cur = null;
  for (const a of tr.acts) if (t >= a.start) cur = a;
  if (!cur) return tr.acts[0].from;
  if (t >= cur.start + cur.dur) return cur.end;
  return ptAt(cur.cv, moveK(cur, (t - cur.start) / cur.dur) * cur.L);
}

/**
 * @param {SVGElement} svg  מגרש שנבנה ב-buildPitch
 * @param {{order:number[], base:Object}} formation  מיקומי ברירת מחדל לפי מספר חולצה
 * @param {number} role  מספר החולצה המודגש בזהב — נקבע לפי החוברת, לא קשיח בקוד
 */
export function createPitch(svg, formation, role) {
  const uid = svg.dataset.uid;
  const q = c => svg.querySelector('.' + c);
  const gTeam = q('g-team'), gOpp = q('g-opp'), gArr = q('g-arrows'),
        gZone = q('g-zones'), gGhost = q('g-ghosts'), gBall = q('g-ball'), gFx = q('g-fx');

  const { order, base } = formation;
  const toks = {};
  const at = {};          /* המיקום הנוכחי של כל אסימון — להתחלה חלקה של הרצה */
  gTeam.textContent = '';
  order.forEach(n => {
    const g = el('g', { class: 'tok mate', filter: `url(#sh-${uid})` });
    g.dataset.num = n;   /* לתפיסה בגרירה בעורך */
    g.appendChild(el('circle', { r: 12.5, class: 'tc', fill: `url(#gm-${uid})` }));
    const t = el('text', { class: 'tn' });
    t.textContent = n;
    g.appendChild(t);
    gTeam.appendChild(g);
    toks[n] = g;
  });

  /* הכדור: כדור אמיתי עם צל ומחומש שמסתובב בתנועה. בגודל 4.6 של הגרסה
     הקודמת הוא היה נקודה, וקשה היה לעקוב אחריו בזמן מסירה. */
  gBall.textContent = '';
  const ballG = el('g', { class: 'ballg' });
  ballG.appendChild(el('ellipse', { cx: 1.2, cy: 2.2, rx: 5.4, ry: 3.6, class: 'ball-sh' }));
  ballG.appendChild(el('circle', { r: 5.5, class: 'ball' }));
  const spin = el('g', { class: 'ball-spin' });
  spin.appendChild(el('path', { d: 'M0 -2.3 L2.2 -.7 L1.35 1.9 L-1.35 1.9 L-2.2 -.7 Z', class: 'ball-pat' }));
  ballG.appendChild(spin);
  gBall.appendChild(ballG);

  const place = (node, p) => node.setAttribute('transform', `translate(${r1(p[0])},${r1(p[1])})`);
  const setTok = (n, p) => { place(toks[n], p); at['n' + n] = p; };
  const setBall = (p, rot) => {
    place(ballG, p); at.ball = p;
    spin.setAttribute('transform', `rotate(${Math.round(rot || 0)})`);
  };
  let oppEls = [];
  const setOpp = (i, p) => { if (oppEls[i]) place(oppEls[i], p); at['o' + i] = p; };

  /* בשיקוף של תפקיד אגף המספר המודגש מתחלף, ולכן ההדגשה ניתנת לשינוי
     אחרי הבנייה ולא רק בזמנה */
  let hero = role;
  function setRole(n) {
    hero = n;
    order.forEach(m => {
      const me = m === hero;
      toks[m].setAttribute('class', 'tok ' + (me ? 'eight' : 'mate'));
      toks[m].firstChild.setAttribute('r', me ? 14.5 : 12.5);
      toks[m].firstChild.setAttribute('fill', `url(#${me ? 'gh' : 'gm'}-${uid})`);
    });
  }
  setRole(role);


  /* ---------- הציור הסטטי ---------- */

  /** המחלקה של חץ לפי סוגו ולפי מי שרץ עליו */
  function arrowClass(ar, who) {
    if (ar.k === 'pass') return ['a-pass', 'hb'];
    if (ar.k === 'opt') return ['a-opt', 'hp'];
    if (ar.k === 'press') return who && who.num != null ? ['a-mpress', 'hm'] : ['a-press', 'hg'];
    return who && who.num != null && who.num !== hero ? ['a-mrun', 'hm'] : ['a-run', 'hp'];
  }

  /** תווית אפשרות (A, B) — עיגול על הקשת, בצד הבולט שלה, ולא טקסט חופשי
      שנבלע בקווי המגרש */
  function badge(cv, label, bend) {
    const L = cv.len / 2;
    const p = ptAt(cv, L), d = dirAt(cv, L);
    const side = (bend || 0) >= 0 ? 1 : -1;
    const g = el('g', { class: 'abadge', transform: `translate(${r1(p[0] - d[1] * 12 * side)},${r1(p[1] + d[0] * 12 * side)})` });
    g.appendChild(el('circle', { r: 8.5 }));
    const t = el('text');
    t.textContent = label;
    g.appendChild(t);
    return g;
  }

  function render(s, opts = {}) {
    exitMovie();
    /* decorate=false רק לתמונות מוקטנות ולמבדק: בלי מחלקות אנימציה כלל.
       בתנועה מופחתת המחלקות כן נוספות ו-CSS מנטרל אותן. */
    const decorate = opts.animate !== false;
    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    const fade = decorate ? ' fade' : '';
    const c = castOf(s, formation);

    order.forEach(n => setTok(n, c.posOf(n)));
    setBall(restBall(s, c, order), 0);

    gZone.textContent = ''; gOpp.textContent = ''; gArr.textContent = ''; gGhost.textContent = ''; gFx.textContent = '';

    (s.zones || []).forEach((z, i) => {
      const r = el('rect', { x: z.x, y: z.y, width: z.w, height: z.h, rx: 8, class: 'zone' + fade });
      r.dataset.zone = i;
      gZone.appendChild(r);
      if (z.label) {
        /* עוגן בצד ימין של האזור, ואת הכיוון קובעים במפורש: במסמך RTL
           ה-end הוא דווקא הקצה השמאלי, והתווית ברחה אל מחוץ לאזור */
        const t = el('text', { x: z.x + z.w - 8, y: z.y + 16, class: 'zlabel' + fade, 'text-anchor': 'start', direction: 'rtl' });
        t.textContent = z.label;
        gZone.appendChild(t);
      }
    });

    if (s.shadow) {
      const [p, r] = s.shadow;
      const dx = r[0] - p[0], dy = r[1] - p[1], l = Math.hypot(dx, dy) || 1;
      const ex = p[0] + dx / l * 140, ey = p[1] + dy / l * 140, nx = -dy / l * 34, ny = dx / l * 34;
      gZone.appendChild(el('path', { d: `M${p[0]} ${p[1]} L${ex + nx} ${ey + ny} L${ex - nx} ${ey - ny} Z`, class: 'shadow' + fade }));
    }

    const arrows = s.arrows || [];
    const who = arrows.map(ar => c.actor(ar));

    (s.ghosts || []).forEach((g, i) => {
      /* המספר של מי שיצא מכאן, חלש — כדי שיהיה ברור של מי נקודת ההתחלה */
      const k = arrows.findIndex((ar, j) => who[j] && who[j].num != null && closeTo(ar.a, g, R_AT));
      gGhost.appendChild(ghostEl(g, k >= 0 ? who[k].num : null, fade, i));
    });

    oppEls = (s.opp || []).map((o, i) => {
      const g = el('g', { class: 'opp' + fade, filter: `url(#sh-${uid})` });
      g.dataset.opp = i;
      g.appendChild(el('circle', { r: 12, class: 'tc', fill: `url(#go-${uid})` }));
      gOpp.appendChild(g);
      return g;
    });
    (s.opp || []).forEach((o, i) => setOpp(i, o));

    arrows.forEach((ar, k) => {
      const cv = curve(ar.a, ar.b, ar.bend || 0);
      const [cls, head] = arrowClass(ar, who[k]);
      const p = el('path', { d: arrowD(cv, ar.k), class: 'arrow ' + cls, 'marker-end': `url(#${head}-${uid})` });
      p.dataset.arrow = k;
      gArr.appendChild(p);
      if (decorate && !reduce) {
        if (ar.k === 'run') {
          p.style.setProperty('--len', p.getTotalLength());
          p.classList.add('draw');
          p.style.animationDelay = (0.18 + k * 0.1) + 's';
        } else {
          p.classList.add('draw');
          p.style.animationDelay = (0.28 + k * 0.12) + 's';
        }
      }
      if (ar.label) {
        const b = badge(cv, ar.label, ar.bend);
        if (decorate) b.classList.add('fade');
        gArr.appendChild(b);
      }
    });
  }

  function ghostEl(p, num, fade, i) {
    const g = el('g', { class: 'ghost-g' + (fade || ''), transform: `translate(${r1(p[0])},${r1(p[1])})` });
    const c = el('circle', { r: 13, class: 'ghost' });
    if (i != null) c.dataset.ghost = i;
    g.appendChild(c);
    if (num != null) {
      const t = el('text', { class: 'gn' });
      t.textContent = num;
      g.appendChild(t);
    }
    return g;
  }

  /* ---------- ההרצה עצמה ---------- */

  let movie = null;     /* התוכנית הטעונה */
  let mv = null;        /* האלמנטים של ההרצה, כשהיא על המסך */
  let introFrom = null; /* המיקומים שמהם מחליקים לנקודת ההתחלה */
  const INTRO = 480;    /* החלקה מהציור אל רגע ההתחלה */
  const PREVIEW = 0.24; /* המסלול שעוד לא נעשה — חלש, כדי שהשובל יבלוט */

  /** מכין הרצה. הציור הסטטי נבנה מחדש קודם, כדי שחיצים שהרצה קודמת
      הסירה (של אפשרות אחרת) יחזרו — הם החלופה החלשה ברקע של זו. לכן
      snapshot() נקרא לפני load: הציור מחדש מחזיר את כולם למקום המצויר. */
  function load(s, variant) {
    const p = choreograph(s, formation, hero, variant);
    if (!p.acts.length) { movie = null; return null; }
    render(s, { animate: false });
    p.s = s;
    movie = p;
    return { total: p.total, steps: p.steps, variant: p.variant, variants: p.variants };
  }

  /** צילום של המיקומים הנוכחיים, כנקודת המוצא של ההחלקה להתחלה */
  function snapshot() { introFrom = { ...at }; }

  function enterMovie() {
    const M = movie;
    svg.classList.add('movie');
    gGhost.textContent = ''; gFx.textContent = '';
    /* חיצים שאינם חלק מההרצה נשארים, חלשים: חלופה אחרת, או אפשרות שלא
       נבחרה. המסלולים של ההרצה נבנים מחדש, ושאר החיצים נמחקים. */
    [...gArr.children].forEach(node => {
      const k = node.dataset.arrow != null ? +node.dataset.arrow : null;
      const keep = k != null && (M.statics.includes(k) || M.other.includes(k));
      if (node.classList.contains('abadge')) {
        const lab = node.textContent;
        const otherLab = M.variant && lab !== M.variant;
        if (otherLab) { node.classList.add('dim'); return; }
        if (lab === M.variant) return;
        node.remove();
        return;
      }
      if (!keep) { node.remove(); return; }
      node.classList.remove('draw', 'fade');
      node.classList.add(M.other.includes(k) ? 'dim' : 'aside');
    });
    const els = { prev: [], trail: [], ghosts: [], ripples: [] };
    const styleOf = a => {
      if (a.type === 'pass') return a.opt ? ['a-opt', 'hp'] : ['a-pass', 'hb'];
      if (a.kind === 'opt') return ['a-opt', 'hp'];
      if (a.team === 'opp') return ['a-press', 'hg'];
      if (a.kind === 'press') return ['a-mpress', 'hm'];
      return a.team === 'hero' ? ['a-run', 'hp'] : ['a-mrun', 'hm'];
    };
    M.acts.forEach(a => {
      const [cls, head] = styleOf(a);
      const [t1, t2] = a.type === 'pass' ? [0, 15] : trims(a.L, a.kind);
      a.t1 = t1; a.t2 = t2;
      const d = subD(a.cv, t1, Math.max(t1, a.L - t2));
      const pv = el('path', { d, class: 'arrow pv ' + cls, 'marker-end': `url(#${head}-${uid})` });
      const tr = el('path', { d: 'M0 0', class: 'arrow tr ' + cls });
      tr.dataset.head = `url(#${head}-${uid})`;
      gArr.insertBefore(pv, gArr.firstChild);
      gArr.appendChild(tr);
      els.prev.push(pv); els.trail.push(tr);
      if (a.type === 'pass') {
        const r = el('circle', { r: 6, class: 'ripple' });
        gFx.appendChild(r);
        els.ripples.push(r);
      } else els.ripples.push(null);
    });
    /* נקודות התחלה: מופיעות כשהשחקן עוזב אותן */
    M.tracks.forEach(t => {
      const g = ghostEl(t.acts[0].from, t.who.num != null ? t.who.num : null);
      if (t.who.opp != null) g.classList.add('og');
      gGhost.appendChild(g);
      els.ghosts.push({ g, t });
    });
    els.halo = el('circle', { r: 20, class: 'halo' });
    gFx.appendChild(els.halo);
    mv = els;
  }

  function exitMovie() {
    if (!mv) return;
    svg.classList.remove('movie');
    mv = null;
  }

  /** מצייר את הרגע t של ההרצה הטעונה. t שלילי הוא ההחלקה מהציור אל
      נקודת ההתחלה: מ-INTRO- עד אפס. */
  function seek(t) {
    const M = movie;
    if (!M) return;
    if (!mv) enterMovie();
    const tc = clamp(t, 0, M.total);
    const k = t < 0 ? easeRun(clamp((t + INTRO) / INTRO, 0, 1)) : 1;
    const from = introFrom || at;
    const glide = (key, p) => (k < 1 && from[key] ? lerp(from[key], p, k) : p);

    /* שחקנים שלא זזים בהרצה נשארים במקום המצויר — גם אם ההחלקה מתחילה
       מסוף הרצה קודמת (של אפשרות אחרת) שבה הם במקום אחר */
    const S = M.s;
    order.forEach(n => {
      const tr = M.tracks.get('n' + n);
      const p = glide('n' + n, tr ? trackPos(tr, tc) : ((S.pos && S.pos[n]) || base[n]));
      place(toks[n], p); at['n' + n] = p;
    });
    (S.opp || []).forEach((o, i) => {
      const tr = M.tracks.get('o' + i);
      setOpp(i, glide('o' + i, tr ? trackPos(tr, tc) : o));
    });

    /* הכדור: המהלך האחרון שכבר התחיל הוא הנהג. בלי הבחירה הזאת גם
       ההובלה וגם המסירה היו כותבות לו מיקום, והאחרונה ברשימה — לא
       האחרונה בזמן — הייתה מנצחת. */
    let bp = M.ball0, dist = 0, cur = null;
    for (const c of M.chain) {
      if (tc >= c.start) cur = c;
      const L = c.type === 'pass' ? c.L : c.m.L;
      dist += L * clamp((tc - c.start) / c.dur, 0, 1);
    }
    if (cur) {
      const u = clamp((tc - cur.start) / cur.dur, 0, 1);
      if (cur.type === 'pass') bp = ptAt(cur.cv, easeBall(u) * cur.L);
      else {
        const m = cur.m, L = moveK(m, u) * m.L;
        const p = ptAt(m.cv, L), d = dirAt(m.cv, L);
        const f = [p[0] + d[0] * FEET, p[1] + d[1] * FEET];
        /* בתחילת ההובלה הכדור עובר מהמקום שבו נעצר אל הרגליים */
        bp = u < 0.22 ? lerp(cur.from, f, easeRun(u / 0.22)) : f;
      }
    }
    setBall(glide('ball', bp), dist / 5.5 * 57.3);

    /* שובל: מה שכבר נעשה, מלא; מה שעוד לא — חלש מתחת */
    M.acts.forEach((a, j) => {
      const pv = mv.prev[j], tr = mv.trail[j];
      if (t < 0) {
        pv.style.opacity = 1 - (1 - PREVIEW) * k;
        tr.setAttribute('d', 'M0 0');
        tr.removeAttribute('marker-end');
        return;
      }
      pv.style.opacity = PREVIEW;
      const u = clamp((tc - a.start) / a.dur, 0, 1);
      const pos = moveK(a, u) * a.L;
      const tip = Math.min(pos - (a.type === 'pass' ? 4 : 0), a.L - a.t2);
      if (tip <= a.t1 + 0.5) { tr.setAttribute('d', 'M0 0'); tr.removeAttribute('marker-end'); return; }
      tr.setAttribute('d', subD(a.cv, a.t1, tip));
      if (u >= 1) tr.setAttribute('marker-end', tr.dataset.head);
      else tr.removeAttribute('marker-end');
      const rp = mv.ripples[j];
      if (rp) {
        const q2 = (tc - a.start - a.dur) / 480;
        if (q2 >= 0 && q2 <= 1) {
          rp.setAttribute('cx', r1(a.to[0])); rp.setAttribute('cy', r1(a.to[1]));
          rp.setAttribute('r', r1(6 + 18 * q2));
          rp.style.opacity = 0.75 * (1 - q2);
        } else rp.style.opacity = 0;
      }
    });

    mv.ghosts.forEach(({ g, t: tr }) => {
      const home = tr.acts[0].from;
      const p = at[tr.key] || home;
      const away = clamp(span(p, home) / 22, 0, 1);
      g.style.opacity = t < 0 ? (1 - k) : away;
    });

    /* הילה סביבך כשאתה בתנועה — העין צריכה לדעת על מי להסתכל */
    const heroAct = (M.tracks.get('n' + hero) || { acts: [] }).acts
      .find(a => tc >= a.start - 120 && tc <= a.start + a.dur + 120);
    if (heroAct && t >= 0) {
      const hp = at['n' + hero];
      mv.halo.setAttribute('cx', r1(hp[0])); mv.halo.setAttribute('cy', r1(hp[1]));
      mv.halo.setAttribute('r', r1(20 + 2.5 * Math.sin(tc / 140)));
      const edge = Math.min(tc - (heroAct.start - 120), heroAct.start + heroAct.dur + 120 - tc);
      mv.halo.style.opacity = clamp(edge / 160, 0, 1) * 0.55;
    } else mv.halo.style.opacity = 0;
  }

  return {
    render, setRole, load, seek, snapshot,
    intro: INTRO,
    variantsOf,
    /* תרחיש בלי תנועה — מפת תפקיד, למשל — לא מקבל פס הרצה */
    canPlay: s => {
      const vs = variantsOf(s);
      return (vs.length ? vs : [null]).some(v => choreograph(s, formation, hero, v).acts.length > 0);
    },
    /* לבדיקות: הלוח זמנים שנגזר מהתרחיש, בלי לצייר */
    planOf: (s, v) => choreograph(s, formation, hero, v),
    tokens: toks, ball: ballG, formation, role
  };
}

/** מגרש קטן וסטטי לכרטיס בספרייה */
export function thumbnail(scenario, formation, role) {
  const svg = buildPitch();
  svg.classList.add('mini');
  svg.setAttribute('aria-hidden', 'true');
  svg.removeAttribute('role');
  svg.removeAttribute('aria-label');
  createPitch(svg, formation, role).render(scenario, { animate: false });
  return svg;
}
