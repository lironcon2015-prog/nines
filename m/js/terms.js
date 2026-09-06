/* מילון מונחים.

   התוכן משתמש בשפה של המשחק — "חצי-מרחב", "גוף פתוח", "בלוק" — וילד בן 11
   לא מכיר אותה. בלי הסבר הוא מדלג על המשפט, ואיתו על הרעיון שהתרחיש בא
   ללמד. כאן ההופעה הראשונה של כל מונח בטקסט הופכת לכפתור, ונגיעה בו
   פותחת שורת הסבר אחת.

   המונחים עצמם יושבים ב-content/booklets.json ולא כאן, כי הם תוכן.

   שים לב: המונחים חייבים להיות נטולי "ימין" ו"שמאל". הטקסט מגיע לכאן
   אחרי mirrorText, וטקסט שמתהפך היה מפספס את ההתאמה בצד אחד מהשניים. */

/* תחיליות שנדבקות למילה בעברית: "בחצי-מרחב", "והפרוזדור", "לחלל".
   הן נכנסות לתוך הכפתור יחד עם המונח, כדי שהקו התחתון לא ייראה שבור. */
const PREFIX = 'והבלמשכ';

const escape = s => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

/**
 * @param {Object<string,string>} terms  מונח → שורת הסבר
 * @returns {{decorate:(t:string)=>Node, define:(t:string)=>string, reset:Function, any:boolean}}
 */
export function createGlossary(terms) {
  /* הארוך קודם, כדי ש"גוף פתוח" ינצח התאמה חלקית קצרה יותר */
  const keys = Object.keys(terms || {}).sort((a, b) => b.length - a.length);

  if (!keys.length) {
    return {
      any: false,
      decorate: t => document.createTextNode(typeof t === 'string' ? t : ''),
      define: () => null,
      reset() {}
    };
  }

  /* גבול המילה נתפס כקבוצה ולא כ-lookbehind: יש אייפונים בשירות שבהם
     lookbehind אינו נתמך, ואפליקציה שנופלת על regex אינה שווה את הקיצור. */
  const re = new RegExp(
    '(^|[^א-ת])([' + PREFIX + ']{0,2})(' + keys.map(escape).join('|') + ')(?![א-ת])',
    'g'
  );

  let used = new Set();

  return {
    any: true,

    /** מונח מוסבר פעם אחת בכל תרחיש — לא בכל הופעה */
    reset() { used = new Set(); },

    define: term => (terms[term] || null),

    decorate(text) {
      const frag = document.createDocumentFragment();
      if (typeof text !== 'string') return frag;

      re.lastIndex = 0;
      let at = 0, m;
      while ((m = re.exec(text)) !== null) {
        const [, lead, prefix, term] = m;
        if (used.has(term)) continue;
        used.add(term);

        const start = m.index + lead.length;
        frag.appendChild(document.createTextNode(text.slice(at, start)));

        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'term';
        b.dataset.term = term;
        b.setAttribute('aria-expanded', 'false');
        b.textContent = prefix + term;
        frag.appendChild(b);

        at = start + prefix.length + term.length;
      }
      frag.appendChild(document.createTextNode(text.slice(at)));
      return frag;
    }
  };
}
