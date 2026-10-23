/* האימון האישי: בונים בבית, מעבירים במגרש, ושומרים ביומן.

   בעל הריפו מאמן את הבן שלו (11) באימון אישי פעם בשבוע — טכניקה ועוד. האימון
   נבנה מתוך ספריית הסרטונים: כל תרגיל יכול להחזיק סרטון (מזהה, לא עותק — השם,
   התמונה והניגון באים מהספרייה), מידה — זמן, עבודה/מנוחה, חזרות או אתגר —
   והערה שייכת לאימון הזה בלבד.

   במגרש רק ההורה מחזיק את הטלפון, ולפעמים הידיים שלו עסוקות (מוסר כדורים).
   לכן תרגיל מתחיל בלחיצה ואז רץ לבד, עם צפצופים לפני כל מעבר ובסוף, והמסך
   נשאר דולק. הטיימר הכולל הוא שעון מתחילת האימון ולא עוצר; טיימר התרגיל
   עוצר כשפותחים את הסרטון (בעל הריפו: "בזמן צפייה הטיימר הכולל ממשיך לרוץ,
   אבל טיימר התרגיל לא נספר").

   בסוף — ציון 1–5 והערה לכל תרגיל, והאימון עובר ליומן. היומן והשיאים מגיעים
   גם לטלפון של הבן כצופה בספרייה המשותפת: האימונים יושבים במסמך של
   הסרטונים (videos.js). */

import {
  getVideo, platformName, upcoming, journal, getSession, newSession, putSession, removeSession, newId, readOnly, reload
} from './videos.js';
import { syncNow, onSync } from './sync.js';
import { el, icon, toast, sheet, openLayer, onEscape, afterLayers } from './ui.js';
import { openVideo, videoThumb, posterUrlsReady, pickForTraining } from './videolib.js';

/* --- מידות --- */

const KINDS = [['time', 'זמן'], ['interval', 'עבודה/מנוחה'], ['reps', 'חזרות'], ['challenge', 'אתגר']];
const START = { kind: 'time', minutes: 5, work: 30, rest: 15, rounds: 6, sets: 3, reps: 8, unit: '', limit: 0 };
/* מה עובר לאימון הבא כשמשכפלים — בלי התוצאות */
const PLAN_KEYS = ['video', 'title', 'kind', 'minutes', 'work', 'rest', 'rounds', 'sets', 'reps', 'unit', 'limit', 'note'];

function clock(sec) {
  const n = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor(n % 3600 / 60);
  const s = String(n % 60).padStart(2, '0');
  return h ? h + ':' + String(m).padStart(2, '0') + ':' + s : m + ':' + s;
}

/** כמה שניות התרגיל אמור לקחת; null כשאין דרך לדעת (חזרות, אתגר בלי זמן) */
function plannedSecs(d) {
  if (d.kind === 'time') return d.minutes * 60;
  if (d.kind === 'interval') return d.rounds * d.work + Math.max(0, d.rounds - 1) * d.rest;
  if (d.kind === 'challenge') return d.limit || null;
  return null;
}

function measure(d) {
  if (d.kind === 'time') return d.minutes + ' דק׳';
  if (d.kind === 'interval') return d.work + '/' + d.rest + ' × ' + d.rounds;
  if (d.kind === 'reps') return d.sets + ' × ' + d.reps;
  return 'אתגר' + (d.limit ? ' · ' + d.limit + ' שנ׳' : '');
}

function totalText(s) {
  const all = s.drills.map(plannedSecs);
  const sum = all.reduce((a, x) => a + (x || 0), 0);
  /* חזרות ואתגר בלי זמן — לא יודעים כמה, ולכן "כ-" */
  return (all.some(x => x === null) ? 'כ-' : '') + Math.max(1, Math.round(sum / 60)) + ' דק׳';
}

/* --- תאריכים --- */

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dayName(iso) {
  if (!iso) return '';
  try { return new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(iso + 'T12:00')).replace(/^יום\s+/, ''); }
  catch (e) { return ''; }
}
function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? (+m[3]) + '.' + (+m[2]) : '';
}
const titleOf = s => s.title || ('אימון ' + dayName(s.date)).trim();

/* --- שיאים ---
   אתגר מזוהה לפי הסרטון שלו, ובלי סרטון — לפי השם. השיא נלקח מהיומן בלבד,
   כך שהאימון שרץ עכשיו נמדד מול מה שהיה לפניו. */

const fold = t => String(t || '').replace(/[֑-ׇ]/g, '').replace(/\s+/g, ' ').trim();
const recKey = d => d.video ? 'v:' + d.video : 't:' + fold(d.title);
/** שם שנמחק בעורך חוזר לשם הסרטון — כמו שה-placeholder שם מבטיח */
const nameOf = (d, none = 'תרגיל') => d.title || (d.video && (getVideo(d.video) || {}).title) || none;

function records(skip) {
  const best = new Map();
  for (const s of journal()) {
    if (s.id === skip) continue;
    for (const d of s.drills) {
      if (d.kind !== 'challenge' || typeof d.result !== 'number') continue;
      const k = recKey(d);
      const b = best.get(k);
      if (!b || d.result > b.value) best.set(k, { value: d.result, at: s.endedAt || s.at, title: nameOf(d, 'אתגר'), unit: d.unit, video: d.video });
    }
  }
  return best;
}

/* --- האימון הקרוב --- */

function drillFrom(v) {
  return Object.assign({ id: newId(), video: v ? v.id : null, title: v ? v.title : '', note: '' }, START);
}

function ensurePlan() {
  return upcoming() || newSession({ date: today() });
}

