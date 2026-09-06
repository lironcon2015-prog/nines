/* בניית גרסת תפקיד אחד.

   מייצרת עותק עצמאי ומלא של האפליקציה שיש בו חוברת אחת בלבד — הקוד
   זהה, התוכן מסונן. הבידוד הוא בקבצים ולא בממשק: קובצי החוברות האחרות
   פשוט אינם שם, ולכן אין כתובת, מטמון או קישור שיחשוף אותן.

   הרצה:
     node tools-single.mjs winger          כנף, שני הצדדים
     node tools-single.mjs winger right    כנף, נפתח על ימין
     node tools-single.mjs left-back left  מגן, נפתח על שמאל

   התוצאה ב-dist/<חוברת>[-r|-l]/ — תיקייה שאפשר להעלות כאתר בפני עצמו.
   הצד הוא ברירת מחדל לפתיחה הראשונה בלבד; המתג בתוך החוברת ממשיך לעבוד,
   כי אותם תרחישים משוקפים בקוד ואין בהם סוד לצד השני.

   העורך (editor.html) אינו נכנס לחבילה — הוא הכלי של ההורה, לא של מי
   שמקבל את הקישור. */

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const p = (...x) => join(root, ...x);
const readJSON = f => JSON.parse(readFileSync(p(f), 'utf8'));

/* החלפה שנכשלת בקול. החלפה שלא תפסה היא בדיוק סוג הכישלון שמגיע עד
   הטלפון בשקט — קובץ שנראה תקין ומגיש את הדבר הישן. */
function replace(text, pattern, to, what) {
  const out = text.replace(pattern, to);
  if (out === text) {
    console.error('✗ לא נמצא ' + what + ' — הקובץ במקור השתנה, ותקן את tools-single.mjs');
    process.exit(1);
  }
  return out;
}

const [, , id, sideArg] = process.argv;
const index = readJSON('content/booklets.json');

if (!id) {
  console.error('שימוש: node tools-single.mjs <חוברת> [right|left]');
  console.error('חוברות: ' + index.booklets.map(b => b.id).join(' · '));
  process.exit(1);
}

const entry = index.booklets.find(b => b.id === id);
if (!entry) {
  console.error('✗ אין חוברת בשם ' + id);
  console.error('יש: ' + index.booklets.map(b => b.id).join(' · '));
  process.exit(1);
}

const booklet = readJSON(entry.file);

/* הצד אינו "ימין = R". R הוא הצד שבו התרחישים נכתבו ו-L הוא השיקוף
   שלהם, ומי שאומר איזה צד זה בפועל הוא side.a ו-side.b שבחוברת עצמה:
   בחוברות האגף a הוא שמאל, ולכן דווקא הצד הימני הוא המשוקף. מיפוי קשיח
   כאן היה מייצר חבילה שכתוב עליה "הכנף הימנית" ונפתחת על שמאל. */
const asked = sideArg ? ({ right: 'ימין', r: 'ימין', ימין: 'ימין',
  left: 'שמאל', l: 'שמאל', שמאל: 'שמאל' })[sideArg.toLowerCase()] : null;
if (sideArg && !asked) {
  console.error('✗ צד לא מוכר: ' + sideArg + ' (right · left · ימין · שמאל)');
  process.exit(1);
}

const sideOf = booklet.side || { a: 'ימין', b: 'שמאל' };
const side = !asked ? null
  : sideOf.a.includes(asked) ? 'R'
  : sideOf.b.includes(asked) ? 'L'
  : null;
if (asked && !side) {
  console.error('✗ ' + id + ' אינה חוברת אגף — אין בה צד ' + asked);
  process.exit(1);
}

/* titleB הוא השם בצד המשוקף ("המגן הימני"), title בצד שבו נכתבו התרחישים */
const name = side === 'L' && booklet.titleB ? booklet.titleB : booklet.title;
const out = 'dist/' + id + (asked ? '-' + (asked === 'ימין' ? 'right' : 'left') : '');
const dir = p(out);

rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, 'content'), { recursive: true });

/* --- הקוד: כמו שהוא, פחות העורך --- */
cpSync(p('css/app.css'), join(dir, 'css/app.css'));
cpSync(p('fonts.css'), join(dir, 'fonts.css'));
cpSync(p('fonts'), join(dir, 'fonts'), { recursive: true });
cpSync(p('icons'), join(dir, 'icons'), { recursive: true });
writeFileSync(join(dir, '.nojekyll'), '');

