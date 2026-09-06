/* בניית החבילה המלאה: כל החוברות בקובץ JSON אחד.

   האתר בשורש אינו מגיש חוברות (gate:"pack" ב-content/booklets.json) —
   הן מגיעות מהקובץ הזה, שנטען פעם אחת למכשיר ונשמר עליו. כך מי שחותך
   את הכתובת מגרסת התפקיד אל השורש מקבל מסך שמבקש חבילה.

   הרצה:  node tools-pack.mjs          בונה pack/all.json
          node tools-pack.mjs --check  נכשל אם הקובץ אינו מעודכן

   הקובץ נבנה מ-content/ ולכן הוא מתיישן בשקט בכל שינוי תוכן. --check
   רץ מתוך tools-check.sh בדיוק בשביל זה. */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const p = (...x) => join(root, ...x);
const readJSON = f => JSON.parse(readFileSync(p(f), 'utf8'));

export const PACK_FILE = 'pack/all.json';

export function buildPack() {
  const index = readJSON('content/booklets.json');
  return JSON.stringify({
    version: index.version,
    home: index.home,
    /* בלי gate: החבילה היא האינדקס עצמו אחרי שנטענה, ואם היה בה שער
       היא הייתה שולחת את האפליקציה לחפש חבילה בתוך החבילה */
    legacyBooklet: index.legacyBooklet,
    terms: index.terms,
    formations: readJSON('content/formations.json'),
    booklets: index.booklets.map(b => readJSON(b.file))
  }, null, 1) + '\n';
}

const built = buildPack();

if (process.argv.includes('--check')) {
  let have = null;
  try { have = readFileSync(p(PACK_FILE), 'utf8'); } catch (e) { /* אין קובץ */ }
  if (have !== built) {
    console.error('✗ ' + PACK_FILE + ' אינו מעודכן מול content/ — הרץ: node tools-pack.mjs');
    process.exit(1);
  }
  console.log('· ' + PACK_FILE + ' מעודכן');
} else {
  mkdirSync(p('pack'), { recursive: true });
  writeFileSync(p(PACK_FILE), built);
  const n = JSON.parse(built).booklets.length;
  const kb = Math.round(Buffer.byteLength(built) / 1024);
  console.log('✓ ' + PACK_FILE + '  ·  ' + n + ' חוברות  ·  ' + kb + 'KB');
}