/** מהספרייה: הבחירה, או "+ לאימון" בנגן. מחזירה כמה נוספו. */
export function addVideosToPlan(ids) {
  if (readOnly() || !ids || !ids.length) return 0;
  const s = ensurePlan();
  let n = 0;
  for (const id of ids) {
    const v = getVideo(id);
    if (!v) continue;
    s.drills.push(drillFrom(v));
    n++;
  }
  putSession(s);
  syncNow();
  return n;
}

/** מה שכרטיס האימון בראש הספרייה צריך */
export function planCard() {
  const s = upcoming();
  if (!s) return null;
  return {
    title: titleOf(s), date: shortDate(s.date), count: s.drills.length,
    total: s.drills.length ? totalText(s) : '', live: !!(s.startedAt && !s.endedAt)
  };
}

function duplicate(from) {
  const drills = from.drills.map(d => {
    const c = { id: newId() };
    PLAN_KEYS.forEach(k => { c[k] = d[k]; });
    return c;
  });
  const plan = upcoming();
  if (plan) {
    plan.drills = drills;
    plan.goal = from.goal || '';
    putSession(plan);
    return plan;
  }
  return newSession({ date: today(), goal: from.goal || '', drills });
}

function pageHead(ic, title, sub) {
  return el('div.page-head', null,
    el('div.crest', null, el('span', null, icon(ic))),
    el('div', null, el('h1', { text: title }), sub ? el('p', { text: sub }) : null));
}

