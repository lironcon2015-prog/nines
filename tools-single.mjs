/* בניית גרסה לתפקיד אחד.

   מייצרת עותק עצמאי ומלא של האפליקציה שיש בו חוברת אחת בלבד — הקוד
   זהה, התוכן מסונן. הבידוד הוא בקבצים: קובצי החוברות האחרות אינם
   בתיקייה, ולכן אין באפליקציה כתובת, מטמון או קישור שיחשוף אותן.
   מי שחותך את הכתובת ומגיע לשורש מקבל את הגרסה המלאה, שאין בה תוכן
   בלי החבילה (ראה tools-pack.mjs).

   הרצה:
     node tools-single.mjs                  בונה את התיקיות שמתפרסמות
     node tools-single.mjs --check          נכשל אם הן אינן מעודכנות
     node tools-single.mjs winger           בנייה לבדיקה ב-dist/winger
     node tools-single.mjs winger --side right

   הצד הוא ברירת מחדל לפתיחה הראשונה בלבד; המתג בתוך החוברת ממשיך לעבוד,
   כי אותם תרחישים משוקפים בקוד ואין בהם סוד לצד השני.

   העורך (editor.html) אינו נכנס לחבילה — הוא הכלי של ההורה. */

import {
  readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync, existsSync
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const p = (...x) => join(root, ...x);
const readJSON = f => JSON.parse(readFileSync(p(f), 'utf8'));

/* התיקיות שמתפרסמות באתר. שם התיקייה הוא הסיומת בכתובת:
   …/nines/w/ הוא הכנף, …/nines/m/ הוא המגן. */
const PUBLISHED = { w: 'winger', m: 'left-back' };

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

/* scope הוא הזהות של הגרסה — הסיומת בכתובת — ולא בהכרח שם התיקייה
   שנכתבת אליה: --check בונה לתיקייה זמנית וחייב לקבל בדיוק את אותם
   קבצים, אחרת כל בדיקה הייתה מכריזה על הבדל שאינו קיים. */
/* המילים הפותחות שמשותפות לשני השמות. ברמת מילה ולא תו, אחרת "המגן
   השמאלי" ו"המגן הימני" היו נחתכים באמצע מילה. */
function shared(a, b) {
  const wa = a.split(' '), wb = b.split(' ');
  const out = [];
  for (let i = 0; i < Math.min(wa.length, wb.length) && wa[i] === wb[i]; i++) out.push(wa[i]);
  return out.length ? out.join(' ') : a;
}

function build(id, dir, sideArg, scope = dir) {
  const index = readJSON('content/booklets.json');
  const entry = index.booklets.find(b => b.id === id);
  if (!entry) {
    console.error('✗ אין חוברת בשם ' + id + '. יש: ' + index.booklets.map(b => b.id).join(' · '));
    process.exit(1);
  }
  const booklet = readJSON(entry.file);

  /* הצד אינו "ימין = R". R הוא הצד שבו התרחישים נכתבו ו-L הוא השיקוף
     שלהם, ומי שאומר איזה צד זה בפועל הוא side.a ו-side.b שבחוברת עצמה:
     בחוברות האגף a הוא שמאל, ולכן דווקא הצד הימני הוא המשוקף. מיפוי
     קשיח כאן היה מייצר תיקייה שכתוב עליה "הכנף הימנית" ונפתחת על שמאל. */
  const asked = sideArg ? ({ right: 'ימין', r: 'ימין', 'ימין': 'ימין',
    left: 'שמאל', l: 'שמאל', 'שמאל': 'שמאל' })[sideArg.toLowerCase()] : null;
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

  /* titleB הוא השם בצד המשוקף ("המגן הימני"), title בצד שבו נכתבו
     התרחישים. כשלא נקבע צד, שם של צד אחד היה שקר על מסך הבית של מי
     שמשחק בשני — ולכן נשאר מה שמשותף לשניהם ("המגן"), והכרטיס שבפנים
     ממילא מציג את השם המלא לפי המתג. */
  const name = !side ? shared(booklet.title, booklet.titleB || booklet.title)
    : side === 'L' && booklet.titleB ? booklet.titleB
    : booklet.title;
  const out = p(dir);

  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'content'), { recursive: true });

  /* --- הקוד: כמו שהוא, פחות העורך --- */
  cpSync(p('css/app.css'), join(out, 'css/app.css'));
  cpSync(p('fonts.css'), join(out, 'fonts.css'));
  cpSync(p('fonts'), join(out, 'fonts'), { recursive: true });
  cpSync(p('icons'), join(out, 'icons'), { recursive: true });
  writeFileSync(join(out, '.nojekyll'), '');

  const scripts = readdirSync(p('js')).filter(f => f.endsWith('.js') && f !== 'editor.js');
  mkdirSync(join(out, 'js'), { recursive: true });
  scripts.forEach(f => cpSync(p('js', f), join(out, 'js', f)));

  /* --- index.html --- */
  let html = readFileSync(p('index.html'), 'utf8');
  html = replace(html, /<title>[^<]*<\/title>/, '<title>' + name + ' — תשיעיות</title>',
    '<title> ב-index.html');
  html = replace(html, /(<meta name="description" content=")[^"]*"/,
    '$1' + name + ' בכדורגל תשיעיות: מיקומים, תנועות, החלטות עם הכדור וטעויות נפוצות."',
    'תיאור ב-index.html');
  /* app-scope מפריד את המפתחות שאסור להם להיות משותפים בין הגרסאות
     שיושבות על אותו דומיין — ראה SCOPE ב-store.js */
  html = replace(html, /(<meta name="viewport"[^>]*>)/,
    '$1\n<meta name="app-scope" content="' + scope.replace(/[^a-z0-9-]/gi, '') + '">',
    'meta viewport ב-index.html');
  html = replace(html, /כל החוברות ←/g, 'חזרה ←', 'קישורי החזרה ב-index.html');
  writeFileSync(join(out, 'index.html'), html);

  /* --- התוכן: חוברת אחת. בלי gate, כי כאן התוכן מגיע עם האתר --- */
  cpSync(p('content/formations.json'), join(out, 'content/formations.json'));
  cpSync(p(entry.file), join(out, entry.file));

  const single = {
    version: index.version,
    home: {
      eyebrow: index.home.eyebrow,
      title: name,
      lede: 'התפקיד שלך, ובתוכו תרחישים. סמן מה שכבר למדת, וחזור למה שנשאר.',
      foot: index.home.foot
    },
    /* עובר כמו שהוא. כשהוא מפנה לחוברת שאינה כאן, app.js לא מהגר כלום —
       ולא מסמן לילד תרחישים שלא ראה */
    legacyBooklet: index.legacyBooklet,
    terms: index.terms,
    booklets: [{ id: entry.id, file: entry.file }]
  };
  if (side) single.defaultSide = side;
  writeFileSync(join(out, 'content/booklets.json'), JSON.stringify(single, null, 1) + '\n');

  /* --- manifest: שם משלו, כדי ששתי גרסאות על אותו טלפון לא ייראו זהות --- */
  const manifest = readJSON('manifest.webmanifest');
  manifest.name = name + ' — תשיעיות';
  manifest.short_name = name;
  manifest.description = name + ': מיקומים, תנועות, החלטות עם הכדור וטעויות נפוצות.';
  writeFileSync(join(out, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');

  /* --- sw.js: מטמון בשם משלו, ורשימת תוכן שאין בה את שאר החוברות ---
     בלי שם משלו שתי הגרסאות שעל אותו דומיין היו נלחמות על אותו מטמון. */
  let sw = readFileSync(p('sw.js'), 'utf8');
  sw = replace(sw, /const VERSION = '(v[0-9]+)';/, "const VERSION = '$1-" + scope + "';",
    'VERSION ב-sw.js');
  sw = replace(sw, /\n *'\.\/editor\.html'[^\n]*\n/, '\n', 'שורת העורך ב-ASSETS');
  sw = replace(sw, /const CONTENT_ASSETS = \[[\s\S]*?\];/,
    "const CONTENT_ASSETS = [\n  './content/booklets.json', './content/formations.json',\n  './"
    + entry.file + "'\n];", 'CONTENT_ASSETS ב-sw.js');
  writeFileSync(join(out, 'sw.js'), sw);

  /* כל קובץ JS שנארז חייב להיות ב-ASSETS, אחרת לא יישמר לאופליין —
     אותה בדיקה שב-tools-check.sh, כאן על התיקייה */
  const missing = scripts.filter(f => !sw.includes("'./js/" + f + "'"));
  if (missing.length) {
    console.error('✗ אינם ב-ASSETS שב-sw.js: ' + missing.join(' · '));
    process.exit(1);
  }

  return { dir, name, scenarios: booklet.scenarios.length, asked, scripts: scripts.length };
}

/* --- השוואת תיקיות, ל---check --- */
function walk(base, at = base, list = []) {
  for (const f of readdirSync(at)) {
    const full = join(at, f);
    if (statSync(full).isDirectory()) walk(base, full, list);
    else list.push(relative(base, full));
  }
  return list;
}

function diff(a, b) {
  const fa = new Set(walk(a));
  const fb = new Set(walk(b));
  const out = [];
  for (const f of fa) if (!fb.has(f)) out.push('חסר: ' + f);
  for (const f of fb) if (!fa.has(f)) out.push('עודף: ' + f);
  for (const f of fa) {
    if (!fb.has(f)) continue;
    if (!readFileSync(join(a, f)).equals(readFileSync(join(b, f)))) out.push('שונה: ' + f);
  }
  return out;
}

/* --- הפעלה --- */
const args = process.argv.slice(2);
const check = args.includes('--check');
const si = args.indexOf('--side');
const sideArg = si >= 0 ? args[si + 1] : null;
const id = args.find(a => !a.startsWith('--') && a !== sideArg);

if (check) {
  let bad = 0;
  for (const [dir, booklet] of Object.entries(PUBLISHED)) {
    const tmp = '.check-' + dir;
    build(booklet, tmp, null, dir);
    if (!existsSync(p(dir))) {
      console.error('✗ התיקייה ' + dir + '/ אינה קיימת — הרץ: node tools-single.mjs');
      bad = 1;
    } else {
      const d = diff(p(tmp), p(dir));
      if (d.length) {
        console.error('✗ ' + dir + '/ אינה מעודכנת (' + d.slice(0, 5).join(' · ')
          + (d.length > 5 ? ' ועוד ' + (d.length - 5) : '') + ') — הרץ: node tools-single.mjs');
        bad = 1;
      }
    }
    rmSync(p(tmp), { recursive: true, force: true });
  }
  if (!bad) console.log('· ' + Object.keys(PUBLISHED).join('/ ו-') + '/ מעודכנות');
  process.exit(bad);
}

if (!id) {
  /* בלי ארגומנטים — בונים את מה שמתפרסם */
  for (const [dir, booklet] of Object.entries(PUBLISHED)) {
    const r = build(booklet, dir);
    console.log('✓ ' + r.dir + '/  ·  ' + r.name + '  ·  ' + r.scenarios + ' תרחישים');
  }
} else {
  const dir = 'dist/' + id + (sideArg ? '-' + sideArg : '');
  const r = build(id, dir, sideArg);
  console.log('✓ ' + r.dir + '  ·  ' + r.name + '  ·  ' + r.scenarios + ' תרחישים'
    + (r.asked ? '  ·  נפתח על ' + r.asked : ''));
  console.log('  בדיקה:  cd ' + r.dir + ' && python3 -m http.server 8001');
}
