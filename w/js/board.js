/* ההרצה במסך החוברת: ▶ ליד האגודל, ציר זמן עם שלבים, הילוך איטי,
   כיתוב שאומר מה קורה עכשיו, בחירה בין אפשרויות — ומצלמה: כשהמקום קטן
   (ההנחיות פתוחות, או מסך נמוך) המגרש מתמקד באזור שבו קורה המהלך.

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
/* המפה הקטנה בכפתור המצלמה: המגרש, והחלון שרואים ממנו עכשיו */
const MINI = '<svg viewBox="-30 -30 460 680" aria-hidden="true"><rect class="mini-f" x="20" y="20" width="360" height="580" rx="16"/><line class="mini-l" x1="20" y1="310" x2="380" y2="310"/><rect class="mini-w" x="0" y="0" width="400" height="620" rx="14"/></svg>';

/* ---------- המצלמה ----------
   האזור שבו קורה המהלך נגזר מהכוריאוגרפיה: כל המסלולים, המסירות,
   נקודות ההתחלה, האזורים, אתה והכדור — בלי שדה חדש בתוכן. גודל מינימלי,
   כדי שלא יתקרב עד שאובד ההקשר. */
function interest(pitch, s, hero) {
  const p = pitch.planOf(s, null);
  const pts = [];
  const curve = cv => {
    for (let i = 0; i <= 4; i++) {
      const t = i / 4, u = 1 - t;
      pts.push([u * u * cv.a[0] + 2 * u * t * cv.c[0] + t * t * cv.b[0], u * u * cv.a[1] + 2 * u * t * cv.c[1] + t * t * cv.b[1]]);
    }
  };
  p.movers.forEach(m => curve(m.cv));
  p.chain.forEach(c => { if (c.cv) curve(c.cv); });
  (s.arrows || []).forEach(a => pts.push(a.a, a.b));
  (s.ghosts || []).forEach(g => pts.push(g));
  (s.zones || []).forEach(z => pts.push([z.x, z.y], [z.x + z.w, z.y + z.h]));
  pts.push((s.pos && s.pos[hero]) || pitch.formation.base[hero], s.ball);
  const xs = pts.map(v => v[0]), ys = pts.map(v => v[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function focusRect(bb, aspect) {
  const M = 36;
  let w = Math.max(bb.x1 - bb.x0 + 2 * M, 250), h = Math.max(bb.y1 - bb.y0 + 2 * M, 186);
  if (w / h > aspect) h = w / aspect; else w = h * aspect;
  const cx = w >= 400 ? 200 : clamp((bb.x0 + bb.x1) / 2, w / 2, 400 - w / 2);
  const cy = h >= 620 ? 310 : clamp((bb.y0 + bb.y1) / 2, h / 2, 620 - h / 2);
  return [cx - w / 2, cy - h / 2, w, h];
}

/** כל המגרש, במלבן באותו יחס כמו הבמה — השוליים בצבע השוליים של המגרש */
function fullRect(aspect) {
  let h = 620, w = h * aspect;
  if (w < 400) { w = 400; h = w / aspect; }
  return [200 - w / 2, 310 - h / 2, w, h];
}

/**
 * @param {HTMLElement} stage  הבמה — המגרש כבר בתוכה
 * @param {object} pitch  מה ש-createPitch מחזיר
 * @param {{hero:()=>number, ctl:HTMLElement, legend?:HTMLElement}} opts
 *   hero — המספר המודגש כרגע (משתנה בשיקוף). ctl — שורת השליטה.
 *   legend — לאן לצייר את המקרא של התרחיש.
 */
export function mountBoard(stage, pitch, opts) {
  const svg = stage.querySelector('svg.pitch');
  const reduce = () => window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  const ctl = opts.ctl;

  /* על הבמה: המצלמה בפינה אחת, האפשרויות בשנייה, והאישור לנגיעה באמצע */
  const cam = document.createElement('button');
  cam.className = 'camb';
  cam.type = 'button';
  cam.innerHTML = MINI + '<span></span>';
  const vars = document.createElement('div');
  vars.className = 'pvar';
  vars.hidden = true;
  vars.innerHTML = '<span class="pvar-l">אפשרות</span><span class="seg"></span>';
  const flash = document.createElement('div');
  flash.className = 'pflash';
  flash.setAttribute('aria-hidden', 'true');
  stage.append(cam, vars, flash);

  ctl.innerHTML = `
    <button class="pplay" type="button"></button>
    <div class="ptime">
      <div class="pcap" aria-live="polite"><b class="pstep" hidden></b><span class="ptext"></span></div>
      <div class="ptrack"><div class="pticks" aria-hidden="true"></div><input class="pseek" type="range" min="0" max="1000" step="1" value="0" dir="ltr" aria-label="ציר הזמן של המהלך"></div>
    </div>
    <button class="pspeed" type="button" aria-pressed="false">איטי</button>`;

  const $ = c => ctl.querySelector('.' + c);
  const playBtn = $('pplay'), seekEl = $('pseek'), speedBtn = $('pspeed'),
        stepEl = $('pstep'), textEl = $('ptext'), ticks = $('pticks'),
        varSeg = vars.querySelector('.seg'), win = cam.querySelector('.mini-w'), camLabel = cam.querySelector('span');

  let s = null;          /* התרחיש המוצג */
  let info = null;       /* ההרצה הטעונה: total, steps */
  let variant = null;
  let t = 0;             /* זמן השעון — שלילי בזמן ההחלקה וההמתנה */
  let playing = false, ended = false, live = false;
  let raf = 0, last = 0;
  let slow = read(SLOW_KEY) === '1';
  let shownStep = -2;
  let room = false;      /* ההנחיות פתוחות — המקום למגרש קטן */
  let userFocus = null;  /* מה שהילד בחר בכפתור המצלמה, עד התרחיש הבא */
  let camRaf = 0, tweening = false;

  const listeners = [];
  const on = (target, type, fn, o) => { target.addEventListener(type, fn, o); listeners.push([target, type, fn, o]); };

  /* ---------- המצלמה ---------- */

  const aspect = () => (stage.clientWidth / stage.clientHeight) || 400 / 620;
  /* מסך נמוך: המגרש השלם היה יוצא צר משני שלישים מהרוחב */
  const tooShort = () => stage.clientHeight * 400 / 620 < stage.clientWidth * 0.62;
  const focused = () => (userFocus != null ? userFocus : room || tooShort());

  function camera(ms) {
    if (!s || !stage.clientHeight) return;
    const to = focused() ? focusRect(interest(pitch, s, opts.hero()), aspect()) : fullRect(aspect());
    const set = v => svg.setAttribute('viewBox', v.map(n => n.toFixed(1)).join(' '));
    cancelAnimationFrame(camRaf);
    if (!ms || reduce()) { set(to); tweening = false; }
    else {
      const vb = svg.viewBox.baseVal, from = [vb.x, vb.y, vb.width, vb.height];
      const t0 = performance.now();
      tweening = true;
      const step = now => {
        const k = Math.min(1, (now - t0) / ms), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        set(from.map((f, i) => f + (to[i] - f) * e));
        if (k < 1) camRaf = requestAnimationFrame(step); else tweening = false;
      };
      camRaf = requestAnimationFrame(step);
    }
    const x = clamp(to[0], 0, 400), y = clamp(to[1], 0, 620);
    win.setAttribute('x', x.toFixed(0));
    win.setAttribute('y', y.toFixed(0));
    win.setAttribute('width', (clamp(to[0] + to[2], 0, 400) - x).toFixed(0));
    win.setAttribute('height', (clamp(to[1] + to[3], 0, 620) - y).toFixed(0));
    camLabel.textContent = focused() ? 'כל המגרש' : 'התמקד';
    cam.setAttribute('aria-label', focused() ? 'הצג את כל המגרש' : 'התמקד באזור המהלך');
  }
  on(cam, 'click', () => { userFocus = !focused(); camera(480); });
  /* הבמה משנה גודל — סיבוב, מקלדת, פתיחת ההנחיות. בזמן מעבר מצלמה לא
     נוגעים: היעד שלו חושב כבר לגודל החדש */
  const ro = new ResizeObserver(() => { if (!tweening) camera(0); });
  ro.observe(stage);

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

  const canPlay = () => !!s && pitch.canPlay(s);

  function play() {
    if (!canPlay()) return;
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
    playBtn.classList.remove('breathe');
    paintButton();
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
    playBtn.dataset.state = state;
    playBtn.disabled = !canPlay();
    playBtn.setAttribute('aria-label', { play: 'הפעל את התנועה', pause: 'השהה', again: 'שוב מההתחלה' }[state]);
    ctl.dataset.state = !live ? 'idle' : playing ? 'playing' : ended ? 'ended' : 'paused';
  }

  function paintTime() {
    const p = live && info ? Math.max(0, Math.min(1, t / info.total)) : 0;
    seekEl.value = Math.round(p * 1000);
    ctl.style.setProperty('--p', (p * 100).toFixed(2) + '%');
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
      stepEl.hidden = true;
      textEl.textContent = !canPlay() ? 'מפה של התפקיד, בלי תנועה'
        : vars.hidden ? 'לחץ ▶ וראה את המהלך זז' : 'בחר אפשרות על המגרש, או לחץ ▶';
      ctl.classList.add('idle');
      return;
    }
    ctl.classList.remove('idle');
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
    vars.hidden = vs.length < 2;
    varSeg.textContent = '';
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
    const legend = opts.legend;
    if (!legend) return;
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
    item(dot('lg-hero'), 'ה-' + opts.hero());
    item(dot('lg-mate'), 'הקבוצה שלנו');
    if ((s.opp || []).length) item(dot('lg-opp'), 'יריב');
    if (has('run')) item(line('a-run', 'hp'), 'ריצה');
    if (has('pass')) item(line('a-pass', 'hb'), 'מסירה');
    if (has('opt')) item(line('a-opt', 'hp'), 'אפשרות');
    if (has('press')) item(line('a-press', 'hg'), 'תנועת יריב');
    if ((s.ghosts || []).length || has('run')) item('<svg class="lsw" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.3" class="ghost"/></svg>', 'נקודת התחלה');
    item('<svg class="lsw" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3.5M4.2 7 8 3.2 11.8 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>', 'תוקפים למעלה');
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
    if (!canPlay()) return;
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
    if (!canPlay()) return;
    toggle();
    flash.innerHTML = playing ? ICON.play : ICON.pause;
    flash.classList.remove('on');
    void flash.offsetWidth;
    flash.classList.add('on');
  });

  /* ---------- ממשק ---------- */

  function show(scenario) {
    const first = !s;
    stop();
    s = scenario;
    const vs = pitch.variantsOf(s);
    variant = vs[0] || null;
    userFocus = null;
    stage.classList.toggle('still', !canPlay());
    speedBtn.hidden = !canPlay();
    seekEl.disabled = !canPlay();
    if (!read(SEEN_KEY)) playBtn.classList.add('breathe');
    paintVariants();
    shownStep = -2;
    ticks.textContent = '';
    paintTime();
    paintButton();
    paintLegend();
    camera(first ? 0 : 450);
  }

  return {
    show,
    toggle,
    pause,
    /** ההנחיות נפתחו או נסגרו: המקום למגרש השתנה, והמצלמה בוחרת מחדש */
    setRoom(v) { room = v; userFocus = null; camera(480); },
    destroy() {
      stop();
      cancelAnimationFrame(camRaf);
      ro.disconnect();
      listeners.forEach(([tg, type, fn, o]) => tg.removeEventListener(type, fn, o));
      cam.remove();
      vars.remove();
      flash.remove();
      ctl.textContent = '';
      ctl.removeAttribute('data-state');
    }
  };
}