/** #/v/a */
export function mountPlan(root) {
  reload();
  document.title = 'האימון הקרוב — תשיעיות';
  const viewer = readOnly();
  let s = null;
  let sureDelete = false;
  const save = repaint => {
    putSession(s);
    syncNow();
    if (repaint) paint();
  };

  function paint() {
    s = upcoming();
    root.textContent = '';
    root.appendChild(el('a.back', { href: '#/v' }, icon('back'), 'חזרה לסרטונים'));
    if (!s) { empty(); return; }

    const head = el('div.plan-head');
    if (viewer) {
      head.append(el('h1.plan-title', { text: titleOf(s) }), el('p.plan-goal', { text: [shortDate(s.date), s.goal].filter(Boolean).join(' · ') }));
    } else {
      const title = el('input.plan-title', { type: 'text', id: 'tp-title', 'aria-label': 'שם האימון', placeholder: titleOf(Object.assign({}, s, { title: '' })) });
      title.value = s.title || '';
      title.onchange = () => { s.title = title.value.trim(); save(); };
      const date = el('input.inp.plan-date', { type: 'date', id: 'tp-date', 'aria-label': 'תאריך' });
      date.value = s.date || '';
      date.onchange = () => { s.date = date.value; save(true); };
      const goal = el('input.inp', { type: 'text', id: 'tp-goal', 'aria-label': 'מטרה', placeholder: 'מטרה — למשל רגל חלשה וקבלה' });
      goal.value = s.goal || '';
      goal.onchange = () => { s.goal = goal.value.trim(); save(); };
      head.append(title, el('div.row', null, date, goal));
    }
    root.appendChild(head);

    const n = s.drills.length;
    root.appendChild(el('div.plan-sum', null,
      el('span.chip.num', { 'aria-pressed': 'true', text: n + (n === 1 ? ' תרגיל' : ' תרגילים') }),
      n ? el('span.chip.num', { 'aria-pressed': 'true', text: totalText(s) }) : null));

    const list = el('div.card.rows.drills');
    s.drills.forEach(d => list.appendChild(drillRow(d)));
    if (!n) list.appendChild(el('p.hint.pad', { text: 'עוד אין תרגילים. מוסיפים מהסרטונים, או תרגיל בלי סרטון.' }));
    root.appendChild(list);

    if (viewer) {
      root.appendChild(el('p.hint', { text: 'את האימון בונה ומעביר המאמן. הסיכום יופיע ביומן.' }));
      root.appendChild(el('a.btn', { href: '#/v/h' }, icon('cup'), 'יומן האימונים'));
      return;
    }
    root.appendChild(addButtons());
    const live = s.startedAt && !s.endedAt;
    if (s.endedAt) {
      /* האימון נגמר ולא נשמר ביומן (יצאו מהסיכום) — חוזרים אליו, לא מתחילים מחדש */
      root.appendChild(el('button.btn.gold.wide.plan-go', { type: 'button', onclick: () => openSummary(s, paint) }, icon('check'), 'לסיכום ושמירה ביומן'));
      root.appendChild(el('button.btn.quiet.sm', { type: 'button', text: 'חזרה לאימון', onclick: () => startLive(s, paint) }));
    } else {
      root.appendChild(el('button.btn.gold.wide.plan-go', { type: 'button', disabled: !n, onclick: () => startLive(s, paint) },
        icon('play'), live ? 'להמשיך את האימון' : 'להתחיל אימון'));
    }
    const del = el('button.btn.quiet.sm', { type: 'button', text: sureDelete ? 'למחוק את האימון? לחיצה נוספת מוחקת' : 'מחיקת האימון' });
    del.onclick = () => {
      if (!sureDelete) { sureDelete = true; del.textContent = 'למחוק את האימון? לחיצה נוספת מוחקת'; return; }
      sureDelete = false;
      removeSession(s.id);
      syncNow();
      toast('האימון נמחק');
      paint();
    };
    root.appendChild(el('div.plan-foot', null, el('a.btn.quiet.sm', { href: '#/v/h' }, icon('cup'), 'יומן האימונים'), del));
  }

  function addButtons() {
    return el('div.plan-add', null,
      el('button.btn', { type: 'button', onclick: () => pickForTraining() }, icon('plus'), 'מהסרטונים'),
      el('button.btn', { type: 'button', onclick: () => {
        const plan = ensurePlan();
        s = plan;
        editDrill(plan, drillFrom(null), true, save);
      } }, icon('plus'), 'תרגיל בלי סרטון'));
  }

  function empty() {
    root.appendChild(pageHead('watch', 'האימון הקרוב', viewer ? 'המאמן עוד לא בנה אימון' : 'בוחרים תרגילים מהסרטונים, או מוסיפים תרגיל בלי סרטון'));
    if (!viewer) {
      root.appendChild(addButtons());
      const last = journal()[0];
      if (last) {
        root.appendChild(el('button.btn', { type: 'button', onclick: () => { duplicate(last); syncNow(); paint(); } },
          icon('sync'), 'לבנות מהאימון האחרון — ' + titleOf(last)));
      }
    }
    root.appendChild(el('a.btn.quiet', { href: '#/v/h' }, icon('cup'), 'יומן האימונים'));
  }

  function drillRow(d) {
    const v = d.video ? getVideo(d.video) : null;
    const r = el('div.mr.drill', { 'data-id': d.id });
    const grip = el('button.grip', { type: 'button', 'aria-label': 'גרירה לשינוי הסדר' }, icon('grip'));
    if (viewer) grip.style.visibility = 'hidden'; else wireDrag(grip, r);
    const thumb = v ? videoThumb(v) : el('div.pv.none', null, icon(d.kind === 'challenge' ? 'cup' : 'watch'));
    thumb.classList.add('dthumb');
    if (v) {
      const play = el('button.dplay', { type: 'button', 'aria-label': 'צפייה בסרטון', onclick: () => openVideo(v.id) }, thumb);
      r.append(grip, play);
    } else r.append(grip, thumb);
    const lost = d.video && !v;
    const sub = d.note || (lost ? 'הסרטון נמחק מהספרייה' : '');
    const body = el('button.dbody', { type: 'button', disabled: viewer, onclick: () => editDrill(s, d, false, save) },
      el('b', { text: nameOf(d) }), sub ? el('small', { text: sub }) : null);
    r.append(body, el('span.meas.num', { text: measure(d) }));
    return r;
  }

  /* גרירה באצבע על הנקודות — כמו בקטגוריות (vcats.js) */
  function wireDrag(grip, r) {
    grip.onpointerdown = e => {
      if (e.button) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const startY = e.clientY;
      const startTop = r.offsetTop;
      r.classList.add('dragging');
      const siblings = () => [...r.parentNode.querySelectorAll('.mr[data-id]')];
      const move = ev => {
        const all = siblings();
        const i = all.indexOf(r);
        const prev = all[i - 1];
        const next = all[i + 1];
        if (prev) { const b = prev.getBoundingClientRect(); if (ev.clientY < b.top + b.height / 2) r.parentNode.insertBefore(r, prev); }
        if (next) { const b = next.getBoundingClientRect(); if (ev.clientY > b.top + b.height / 2) r.parentNode.insertBefore(next, r); }
        r.style.transform = 'translateY(' + (ev.clientY - startY - (r.offsetTop - startTop)) + 'px)';
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        r.classList.remove('dragging');
        r.style.transform = '';
        const ids = siblings().map(x => x.dataset.id);
        if (ids.join() !== s.drills.map(d => d.id).join()) {
          s.drills = ids.map(id => s.drills.find(d => d.id === id)).filter(Boolean);
          save(true);
        }
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    };
  }

  posterUrlsReady().then(() => { if (root.isConnected && !root.hidden) paint(); });
  paint();
  const off = onSync(ch => { if (ch && !root.hidden && !document.querySelector('.sheet.on, .live')) paint(); });
  return { destroy() { off(); root.textContent = ''; } };
}

/* --- עריכת תרגיל ---
   על עותק, שנכנס לאימון רק ב"שמירה" — כך סגירה בלי שמירה לא משנה כלום. */

function stepper(label, get, set, opts, after) {
  const val = el('b.num');
  const paintVal = () => { val.textContent = opts.fmt ? opts.fmt(get()) : String(get()); };
  const bump = dir => {
    set(Math.min(opts.max, Math.max(opts.min, get() + dir * opts.step)));
    paintVal();
    after();
  };
  paintVal();
  return el('div.stp', null, el('span', { text: label }), el('div.ctl', null,
    el('button', { type: 'button', 'aria-label': label + ' — פחות', onclick: () => bump(-1) }, '−'),
    val,
    el('button', { type: 'button', 'aria-label': label + ' — יותר', onclick: () => bump(1) }, '+')));
}

const secs = n => n + ' שנ׳';

function editDrill(s, d, isNew, done) {
  const v = d.video ? getVideo(d.video) : null;
  const w = Object.assign({}, d);
  sheet(isNew ? 'תרגיל חדש' : 'עריכת תרגיל', (body, close) => {
    const form = el('div.stack.dform');
    const name = el('input.inp', { type: 'text', id: 'd-title', placeholder: v ? v.title : 'למשל חימום, מים, משחק 1 על 1' });
    name.value = w.title || '';
    form.appendChild(el('label.dlabel', null, el('span', { text: 'שם' }), name));
    if (v) {
      form.appendChild(el('div.dvid', null, videoThumb(v), el('div.tx', null, el('b', { text: v.title }), el('small', { text: platformName(v.platform) })),
        el('button.btn.sm', { type: 'button', onclick: () => openVideo(v.id) }, icon('play'), 'צפייה')));
    }
    const kinds = el('div.kinds', { role: 'group', 'aria-label': 'איך מודדים' });
    const fields = el('div.dfields');
    const total = el('p.dtotal');
    const paintTotal = () => {
      const t = plannedSecs(w);
      total.textContent = w.kind === 'reps' ? 'בלי טיימר — מסמנים כל סט' : t ? 'זמן: ' + clock(t) : 'בלי טיימר — סופרים עד שמסיימים';
    };
    const paintKind = () => {
      kinds.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === w.kind)));
      fields.textContent = '';
      const st = (label, key, o) => stepper(label, () => w[key], x => { w[key] = x; }, o, paintTotal);
      if (w.kind === 'time') fields.append(st('דקות', 'minutes', { min: 1, max: 90, step: 1 }));
      if (w.kind === 'interval') fields.append(
        st('עבודה', 'work', { min: 5, max: 600, step: 5, fmt: secs }),
        st('מנוחה', 'rest', { min: 0, max: 600, step: 5, fmt: secs }),
        st('סבבים', 'rounds', { min: 1, max: 40, step: 1 }));
      if (w.kind === 'reps') fields.append(st('סטים', 'sets', { min: 1, max: 10, step: 1 }), st('חזרות בסט', 'reps', { min: 1, max: 200, step: 1 }));
      if (w.kind === 'challenge') {
        const unit = el('input.inp', { type: 'text', id: 'd-unit', placeholder: 'מה סופרים — למשל קפיצות, מסירות' });
        unit.value = w.unit || '';
        unit.oninput = () => { w.unit = unit.value.trim(); };
        fields.append(el('label.dlabel', null, el('span', { text: 'מה סופרים' }), unit),
          st('זמן מוגבל', 'limit', { min: 0, max: 600, step: 10, fmt: x => x ? secs(x) : 'בלי' }));
      }
      paintTotal();
    };
    KINDS.forEach(([k, label]) => kinds.appendChild(el('button', { type: 'button', 'data-k': k, text: label, onclick: () => { w.kind = k; paintKind(); } })));
    paintKind();
    form.append(kinds, fields, total);
    const note = el('textarea.inp', { id: 'd-note', rows: 3, placeholder: 'הערה לאימון הזה — מופיעה גדול במגרש. למשל: רק רגל שמאל' });
    note.value = w.note || '';
    form.appendChild(el('label.dlabel', null, el('span', { text: 'הערה' }), note));
    form.appendChild(el('button.btn.gold.wide', { type: 'button', text: 'שמירה', onclick: () => {
      w.title = name.value.trim() || (v ? v.title : 'תרגיל');
      w.note = note.value.trim();
      Object.assign(d, w);
      if (isNew) s.drills.push(d);
      close();
      done(true);
    } }));
    if (!isNew) {
      const del = el('button.btn.quiet', { type: 'button', text: 'הוצאה מהאימון' });
      del.onclick = () => {
        if (!del.classList.contains('sure')) { del.classList.add('sure'); del.textContent = 'להוציא את "' + nameOf(d, 'התרגיל') + '"? לחיצה נוספת'; return; }
        s.drills = s.drills.filter(x => x.id !== d.id);
        close();
        done(true);
      };
      form.appendChild(del);
    }
    body.appendChild(form);
  });
}

