// قفل تمرير الصفحة بعدّاد واحد لكل شي يغطّيها (Dialog والقائمة بالموبايل).
// كل واحد كان يحفظ overflow ويرجّعه بنفسه: القائمة لو انسدّت تحت نافذة مفتوحة ترجّع '' وتفكّ الصفحة،
// ولو بقت مفتوحة بعد ما الشاشة كبرت تبقى الصفحة مقفولة. هسه الصفحة تنفكّ ويّا آخر واحد يتحرّر بس.

let locks = 0;

/** يقفل تمرير الصفحة ويرجّع دالّة الفكّ. الفكّ مرّتين ما ينقّص العدّاد مرّتين. */
export function lockScroll(): () => void {
  locks += 1;
  if (locks === 1) document.body.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks -= 1;
    if (locks === 0) document.body.style.overflow = '';
  };
}
