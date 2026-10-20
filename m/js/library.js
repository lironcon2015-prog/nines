/* מסך הבית.

   הקודם הציג ארבעה כרטיסים שווים, וכל אחד מהם עם מגרש, תיאור, פס
   התקדמות ושני כפתורים. אחרי שהילד בחר מספר, ההבדל היחיד היה מסגרת
   ורודה וסדר — הכרטיס שלו לא נראה אחרת, הוא רק היה ראשון.

   כאן יש דבר אחד: התפקיד שלו, גדול, עם האימון של היום ככפתור ראשי.
   כל השאר מתקפל לשורה אחת — "ספריית התפקידים" — שנפתחת לרשימה קומפקטית.
   ילד בן 11 שנכנס בערב אחרי אימון צריך לראות מסך אחד, לא ארבעה. */

import { thumbnail, mirrorScenario, mirrorRole, mirrorText } from './pitch.js';
import {
  isLearned, learnedCount, getLast, isMirrored, quizSummary,
  hasMyNumber, getMyNumber, setMyNumber, quizTouched
} from './store.js';
import { savePack, fetchPack, clearPack } from './pack.js';

const $ = id => document.getElementById(id);

export function renderLibrary(home, booklets, formations, onOpen, onQuiz, onTrain, version, pack) {
  $('lib-eyebrow').textContent = home.eyebrow;
  $('lib-title').textContent = home.title;
  $('lib-lede').textContent = home.lede;
  $('lib-foot').textContent = home.foot;
  document.title = home.title + ' — תשיעיות';

  /* חיווי גרסה — כדי לדעת במבט אם העדכון האחרון הגיע למכשיר */
  $('lib-ver').textContent = version ? 'גרסה ' + version : '';

  const repaint = () => renderLibrary(home, booklets, formations, onOpen, onQuiz, onTrain, version, pack);

  const mirrored = isMirrored();
  const heroOf = b => {
    const f = formations[b.formation];
    return f && mirrored ? mirrorRole(f, b.role) : b.role;
  };

  const me = getMyNumber();

  /* בנייה לתפקיד אחד: אין ספרייה ואין מה לבחור. בלי ההבחנה הזאת מסך
     הבית היה פותח ב"איזה מספר אתה?" ומציג את כל מספרי המערך — רובם בלי
     חוברת — כדי לבחור בין אפשרות אחת. */
  const single = booklets.length === 1;

  /* בשיקוף ההשוואה היא מול התפקיד המשוקף, כך שילד שמאלי שהוא מספר 2
     מקבל את חוברת המגן שהופכת עבורו ל-2. */
  const mine = single ? booklets[0]
    : (hasMyNumber() && me > 0 ? booklets.find(b => heroOf(b) === me) || null : null);

  const ctx = { booklets, formations, mirrored, heroOf, me, onOpen, onQuiz, onTrain, repaint, single };

  renderPack(pack);
  renderMeLine(ctx);
  const rest = renderHero(ctx, mine);
  renderRoles(ctx, rest, !single && (!hasMyNumber() || !mine));
  renderScenarios(ctx, mine);
  /* הסמל בכותרת: מספר החולצה שלך, כמו הסמל בגבעתיים. בלי מספר — קונוס */
  const crest = $('lib-crest');
  if (mine) { crest.textContent = String(heroOf(mine)); crest.classList.add('num'); }
  else { crest.classList.remove('num'); crest.innerHTML = '<svg class="i"><use href="#i-cone"/></svg>'; }
}

/* ---------- התרחישים של התפקיד ----------
   שורה לכל תרחיש, עם ✓ למה שכבר נלמד. לחיצה פותחת את התרחיש עצמו — הילד
   רואה מה נשאר בלי להיכנס לחוברת ולדפדף. */