/* --- קול ---
   צפצוף מ-Web Audio. באייפון המתג השקט משתיק אותו, אלא אם הדף מצהיר שהוא
   מנגן (audioSession, מ-iOS 17). נפתח בלחיצה הראשונה במגרש — לפני לחיצה
   אסור לדף להשמיע. */

let audio = null;
function beep(freq, ms, when) {
  try {
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audio = new AC();
    }
    if (audio.state === 'suspended') audio.resume();
    const t0 = audio.currentTime + (when || 0);
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    o.connect(g);
    g.connect(audio.destination);
    o.start(t0);
    o.stop(t0 + ms / 1000 + 0.05);
  } catch (e) { /* בלי קול — הטיימר עדיין על המסך */ }
}
function unlockAudio() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* דפדפן ישן */ }
  beep(440, 1);
}
const sound = {
  tick: () => beep(880, 110),
  work: () => beep(1175, 480),
  rest: () => beep(587, 480),
  end: () => { beep(988, 200); beep(988, 200, 0.28); beep(1319, 520, 0.56); }
};

/* --- המסך דולק --- */
let wake = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } }
  catch (e) { /* לא הורשה — לא קריטי */ }
}
function letSleep() {
  try { if (wake) wake.release(); } catch (e) { /* כבר שוחרר */ }
  wake = null;
}

/* --- במגרש --- */

/** איפה התרגיל עומד אחרי secs שניות פעילות */
function phaseAt(d, secs) {
  const total = plannedSecs(d);
  if (d.kind === 'interval') {
    if (secs >= total) return { end: true };
    const cyc = d.work + d.rest;
    const r = Math.floor(secs / cyc);
    const inC = secs - r * cyc;
    const work = inC < d.work;
    return { round: r + 1, work, left: work ? d.work - inC : cyc - inC };
  }
  if (!total) return { open: true };
  if (secs >= total) return { end: true };
  return { left: total - secs };
}

