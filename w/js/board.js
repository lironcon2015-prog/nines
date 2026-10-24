/* פס ההרצה שמתחת למגרש: הפעלה והשהיה, ציר זמן עם שלבים, הילוך איטי,
   בחירה בין אפשרויות, כיתוב שאומר מה קורה עכשיו — ומקרא שמראה רק את מה
   שיש בתרחיש הזה.

   יושב מעל createPitch ואינו יודע דבר על חוברות. ההרצה עצמה היא
   pitch.seek(t) — פונקציה של הזמן בלבד — ולכן כאן יש רק שעון: הפעלה
   מקדמת אותו, גרירה קובעת אותו, ו"איטי" משנה את קצב ההתקדמות. */

const SLOW_KEY = 'k8:slow';
const SEEN_KEY = 'k8:played';
/* אחרי ההחלקה לנקודת ההתחלה, רגע של עמידה לפני שזזים — העין צריכה
   לקלוט מאיפה מתחילים לפני שמשהו זז */
const HOLD = 380;

const read = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* לא קריטי */ } };

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.3" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.3" fill="currentColor"/></svg>',
  again: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M19.5 3.5v5h-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

/**
 * @param {HTMLElement} board  המיכל של המגרש (המגרש כבר בתוכו)
 * @param {object} pitch  מה ש-createPitch מחזיר
 * @param {{hero:()=>number, obstruct?:()=>HTMLElement|null}} opts
 *   hero — המספר המודגש כרגע (משתנה בשיקוף). obstruct — מה שצף בתחתית
 *   המסך ומסתיר, כדי שההרצה לא תתחיל מתחתיו.
 */
