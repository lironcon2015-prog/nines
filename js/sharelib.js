/* מסך הספרייה המשותפת: חיבור, שיתוף, והצטרפות.

   שלושה מצבים ולא אחד, כי מה שרואים תלוי במי אתה:
   · לא מחובר — שדה כתובת וקוד, וגם "הצטרף לספרייה של מישהו אחר".
   · בעלים — הקישור שנשלח לילד, וכפתור לשלוח אותו.
   · צופה — מה מחובר, ואיך מתנתקים.

   הילד לא מקליד כתובת של Apps Script באורך מאה תווים, ולכן מה שנשלח הוא
   קישור רגיל לאפליקציה שנושא בתוכו את הכתובת ואת קוד הקריאה. לחיצה עליו
   פותחת את האפליקציה כבר במסך ההצטרפות. */

import * as cloud from './cloud.js';
import { reload, exportDoc, applyRemote, videoCount } from './videos.js';

const $ = id => document.getElementById(id);

/* הכתובת שאליה חוזרים, כדי שקישור ההצטרפות יהיה קישור לאפליקציה עצמה
   ולא למקום שממנו במקרה נפתחה */
function appBase() {
  return location.origin + location.pathname;
}

function joinLink(readCode) {
  return appBase() + '#/join/' + cloud.joinPayload(readCode);
}

function line(parent, cls, text) {
  const p = document.createElement('p');
  p.className = cls;
  p.textContent = text;
  parent.appendChild(p);
  return p;
}

function button(parent, cls, text, onclick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  b.onclick = onclick;
  parent.appendChild(b);
  return b;
}

function field(parent, label, attrs) {
  const l = document.createElement('label');
  l.textContent = label;
  const input = document.createElement('input');
  Object.assign(input, attrs || {});
  l.appendChild(input);
  parent.appendChild(l);
  return input;
}

/** prefill: {url, code} מקישור הצטרפות, או null */
export function mountShare(prefill) {
  document.title = 'ספרייה משותפת — תשיעיות';
  const box = $('s-body');

  const repaint = () => {
    box.textContent = '';
    if (prefill) drawJoin(box, prefill, repaint);
    else if (cloud.isOwner()) drawOwner(box, repaint);
    else if (cloud.isViewer()) drawViewer(box, repaint);
    else drawSetup(box, repaint);
  };
  repaint();

  return {
    go() {},
    destroy() { box.textContent = ''; }
  };
}

/* --- לא מחובר: הקמה או הצטרפות --- */