function startLive(s, after) {
  if (readOnly() || !s.drills.length) return;
  // היומן מתעד מתי התאמנו, לא לאיזה יום תכננו — ומשם גם השם "אימון <יום>"
  if (!s.startedAt) { s.startedAt = Date.now(); s.date = today(); }
  s.endedAt = 0;
  if (typeof s.cur !== 'number' || s.cur >= s.drills.length) s.cur = Math.max(0, s.drills.findIndex(d => !d.done));
  putSession(s);

  const layer = el('div.live', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'אימון' });
  let running = false;
  let watching = false;
  let last = Date.now();
  let savedAt = 0;
  let timer = 0;
  let offKey = null;
  let finished = false;
  let refresh = null;

  const store = () => { putSession(s); savedAt = Date.now(); };
  const close = openLayer(() => {
    clearInterval(timer);
    if (offKey) offKey();
    document.removeEventListener('visibilitychange', onVis);
    running = false;
    store();
    syncNow();
    letSleep();
    layer.remove();
    if (after) after();
  });
  const onVis = () => { if (document.visibilityState === 'visible') { last = Date.now(); keepAwake(); } };
  document.addEventListener('visibilitychange', onVis);
  offKey = onEscape(() => close());
  keepAwake();

  const totalEl = el('b.ltotal.num');
  const countEl = el('span.lcount.num');
  const prog = el('div.lprog');
  const main = el('div.lmain');
  const foot = el('div.lfoot');
  const top = el('div.ltop', null,
    el('button.lx', { type: 'button', 'aria-label': 'יציאה — אפשר להמשיך אחר כך', onclick: () => close() }, icon('x'), 'יציאה'),
    el('span.ltlabel', null, 'זמן האימון ', totalEl), countEl);
  layer.append(top, prog, main, foot);
  document.body.appendChild(layer);

  const cur = () => s.drills[s.cur];
  const paintTotal = () => { totalEl.textContent = clock((Date.now() - s.startedAt) / 1000); };

  function paint() {
    if (finished) return;
    paintTotal();
    const d = cur();
    countEl.textContent = (s.cur + 1) + ' / ' + s.drills.length;
    prog.textContent = '';
    s.drills.forEach((x, i) => {
      const seg = el('button', { type: 'button', 'aria-label': 'תרגיל ' + (i + 1) + ': ' + nameOf(x, ''), onclick: () => go(i) });
      seg.className = x.done ? 'done' : (i === s.cur ? 'now' : '');
      prog.appendChild(seg);
    });
    main.textContent = '';
    refresh = null;
    const v = d.video ? getVideo(d.video) : null;
    main.appendChild(el('h2.ltitle', { text: nameOf(d) }));
    if (v) {
      main.appendChild(el('button.card.lvid', { type: 'button', onclick: () => watch(v) }, videoThumb(v),
        el('span', null, el('b', null, icon('play'), ' צפייה בסרטון'), el('small', { text: 'טיימר התרגיל עוצר בזמן הצפייה' }))));
    }
    main.appendChild(kindBody(d));
    const cue = d.note || (v && v.note) || '';
    if (cue) main.appendChild(el('p.lcue', { text: cue }));
    paintFoot();
  }

  function kindBody(d) {
    if (d.kind === 'reps') return repsBody(d);
    if (d.kind === 'challenge') return challengeBody(d);
    return timerBody(d);
  }

  /* זמן ועבודה/מנוחה: שעון גדול בטבעת, ▶/❚❚ אחד גדול. refresh מעדכן רק את
     השעון והטבעת — בלי לבנות את המסך מחדש בכל רבע שנייה (התמונה הבהבה) */
  function timerBody(d) {
    const box = el('div.ltimer');
    const C = 2 * Math.PI * 45;
    const ring = el('div.tring');
    ring.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="bg" cx="50" cy="50" r="45"/><circle class="fg" cx="50" cy="50" r="45" stroke-dasharray="' + C.toFixed(1) + '"/></svg>';
    const fg = ring.querySelector('.fg');
    const phase = el('span.tphase');
    const big = el('b.tbig.num');
    const rnd = el('span.rnd.num');
    ring.appendChild(el('div.rin', null, phase, big, rnd));
    refresh = () => {
      const ph = phaseAt(d, d.secs || 0);
      const left = ph.end ? 0 : ph.left;
      const part = d.kind === 'interval' && !ph.end ? (ph.work ? d.work : d.rest) : plannedSecs(d);
      const frac = ph.end ? 1 : 1 - left / part;
      fg.setAttribute('stroke-dashoffset', (C * (1 - frac)).toFixed(1));
      ring.classList.toggle('rest', d.kind === 'interval' && !ph.end && !ph.work);
      phase.textContent = ph.end ? 'הסתיים' : d.kind === 'interval' ? (ph.work ? 'עבודה' : 'מנוחה') : (running ? 'רץ' : (d.secs ? 'בהפסקה' : 'מוכן'));
      big.textContent = clock(ph.end ? 0 : Math.ceil(left));
      rnd.textContent = d.kind === 'interval' && !ph.end ? 'סבב ' + ph.round + ' מתוך ' + d.rounds : '';
    };
    refresh();
    box.appendChild(ring);
    if (!phaseAt(d, d.secs || 0).end) {
      box.appendChild(el('div.lctrl', null,
        el('button.lbig', { type: 'button', 'aria-label': running ? 'עצירה' : 'התחלה', onclick: toggleRun }, icon(running ? 'pause' : 'play')),
        d.secs ? el('button.btn.quiet.sm', { type: 'button', text: 'מההתחלה', onclick: () => { d.secs = 0; running = false; store(); paint(); } }) : null));
    }
    return box;
  }

  /* חזרות: סט אחרי סט, כפתור ענק — אפשר ללחוץ גם עם כדור ביד השנייה */
  function repsBody(d) {
    const box = el('div.lreps');
    const doneSets = d.setsDone || 0;
    const dots = el('div.ldots');
    for (let i = 0; i < d.sets; i++) dots.appendChild(el('i' + (i < doneSets ? '.on' : '')));
    box.append(el('b.tbig.num', { text: doneSets >= d.sets ? 'כל הסטים' : 'סט ' + (doneSets + 1) + ' מתוך ' + d.sets }),
      el('span.lsub.num', { text: d.reps + ' חזרות בכל סט' }), dots);
    if (doneSets < d.sets) {
      box.appendChild(el('button.lhuge', { type: 'button', onclick: () => {
        d.setsDone = doneSets + 1;
        if (!running) startRun();
        if (d.setsDone >= d.sets) { sound.end(); finishDrill(); return; }
        sound.tick();
        store();
        paint();
      } }, icon('check'), 'סט הושלם'));
      if (doneSets) box.appendChild(el('button.btn.quiet.sm', { type: 'button', text: 'ביטול הסט האחרון', onclick: () => { d.setsDone = doneSets - 1; store(); paint(); } }));
    }
    return box;
  }

  /* אתגר: ספירה בכפתור ענק, או הקלדה בסוף כשהידיים היו עסוקות; השיא הקודם
     על המסך, וחגיגה כששוברים אותו */
  function challengeBody(d) {
    const box = el('div.lchal');
    const best = records(s.id).get(recKey(d));
    const n = d.result || 0;
    const line = el('div.lbest');
    if (best) line.append(el('span', null, 'השיא: ', el('b.num', { text: String(best.value) })));
    else line.append(el('span', { text: 'עוד אין שיא — זה יהיה הראשון' }));
    if (best && n > best.value) line.append(el('span.badge', { text: 'שיא חדש!' }));
    box.appendChild(line);
    if (d.limit) {
      const ph = phaseAt(d, d.secs || 0);
      const t = el('b.num');
      refresh = () => { const p2 = phaseAt(d, d.secs || 0); t.textContent = clock(p2.end ? 0 : Math.ceil(p2.left)); };
      refresh();
      box.appendChild(el('div.lclock', null, t,
        ph.end ? el('span', { text: 'הזמן נגמר' }) : el('button.lsmall', { type: 'button', 'aria-label': running ? 'עצירה' : 'התחלה', onclick: toggleRun }, icon(running ? 'pause' : 'play'))));
    }
    box.append(el('b.tcount.num', { text: String(n) }), el('span.lsub', { text: d.unit || 'פעמים' }));
    const set = x => {
      const before = d.result || 0;
      d.result = Math.max(0, x);
      if (best && before <= best.value && d.result > best.value) sound.end();
      store();
      paint();
    };
    box.appendChild(el('button.lplus', { type: 'button', dir: 'ltr', 'aria-label': 'עוד אחד', onclick: () => { if (d.limit && !running && !d.secs) startRun(); set(n + 1); } }, '+1'));
    const typed = el('input.inp.ltype.num', { type: 'number', inputmode: 'numeric', min: '0', id: 'l-type', placeholder: 'הקלדה' });
    typed.onchange = () => { const x = parseInt(typed.value, 10); if (!isNaN(x)) set(x); };
    box.appendChild(el('div.lrow', null, el('button.btn.sm', { type: 'button', dir: 'ltr', 'aria-label': 'אחד פחות', onclick: () => set(n - 1) }, '−1'), typed));
    return box;
  }

  function paintFoot() {
    foot.textContent = '';
    const d = cur();
    const next = s.drills[s.cur + 1];
    const info = el('div.lnext', null,
      el('small', { text: next ? 'הבא' : 'זה התרגיל האחרון' }),
      next ? el('b', null, nameOf(next) + ' · ', el('span.num', { text: measure(next) })) : null);
    const lastOne = !next;
    const btn = el('button.btn' + (d.done || lastOne ? '.gold' : ''), { type: 'button', onclick: () => {
      if (!d.done) finishDrill(true); else if (lastOne) finishSession(); else go(s.cur + 1);
    } }, d.done ? (lastOne ? 'סיום האימון' : 'לתרגיל הבא') : 'סיימנו', icon(d.done && !lastOne ? 'next' : 'check'));
    foot.append(info, btn);
  }

  function toggleRun() {
    unlockAudio();
    if (running) { running = false; store(); paint(); return; }
    startRun();
    paint();
  }
  function startRun() {
    unlockAudio();
    running = true;
    last = Date.now();
  }

  /* "סיימנו" — נגיעה אחת מסמנת ועוברת לתרגיל הבא (הידיים עסוקות). תרגיל
     שנגמר לבד נשאר על המסך עם "לתרגיל הבא", כי אולי אף אחד לא הסתכל */
  function finishDrill(manual) {
    const d = cur();
    running = false;
    d.done = true;
    store();
    if (manual) {
      if (s.drills[s.cur + 1]) go(s.cur + 1); else finishSession();
      return;
    }
    paint();
  }

  function go(i) {
    if (i < 0 || i >= s.drills.length) return;
    running = false;
    s.cur = i;
    store();
    paint();
  }

  /* הסרטון: טיימר התרגיל עוצר, הכולל ממשיך. סגירת הנגן מחזירה לכאן */
  function watch(v) {
    watching = true;
    openVideo(v.id, () => { watching = false; last = Date.now(); paint(); });
  }

  function advance(dt) {
    const d = cur();
    if (d.done) { running = false; return; }
    const before = phaseAt(d, d.secs || 0);
    d.secs = (d.secs || 0) + dt;
    const now = phaseAt(d, d.secs);
    if (now.end && !before.end) {
      sound.end();
      finishDrill(false);
      return;
    }
    if (d.kind === 'interval' && (now.work !== before.work || now.round !== before.round)) {
      if (now.work) sound.work(); else sound.rest();
    } else if (!now.open && !before.open && Math.ceil(now.left) !== Math.ceil(before.left) && Math.ceil(now.left) <= 3) {
      sound.tick();
    }
  }

  function tick() {
    const t = Date.now();
    const dt = (t - last) / 1000;
    last = t;
    paintTotal();
    if (!running || watching || finished) return;
    const was = cur().done;
    advance(dt);
    if (finished) return;
    /* מעבר מצב (נגמר) — ציור מלא; אחרת רק השעון */
    if (cur().done !== was) paint();
    else if (refresh) refresh();
    if (Date.now() - savedAt > 5000) store();
  }

  function finishSession() {
    finished = true;
    running = false;
    clearInterval(timer);
    s.endedAt = Date.now();
    s.totalSecs = Math.round((s.endedAt - s.startedAt) / 1000);
    store();
    summary(s, layer, close);
  }

  paint();
  timer = setInterval(tick, 250);
}

