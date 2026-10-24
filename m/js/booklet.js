/* מסך חוברת — מסך אחד שבו המגרש וההנחיות יחד.

   היה כאן דף נגלל: כותרת, פס התקדמות, צ'יפים, מגרש, ומתחתיו הטקסט. מי
   שקרא את ההנחיות לא ראה את המגרש, ומי שהריץ את התנועה לא ראה את ההנחיות.
   עכשיו המסך ממלא את הטלפון: כותרת, מגרש, שורת שליטה, וההנחיות ככרטיסים
   (או כרשימה, כשמושכים את הידית). כל השאר — רשימת התרחישים, ההתקדמות,
   הצד — נפתח בלחיצה על שם התרחיש. */

import { buildPitch, createPitch, mirrorScenario, mirrorRole, mirrorText } from './pitch.js';
import { isLearned, toggleLearned, learnedCount, resetBooklet, setLast, isMirrored, setMirrored } from './store.js';
import { createGlossary } from './terms.js';
import { mountBoard } from './board.js';
import { sheet, afterLayers } from './ui.js';

const $ = id => document.getElementById(id);
const make = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/**
 * @param {object} booklet   החוברת מ-content/
 * @param {object} formation מיקומי ברירת מחדל
 * @param {string|null} startId  מזהה התרחיש לפתיחה
 * @param {(id:string)=>void} onScenario  נקרא בכל מעבר תרחיש, לעדכון הכתובת
 * @param {Object<string,string>} [terms]  מילון המונחים מ-booklets.json
 * @returns {{go:Function, destroy:Function}}
 */
