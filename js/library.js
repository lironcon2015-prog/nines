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
import { videoCount } from './videos.js';
import * as cloud from './cloud.js';

const $ = id => document.getElementById(id);

export function renderLibrary(home, booklets, formations, onOpen, onQuiz, onTrain, version) {
  $('lib-eyebrow').textContent = home.eyebrow;
  $('lib-title').textContent = home.title;
  $('lib-lede').textContent = home.lede;
  $('lib-foot').textContent = home.foot;
  document.title = home.title + ' — תשיעיות';

  /* חיווי גרסה — כדי לדעת במבט אם העדכון האחרון הגיע למכשיר */
  $('lib-ver').textContent = version ? 'גרסה ' + version : '';

  const repaint = () => renderLibrary(home, booklets, formations, onOpen, onQuiz, onTrain, version);

  const mirrored = isMirrored();
  const heroOf = b => {
    const f = formations[b.formation];
    return f && mirrored ? mirrorRole(f, b.role) : b.role;
  };

  const me = getMyNumber();
  /* בשיקוף ההשוואה היא מול התפקיד המשוקף, כך שילד שמאלי שהוא מספר 2
     מקבל את חוברת המגן שהופכת עבורו ל-2. */
  const mine = hasMyNumber() && me > 0
    ? booklets.find(b => heroOf(b) === me) || null
    : null;

  const ctx = { booklets, formations, mirrored, heroOf, me, onOpen, onQuiz, onTrain, repaint };

  renderMeLine(ctx);
  const rest = renderHero(ctx, mine);
  renderRoles(ctx, rest, !hasMyNumber() || !mine);
  renderVideos();
}

/* ---------- שורת המספר ----------
   אחרי שנבחר מספר זו שורה אחת ולא כרטיס: השאלה כבר נענתה, והמקום שייך
   לתפקיד עצמו. לפני שנבחר — אין כאן כלום, כי הבוחר הוא הגיבור. */

function renderMeLine({ me, repaint }) {
  const box = $('me');
  box.textContent = '';
  if (!hasMyNumber()) { box.hidden = true; return; }
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
  key.textContent = 'בוורוד — המספרים שכבר יש להם חוברת';
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
  const { formations, mirrored, heroOf, me, onOpen, onQuiz, onTrain } = ctx;
  const formation = formations[b.formation];
  const hero = heroOf(b);
  const flip = t => (mirrored ? mirrorText(t) : t);

  const card = document.createElement('div');
  card.className = 'big';

  const role = document.createElement('div');
  role.className = 'big-role';
  role.textContent = (tagline || 'התפקיד שלך') + ' · מספר ' + hero;
  card.appendChild(role);

  const head = document.createElement('div');
  head.className = 'big-head';

  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  const first = mirrored ? mirrorScenario(b.scenarios[0], formation) : b.scenarios[0];
  thumb.appendChild(thumbnail(first, formation, hero));
  head.appendChild(thumb);

  const body = document.createElement('div');
  body.className = 'big-body';

  const h3 = document.createElement('h2');
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = titleOf(b, ctx);
  const lastId = getLast(b.id);
  open.onclick = () => onOpen(b.id, lastId);
  h3.appendChild(open);
  body.appendChild(h3);

  const desc = document.createElement('p');
  desc.className = 'big-desc';
  desc.textContent = flip(b.lede);
  body.appendChild(desc);

  const done = learnedCount(b.id);
  const track = document.createElement('div');
  track.className = 'track';
  b.scenarios.forEach(s => {
    const i = document.createElement('i');
    if (isLearned(b.id, s.id)) i.className = 'on';
    track.appendChild(i);
  });
  body.appendChild(track);

  const count = document.createElement('div');
  count.className = 'count';
  count.textContent = `למדתי ${done} מתוך ${b.scenarios.length}`;
  body.appendChild(count);

  head.appendChild(body);
  card.appendChild(head);

  /* המשך מאיפה שהפסיק — רק אם באמת התחיל ולא סיים */
  if (lastId && done < b.scenarios.length) {
    const s = b.scenarios.find(x => x.id === lastId);
    if (s) {
      const resume = document.createElement('p');
      resume.className = 'big-resume';
      resume.textContent = 'המשך: ' + flip(s.title);
      resume.onclick = () => onOpen(b.id, lastId);
      card.appendChild(resume);
    }
  }

  /* האימון הקצר הוא הפעולה הראשית: שלוש שאלות בערב אחרי אימון הן משהו
     שילד באמת חוזר אליו, בניגוד למבדק על חוברת שלמה. */
  const train = document.createElement('button');
  train.type = 'button';
  train.className = 'traingo';
  train.textContent = quizTouched(b.id)
    ? 'האימון של היום · 3 תרחישים'
    : 'התחל אימון · 3 תרחישים';
  train.onclick = () => onTrain(b.id);
  card.appendChild(train);

  /* המבדק המלא נשאר, כמהלך של סוף חוברת ולא כברירת מחדל */
  const quiz = document.createElement('button');
  quiz.type = 'button';
  quiz.className = 'quizgo';
  const q = quizSummary(b.id);
  quiz.textContent = q.done
    ? `מבדק מלא · ${q.exact} מדויקים מתוך ${q.done}`
    : 'מבדק מלא על כל החוברת';
  quiz.classList.toggle('ready', done === b.scenarios.length);
  quiz.onclick = () => onQuiz(b.id);
  card.appendChild(quiz);

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

/* ---------- ספריית הסרטונים ---------- */

function renderVideos() {
  const n = videoCount();
  $('videosn').textContent = n ? ' · ' + n : '';
  /* כשהספרייה משותפת שווה לומר את זה כאן, כי זה משנה מה יימצא בפנים */
  const tag = $('videostag');
  if (cloud.isViewer()) tag.textContent = 'משותפת · צפייה';
  else if (cloud.isOwner()) tag.textContent = 'משותפת';
  else tag.textContent = '';
  tag.hidden = !tag.textContent;
}
