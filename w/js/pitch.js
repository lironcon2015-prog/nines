/* ציור המגרש: שחקנים, כדור, חיצים, אזורים.
   מודול עצמאי — לא יודע דבר על ניווט, התקדמות או חוברות,
   כדי שגם מסך העריכה וגם תמונות מוקטנות יוכלו להשתמש בו. */

const NS = 'http://www.w3.org/2000/svg';

export const el = (n, a = {}) => {
  const e = document.createElementNS(NS, n);
  for (const k in a) e.setAttribute(k, a[k]);
  return e;
};

/* קיצור החץ בקצוות כדי שלא ייגע בעיגול השחקן */
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

const ARROW_CLASS = { pass: 'a-pass', opt: 'a-opt', press: 'a-press', run: 'a-run' };
const ARROW_MARKER = { pass: 'hb', press: 'hg', run: 'hp', opt: 'hp' };
const HEAD_FILL = { hp: '#E5326F', hb: '#1F4FA8', hg: '#6E7A6B' };

let uidSeq = 0;

/** בונה את שלד המגרש: קווים, ראשי חיצים וקבוצות ריקות.
    כל מגרש מקבל מזהה משלו כדי ששני מגרשים באותו דף לא יתנגשו. */
export function buildPitch() {
  const uid = 'p' + (++uidSeq);
  const svg = el('svg', {
    class: 'pitch', viewBox: '0 0 400 620',
    role: 'img', 'aria-label': 'דיאגרמת מגרש תשיעיות'
  });
  svg.dataset.uid = uid;

  const defs = el('defs');
  for (const [name, fill] of Object.entries(HEAD_FILL)) {
    const m = el('marker', {
      id: `${name}-${uid}`, viewBox: '0 0 10 10', refX: 8, refY: 5,
      markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse'
    });
    m.appendChild(el('path', { d: 'M0 0 L10 5 L0 10 z', fill }));
    defs.appendChild(m);
  }
  svg.appendChild(defs);

  svg.appendChild(el('rect', { x: 20, y: 20, width: 360, height: 580, fill: '#D6DAC6' }));
  svg.appendChild(el('g', { class: 'g-zones' }));

  const lines = el('g', { class: 'pl' });
  const dot = (cx, cy) => el('circle', { cx, cy, r: 2.4, fill: '#17211F', stroke: 'none', opacity: '.4' });
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
  lines.appendChild(el('rect', { x: 170, y: 596, width: 60, height: 8 }));
  lines.appendChild(el('rect', { x: 170, y: 16, width: 60, height: 8 }));
  svg.appendChild(lines);

  ['g-ghosts', 'g-arrows', 'g-opp', 'g-team', 'g-ball'].forEach(c => svg.appendChild(el('g', { class: c })));
  return svg;
}

/**
 * @param {SVGElement} svg  מגרש שנבנה ב-buildPitch
 * @param {{order:number[], base:Object}} formation  מיקומי ברירת מחדל לפי מספר חולצה
 * @param {number} role  מספר החולצה המודגש בוורוד — נקבע לפי החוברת, לא קשיח בקוד
 */
