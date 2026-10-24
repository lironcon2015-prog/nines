/* בדיקות ליחידות שנשברו בפועל.
   רצות מול הקוד עצמו ולא מול העתק שלו, אחרת הן מתיישנות בשקט.
   הרצה: node tools-test.mjs */

import { readFileSync } from 'node:fs';
import { findExec } from './js/cloud.js';
import { choreograph, variantsOf, mirrorScenario, mirrorRole } from './js/pitch.js';

const U = 'https://script.google.com/macros/s/AKfycbTEST_deployment-id123/exec';

/* כל אחד מאלה הוא דרך אמיתית שבה כתובת תקינה מגיעה לשדה. הגרסה שבדקה
   מול ביטוי מעוגן נכשלה על רובם, וההודעה אמרה "הכתובת שגויה" כשהיא לא. */
const pass = {
  'נקייה': U,
  'רווח בקצוות': '  ' + U + '  ',
  'שורה חדשה בסוף': U + '\n',
  'שורה חדשה באמצע — גלישת שורה בהעתקה': U.slice(0, 40) + '\n' + U.slice(40),
  'שבורה לשלוש שורות עם הזחה': U.slice(0, 30) + '\n  ' + U.slice(30, 55) + '\n  ' + U.slice(55),
  'טאב באמצע': U.slice(0, 45) + '\t' + U.slice(45),
  'LRM בסוף — העתקה מטקסט בעברית': U + '‎',
  'RLM משני הצדדים': '‏' + U + '‏',
  'עטוף בתווי בידוד': '⁦' + U + '⁩',
  'עטוף ב-LRE/PDF': '‪' + U + '‬',
  'רוחב אפס באמצע': U.slice(0, 50) + '​' + U.slice(50),
  'BOM בהתחלה': '﻿' + U,
  'מקף טיפוגרפי מ-iOS': U.replace('-id', '–id'),
  'טקסט מסביב': 'הכתובת היא ' + U + ' תעתיק',
  'במרכאות': '"' + U + '"',
  'בגרשיים של מרקדאון': '`' + U + '`',
  'עם פרמטרים': U + '?op=ping&k=abc',
  'עם סלאש בסוף': U + '/',
  'עם נקודה בסוף משפט': U + '.',
  'רווח קשיח בקצוות': ' ' + U + ' '
};

/* ואלה חייבים להידחות — הקוד נשלח לכתובת הזאת, ולכן היא לא יכולה
   להיות "כל דבר שנראה בערך נכון". */
const fail = {
  'ריק': '',
  'רק רווחים': '   ',
  'כתובת /dev ולא /exec': U.replace('/exec', '/dev'),
  'כתובת של העורך': 'https://script.google.com/home/projects/abc/edit',
  'דומיין אחר': 'https://docs.google.com/macros/s/AKfycb1/exec',
  'דומיין מתחזה': 'https://script.google.com.evil.test/macros/s/AKfycb1/exec',
  'טקסט אקראי': 'שלום'
};

let bad = 0;
for (const [name, value] of Object.entries(pass)) {
  const got = findExec(value);
  if (got !== U) { console.log('✗ אמור לעבור · ' + name + ' → ' + JSON.stringify(got)); bad++; }
}
for (const [name, value] of Object.entries(fail)) {
  const got = findExec(value);
  if (got !== null) { console.log('✗ אמור להידחות · ' + name + ' → ' + got); bad++; }
}

let total = Object.keys(pass).length + Object.keys(fail).length;

/* ---------- הרצת התנועה ----------
   נשברה בפועל: כל תרחיש נגמר בפחות מחצי שנייה, חיצי "אפשרות" לא זזו
   בכלל (המסירה החוזרת בקיר), ואפשרויות A ו-B רצו יחד. הבדיקות רצות על
   כל התרחישים שבחוברות, בשני הצדדים, ולא על דוגמה אחת. */