export function mountBoard(board, pitch, opts = {}) {
  const svg = board.querySelector('svg.pitch');
  const reduce = () => window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  board.classList.add('has-bar');

  const bar = document.createElement('div');
  bar.className = 'pbar';
  bar.innerHTML = `
    <div class="pvar" hidden><span class="pvar-l"></span><span class="seg"></span></div>
    <div class="pcap" aria-live="polite"><b class="pstep"></b><span class="ptext"></span></div>
    <div class="pctl">
      <button class="pplay" type="button"></button>
      <div class="ptrack"><div class="pticks" aria-hidden="true"></div><input class="pseek" type="range" min="0" max="1000" step="1" value="0" dir="ltr" aria-label="ציר הזמן של המהלך"></div>
      <button class="pspeed" type="button" aria-pressed="false">איטי</button>
    </div>`;
  board.appendChild(bar);

  /* אישור ויזואלי לנגיעה במגרש — כמו בנגן וידאו */
  const flash = document.createElement('div');
  flash.className = 'pflash';
  flash.setAttribute('aria-hidden', 'true');
  board.appendChild(flash);

  const legend = document.createElement('div');
  legend.className = 'legend';
  board.after(legend);

  const $ = c => bar.querySelector('.' + c);
  const playBtn = $('pplay'), seekEl = $('pseek'), speedBtn = $('pspeed'),
        stepEl = $('pstep'), textEl = $('ptext'), ticks = $('pticks'),
        varRow = $('pvar'), varSeg = varRow.querySelector('.seg'), varLabel = $('pvar-l');

  let s = null;          /* התרחיש המוצג */
  let info = null;       /* ההרצה הטעונה: total, steps */
  let variant = null;
  let t = 0;             /* זמן השעון — שלילי בזמן ההחלקה וההמתנה */
  let playing = false, ended = false, live = false;
  let raf = 0, last = 0;
  let slow = read(SLOW_KEY) === '1';
  let shownStep = -2;

  const listeners = [];
  const on = (target, type, fn, o) => { target.addEventListener(type, fn, o); listeners.push([target, type, fn, o]); };

  /* ---------- השעון ---------- */

  function drawAt(tb) {
    /* זמן השעון לזמן ההרצה: קודם ההחלקה, אחר כך עמידה בנקודת ההתחלה */
    if (tb < -HOLD) pitch.seek(tb + HOLD);
    else pitch.seek(Math.max(0, tb));
    paintTime();
  }

  function tick(now) {
    let dt = now - last;
    last = now;
    /* חזרה מלשונית אחרת: הזמן שעבר ברקע אינו זמן הרצה */
    if (dt > 250) dt = 16;
    t += dt * (slow && t >= 0 ? 0.5 : 1);
    if (t >= info.total) {
      t = info.total;
      playing = false;
      ended = true;
      drawAt(t);
      paintButton();
      return;
    }
    drawAt(t);
    raf = requestAnimationFrame(tick);
  }

  /** טוען את ההרצה של התרחיש והאפשרות הנוכחיים, ומתחיל מההחלקה */
  function start() {
    pitch.snapshot();
    info = pitch.load(s, variant);
    if (!info) return false;
    live = true;
    ended = false;
    shownStep = -2;
    paintTicks();
    t = reduce() ? 0 : -(pitch.intro + HOLD);
    return true;
  }

  function play() {
    if (!s) return;
    if (!live || ended) {
      if (!start()) return;
      /* הפריים הראשון מצויר מיד ולא בפריים הבא: load מחזיר את הציור
         הסטטי, ובלי זה היה מהבהב לרגע בין סוף ההרצה הקודמת לתחילת ההחלקה */
      drawAt(t);
    }
    if (!playing) {
      playing = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
    write(SEEN_KEY, '1');
    board.classList.add('seen');
    paintButton();
    reveal();
  }

  function pause() {
    playing = false;
    cancelAnimationFrame(raf);
    paintButton();
  }

  function toggle() {
    if (playing) pause(); else play();
  }

  /** חזרה לציור הסטטי — מעבר תרחיש, שיקוף, סימון */
  function stop() {
    playing = false;
    cancelAnimationFrame(raf);
    live = false;
    ended = false;
    info = null;
    t = 0;
  }

  /* ---------- צביעה ---------- */

  function paintButton() {
    const state = playing ? 'pause' : ended ? 'again' : 'play';
    playBtn.innerHTML = ICON[state];
    playBtn.setAttribute('aria-label', { play: 'הפעל את התנועה', pause: 'השהה', again: 'שוב מההתחלה' }[state]);
    bar.dataset.state = !live ? 'idle' : playing ? 'playing' : ended ? 'ended' : 'paused';
  }

  function paintTime() {
    const p = live && info ? Math.max(0, Math.min(1, t / info.total)) : 0;
    seekEl.value = Math.round(p * 1000);
    bar.style.setProperty('--p', (p * 100).toFixed(2) + '%');
    paintCaption();
  }

  function paintTicks() {
    ticks.textContent = '';
    if (!info) return;
    info.steps.forEach((st, i) => {
      if (i === 0) return;
      const d = document.createElement('i');
      d.style.insetInlineStart = (st.t0 / info.total * 100).toFixed(2) + '%';
      ticks.appendChild(d);
    });
  }

  function paintCaption() {
    if (!live || !info) {
      if (shownStep === -1) return;
      shownStep = -1;
      stepEl.textContent = '';
      stepEl.hidden = true;
      textEl.textContent = varRow.hidden ? 'לחץ על ▶ כדי לראות איך זה זז' : 'בחר אפשרות, וראה אותה זזה';
      bar.classList.add('idle');
      return;
    }
    bar.classList.remove('idle');
    const steps = info.steps;
    let i = 0;
    steps.forEach((st, j) => { if (t >= st.t0) i = j; });
    const key = ended ? steps.length : i;
    if (key === shownStep) return;
    shownStep = key;
    /* שלב יחיד אינו צריך מונה — ו-▶ במקומו נראה כמו עוד כפתור הפעלה */
    stepEl.hidden = !ended && steps.length < 2;
    stepEl.textContent = ended ? '✓' : (i + 1) + '/' + steps.length;
    textEl.textContent = steps[i] ? steps[i].text : '';
  }

  function paintVariants() {
    const vs = s ? pitch.variantsOf(s) : [];
    varRow.hidden = vs.length < 2;
    varSeg.textContent = '';
    if (vs.length < 2) return;
    varLabel.textContent = vs.length === 2 ? 'שתי אפשרויות:' : vs.length === 3 ? 'שלוש אפשרויות:' : 'אפשרויות:';
    vs.forEach(v => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = v;
      b.setAttribute('aria-label', 'אפשרות ' + v);
      b.setAttribute('aria-pressed', v === variant);
      b.onclick = () => {
        variant = v;
        [...varSeg.children].forEach(x => x.setAttribute('aria-pressed', x.textContent === v));
        /* בחירה היא בקשה לראות: מריצים מיד, גם באמצע הרצה אחרת */
        pause();
        if (start()) play();
      };
      varSeg.appendChild(b);
    });
  }

  /** מקרא של התרחיש הזה בלבד — סימן שלא מופיע במגרש רק מרעיש */
  function paintLegend() {
    legend.textContent = '';
    if (!s) return;
    const arrows = s.arrows || [];
    const has = k => arrows.some(a => a.k === k);
    const item = (sw, text) => {
      const span = document.createElement('span');
      span.innerHTML = sw;
      span.appendChild(document.createTextNode(text));
      legend.appendChild(span);
    };
    const dot = cls => `<svg class="lsw" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.3" class="${cls}"/></svg>`;
    const line = (cls, head) => `<svg class="lsw wide" viewBox="0 0 24 12" aria-hidden="true"><path d="M2 6H17" class="arrow ${cls}"/><path d="M15.5 2.4 L22.5 6 L15.5 9.6 L17.4 6z" class="head-${head}"/></svg>`;
    item(dot('lg-hero'), 'ה-' + (opts.hero ? opts.hero() : ''));
    item(dot('lg-mate'), 'הקבוצה שלנו');
    if ((s.opp || []).length) item(dot('lg-opp'), 'יריב');
    if (has('run')) item(line('a-run', 'hp'), 'ריצה');
    if (has('pass')) item(line('a-pass', 'hb'), 'מסירה');
    if (has('opt')) item(line('a-opt', 'hp'), 'אפשרות');
    if (has('press')) item(line('a-press', 'hg'), 'תנועת יריב');
    if ((s.ghosts || []).length || has('run')) item(`<svg class="lsw" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.3" class="ghost"/></svg>`, 'נקודת התחלה');
    item('<svg class="lsw" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3.5M4.2 7 8 3.2 11.8 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>', 'תוקפים למעלה');
  }

  /* ---------- גלילה ---------- */

  /** ההרצה מתחילה כשכל המגרש והפס גלויים — לא מתחת לפס הצף ולא מעל
      לראש המסך. בטלפון קטן המגרש עצמו מתכווץ ב-CSS כדי שזה יתאפשר. */
  function reveal() {
    const r = board.getBoundingClientRect();
    const ob = opts.obstruct && opts.obstruct();
    const limit = (ob && ob.offsetParent !== null ? ob.getBoundingClientRect().top : window.innerHeight) - 10;
    const top = 10;
    let dy = 0;
    if (r.bottom > limit) dy = r.bottom - limit;
    if (r.top - dy < top) dy = r.top - top;
    if (Math.abs(dy) > 4) window.scrollBy({ top: dy, behavior: reduce() ? 'auto' : 'smooth' });
  }

  /* ---------- אירועים ---------- */

  on(playBtn, 'click', toggle);

  on(speedBtn, 'click', () => {
    slow = !slow;
    write(SLOW_KEY, slow ? '1' : '0');
    speedBtn.setAttribute('aria-pressed', slow);
  });
  speedBtn.setAttribute('aria-pressed', slow);

  /* גרירה בציר הזמן: עוצרת ומציגה בדיוק את הרגע הזה. מהציור הסטטי
     נכנסים להרצה בלי החלקה — זו תנועה שהאצבע מובילה. */
  on(seekEl, 'input', () => {
    if (!s) return;
    if (!live) {
      pitch.snapshot();
      info = pitch.load(s, variant);
      if (!info) return;
      live = true;
      shownStep = -2;
      paintTicks();
    }
    if (playing) { playing = false; cancelAnimationFrame(raf); }
    t = seekEl.value / 1000 * info.total;
    ended = t >= info.total;
    drawAt(t);
    paintButton();
  });

  /* נגיעה במגרש מפעילה ועוצרת. החלקה (מעבר תרחיש) לא יוצרת click */
  on(svg, 'click', () => {
    if (bar.hidden) return;
    toggle();
    flash.innerHTML = playing ? ICON.play : ICON.pause;
    flash.classList.remove('on');
    void flash.offsetWidth;
    flash.classList.add('on');
  });

  /* ---------- ממשק ---------- */

  function show(scenario) {
    stop();
    s = scenario;
    const vs = pitch.variantsOf(s);
    variant = vs[0] || null;
    bar.hidden = !pitch.canPlay(s);
    board.classList.toggle('still', bar.hidden);
    if (read(SEEN_KEY)) board.classList.add('seen');
    paintVariants();
    shownStep = -2;
    ticks.textContent = '';
    paintTime();
    paintButton();
    paintLegend();
  }

  return {
    show,
    stop() { if (live) { stop(); if (s) pitch.render(s, { animate: false }); paintTime(); paintButton(); } },
    destroy() {
      stop();
      listeners.forEach(([tg, type, fn, o]) => tg.removeEventListener(type, fn, o));
      bar.remove();
      flash.remove();
      legend.remove();
      board.classList.remove('has-bar', 'still', 'seen');
    }
  };
}