/* --- הסיכום, ושורות התוצאה (גם ביומן) --- */

function resultText(d) {
  if (!d.done) return 'לא נעשה';
  if (d.kind === 'reps') return (d.setsDone || 0) + ' מתוך ' + d.sets + ' סטים';
  if (d.kind === 'challenge') return (d.result || 0) + ' ' + (d.unit || 'פעמים');
  // "סיימנו" בלי להפעיל את הטיימר (החימום נעשה בצד) — 0:00 נראה כמו כישלון
  return d.secs >= 1 ? clock(d.secs) : 'בוצע';
}

/** ציון 1–5 והערה לכל תרגיל. editable — רק אצל המאמן */
function resultRows(s, editable, changed) {
  const list = el('div.card.rows.results');
  const before = records(s.id);
  s.drills.forEach(d => {
    const row = el('div.res');
    const best = d.kind === 'challenge' ? before.get(recKey(d)) : null;
    const isRecord = d.kind === 'challenge' && d.done && typeof d.result === 'number' && d.result > 0 && (!best || d.result > best.value);
    row.appendChild(el('div.rhead', null,
      el('b', { text: nameOf(d) }),
      el('span.rval.num' + (d.done ? '' : '.miss'), { text: resultText(d) }),
      isRecord ? el('span.badge', { text: 'שיא' }) : null));
    const score = el('div.score', { role: 'group', 'aria-label': 'ציון' });
    for (let i = 1; i <= 5; i++) {
      const b = el('button.num', { type: 'button', text: String(i), 'aria-pressed': String(d.score === i), disabled: !editable, 'aria-label': 'ציון ' + i });
      if (editable) b.onclick = () => { d.score = d.score === i ? null : i; score.querySelectorAll('button').forEach((x, j) => x.setAttribute('aria-pressed', String(d.score === j + 1))); changed(); };
      score.appendChild(b);
    }
    row.appendChild(score);
    if (editable) {
      const c = el('input.inp.rcomment', { type: 'text', id: 'r-' + d.id, placeholder: 'הערה על התרגיל' });
      c.value = d.comment || '';
      c.onchange = () => { d.comment = c.value.trim(); changed(); };
      row.appendChild(c);
    } else if (d.comment) {
      row.appendChild(el('p.rcomment', { text: d.comment }));
    }
    list.appendChild(row);
  });
  return list;
}