const readJSON = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const formations = readJSON('./content/formations.json');
const index = readJSON('./content/booklets.json');
const near = (a, b, r) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= r;

const check = (ok, what) => { total++; if (!ok) { console.log('✗ ' + what); bad++; } };

for (const entry of index.booklets) {
  const book = readJSON('./' + entry.file);
  const formation = formations[book.formation] || formations[Object.keys(formations)[0]];
  for (const side of ['R', 'L']) {
    const hero = side === 'L' ? mirrorRole(formation, book.role) : book.role;
    for (const raw of book.scenarios) {
      const s = side === 'L' ? mirrorScenario(raw, formation) : raw;
      const vs = variantsOf(s);
      for (const v of (vs.length ? vs : [null])) {
        const name = book.id + '/' + s.id + (v ? ' ' + v : '') + (side === 'L' ? ' (שמאל)' : '');
        const p = choreograph(s, formation, hero, v);
        const used = new Set(p.movers.map(m => m.i).concat(p.chain.filter(c => c.type === 'pass').map(c => c.i)));

        /* אף חץ לא נעלם בשקט: או שהוא זז, או שהוא מסומן כמצויר בלבד */
        (s.arrows || []).forEach((ar, i) => {
          if (ar.label && ar.label !== v) return;
          check(used.has(i) || p.statics.includes(i), name + ': החץ ' + i + ' (' + ar.k + ') לא זז ולא מצויר');
        });
        /* אפשרויות חלופיות אינן רצות יחד */
        p.movers.forEach(m => check(!m.ar.label || m.ar.label === v, name + ': אפשרות ' + m.ar.label + ' רצה בתוך ' + v));
        if (!p.acts.length) continue;
        /* קצב שעין יכולה לעקוב אחריו */
        check(p.total >= 600, name + ': כל ההרצה ' + Math.round(p.total) + ' אלפיות — מהר מדי');
        /* כדור אחד: מהלך של הכדור לא מתחיל לפני שהקודם נגמר */
        p.chain.forEach((c, k) => {
          if (!k) return;
          const prev = p.chain[k - 1];
          check(c.start >= prev.start + prev.dur - 1, name + ': שני מהלכים של הכדור חופפים בזמן');
        });
        /* דיוק: מי שמצויר בסוף החץ מסיים בדיוק במקום המצויר */
        p.movers.forEach(m => {
          const home = m.who.num != null ? ((s.pos && s.pos[m.who.num]) || formation.base[m.who.num]) : s.opp[m.who.opp];
          if (m.prev || m.L < m.cv.len - 0.5) return;
          if (near(home, m.ar.b, 24) && !near(home, m.ar.a, 24)) check(near(m.end, home, 0.5), name + ': השחקן לא מסיים במקום המצויר');
        });
      }
    }
  }
}

/* הקיר: המסירה החוזרת זזה, ומגיעה אל ה-8 בסוף הריצה שלו */
{
  const book = readJSON('./content/kesher-8.json');
  const formation = formations[book.formation] || formations[Object.keys(formations)[0]];
  const p = choreograph(book.scenarios.find(x => x.id === 'wall-pass'), formation, 8, null);
  const passes = p.chain.filter(c => c.type === 'pass');
  const run = p.movers.find(m => m.who.num === 8);
  check(passes.length === 2 && passes[1].opt, 'הקיר: המסירה החוזרת לא רצה');
  check(run && run.sync === passes[1], 'הקיר: הריצה של ה-8 לא מתוזמנת עם המסירה החוזרת');
  check(p.steps.length === 2 && /מחזיר ל-8/.test(p.steps[1].text), 'הקיר: הכיתוב של השלב השני — ' + (p.steps[1] || {}).text);
}

console.log(bad ? bad + ' מתוך ' + total + ' נכשלו' : '✓ ' + total + ' בדיקות עוברות');
process.exit(bad ? 1 : 0);