export function createPitch(svg, formation, role) {
  const uid = svg.dataset.uid;
  const q = c => svg.querySelector('.' + c);
  const gTeam = q('g-team'), gOpp = q('g-opp'), gArr = q('g-arrows'),
        gZone = q('g-zones'), gGhost = q('g-ghosts'), gBall = q('g-ball');

  const { order, base } = formation;
  const toks = {};
  gTeam.textContent = '';
  order.forEach(n => {
    const me = n === role;
    const g = el('g', { class: 'tok ' + (me ? 'eight' : 'mate'), transform: `translate(${base[n][0]},${base[n][1]})` });
    g.dataset.num = n;   /* לתפיסה בגרירה בעורך */
    g.appendChild(el('circle', { r: me ? 14.5 : 12.5 }));
    const t = el('text');
    t.textContent = n;
    g.appendChild(t);
    gTeam.appendChild(g);
    toks[n] = g;
  });

  gBall.textContent = '';
  const ballDot = el('circle', { r: 4.6, class: 'ball' });
  gBall.appendChild(ballDot);

  /* בשיקוף של תפקיד אגף המספר המודגש מתחלף, ולכן ההדגשה ניתנת לשינוי
     אחרי הבנייה ולא רק בזמנה */
  let hero = role;
  function setRole(n) {
    hero = n;
    order.forEach(m => {
      const me = m === hero;
      toks[m].setAttribute('class', 'tok ' + (me ? 'eight' : 'mate'));
      toks[m].firstChild.setAttribute('r', me ? 14.5 : 12.5);
    });
  }

  function render(s, opts = {}) {
    /* decorate=false רק לתמונות מוקטנות: בלי מחלקות אנימציה כלל.
       בתנועה מופחתת המחלקות כן נוספות ו-CSS מנטרל אותן — כך שהפלט
       זהה בדיוק לגרסה שקדמה לפירוק, כולל החלקת הקצוות. */
    const decorate = opts.animate !== false;
    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    const fade = decorate ? ' fade' : '';

    order.forEach(n => {
      const p = (s.pos && s.pos[n]) || base[n];
      toks[n].setAttribute('transform', `translate(${p[0]},${p[1]})`);
    });
    ballDot.setAttribute('cx', s.ball[0]);
    ballDot.setAttribute('cy', s.ball[1]);

    gZone.textContent = ''; gOpp.textContent = ''; gArr.textContent = ''; gGhost.textContent = '';

    (s.zones || []).forEach((z, i) => {
      const r = el('rect', { x: z.x, y: z.y, width: z.w, height: z.h, rx: 6, class: 'zone' + fade });
      r.dataset.zone = i;
      gZone.appendChild(r);
      if (z.label) {
        const t = el('text', { x: z.x + z.w - 8, y: z.y + 16, class: 'zlabel' + fade, 'text-anchor': 'end' });
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

    (s.ghosts || []).forEach((g, i) => {
      const c = el('circle', { cx: g[0], cy: g[1], r: 13, class: 'ghost' + fade });
      c.dataset.ghost = i;
      gGhost.appendChild(c);
    });

    (s.opp || []).forEach((o, i) => {
      const g = el('g', { class: 'opp' + fade, transform: `translate(${o[0]},${o[1]})` });
      g.dataset.opp = i;
      g.appendChild(el('circle', { r: 12, class: 'oppfill' }));
      g.appendChild(el('circle', { r: 12 }));
      gOpp.appendChild(g);
    });

    (s.arrows || []).forEach((ar, k) => {
      const [a, b] = trim(ar.a, ar.b, ar.k === 'pass' ? 15 : 16, 17);
      const marker = ARROW_MARKER[ar.k] || 'hp';
      const p = el('path', {
        d: arc(a, b, ar.bend || 0),
        class: 'arrow ' + (ARROW_CLASS[ar.k] || 'a-run'),
        'marker-end': `url(#${marker}-${uid})`
      });
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
        const t = el('text', { x: (a[0] + b[0]) / 2 - 14, y: (a[1] + b[1]) / 2, class: 'alabel' + fade });
        t.textContent = ar.label;
        gArr.appendChild(t);
      }
    });
  }

  /* ---------- הרצת התרחיש ----------
     ילד בן 11 קורא תנועה טוב בהרבה משהוא קורא חץ מכופף — חץ הוא ייצוג
     מופשט שצריך ללמוד לקרוא. הנתונים כבר מחזיקים מסלול מלא (a, b, bend),
     ולכן אין כאן תוכן חדש: רק הזזת האסימונים לאורך מה שכבר משורטט. */

  /* מרחקי זיהוי. AT — שחקן עומד בנקודה. SAME — שני חצים מתכוונים לאותה
     נקודה, וזה סובלני יותר כי כל אחד מהם צויר בנפרד. BALL — הכדור לרגליו. */
  const R_AT = 24, R_SAME = 32, R_BALL = 20;
  const PAUSE = 130;   /* נגיעה ראשונה, לפני שממשיכים */

  const closeTo = (a, b, r) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= r;
  const span = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* המשך תלוי מרחק: צעד קצר וספרינט של שלושים מטר אינם אורכים אותו זמן.
     הכדור מהיר מהרגליים. */
  const runMs = d => clamp(d * 3.4, 450, 1500);
  const passMs = d => clamp(d * 2.6, 340, 1100);

  /** האם הנקודה יושבת על הקטע בין שני קצוות החץ — לא עליהם, אלא בדרך */
  function onSegment(p, a, b, r) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (!len2) return false;
    const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    if (t <= 0.15 || t >= 0.85) return false;   /* הקצוות נבדקו כבר */
    return closeTo(p, [a[0] + dx * t, a[1] + dy * t], r);
  }

  /**
   * מה זז בתרחיש, ומתי.
   *
   * הקושי אינו בציור אלא בתזמון: שרטוט אחד מחזיק כמה אירועים שקרו זה
   * אחר זה, והחיצים אינם אומרים מי קדם למי. הסדר נגזר כאן מהגיאומטריה —
   * מסירה מתחילה מהמקום שאליו הגיעה הקודמת, ריצה שמסתיימת בנקודת מסירה
   * חייבת להסתיים לפניה, וריצה שמסתיימת ביעד של מסירה מתוזמנת להגיע
   * יחד עם הכדור ולא לפניו או אחריו.
   */
  function plan(s) {
    const posOf = n => (s.pos && s.pos[n]) || base[n];
    const opps = s.opp || [];
    const arrows = s.arrows || [];

    /** מי מצויר בנקודה: קודם הקצוות, ואז מי שמצויר באמצע החץ ועוד בדרך.
        mid מסמן את המקרה השלישי, וחשוב: מי שמצויר באמצע החץ **עוצר שם**
        ולא בקצהו. אחרת הוא היה רץ עד הסוף ואז קופץ אחורה למקום שבו
        התרחיש מצייר אותו. שארית החץ היא לאן שהוא ממשיך. */
    const actorAt = (ar, pick) => {
      let n = pick(p => closeTo(p, ar.b, R_AT));
      if (n != null) return { n, mid: false };
      n = pick(p => closeTo(p, ar.a, R_AT));
      if (n != null) return { n, mid: false };
      n = pick(p => onSegment(p, ar.a, ar.b, R_AT));
      return n != null ? { n, mid: true } : null;
    };

    /* --- מסירות --- */
    const passes = arrows.filter(a => a.k === 'pass').map(a => ({
      kind: 'pass', ball: true, from: a.a, to: a.b, bend: a.bend || 0,
      dur: passMs(span(a.a, a.b)), start: 0
    }));

    /* חץ שנקודת התחלה מסומנת בשני קצותיו אינו תנועה אלא טווח: כך מצוירת
       מפת התפקיד, "בין כאן לכאן אתה חי". אין מה להריץ לאורכו. */
    const ghosts = s.ghosts || [];
    const isRange = ar => ghosts.some(g => closeTo(g, ar.a, R_AT))
                       && ghosts.some(g => closeTo(g, ar.b, R_AT));

    /* --- ריצות --- */
    const runs = [];
    arrows.filter(a => a.k === 'run' && !isRange(a)).forEach(ar => {
      const found = actorAt(ar, test => order.find(n => test(posOf(n))));
      if (!found) return;
      const at = posOf(found.n);
      const end = found.mid ? at : ar.b;
      runs.push({
        kind: 'run', num: found.n, at, from: ar.a, to: ar.b, end,
        stopAt: found.mid ? at : null, bend: ar.bend || 0,
        dur: runMs(span(ar.a, end)), start: 0
      });
    });

    /* --- לחץ ---
       ה-README מגדיר press כתנועת יריב, אבל בתוכן הוא משמש גם לריצת לחץ
       של שחקן שלנו. מי שמצויר בתחילת החץ הוא מי שזז, ולא מי שבסופו —
       אחרת יריב שעומד ביעד היה נשאב אחורה אל נקודת ההתחלה. */
    const presses = [];
    arrows.filter(a => a.k === 'press').forEach(ar => {
      const add = (who, at, mid) => {
        const end = mid ? at : ar.b;
        presses.push({
          kind: 'press', ...who, at, from: ar.a, to: ar.b, end,
          stopAt: mid ? at : null, bend: ar.bend || 0,
          dur: runMs(span(ar.a, end)), start: 0
        });
      };
      let i = opps.findIndex(o => closeTo(o, ar.a, R_AT));
      if (i >= 0) return add({ oppIndex: i }, opps[i], false);
      const num = order.find(n => closeTo(posOf(n), ar.a, R_AT));
      if (num != null) return add({ num }, posOf(num), false);
      i = opps.findIndex(o => closeTo(o, ar.b, R_AT));
      if (i >= 0) return add({ oppIndex: i }, opps[i], false);
      i = opps.findIndex(o => onSegment(o, ar.a, ar.b, R_AT));
      if (i >= 0) add({ oppIndex: i }, opps[i], true);
    });

    /* --- שרשרת המסירות ---
       כל מסירה מתחילה מהמקום שאליו הגיעה הקודמת. בלי זה שתי מסירות
       באותו תרחיש רצות יחד ושתיהן מזיזות את אותו כדור — וזה נראה
       כאילו הכדור קופץ. */
    const chain = [];
    const pool = passes.slice();
    let cursor = s.ball;
    while (pool.length) {
      let k = pool.findIndex(p => closeTo(p.from, cursor, R_SAME));
      if (k < 0) k = 0;
      const p = pool.splice(k, 1)[0];
      chain.push(p);
      cursor = p.to;
    }

    /* --- תזמון המסירות ---
       מסירה שיוצאת מנקודה שאליה מגיעה ריצה מחכה לה: המוסר עוד בדרך. */
    let t = 0;
    chain.forEach(p => {
      const carrier = runs.find(r => closeTo(r.end, p.from, R_SAME));
      p.start = Math.max(t, carrier ? carrier.dur + PAUSE : 0);
      t = p.start + p.dur + PAUSE;
    });

    /* מסירה אל מי שרץ אליה ממתינה לו כשהריצה ארוכה ממנה — עדיף שהכדור
       יפגוש אותו מאשר שינחת בחלל ריק וימתין שם. אחרי הדחייה מסדרים את
       השרשרת מחדש, כדי ששתי מסירות לא יחפפו. */
    chain.forEach(p => {
      const runner = runs.find(r => closeTo(r.end, p.to, R_SAME));
      if (!runner) return;
      const need = runner.dur - p.dur;
      if (need > 60) p.start = Math.max(p.start, need);
    });
    let acc = 0;
    chain.forEach(p => { p.start = Math.max(p.start, acc); acc = p.start + p.dur + PAUSE; });

    /* --- תזמון הריצות --- */
    runs.forEach(r => {
      /* הוא המוסר, ומגיע לנקודת המסירה ראשון */
      if (chain.some(p => closeTo(r.end, p.from, R_SAME))) { r.start = 0; return; }
      /* קיבל את הכדור וממשיך איתו */
      const recv = chain.find(p => closeTo(p.to, r.from, R_SAME));
      if (recv) { r.start = recv.start + recv.dur + PAUSE; r.after = recv; return; }
      /* מסר ואז יצא לריצה — הקיר עם החלוץ */
      const passer = chain.find(p => closeTo(p.from, r.from, R_AT));
      if (passer) { r.start = passer.start + Math.round(passer.dur * 0.5); return; }
      /* רץ אל הכדור: מגיע יחד איתו, לא לפניו ולא אחריו */
      const deliver = chain.find(p => closeTo(p.to, r.end, R_SAME));
      if (deliver) { r.start = Math.max(0, deliver.start + deliver.dur - r.dur); return; }
      r.start = 0;
    });

    /* --- מי מוביל את הכדור ---
       הכדור נוסע עם שחקן כשהוא מצויר לרגליו, או כשמסירה הרגע הגיעה
       אליו. יריב שעומד על הכדור גובר: אז הוא לא שלנו להוביל. */
    const oppOnBall = opps.some(o => closeTo(o, s.ball, R_BALL));
    const delivered = p => chain.some(c => closeTo(c.to, p, R_SAME));

    const rides = mover => ({
      kind: 'carry', ball: true, link: mover,
      from: mover.from, to: mover.to, end: mover.end, stopAt: mover.stopAt,
      bend: mover.bend, dur: mover.dur, start: mover.start
    });

    const carries = [];
    runs.forEach(r => {
      const dribbles = !oppOnBall && closeTo(s.ball, r.at, R_BALL) && !delivered(r.at);
      if (r.after || dribbles) carries.push(rides(r));
    });
    presses.forEach(pr => {
      if (closeTo(s.ball, pr.at, R_BALL) && !delivered(pr.at)) carries.push(rides(pr));
    });

    /* --- כדור אחד, נהג אחד בכל רגע ---
       אם שני מהלכים של הכדור חופפים בזמן, השני נדחה — ומי שמוביל אותו
       נדחה איתו, אחרת השחקן והכדור נפרדים. */
    const ballActs = chain.concat(carries).sort((a, b) => a.start - b.start);
    for (let i = 1; i < ballActs.length; i++) {
      const prev = ballActs[i - 1], cur = ballActs[i];
      const earliest = prev.start + prev.dur;
      if (cur.start >= earliest) continue;
      const shift = earliest - cur.start;
      cur.start += shift;
      if (cur.link) cur.link.start += shift;
    }

    return { acts: runs.concat(presses, chain, carries), ball: ballActs[0] || null };
  }

  /** המגרש ברגע שלפני התנועה: כל מי שזז חוזר לתחילת החץ שלו */
  function beforeOf(s, plan) {
    const b = { ...s, pos: { ...(s.pos || {}) } };
    plan.acts.forEach(a => { if (a.num != null) b.pos[a.num] = a.from; });

    if (plan.ball) b.ball = plan.ball.from;

    if (plan.acts.some(a => a.oppIndex != null)) {
      b.opp = (s.opp || []).map((o, i) => {
        const a = plan.acts.find(x => x.oppIndex === i);
        return a ? a.from : o;
      });
    }

    /* בלי חיצים ובלי נקודות התחלה — התנועה עצמה מחליפה אותם.
       אזורים וצל נשארים: הם ההקשר, לא התנועה. */
    delete b.arrows; delete b.ghosts;
    return b;
  }

  let cancel = null;

  /**
   * מריץ את התרחיש פעם אחת ומסיים בתמונה המלאה, על החיצים.
   * בתנועה מופחתת מדלג ישר לתמונה המלאה.
   * @param {object} s תרחיש (משוקף כבר, אם צריך)
   * @param {Function} [onDone] נקרא בסוף, גם כשלא הייתה אנימציה
   */
  function play(s, onDone) {
    if (cancel) cancel();

    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    const p = reduce ? { acts: [], ball: null } : plan(s);
    if (!p.acts.length) { render(s); if (onDone) onDone(); return; }

    render(beforeOf(s, p), { animate: false });

    /* אסימוני היריב נבנים מחדש בכל ציור, ולכן ההפניות נאספות אחרי */
    const oppEls = [...gOpp.children];
    const defs = svg.querySelector('defs');
    const live = [];

    p.acts.forEach(a => {
      const node = a.ball ? ballDot : a.num != null ? toks[a.num] : oppEls[a.oppIndex];
      if (!node) return;
      /* מסלול לדגימה בלבד. יושב ב-defs כדי שלא ייצבע, אבל כן יהיה במסמך —
         getTotalLength על אלמנט מנותק אינו אמין בכל דפדפן. */
      const probe = el('path', { d: arc(a.from, a.to, a.bend) });
      defs.appendChild(probe);
      /* מי שמצויר באמצע החץ עוצר במקום שבו הוא מצויר. הקשת אינה קו ישר,
         ולכן מוצאים את הנקודה על המסלול ולא מחשבים אותה. */
      live.push({ ...a, node, probe, len: a.stopAt ? lengthAt(probe, a.stopAt) : probe.getTotalLength() });
    });

    if (!live.length) { render(s); if (onDone) onDone(); return; }

    svg.classList.add('playing');
    /* שהות קצרה בסוף, כדי שהתמונה הסופית תיראה לפני שהחיצים חוזרים */
    const total = Math.max(...live.map(a => a.start + a.dur)) + 260;
    const t0 = performance.now();
    let raf = 0;

    const clear = () => {
      cancelAnimationFrame(raf);
      live.forEach(a => a.probe.remove());
      svg.classList.remove('playing');
      cancel = null;
    };

    /* הכדור מקבל נהג אחד בכל רגע: המהלך האחרון שכבר התחיל. בלי הבחירה
       הזאת גם ההובלה וגם המסירה היו כותבות לו מיקום בכל פריים, והאחרונה
       ברשימה — לא האחרונה בזמן — הייתה מנצחת. */
    const ballLive = live.filter(a => a.ball).sort((a, b) => a.start - b.start);
    const moverLive = live.filter(a => !a.ball);
    const at = (a, t) => a.probe.getPointAtLength(
      ease(Math.max(0, Math.min(1, (t - a.start) / a.dur))) * a.len);
    const driver = t => {
      let cur = ballLive[0];
      ballLive.forEach(a => { if (t >= a.start) cur = a; });
      return cur;
    };

    function frame(now) {
      const t = now - t0;
      moverLive.forEach(a => {
        const p = at(a, t);
        a.node.setAttribute('transform', `translate(${p.x},${p.y})`);
      });
      if (ballLive.length) {
        const p = at(driver(t), t);
        ballDot.setAttribute('cx', p.x);
        ballDot.setAttribute('cy', p.y);
      }
      if (t < total) { raf = requestAnimationFrame(frame); return; }
      const end = settled();
      clear();
      render(end);              /* התמונה המלאה, עם החיצים */
      if (onDone) onDone();
    }

    /* התרחיש כפי שהוא נראה אחרי הפעולה.
       חייב להיגזר מהמקום שבו כל אחד באמת עצר, ולא מהנתונים: השרטוט הוא
       לפעמים הרגע שלפני הפעולה ולא אחריה — הכדור מצויר לרגלי המוסר,
       או השחקן מצויר בתחילת חץ הריצה — וציור התרחיש כמות שהוא היה מחזיר
       אותם אחורה בקפיצה ברגע האחרון. */
    function settled() {
      const out = { ...s, pos: { ...(s.pos || {}) } };
      const opp = (s.opp || []).slice();
      moverLive.forEach(a => {
        const p = a.probe.getPointAtLength(a.len);
        if (a.num != null) out.pos[a.num] = [p.x, p.y];
        else if (a.oppIndex != null) opp[a.oppIndex] = [p.x, p.y];
      });
      if (ballLive.length) {
        const last = ballLive[ballLive.length - 1];
        const p = last.probe.getPointAtLength(last.len);
        out.ball = [p.x, p.y];
      }
      if (moverLive.some(a => a.oppIndex != null)) out.opp = opp;
      return out;
    }

    cancel = clear;
    raf = requestAnimationFrame(frame);
  }

  return {
    render, setRole, play,
    /* תרחיש בלי תנועה — מפת תפקיד, למשל — לא מקבל כפתור הרצה */
    canPlay: s => plan(s).acts.length > 0,
    /* לבדיקות: הלוח זמנים שנגזר מהתרחיש, בלי לצייר */
    planOf: plan,
    stopPlay: () => { if (cancel) cancel(); },
    tokens: toks, ball: ballDot, formation, role
  };
}

/** האטה בקצוות: יוצא לאט, מגיע לאט. תנועה קבועה נראית מכנית */
const ease = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/** האורך שבו המסלול הכי קרוב לנקודה — דגימה, כי לקשת אין פתרון סגור */
function lengthAt(path, pt) {
  const total = path.getTotalLength();
  let best = total, bd = Infinity;
  for (let i = 0; i <= 64; i++) {
    const L = total * i / 64;
    const p = path.getPointAtLength(L);
    const d = Math.hypot(p.x - pt[0], p.y - pt[1]);
    if (d < bd) { bd = d; best = L; }
  }
  return best;
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