function newRecords(s) {
  const before = records(s.id);
  return s.drills.filter(d => d.kind === 'challenge' && d.done && typeof d.result === 'number' && d.result > 0)
    .map(d => ({ d, was: before.get(recKey(d)) }))
    .filter(x => !x.was || x.d.result > x.was.value);
}

function summary(s, layer, close) {
  layer.textContent = '';
  layer.classList.add('sum');
  const done = s.drills.filter(d => d.done).length;
  const wrap = el('div.lsum');
  wrap.append(el('h2.done-h', { text: 'כל הכבוד!' }),
    el('p.done-p.num', { text: done + ' מתוך ' + s.drills.length + ' תרגילים · ' + clock(s.totalSecs) }));
  newRecords(s).forEach(x => wrap.appendChild(el('div.card.rec', null, icon('cup'),
    el('b', null, 'שיא חדש: ' + nameOf(x.d, 'אתגר') + ' ', el('span.num', { text: String(x.d.result) }), x.was ? ' (היה ' + x.was.value + ')' : ''))));
  wrap.appendChild(el('p.hint.left', { text: 'ציון 1–5 והערה לכל תרגיל — יופיעו ביומן, גם אצל הבן.' }));
  const store = () => putSession(s);
  wrap.appendChild(resultRows(s, true, store));
  const note = el('textarea.inp', { id: 's-note', rows: 3, placeholder: 'הערה כללית — מה היה טוב, ומה לשפר בפעם הבאה' });
  note.value = s.note || '';
  note.onchange = () => { s.note = note.value.trim(); store(); };
  wrap.appendChild(note);
  const keep = next => {
    s.note = note.value.trim();
    s.status = 'done';
    putSession(s);
    if (next) duplicate(s);
    syncNow();
    close();
    toast(next ? 'נשמר ביומן — והאימון הבא מוכן לעריכה' : 'האימון נשמר ביומן');
    /* סגירת השכבה שולחת "חזרה" אסינכרונית — ניווט מיד אחריה היה מתבטל */
    afterLayers(() => { location.hash = next ? '#/v/a' : '#/v/h/' + s.id; });
  };
  wrap.appendChild(el('div.two', null,
    el('button.btn', { type: 'button', text: 'שמירה ביומן', onclick: () => keep(false) }),
    el('button.btn.gold', { type: 'button', text: 'שמירה ולשבוע הבא', onclick: () => keep(true) })));
  layer.appendChild(wrap);
  layer.scrollTop = 0;
}

/** הסיכום בלבד — לאימון שנגמר ועוד לא נשמר ביומן */
function openSummary(s, after) {
  const layer = el('div.live.sum', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'סיכום האימון' });
  let offKey = null;
  const close = openLayer(() => { if (offKey) offKey(); putSession(s); syncNow(); layer.remove(); if (after) after(); });
  offKey = onEscape(() => close());
  document.body.appendChild(layer);
  summary(s, layer, close);
}