function renderScenarios(ctx, b) {
  const box = $('scenlist');
  box.textContent = '';
  if (!b) return;
  const flip = t => (ctx.mirrored ? mirrorText(t) : t);
  const head = document.createElement('div');
  head.className = 'sec';
  head.innerHTML = '<svg class="i"><use href="#i-cone"/></svg>';
  const h = document.createElement('h3');
  h.textContent = 'התרחישים';
  const n = document.createElement('span');
  n.className = 'n num';
  n.textContent = learnedCount(b.id) + ' מתוך ' + b.scenarios.length;
  head.append(h, n);
  box.appendChild(head);

  const list = document.createElement('div');
  list.className = 'list';
  b.scenarios.forEach((s, i) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'lr';
    row.onclick = () => ctx.onOpen(b.id, s.id);
    const k = document.createElement('span');
    const done = isLearned(b.id, s.id);
    k.className = 'k num' + (done ? ' ok' : '');
    k.textContent = done ? '✓' : String(i + 1);
    const name = document.createElement('b');
    name.textContent = flip(s.chip || s.title);
    const ph = document.createElement('small');
    ph.textContent = s.phase;
    row.append(k, name, ph);
    list.appendChild(row);
  });
  box.appendChild(list);
}

/* ---------- החבילה המלאה ----------
   מוצגת רק בגרסה המלאה: כשאין תוכן במכשיר זה כל מסך הבית, וכשיש חבילה
   זו שורה בתחתית להחלפה. בגרסה לתפקיד אחד התוכן מגיע עם האתר, ולכן אין
   כאן מה להציג ולא מוצע להחליף אותו. */

function renderPack(pack) {
  const box = $('pack');
  /* בבית רק כשאין חבילה בכלל — אז זה כל המסך. אחרי שנטענה, ההחלפה וההסרה
     עוברות להגדרות (packui.js), יחד עם ההודעה כשעדכון לא ירד. */
  if (!pack || !pack.gated || pack.loaded) { box.hidden = true; return; }

  /* החבילה שבמכשיר מול מה שהאתר מכריז. העדכון יורד לבד בפתיחה, ולכן
     אם ההפרש עדיין כאן — ההורדה נכשלה (אין רשת, או שהאתר לא מגיע).
     בלי ההודעה הזאת זה היה נראה בדיוק כמו "אין עדכון". */
  const stale = pack.loaded && pack.siteVersion && pack.siteVersion !== pack.version;

  box.hidden = false;
  box.className = 'pack' + (pack.loaded ? ' set' : '') + (stale ? ' stale' : '');
  $('pack-t').textContent = pack.loaded
    ? 'החבילה: גרסה ' + (pack.version || '—')
    : 'אין חוברות במכשיר הזה';
  $('pack-d').textContent = stale
    ? 'יש תוכן חדש — גרסה ' + pack.siteVersion + ' — והוא לא ירד למכשיר. פתח שוב עם רשת, או טען את הקובץ.'
    : 'טען את קובץ החבילה, והתפקידים ייפתחו. הוא נשמר במכשיר ועובד גם בלי רשת.';
  $('pack-filelbl').textContent = pack.loaded ? 'החלף קובץ' : 'בחר קובץ חבילה';

  const err = $('pack-error');
  const show = e => {
    err.hidden = false;
    err.textContent = e.detail ? e.message + '\n' + e.detail : e.message;
  };
  const clear = () => { err.hidden = true; err.textContent = ''; };

  /* אחרי טעינה מרעננים ולא מציירים מחדש: התוכן נקרא ב-boot, וכל מסך
     שכבר עומד מחזיק חוברות ישנות */
  const done = () => location.reload();

  const file = $('pack-input');
  file.value = '';
  file.onchange = async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    clear();
    try {
      savePack(await f.text(), f.name + ' · ' + f.size + ' בתים');
      done();
    } catch (e) { show(e); }
  };

  const row = $('pack-urlrow');
  row.hidden = true;
  $('pack-urlgo').onclick = () => {
    row.hidden = !row.hidden;
    if (!row.hidden) $('pack-url').focus();
  };
  row.onsubmit = async ev => {
    ev.preventDefault();
    clear();
    const go = $('pack-load');
    go.disabled = true;
    try {
      await fetchPack($('pack-url').value);
      done();
    } catch (e) { show(e); } finally { go.disabled = false; }
  };

  const drop = $('pack-drop');
  drop.hidden = !pack.loaded;
  drop.onclick = () => {
    if (!confirm('להסיר את החבילה מהמכשיר? התפקידים ייעלמו עד שתטען אותה שוב.')) return;
    clearPack();
    done();
  };
}

