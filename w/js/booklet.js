/* מסך חוברת: מגרש, צ'יפים, פאנל ההסבר, ניווט בין תרחישים. */

import { buildPitch, createPitch, mirrorScenario, mirrorRole, mirrorText } from './pitch.js';
import { isLearned, toggleLearned, learnedCount, resetBooklet, setLast, isMirrored, setMirrored } from './store.js';
import { createGlossary } from './terms.js';

const $ = id => document.getElementById(id);

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

  /* תרחיש בודד שהגיע בקישור שיתוף: בלי התקדמות, מערך ותרגילים */
  const solo = !!booklet.solo;
  ['track', 'count', 'learn', 'formation', 'closing', 'side'].forEach(id => { $(id).hidden = solo; });

  /* בשיקוף, תפקיד אגף הופך לתפקיד האגף השני: גם המספר המודגש וגם השם.
     titleB הוא עקיפה ידנית; בלעדיו מספיקה החלפת מילות הצד. */
  const hero = () => (isMirrored() ? mirrorRole(formation, booklet.role) : booklet.role);
  const flip = t => (isMirrored() ? mirrorText(t) : t);
  const heroTitle = () => (isMirrored() && booklet.titleB ? booklet.titleB : flip(booklet.title));

  /* --- כותרת החוברת --- */
  $('eyebrow').textContent = booklet.eyebrow;

  let formationText = null;
  if (!solo) {
    $('f-label').textContent = booklet.formationNote.label;
    /* צומת טקסט חשוף ולא span — כדי שגלישת השורות תהיה זהה לגרסה המקורית */
    formationText = document.createTextNode('');
    $('f-label').after(formationText);
  }

  function paintHead() {
    const n = String(hero());
    document.title = heroTitle() + ' — תשיעיות';
    $('mark-b').textContent = n;
    $('mark-p').textContent = n;
    /* מספר דו-ספרתי לא נכנס בגודל של ספרה אחת */
    $('mark-b').parentElement.classList.toggle('wide', n.length > 1);
    $('b-title').textContent = heroTitle();
    $('lg-role').textContent = 'ה-' + n;
    $('b-lede').textContent = flip(booklet.lede);
    if (formationText) formationText.nodeValue = ' ' + flip(booklet.formationNote.text);
  }
  paintHead();

  /* --- מגרש --- */
  const board = $('board');
  const svg = buildPitch();
  svg.id = 'pitch';
  board.prepend(svg);
  const pitch = createPitch(svg, formation, booklet.role);

  /* --- הרצת התנועה --- */
  const playBtn = $('play');
  let playing = false;

  function stopPlaying() {
    pitch.stopPlay();
    playing = false;
    playBtn.disabled = false;
    playBtn.textContent = 'הראה לי את התנועה';
  }

  on(playBtn, 'click', () => {
    if (playing) return;
    playing = true;
    playBtn.disabled = true;
    playBtn.textContent = 'רץ…';
    pitch.play(shown(), stopPlaying);
  });

  /* --- מילון המונחים --- */
  const glossary = createGlossary(terms);
  const panel = $('panel');
  let openTerm = null;

  function closeTerm() {
    const box = panel.querySelector('.termdef');
    if (box) box.remove();
    if (openTerm) openTerm.setAttribute('aria-expanded', 'false');
    openTerm = null;
  }

  on(panel, 'click', e => {
    const b = e.target.closest('.term');
    if (!b) return;
    const wasOpen = b === openTerm;
    closeTerm();
    if (wasOpen) return;

    const text = glossary.define(b.dataset.term);
    if (!text) return;
    const box = document.createElement('p');
    box.className = 'termdef';
    box.textContent = text;

    /* ההסבר יושב מתחת לפסקה שבה המונח, ולא מעל השורה — כדי שהטקסט
       שהילד קורא לא יזוז לו מתחת לאצבע */
    /* בתוך פריט רשימה או בתוך הטעות ההסבר נכנס פנימה ולא אחרי — פסקה
       בין שני li אינה חוקית, וגם הייתה נראית כאילו היא שייכת לשניהם */
    const block = b.closest('li, h2, .sub, .mistake') || b;
    if (block.tagName === 'LI' || block.tagName === 'DETAILS') block.appendChild(box);
    else block.after(box);
    b.setAttribute('aria-expanded', 'true');
    openTerm = b;
  });

  /* --- ניווט בין תרחישים (מוסתר כשיש רק אחד) --- */
  $('chips').parentElement.hidden = solo;   /* .rail */
  $('prev').parentElement.hidden = solo;    /* .nav */
  $('hint').hidden = solo;

  /* --- פס התקדמות --- */
  const track = $('track');
  track.textContent = '';
  S.forEach(() => track.appendChild(document.createElement('i')));
  function paintTrack() {
    [...track.children].forEach((b, j) => {
      b.className = j === idx ? 'here' : (isLearned(booklet.id, ids[j]) ? 'on' : '');
    });
    $('count').textContent = `למדתי ${learnedCount(booklet.id)} מתוך ${S.length}`;
  }

  /* --- צ'יפים --- */
  const chips = $('chips');
  const chipText = [];
  chips.textContent = '';
  S.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.dataset.phase = s.phase;
    const dot = document.createElement('i');
    dot.className = 'dot';
    const t = document.createTextNode('');
    chipText.push(t);
    b.append(dot, t);
    b.onclick = () => render(i);
    chips.appendChild(b);
  });
  const paintChips = () => chipText.forEach((t, i) => { t.nodeValue = flip(S[i].chip); });
  paintChips();

  /* --- מתג הצד --- */
  const side = booklet.side || { label: 'הצד של ה-' + booklet.role + ':', a: 'ימין', b: 'שמאל' };
  const hintA = side.hintA || ('מותאם ל' + side.a), hintB = side.hintB || ('מותאם ל' + side.b);
  $('side-label').textContent = side.label;
  const sideBtns = [...$('side').querySelectorAll('button')];
  sideBtns[0].textContent = side.a;
  sideBtns[1].textContent = side.b;
  function paintSide() {
    const m = isMirrored();
    sideBtns.forEach(b => b.setAttribute('aria-pressed', (b.dataset.foot === 'L') === m));
    $('side-hint').textContent = m ? hintB : hintA;
  }
  sideBtns.forEach(b => on(b, 'click', () => {
    const want = b.dataset.foot === 'L';
    if (want === isMirrored()) return;
    setMirrored(want);
    paintSide();
    paintHead();
    paintChips();
    render(idx);
  }));
  paintSide();

  /* --- ציור תרחיש --- */
  let idx = 0;

  /** התרחיש הנוכחי כפי שהוא מוצג — משוקף אם צריך */
  const shown = () => (isMirrored() ? mirrorScenario(S[idx], formation) : S[idx]);

  function render(i) {
    idx = i;
    /* גם הטקסט מגיע מהעותק המשוקף, אחרת ההסבר מדבר על צד אחד
       בזמן שהמגרש מראה את השני */
    const s = isMirrored() ? mirrorScenario(S[i], formation) : S[i];
    stopPlaying();
    closeTerm();
    pitch.setRole(hero());
    pitch.render(s);

    /* קורא מסך מקבל את התרחיש עצמו ולא "דיאגרמת מגרש" סתמית */
    svg.setAttribute('aria-label', s.title + '. ' + s.sub);
    /* מפת תפקיד אין בה תנועה להריץ */
    playBtn.parentElement.hidden = !pitch.canPlay(s);

    $('p-phase').textContent = s.phase;

    /* ההופעה הראשונה של מונח בכל תרחיש הופכת לכפתור הסבר. הכותרת קודמת
       לגוף, כי מונחים כמו "בלוק הגנתי" ו"לחץ גבוה" מופיעים רק בה —
       בלעדיה ההסבר שלהם לא היה נגיש משום מקום. הצ'יפים נשארים נקיים:
       כפתור בתוך כפתור אינו חוקי ושובר את הניווט. */
    glossary.reset();
    const h2 = $('p-title');
    h2.textContent = '';
    h2.appendChild(glossary.decorate(s.title));

    const sub = $('p-sub');
    sub.textContent = '';
    sub.appendChild(glossary.decorate(s.sub));

    const ul = $('p-does');
    ul.textContent = '';
    s.does.forEach(d => {
      const li = document.createElement('li');
      li.appendChild(glossary.decorate(d));
      ul.appendChild(li);
    });

    const mis = $('p-mistake');
    mis.textContent = '';
    mis.appendChild(glossary.decorate(s.mistake));

    $('p-cue').textContent = s.cue;

    const learned = isLearned(booklet.id, s.id);
    $('learn').setAttribute('aria-pressed', learned);
    $('learn-txt').textContent = learned ? '✓ למדתי את זה' : 'סמן שלמדתי את זה';

    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    [...chips.children].forEach((c, j) => c.setAttribute('aria-selected', j === i));
    chips.children[i].scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    paintTrack();

    setLast(booklet.id, s.id);
    if (onScenario) onScenario(s.id);
  }

  /* --- ניווט --- */
  const go = d => render((idx + d + S.length) % S.length);
  on($('next'), 'click', () => go(1));
  on($('prev'), 'click', () => go(-1));
  on($('learn'), 'click', () => { toggleLearned(booklet.id, ids[idx]); render(idx); });
  on($('reset'), 'click', () => { resetBooklet(booklet.id); render(idx); });

  /* החלקה: בממשק ימין-לשמאל, החלקה ימינה מקדמת לתרחיש הבא */
  let sx = 0, sy = 0, tracking = false;
  on(board, 'touchstart', e => {
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
  }, { passive: true });
  on(board, 'touchend', e => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy) * 1.6) go(dx > 0 ? 1 : -1);
  }, { passive: true });

  const first = Math.max(0, ids.indexOf(startId));
  render(first);

  return {
    go,
    destroy() {
      stopPlaying();
      closeTerm();
      listeners.forEach(([t, type, fn, opts]) => t.removeEventListener(type, fn, opts));
      svg.remove();
      if (formationText) formationText.remove();
    }
  };
}
