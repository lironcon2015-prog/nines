#!/bin/sh
# בדיקה לפני פרסום. שלושת הדברים ששכחתי בפועל, וכל אחד מהם נכשל בשקט:
#   · VERSION ב-sw.js לא עלה  → המכשיר ממשיך להגיש את הקוד הישן
#   · version ב-booklets.json לא עלה  → אי אפשר לדעת אם העדכון הגיע
#   · קובץ JS חדש שאינו ב-ASSETS  → לא נשמר למצב לא-מקוון
# הרץ מהשורש: sh tools-check.sh
cd "$(dirname "$0")" || exit 1
fail=0

sw=$(grep -o "const VERSION = 'v[0-9]*'" sw.js | grep -o "v[0-9]*")
app=$(grep -o '"version": "[^"]*"' content/booklets.json | head -1 | cut -d'"' -f4)
echo "sw.js       $sw"
echo "booklets    $app"

# מול מה שכבר פורסם — אבל רק אם באמת השתנה משהו שמוגש לטלפון.
# שינוי בתיעוד או בכללי העבודה אינו דורש העלאת גרסה, וגייט שצועק לשווא
# הוא גייט שמתרגלים להתעלם ממנו.
touched=$(git diff --name-only origin/main -- index.html sw.js css js content editor.html manifest.webmanifest 2>/dev/null)
if [ -z "$touched" ]; then
  echo "· לא השתנה קוד או תוכן — אין צורך בהעלאת גרסה"
elif git rev-parse --verify -q origin/main >/dev/null; then
  psw=$(git show origin/main:sw.js 2>/dev/null | grep -o "const VERSION = 'v[0-9]*'" | grep -o "v[0-9]*")
  papp=$(git show origin/main:content/booklets.json 2>/dev/null | grep -o '"version": "[^"]*"' | head -1 | cut -d'"' -f4)
  echo "פורסם       sw $psw · גרסה $papp"
  [ "$sw" = "$psw" ] && { echo "✗ VERSION ב-sw.js לא עלה מאז הפרסום האחרון"; fail=1; }
  [ "$app" = "$papp" ] && { echo "✗ version ב-booklets.json לא עלה מאז הפרסום האחרון"; fail=1; }
fi

# כל קובץ JS חייב להיות ב-ASSETS
for f in js/*.js; do
  grep -q "'\./$f'" sw.js || { echo "✗ $f אינו ב-ASSETS שב-sw.js"; fail=1; }
done

# בדיקות היחידה שנשברו בפועל
if command -v node >/dev/null; then
  node tools-test.mjs || fail=1
else
  echo "· node אינו מותקן, בדיקות היחידה לא רצו"
fi

[ $fail -eq 0 ] && echo "✓ מוכן לפרסום"
exit $fail