/* ---------- שורת המספר ----------
   אחרי שנבחר מספר זו שורה אחת ולא כרטיס: השאלה כבר נענתה, והמקום שייך
   לתפקיד עצמו. לפני שנבחר — אין כאן כלום, כי הבוחר הוא הגיבור. */

function renderMeLine({ me, repaint, single, booklets }) {
  const box = $('me');
  box.textContent = '';
  if (single || !booklets.length || !hasMyNumber()) { box.hidden = true; return; }
  box.hidden = false;
  box.className = 'me set';

  const line = document.createElement('p');
  line.className = 'me-line';
  line.textContent = me ? `אתה מספר ${me}.` : 'עוד לא בחרת מספר.';

  const change = document.createElement('button');
  change.type = 'button';
  change.className = 'me-change';
  change.textContent = me ? 'החלף' : 'בחר מספר';
  change.onclick = () => { setMyNumber(null); repaint(); };

  line.append(' ', change);
  box.appendChild(line);
}

/* ---------- הגיבור ----------
   מחזירה את החוברות שנשארו לספריית התפקידים. */

function renderHero(ctx, mine) {
  const box = $('hero');
  box.textContent = '';

  /* אין תוכן כלל — הגרסה המלאה לפני שנטענה חבילה. הבוחר כאן היה שואל
     "איזה מספר אתה?" מעל רשימת מספרים ריקה. */
  if (!ctx.booklets.length) return [];
  if (ctx.single) {
    box.appendChild(bigCard(mine, ctx));
    return [];
  }
  if (!hasMyNumber()) {
    drawChooser(box, ctx);
    return ctx.booklets;
  }
  if (mine) {
    box.appendChild(bigCard(mine, ctx));
    return ctx.booklets.filter(b => b !== mine);
  }
  /* נבחר מספר שאין לו חוברת — 1, 4, 7 או 9. עדיף לומר את זה ולהציע את
     הקרוב ביותר, מאשר להחזיר ארבעה כרטיסים בלי שום סימון. */
  drawNoBooklet(box, ctx);
  return ctx.booklets;
}

function drawChooser(box, { booklets, formations, heroOf, repaint }) {
  const ask = document.createElement('div');
  ask.className = 'ask';

  const q = document.createElement('p');
  q.className = 'ask-q';
  q.textContent = 'איזה מספר אתה?';
  ask.appendChild(q);

  const hint = document.createElement('p');
  hint.className = 'ask-hint';
  hint.textContent = 'כדי שהתפקיד שלך יהיה מה שרואים כאן, וכל השאר יתקפל';
  ask.appendChild(hint);

  /* המספרים מגיעים מהמערכים עצמם, כדי שמערך חדש לא ידרוש רשימה בקוד */
  const nums = [...new Set(
    booklets.flatMap(b => (formations[b.formation] || { order: [] }).order)
  )].sort((a, b) => a - b);
  const covered = new Set(booklets.map(heroOf));

  const row = document.createElement('div');
  row.className = 'ask-nums';
  nums.forEach(n => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = n;
    /* מסומן מה שכבר יש לו חוברת — כדי שהבחירה לא תהיה בעיוורון */
    if (covered.has(n)) b.className = 'has';
    b.onclick = () => { setMyNumber(n); repaint(); };
    row.appendChild(b);
  });
  ask.appendChild(row);

  const key = document.createElement('p');
  key.className = 'ask-key';
  key.textContent = 'בזהב — המספרים שכבר יש להם חוברת';
  ask.appendChild(key);

  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'ask-later';
  later.textContent = 'אחר כך';
  later.onclick = () => { setMyNumber(0); repaint(); };
  ask.appendChild(later);

  box.appendChild(ask);
}