export function mountBooklet(booklet, formation, startId, onScenario, terms) {
  const S = booklet.scenarios;
  const ids = S.map(s => s.id);
  const listeners = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    listeners.push([target, type, fn, opts]);
  };

  /* תרחיש בודד שהגיע בקישור שיתוף: בלי רשימה, ניווט והתקדמות */
  const solo = !!booklet.solo;
  const root = $('booklet');
  root.classList.toggle('solo', solo);
  $('b-nav').hidden = solo;
  $('b-ttl').disabled = solo;

  /* בשיקוף, תפקיד אגף הופך לתפקיד האגף השני: גם המספר המודגש וגם השם.
     titleB הוא עקיפה ידנית; בלעדיו מספיקה החלפת מילות הצד. */
  const hero = () => (isMirrored() ? mirrorRole(formation, booklet.role) : booklet.role);
  const flip = t => (isMirrored() ? mirrorText(t) : t);
  const heroTitle = () => (isMirrored() && booklet.titleB ? booklet.titleB : flip(booklet.title));
  /** התרחיש כפי שהוא מוצג — משוקף אם צריך. גם הטקסט מגיע מהעותק
      המשוקף, אחרת ההסבר מדבר על צד אחד בזמן שהמגרש מראה את השני */
  const shown = i => (isMirrored() ? mirrorScenario(S[i], formation) : S[i]);

  /* --- מגרש והרצה --- */
  const stage = $('board');
  const svg = buildPitch();
  svg.id = 'pitch';
  stage.prepend(svg);
  const pitch = createPitch(svg, formation, booklet.role);
  const legend = make('div', 'legend');
  const player = mountBoard(stage, pitch, { hero, ctl: $('b-ctl'), legend });

  /* --- מילון המונחים ---
     ההופעה הראשונה של מונח בכל תרחיש הופכת לכפתור הסבר. הכרטיסים
     והרשימה מציגים את אותו טקסט, ולכן כל אחד מהם מתחיל ספירה משלו. */
  const glossary = createGlossary(terms);
  const guide = $('guide');
  let openTerm = null;

  function closeTerm() {
    const box = guide.querySelector('.termdef');
    if (box) box.remove();
    if (openTerm) openTerm.setAttribute('aria-expanded', 'false');
    openTerm = null;
  }

  on(guide, 'click', e => {
    const b = e.target.closest('.term');
    if (!b) return;
    const wasOpen = b === openTerm;
    closeTerm();
    if (wasOpen) return;
    const text = glossary.define(b.dataset.term);
    if (!text) return;
    const box = make('p', 'termdef', text);
    /* ההסבר יושב מתחת לפסקה שבה המונח — בתוך הכרטיס או פריט הרשימה,
       ולא מעל השורה, כדי שהטקסט שהילד קורא לא יזוז לו מתחת לאצבע */
    const block = b.closest('li, .card, .g-title, .sub, .mis') || b;
    if (block.matches('li, .card, .mis')) block.appendChild(box);
    else block.after(box);
    b.setAttribute('aria-expanded', 'true');
    openTerm = b;
  });

  /* --- ההנחיות: כרטיסים, או הכול ברשימה --- */
  const cards = $('g-cards'), dots = $('g-dots'), list = $('g-list');
  const handle = $('g-handle');
  let open = false;
  /* לרוחב (טלפון מסובב, טאבלט, מחשב) ההנחיות כבר לצד המגרש, כרשימה, ולא
     גוזלות ממנו מקום — אז אין סיבה שהמצלמה תתמקד. אותו תנאי כמו ב-CSS */
  const wide = window.matchMedia('(min-aspect-ratio: 1/1) and (min-width: 560px)');
  const roomy = () => open && !wide.matches;
  on(wide, 'change', () => player.setRoom(roomy()));

  function paintHandle() {
    handle.setAttribute('aria-expanded', open);
    $('g-handle-t').innerHTML = open
      ? '<svg class="i"><use href="#i-down"/></svg> חזרה לכרטיסים'
      : '<svg class="i"><use href="#i-up"/></svg> כל ההנחיות';
  }
  function setOpen(v) {
    if (v === open) return;
    open = v;
    closeTerm();
    root.classList.toggle('open', v);
    player.setRoom(roomy());
    paintHandle();
    if (!v) requestAnimationFrame(() => toCard(current(), false));
  }
  /* הידית: נגיעה מחליפה, משיכה למעלה פותחת, משיכה למטה סוגרת */
  let hy = null;
  on(handle, 'pointerdown', e => { hy = e.clientY; handle.setPointerCapture(e.pointerId); });
  on(handle, 'pointerup', e => {
    if (hy == null) return;
    const dy = e.clientY - hy;
    hy = null;
    setOpen(dy < -20 ? true : dy > 20 ? false : !open);
  });
  on(handle, 'pointercancel', () => { hy = null; });
  on(handle, 'keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); }
  });

  /* כרטיס אחד בכל פעם. בכיוון ימין-לשמאל scrollLeft שלילי כשגוללים שמאלה */
  const stepW = () => (cards.firstElementChild ? cards.firstElementChild.offsetWidth + 8 : 1);
  const current = () => Math.round(Math.abs(cards.scrollLeft) / stepW());
  const reduce = () => window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  function toCard(i, smooth = true) {
    cards.scrollTo({ left: -i * stepW(), behavior: smooth && !reduce() ? 'smooth' : 'auto' });
  }
  function paintDots() {
    const c = current();
    [...dots.children].forEach((d, j) => d.setAttribute('aria-current', j === c));
  }
  let dotRaf = 0;
  on(cards, 'scroll', () => { cancelAnimationFrame(dotRaf); dotRaf = requestAnimationFrame(paintDots); });

  function learnButton() {
    const b = make('button', 'learn');
    b.type = 'button';
    return b;
  }

  /* --- ציור תרחיש --- */
  let idx = 0;

  function paintLearned() {
    const done = isLearned(booklet.id, ids[idx]);
    guide.querySelectorAll('.learn').forEach(b => {
      b.setAttribute('aria-pressed', done);
      b.textContent = done ? '✓ למדתי את זה' : 'סמן שלמדתי את זה';
    });
    $('b-ok').hidden = !done || solo;
  }

  function render(i) {
    idx = i;
    const s = shown(i);
    closeTerm();
    pitch.setRole(hero());
    pitch.render(s);
    player.show(s);

    /* קורא מסך מקבל את התרחיש עצמו ולא "דיאגרמת מגרש" סתמית */
    svg.setAttribute('aria-label', s.title + '. ' + s.sub);
    document.title = s.title + ' · ' + heroTitle() + ' — תשיעיות';
    $('b-title').textContent = s.title;
    $('b-phase').textContent = s.phase;
    $('b-num').textContent = (i + 1) + '/' + S.length;
    $('b-ttl').setAttribute('aria-label', s.title + (solo ? '' : '. כל התרחישים ב' + heroTitle()));

    /* הכרטיסים: משפט הקו קודם — זה מה שנשאר בראש אחרי שבוע — ואז שורה
       אחת בכל כרטיס, והטעות הנפוצה בסוף, יחד עם "למדתי" */
    glossary.reset();
    cards.textContent = '';
    dots.textContent = '';
    const items = [{ k: 'cue', label: 'מה צועקים מהקו', text: s.cue, plain: true }]
      .concat(s.does.map((d, j) => ({ k: 'do', label: (j + 1) + ' מתוך ' + s.does.length, text: d })))
      .concat([{ k: 'mis', label: 'טעות נפוצה', text: s.mistake }]);
    items.forEach((c, j) => {
      const card = make('div', 'card k-' + c.k);
      const p = make('p');
      p.appendChild(c.plain ? document.createTextNode(c.text) : glossary.decorate(c.text));
      card.append(make('small', null, c.label), p);
      if (j === items.length - 1 && !solo) card.appendChild(learnButton());
      cards.appendChild(card);
      const d = make('button');
      d.type = 'button';
      d.setAttribute('aria-label', 'כרטיס ' + (j + 1) + ' מתוך ' + items.length);
      d.addEventListener('click', () => toCard(j));
      dots.appendChild(d);
    });
    toCard(0, false);
    paintDots();

    /* הרשימה: הכול בבת אחת. הכותרת קודמת לגוף, כי מונחים כמו "בלוק
       הגנתי" מופיעים רק בה — בלעדיה ההסבר שלהם לא היה נגיש משום מקום */
    glossary.reset();
    list.textContent = '';
    const h = make('h2', 'g-title');
    h.appendChild(glossary.decorate(s.title));
    const sub = make('p', 'sub');
    sub.appendChild(glossary.decorate(s.sub));
    const cue = make('div', 'cue');
    cue.append(make('small', null, 'מה צועקים מהקו'), make('span', null, s.cue));
    const ul = make('ul', 'does');
    s.does.forEach(d => { const li = make('li'); li.appendChild(glossary.decorate(d)); ul.appendChild(li); });
    const mis = make('div', 'mis');
    const misText = make('span');
    misText.appendChild(glossary.decorate(s.mistake));
    mis.append(make('small', null, 'טעות נפוצה'), misText);
    list.append(h, sub, cue, ul, mis);
    if (!solo) list.appendChild(learnButton());
    list.appendChild(legend);
    list.scrollTop = 0;

    paintLearned();
    setLast(booklet.id, s.id);
    if (onScenario) onScenario(s.id);
  }

  /* --- ניווט --- */
  const go = d => { if (!solo) render((idx + d + S.length) % S.length); };
  on($('next'), 'click', () => go(1));
  on($('prev'), 'click', () => go(-1));

  /* סימון "למדתי" עובר לבד לתרחיש הבא שעוד לא נלמד, אחרי רגע — הלחיצה
     הבאה של הילד היא ממילא "הבא". ביטול סימון נשאר במקום. */
  let advance = 0;
  on(guide, 'click', e => {
    if (!e.target.closest('.learn')) return;
    clearTimeout(advance);
    const was = isLearned(booklet.id, ids[idx]);
    toggleLearned(booklet.id, ids[idx]);
    paintLearned();
    if (was || solo) return;
    const at = idx;
    const next = ids.findIndex((id, j) => j > at && !isLearned(booklet.id, id));
    if (next > at) advance = setTimeout(() => { if (idx === at) render(next); }, 450);
  });

  /* החלקה על המגרש: בממשק ימין-לשמאל, החלקה ימינה מקדמת לתרחיש הבא */
  let sx = 0, sy = 0, tracking = false;
  on(stage, 'touchstart', e => {
    if (e.touches.length !== 1 || e.target.closest('button')) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
  }, { passive: true });
  on(stage, 'touchend', e => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy) * 1.6) go(dx > 0 ? 1 : -1);
  }, { passive: true });

  /* רווח מפעיל ועוצר, כמו בכל נגן — כשהמיקוד לא על כפתור או שדה.
     Esc סוגר את הרשימה ומחזיר לכרטיסים (גיליון פתוח נסגר בעצמו) */
  on(document, 'keydown', e => {
    if (e.key === 'Escape' && open && !document.querySelector('.sheet.on')) { setOpen(false); return; }
    if (e.key !== ' ' || (e.target.closest && e.target.closest('button, input, textarea, select, a, summary'))) return;
    e.preventDefault();
    player.toggle();
  });

  /* --- רשימת התרחישים: נפתחת מהשם ---
     מחליפה את מה שהיה בראש הדף: הצ'יפים, פס ההתקדמות, מתג הצד והמערך */
  function openPicker() {
    if (solo) return;
    player.pause();
    sheet(heroTitle(), (body, close) => {
      const top = make('div', 'pk-top');
      const count = make('p', 'pk-count');
      const track = make('div', 'track pk-track');
      track.setAttribute('aria-hidden', 'true');
      top.append(count, track);

      const side = booklet.side || { label: 'הצד של ה-' + booklet.role + ':', a: 'ימין', b: 'שמאל' };
      const sideRow = make('div', 'pk-side');
      const seg = make('span', 'seg');
      const hint = make('em');
      [['R', side.a], ['L', side.b]].forEach(([foot, label]) => {
        const b = make('button', null, label);
        b.type = 'button';
        b.dataset.foot = foot;
        b.addEventListener('click', () => {
          const want = foot === 'L';
          if (want === isMirrored()) return;
          setMirrored(want);
          render(idx);
          paint();
        });
        seg.appendChild(b);
      });
      sideRow.append(make('span', null, side.label), seg, hint);

      const ol = make('ol', 'pk-list');

      const formationBox = make('details', 'formation');
      const fsum = make('summary', null, booklet.formationNote ? booklet.formationNote.label : 'המערך');
      const ftext = make('p');
      formationBox.append(fsum, ftext);

      const reset = make('button', 'reset', 'אפס את הסימונים');
      reset.type = 'button';
      reset.addEventListener('click', () => { resetBooklet(booklet.id); paintLearned(); paint(); });

      body.append(top, sideRow, ol, formationBox, reset);

      function paint() {
        const hintA = side.hintA || ('מותאם ל' + side.a), hintB = side.hintB || ('מותאם ל' + side.b);
        count.textContent = 'למדתי ' + learnedCount(booklet.id) + ' מתוך ' + S.length;
        track.textContent = '';
        S.forEach((s, j) => {
          const i = make('i');
          i.className = j === idx ? 'here' : (isLearned(booklet.id, s.id) ? 'on' : '');
          track.appendChild(i);
        });
        seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', (b.dataset.foot === 'L') === isMirrored()));
        hint.textContent = isMirrored() ? hintB : hintA;
        ftext.textContent = booklet.formationNote ? flip(booklet.formationNote.text) : '';
        formationBox.hidden = !booklet.formationNote;
        const box = body.closest('.sheet');
        const h2 = box && box.querySelector('.sheet-head h2');
        if (h2) h2.textContent = heroTitle();

        ol.textContent = '';
        S.forEach((s0, j) => {
          const s = shown(j);
          const li = make('li');
          const b = make('button', 'pk-item');
          b.type = 'button';
          b.dataset.phase = s.phase;
          if (j === idx) b.setAttribute('aria-current', 'true');
          const done = isLearned(booklet.id, s0.id);
          const ok = make('span', 'ok' + (done ? '' : ' no'), '✓');
          ok.setAttribute('aria-label', done ? 'נלמד' : 'עוד לא נלמד');
          b.append(make('span', 'n', String(j + 1)), make('i', 'dot'), make('span', 't', s.chip), ok);
          /* הבחירה מחכה שהסגירה תסיים לחזור בהיסטוריה. אחרת עדכון הכתובת
             לתרחיש החדש נכתב על הצעד של הגיליון, והחזרה מחזירה לישן */
          b.addEventListener('click', () => { close(); afterLayers(() => render(j)); });
          li.appendChild(b);
          ol.appendChild(li);
        });
      }
      paint();
      requestAnimationFrame(() => {
        const cur = ol.querySelector('[aria-current]');
        if (cur) cur.scrollIntoView({ block: 'center' });
      });
    });
  }
  on($('b-ttl'), 'click', openPicker);

  /* --- התחלה --- */
  paintHandle();
  const first = Math.max(0, ids.indexOf(startId));
  render(first);

  return {
    go,
    destroy() {
      clearTimeout(advance);
      cancelAnimationFrame(dotRaf);
      player.destroy();
      closeTerm();
      listeners.forEach(([t, type, fn, opts]) => t.removeEventListener(type, fn, opts));
      root.classList.remove('open', 'solo');
      svg.remove();
      legend.remove();
    }
  };
}