/* --- היומן --- */

function avgScore(s) {
  const xs = s.drills.map(d => d.score).filter(Boolean);
  return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '';
}

/** #/v/h ו-#/v/h/<אימון> */
export function mountJournal(root, id) {
  reload();
  const viewer = readOnly();

  function list() {
    document.title = 'יומן האימונים — תשיעיות';
    root.textContent = '';
    root.appendChild(el('a.back', { href: '#/v' }, icon('back'), 'חזרה לסרטונים'));
    const all = journal();
    root.appendChild(pageHead('cup', 'יומן האימונים', all.length ? all.length + (all.length === 1 ? ' אימון' : ' אימונים') : 'עוד אין אימונים ביומן'));
    const recs = [...records(null).values()].sort((a, b) => b.at - a.at);
    if (recs.length) {
      root.appendChild(el('h2.section-title', { text: 'שיאים' }));
      const box = el('div.card.rows');
      recs.forEach(r => box.appendChild(el('div.mr.recrow', null, el('span.name', { text: r.title || 'אתגר' }),
        el('b.num', { text: r.value + (r.unit ? ' ' + r.unit : '') }), el('span.n', { text: new Date(r.at).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) }))));
      root.appendChild(box);
    }
    if (all.length) {
      root.appendChild(el('h2.section-title', { text: 'אימונים' }));
      const box = el('div.card.rows');
      all.forEach(s => {
        const done = s.drills.filter(d => d.done).length;
        const avg = avgScore(s);
        box.appendChild(el('a.mr.jrow', { href: '#/v/h/' + s.id },
          el('span.jdate.num', { text: shortDate(s.date) || new Date(s.endedAt || s.at).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) }),
          el('span.name', null, el('b', { text: titleOf(s) }),
            el('small.num', { text: [done + ' תרגילים', s.totalSecs ? clock(s.totalSecs) : '', avg ? 'ציון ' + avg : ''].filter(Boolean).join(' · ') })),
          icon('back')));
      });
      root.appendChild(box);
    } else {
      root.appendChild(el('p.hint', { text: viewer ? 'כשהמאמן יסיים אימון, הסיכום שלו יופיע כאן.' : 'אחרי אימון, "שמירה ביומן" מביאה אותו לכאן.' }));
    }
    if (!viewer) root.appendChild(el('a.btn.quiet', { href: '#/v/a' }, icon('watch'), 'האימון הקרוב'));
  }

  function detail(s) {
    document.title = titleOf(s) + ' — תשיעיות';
    root.textContent = '';
    root.appendChild(el('a.back', { href: '#/v/h' }, icon('back'), 'יומן האימונים'));
    const done = s.drills.filter(d => d.done).length;
    root.appendChild(pageHead('cup', titleOf(s), [shortDate(s.date), done + ' מתוך ' + s.drills.length + ' תרגילים', s.totalSecs ? clock(s.totalSecs) : ''].filter(Boolean).join(' · ')));
    if (s.goal) root.appendChild(el('p.plan-goal', null, el('b', { text: 'מטרה: ' }), s.goal));
    const store = () => { putSession(s); syncNow(); };
    root.appendChild(resultRows(s, !viewer, store));
    if (viewer) {
      if (s.note) root.appendChild(el('div.card.jnote', null, el('b', { text: 'הערה כללית' }), el('p', { text: s.note })));
      return;
    }
    const note = el('textarea.inp', { id: 'j-note', rows: 3, placeholder: 'הערה כללית' });
    note.value = s.note || '';
    note.onchange = () => { s.note = note.value.trim(); store(); };
    root.appendChild(note);
    const build = el('button.btn.gold', { type: 'button' }, icon('sync'), el('span', { text: 'לבנות את האימון הקרוב מזה' }));
    build.onclick = () => {
      const plan = upcoming();
      /* יש כבר אימון קרוב עם תרגילים — לא מחליפים אותו בלחיצה אחת */
      if (plan && plan.drills.length && !build.classList.contains('sure')) {
        build.classList.add('sure');
        build.lastChild.textContent = 'להחליף את "' + titleOf(plan) + '"? לחיצה נוספת';
        return;
      }
      duplicate(s);
      syncNow();
      location.hash = '#/v/a';
    };
    root.appendChild(build);
    const del = el('button.btn.quiet.sm', { type: 'button', text: 'מחיקה מהיומן' });
    del.onclick = () => {
      if (!del.classList.contains('sure')) { del.classList.add('sure'); del.textContent = 'למחוק את האימון מהיומן? לחיצה נוספת'; return; }
      removeSession(s.id);
      syncNow();
      toast('נמחק מהיומן');
      location.hash = '#/v/h';
    };
    root.appendChild(del);
  }

  const paint = () => {
    const s = id ? getSession(id) : null;
    if (id && s && s.status === 'done') detail(s);
    else list();
  };
  paint();
  const off = onSync(ch => { if (ch && !root.hidden && !root.contains(document.activeElement)) paint(); });
  /* הבן פותח את האפליקציה ישר ליומן, או חוזר אליה אחרי האימון — בלי משיכה
     כאן הוא רואה את מה שהיה בפעם הקודמת שנכנס לסרטונים */
  syncNow();
  const onVisible = () => { if (document.visibilityState === 'visible' && !root.hidden) syncNow(); };
  document.addEventListener('visibilitychange', onVisible);
  return { destroy() { off(); document.removeEventListener('visibilitychange', onVisible); root.textContent = ''; } };
}