function drawNoBooklet(box, ctx) {
  const { me, formations, booklets, heroOf } = ctx;

  const empty = document.createElement('div');
  empty.className = 'noyet';
  const t = document.createElement('p');
  t.className = 'noyet-t';
  t.textContent = 'עוד אין חוברת למספר ' + me;
  empty.appendChild(t);

  const near = nearest(ctx);
  const d = document.createElement('p');
  d.className = 'noyet-d';
  d.textContent = near
    ? 'עד שתהיה — הכי קרוב לתפקיד שלך במגרש הוא ' + titleOf(near, ctx) + '.'
    : 'בינתיים אפשר לפתוח כל אחת מהחוברות מתוך ספריית התפקידים.';
  empty.appendChild(d);
  box.appendChild(empty);

  if (near) box.appendChild(bigCard(near, ctx, 'הכי קרוב לתפקיד שלך'));
}

/* מי קרוב למי — לפי המרחק במגרש, ולא לפי טבלה שצריך לתחזק. המיקומים
   כבר יושבים ב-formations, וחוברת חדשה נכנסת לחישוב מעצמה. */
function nearest({ me, booklets, formations, heroOf }) {
  let best = null;
  let bestAt = Infinity;
  booklets.forEach(b => {
    const f = formations[b.formation];
    if (!f || !f.base || !f.base[me]) return;
    const spot = f.base[heroOf(b)];
    if (!spot) return;
    const dx = spot[0] - f.base[me][0];
    const dy = spot[1] - f.base[me][1];
    const at = dx * dx + dy * dy;
    if (at < bestAt) { bestAt = at; best = b; }
  });
  return best;
}

function titleOf(b, { mirrored }) {
  return mirrored && b.titleB ? b.titleB : (mirrored ? mirrorText(b.title) : b.title);
}

/* ---------- הכרטיס הגדול ---------- */

function bigCard(b, ctx, tagline) {
  const { formations, mirrored, heroOf, onOpen, onQuiz, onTrain } = ctx;
  const formation = formations[b.formation];
  const hero = heroOf(b);
  const flip = t => (mirrored ? mirrorText(t) : t);
  const done = learnedCount(b.id);
  const total = b.scenarios.length;

  /* הכרטיס המוביל של המסך — היחיד שזוהר בזהב (השפה של גבעתיים) */
  const card = document.createElement('div');
  card.className = 'big hero';

  const top = document.createElement('div');
  top.className = 'big-top';
  const role = document.createElement('div');
  role.className = 'eyebrow big-role';
  role.textContent = (tagline || 'התפקיד שלך') + ' · מספר ' + hero;
  /* טבעת ההתקדמות: כמה מהתרחישים כבר סומנו */
  const ring = document.createElement('div');
  ring.className = 'ring';
  ring.style.setProperty('--p', String(Math.round(done / total * 100)));
  const rn = document.createElement('span');
  rn.className = 'num';
  rn.textContent = done + '/' + total;
  ring.appendChild(rn);
  top.append(role, ring);
  card.appendChild(top);

  const head = document.createElement('div');
  head.className = 'big-head';
  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  const first = mirrored ? mirrorScenario(b.scenarios[0], formation) : b.scenarios[0];
  thumb.appendChild(thumbnail(first, formation, hero));
  head.appendChild(thumb);

  const body = document.createElement('div');
  body.className = 'big-body';
  const h2 = document.createElement('h2');
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = titleOf(b, ctx);
  const lastId = getLast(b.id);
  open.onclick = () => onOpen(b.id, lastId);
  h2.appendChild(open);
  body.appendChild(h2);
  const desc = document.createElement('p');
  desc.className = 'big-desc';
  desc.textContent = flip(b.lede);
  body.appendChild(desc);
  head.appendChild(body);
  card.appendChild(head);

  /* הפעולה הראשית: להמשיך מהתרחיש הראשון שעוד לא סומן. מי שעוד לא
     התחיל — מתחילים מהראשון; מי שסיים — למבדק. "המשך מאיפה שעצרתי" לפי
     מה שלא נלמד ולא לפי האחרון שנפתח: האחרון שנפתח אולי כבר סומן. */
  const next = b.scenarios.find(s => !isLearned(b.id, s.id));
  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'btn gold learngo';
  if (!done) {
    main.textContent = 'להתחיל ללמוד · ' + total + ' תרחישים';
    main.onclick = () => onOpen(b.id);
  } else if (next) {
    main.textContent = 'להמשיך מאיפה שעצרתי';
    const sm = document.createElement('small');
    sm.textContent = ' · ' + flip(next.chip || next.title);
    main.appendChild(sm);
    main.onclick = () => onOpen(b.id, next.id);
  } else {
    main.textContent = 'למדת הכול — למבדק המלא';
    main.onclick = () => onQuiz(b.id);
  }
  card.appendChild(main);

  /* האימון הקצר והמבדק — זה לצד זה, מתחת לפעולה הראשית */
  const row = document.createElement('div');
  row.className = 'two';
  const train = document.createElement('button');
  train.type = 'button';
  train.className = 'btn traingo';
  train.textContent = quizTouched(b.id) ? 'האימון של היום' : 'אימון קצר';
  const t3 = document.createElement('small');
  t3.textContent = ' · 3';
  train.appendChild(t3);
  train.onclick = () => onTrain(b.id);
  const quiz = document.createElement('button');
  quiz.type = 'button';
  quiz.className = 'btn quizgo';
  const q = quizSummary(b.id);
  quiz.textContent = q.done ? 'מבדק · ' + q.exact + '/' + q.done : 'מבדק מלא';
  quiz.classList.toggle('ready', done === total);
  quiz.onclick = () => onQuiz(b.id);
  row.append(train, quiz);
  card.appendChild(row);

  return card;
}