function drawSetup(box, repaint) {
  $('s-title').textContent = 'ספרייה משותפת';
  line(box, 'lede', 'ספריית הסרטונים יכולה לשבת בתיקיית דרייב שלך, ולהיראות זהה בשני הטלפונים. אין כאן התחברות לחשבון ואין סיסמה — רק כתובת של הסקריפט שהקמת, והקוד שלו.');

  const form = document.createElement('div');
  form.className = 'sform';
  box.appendChild(form);

  const url = field(form, 'כתובת הסקריפט', {
    type: 'url', id: 's-url', placeholder: 'https://script.google.com/macros/s/…/exec',
    autocomplete: 'off', value: ''
  });
  const code = field(form, 'קוד הכתיבה', {
    type: 'text', id: 's-code', placeholder: 'הקוד שהסקריפט הדפיס ביומן', autocomplete: 'off'
  });

  const err = document.createElement('p');
  err.className = 'verror';
  err.hidden = true;
  form.appendChild(err);

  const go = button(form, 'sgo', 'התחבר', async () => {
    err.hidden = true;
    go.disabled = true;
    go.textContent = 'בודק…';
    try {
      const found = await cloud.ping(url.value, code.value);
      cloud.setConfig(found);
      reload();
      /* הספרייה שכבר יש כאן אינה נמחקת — היא עולה לספרייה המשותפת.
         זה הרגע היחיד שבו המיזוג באמת חשוב, ולכן הוא נעשה מיד. */
      await firstSync();
      repaint();
    } catch (e) {
      err.hidden = false;
      err.textContent = (e && e.message) || 'לא הצלחנו להתחבר';
    } finally {
      go.disabled = false;
      go.textContent = 'התחבר';
    }
  });

  const how = document.createElement('details');
  how.className = 'showto';
  const sum = document.createElement('summary');
  sum.textContent = 'איך מקימים את הסקריפט — פעם אחת';
  how.appendChild(sum);
  const list = document.createElement('ol');
  [
    'היכנס ל-script.google.com, פרויקט חדש, והדבק את הקוד מהקובץ apps-script/Code.gs שבמאגר. אין מה למלא בו.',
    'בחר למעלה את הפונקציה setup ולחץ ▶ הפעלה, ואשר את ההרשאות. היא יוצרת את התיקייה בדרייב ואת שני הקודים לבד, ומדפיסה ביומן את קוד הכתיבה.',
    'פרוס: "פריסה חדשה" · סוג "אפליקציית אינטרנט" · הרצה בשמי · גישה לכל מי שיש לו הקישור.',
    'העתק את הכתובת שמסתיימת ב-‎/exec, והדבק אותה כאן יחד עם קוד הכתיבה.'
  ].forEach(text => {
    const li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  });
  how.appendChild(list);
  const warn = document.createElement('p');
  warn.className = 'swarn';
  warn.textContent = 'כשתעדכן את הסקריפט בהמשך — ערוך את הפריסה הקיימת ואל תיצור פריסה חדשה. פריסה חדשה מקבלת כתובת אחרת, ושני הטלפונים מאבדים את הספרייה.';
  how.appendChild(warn);
  box.appendChild(how);

  const other = document.createElement('div');
  other.className = 'sother';
  box.appendChild(other);
  line(other, 'sotitle', 'או: הצטרף לספרייה של מישהו אחר');
  line(other, 'sohint', 'הדבק כאן את הקישור שקיבלת. אפשר גם ללחוץ עליו ישירות, והאפליקציה תיפתח כאן לבד.');
  const paste = field(other, 'הקישור שקיבלת', {
    type: 'text', placeholder: 'הדבק את הקישור', autocomplete: 'off'
  });
  const perr = document.createElement('p');
  perr.className = 'verror';
  perr.hidden = true;
  other.appendChild(perr);
  button(other, 'sgo ghost', 'הצטרף', () => {
    const found = cloud.decodeJoin(paste.value);
    if (!found) {
      perr.hidden = false;
      perr.textContent = 'הקישור לא נראה תקין. העתק אותו שוב, שלם, מההודעה שקיבלת.';
      return;
    }
    /* אין טעם לעבור דרך הכתובת — מה שהודבק כבר מפוענח בידינו */
    mountJoinDirect(found);
  });
}

/* הדבקה ידנית מגיעה בלי מעבר בכתובת, ולכן המסך נבנה כאן ישירות */
function mountJoinDirect(found) {
  const box = $('s-body');
  box.textContent = '';
  drawJoin(box, found, () => {
    box.textContent = '';
    if (cloud.isViewer()) drawViewer(box, () => mountShare(null));
    else drawSetup(box, () => mountShare(null));
  });
}

/* --- הצטרפות --- */