const scripts = readdirSync(p('js')).filter(f => f.endsWith('.js') && f !== 'editor.js');
mkdirSync(join(dir, 'js'), { recursive: true });
scripts.forEach(f => cpSync(p('js', f), join(dir, 'js', f)));

/* --- index.html: הכותרת מספרת איזו חוברת זו, ו"כל החוברות" כבר לא נכון --- */
let html = readFileSync(p('index.html'), 'utf8');
html = replace(html, /<title>[^<]*<\/title>/, '<title>' + name + ' — תשיעיות</title>', '<title> ב-index.html');
html = replace(html, /(<meta name="description" content=")[^"]*"/,
  '$1' + name + ' בכדורגל תשיעיות: מיקומים, תנועות, החלטות עם הכדור וטעויות נפוצות."',
  'תיאור ב-index.html');
html = replace(html, /כל החוברות ←/g, 'חזרה ←', 'קישורי החזרה ב-index.html');
writeFileSync(join(dir, 'index.html'), html);

/* --- התוכן: חוברת אחת, ומילון המונחים שהיא משתמשת בו --- */
cpSync(p('content/formations.json'), join(dir, 'content/formations.json'));
cpSync(p(entry.file), join(dir, entry.file));

const single = {
  version: index.version,
  home: {
    eyebrow: index.home.eyebrow,
    title: name,
    lede: 'התפקיד שלך, ובתוכו תרחישים. סמן מה שכבר למדת, וחזור למה שנשאר.',
    foot: index.home.foot
  },
  /* עובר כמו שהוא. כשהוא מפנה לחוברת שאינה בחבילה, app.js לא מהגר
     כלום — ולא מסמן לילד תרחישים שלא ראה */
  legacyBooklet: index.legacyBooklet,
  terms: index.terms,
  booklets: [{ id: entry.id, file: entry.file }]
};
if (side) single.defaultSide = side;
writeFileSync(join(dir, 'content/booklets.json'), JSON.stringify(single, null, 1) + '\n');

/* --- manifest: שם משלו, כדי ששתי גרסאות על אותו טלפון לא ייראו זהות --- */
const manifest = readJSON('manifest.webmanifest');
manifest.name = name + ' — תשיעיות';
manifest.short_name = name;
manifest.description = name + ': מיקומים, תנועות, החלטות עם הכדור וטעויות נפוצות.';
writeFileSync(join(dir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');

/* --- sw.js: מטמון בשם משלו, ורשימת תוכן שאין בה את שאר החוברות --- */
let sw = readFileSync(p('sw.js'), 'utf8');
const tag = out.slice('dist/'.length);
sw = replace(sw, /const VERSION = '(v[0-9]+)';/, "const VERSION = '$1-" + tag + "';", 'VERSION ב-sw.js');
sw = replace(sw, /\n *'\.\/editor\.html'[^\n]*\n/, '\n', 'שורת העורך ב-ASSETS');
sw = replace(sw, /const CONTENT_ASSETS = \[[\s\S]*?\];/,
  "const CONTENT_ASSETS = [\n  './content/booklets.json', './content/formations.json',\n  './" + entry.file + "'\n];",
  'CONTENT_ASSETS ב-sw.js');
writeFileSync(join(dir, 'sw.js'), sw);

/* כל קובץ JS שנארז חייב להיות ב-ASSETS, אחרת הוא לא יישמר לאופליין —
   אותה בדיקה שב-tools-check.sh, כאן על החבילה */
const missing = scripts.filter(f => !sw.includes("'./js/" + f + "'"));
if (missing.length) {
  console.error('✗ אינם ב-ASSETS שב-sw.js: ' + missing.join(' · '));
  process.exit(1);
}

console.log('✓ ' + out + '  ·  ' + name + '  ·  ' + booklet.scenarios.length + ' תרחישים'
  + (asked ? '  ·  נפתח על ' + asked : ''));
console.log('  גרסה ' + index.version + ' · ' + scripts.length + ' קובצי JS · בלי העורך');
console.log('  בדיקה:  cd ' + out + ' && python3 -m http.server 8001');