/* ---------- ספריית התפקידים ----------
   שורה במקום כרטיס: מגרש זעיר, מספר, שם ופס התקדמות. לחיצה פותחת את
   החוברת ישירות — האימון של תפקיד אחר אינו פעולה שעושים מכאן. */

function renderRoles(ctx, list, openByDefault) {
  const fold = $('roles');
  const sum = $('roles-sum');
  const box = $('rolelist');
  box.textContent = '';

  if (!list.length) { fold.hidden = true; return; }
  fold.hidden = false;
  fold.open = !!openByDefault;

  sum.textContent = 'ספריית התפקידים';
  const n = document.createElement('span');
  n.className = 'roles-n';
  n.textContent = list.length;
  sum.appendChild(n);

  const { formations, mirrored, heroOf, onOpen } = ctx;
  list.forEach(b => {
    const formation = formations[b.formation];
    if (!formation) return;
    const hero = heroOf(b);

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'rolerow';
    row.onclick = () => onOpen(b.id, getLast(b.id));

    const thumb = document.createElement('span');
    thumb.className = 'thumb';
    const first = mirrored ? mirrorScenario(b.scenarios[0], formation) : b.scenarios[0];
    thumb.appendChild(thumbnail(first, formation, hero));
    row.appendChild(thumb);

    const body = document.createElement('span');
    body.className = 'rolebody';

    const num = document.createElement('span');
    num.className = 'rolenum';
    num.textContent = 'מספר ' + hero;
    body.appendChild(num);

    const name = document.createElement('span');
    name.className = 'rolename';
    name.textContent = titleOf(b, ctx);
    body.appendChild(name);

    const track = document.createElement('span');
    track.className = 'roletrack';
    b.scenarios.forEach(s => {
      const i = document.createElement('i');
      if (isLearned(b.id, s.id)) i.className = 'on';
      track.appendChild(i);
    });
    body.appendChild(track);

    row.appendChild(body);

    const go = document.createElement('span');
    go.className = 'rolego';
    go.textContent = '‹';
    row.appendChild(go);

    box.appendChild(row);
  });
}