function drawJoin(box, found, repaint) {
  $('s-title').textContent = 'הצטרפות לספרייה';
  line(box, 'lede', 'הקישור תקין. אחרי ההצטרפות תראה בדיוק את אותה ספרייה, ותוכל לנגן כל סרטון בה.');

  const card = document.createElement('div');
  card.className = 'scard';
  box.appendChild(card);
  line(card, 'sfrom', 'הספרייה שאליה אתה מצטרף');
  const where = document.createElement('code');
  where.className = 'surl';
  where.textContent = found.url.replace(/^https:\/\/script\.google\.com\/macros\/s\//, '…/');
  card.appendChild(where);

  const keep = videoCount();
  if (keep) {
    line(box, 'skeep', keep + ' הסרטונים ששמורים אצלך עכשיו לא יימחקו. הם ימתינו כאן, ואם תתנתק מהספרייה המשותפת הם יחזרו.');
  }

  const err = document.createElement('p');
  err.className = 'verror';
  err.hidden = true;
  box.appendChild(err);

  const go = button(box, 'sgo', 'הצטרף לספרייה', async () => {
    err.hidden = true;
    go.disabled = true;
    go.textContent = 'מצטרף…';
    try {
      const conf = await cloud.ping(found.url, found.code);
      cloud.setConfig(conf);
      reload();
      const remote = await cloud.pull();
      applyRemote(remote);
      location.hash = '#/v';
    } catch (e) {
      err.hidden = false;
      err.textContent = (e && e.message) || 'לא הצלחנו להצטרף';
      go.disabled = false;
      go.textContent = 'הצטרף לספרייה';
    }
  });

  button(box, 'sgo ghost', 'לא עכשיו', () => { location.hash = '#/'; });
  return repaint;
}

/* --- בעלים --- */

function drawOwner(box, repaint) {
  const conf = cloud.config();
  $('s-title').textContent = 'הספרייה משותפת';
  line(box, 'lede', 'הספרייה יושבת בתיקיית הדרייב שלך. שלח את הקישור למי שרוצה לראות אותה — הוא יוכל לצפות ולנגן, אבל לא להוסיף, לערוך או למחוק.');

  const card = document.createElement('div');
  card.className = 'scard';
  box.appendChild(card);
  line(card, 'sfrom', 'הקישור לשליחה');

  const link = joinLink(conf.readCode);
  const shown = document.createElement('code');
  shown.className = 'surl';
  shown.textContent = link;
  card.appendChild(shown);

  const row = document.createElement('div');
  row.className = 'srow';
  card.appendChild(row);

  /* שיתוף דרך הטלפון עצמו הוא הדרך הקצרה ביותר לוואטסאפ, וכשאין —
     העתקה ללוח, וכשגם היא חסומה — הקישור עצמו כתוב למעלה לבחירה ידנית. */
  if (navigator.share) {
    button(row, 'sgo', 'שלח את הקישור', () => {
      navigator.share({ title: 'ספריית הסרטונים', text: 'הצטרף לספריית הסרטונים שלנו', url: link })
        .catch(() => { /* ביטול אינו שגיאה */ });
    });
  }
  const copy = button(row, 'sgo ghost', 'העתק קישור', async () => {
    try {
      await navigator.clipboard.writeText(link);
      copy.textContent = 'הועתק';
      setTimeout(() => { copy.textContent = 'העתק קישור'; }, 1600);
    } catch (e) {
      copy.textContent = 'סמן והעתק ידנית';
    }
  });

  line(box, 'swarn', 'מי שמחזיק בקישור רואה את כל הספרייה. אל תשים בה משהו שלא היית שולח בוואטסאפ.');

  const facts = document.createElement('dl');
  facts.className = 'sfacts';
  const fact = (k, v) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    facts.append(dt, dd);
  };
  fact('הכתובת', conf.url.replace(/^https:\/\/script\.google\.com\/macros\/s\//, '…/'));
  fact('התפקיד שלך', 'בעלים — אתה מוסיף, עורך ומוחק');
  fact('סרטונים', String(videoCount()));
  box.appendChild(facts);

  button(box, 'sgo ghost danger', 'נתק את המכשיר הזה', () => {
    if (!confirm('לנתק? הסרטונים שכבר ירדו יישארו כאן, וההוספות החדשות לא יגיעו לצד השני.')) return;
    cloud.disconnect();
    reload();
    repaint();
  });
}

/* --- צופה --- */

function drawViewer(box, repaint) {
  const conf = cloud.config();
  $('s-title').textContent = 'מחובר לספרייה משותפת';
  line(box, 'lede', 'אתה רואה את הספרייה של מי ששיתף אותה. אפשר לנגן כל סרטון; ההוספה והעריכה נעשות אצלו.');

  const facts = document.createElement('dl');
  facts.className = 'sfacts';
  const fact = (k, v) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    facts.append(dt, dd);
  };
  fact('הספרייה', conf.name || 'ספרייה משותפת');
  fact('התפקיד שלך', 'צפייה בלבד');
  fact('סרטונים', String(videoCount()));
  box.appendChild(facts);

  button(box, 'sgo', 'פתח את הספרייה', () => { location.hash = '#/v'; });

  button(box, 'sgo ghost danger', 'התנתק מהספרייה', () => {
    if (!confirm('להתנתק? הספרייה המשותפת תיעלם מכאן, והספרייה שהייתה לך על המכשיר תחזור.')) return;
    cloud.disconnect();
    reload();
    repaint();
  });
}

/* חיבור ראשון של מכשיר שכבר יש בו ספרייה: מה שיש כאן עולה לשם, ומה שיש
   שם יורד לכאן. בלי זה, החיבור היה נראה כאילו הוא מוחק את מה שהיה. */
async function firstSync() {
  const remote = await cloud.pull();
  applyRemote(remote);
  const merged = await cloud.push(exportDoc());
  if (merged) applyRemote(merged);
}
