/* בדיקות ליחידות שנשברו בפועל.
   רצות מול הקוד עצמו ולא מול העתק שלו, אחרת הן מתיישנות בשקט.
   הרצה: node tools-test.mjs */

import { findExec } from './js/cloud.js';

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

const total = Object.keys(pass).length + Object.keys(fail).length;
console.log(bad ? bad + ' מתוך ' + total + ' נכשלו' : '✓ ' + total + ' בדיקות עוברות');
process.exit(bad ? 1 : 0);
