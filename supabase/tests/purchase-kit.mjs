// أداة مشتركة لفحوص الشراء البسيط (0017: purchase.test وpurchase-fixes.test): الطفرة داخل معاملة صاحب الجداول. مو ملف فحص.

/**
 * معاملة صاحب الجداول (ترجع دائماً): كلّ دالّة بطفراتها (مرساة مرّة واحدة بالضبط في تعريفها)، ثمّ attempt(مستخدم، fn، دور) يجري fn بهويّته
 * بدور authenticated (أو postgres فوق RLS) داخل نقطة حفظ، ويرجّع { ok, value } أو { ok: false, code, hint }.
 */
export async function mutant(db, asUserId, fns, run) {
  return db.asOwner(async (oq) => {
    for (const [signature, pairs] of fns) {
      const def = (await oq('select pg_get_functiondef($1::regprocedure) as d', [signature])).rows[0].d;
      let broken = def;
      for (const [from, to] of pairs) {
        if (broken.split(from).length !== 2) throw new Error(`طفرة ${signature}: المرساة ليست مرّة واحدة: ${from}`);
        broken = broken.split(from).join(to);
      }
      await oq(broken);
    }
    const attempt = async (user, fn, role = 'authenticated') => {
      await oq('savepoint probe');
      try {
        await oq("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: 'authenticated' })]);
        await oq("select set_config('poultry.purchase_doc', '', true)");
        if (role !== 'postgres') await oq(`set local role ${role}`);
        const value = await fn(oq);
        await oq('set local role postgres');
        await oq('release savepoint probe');
        return { ok: true, value };
      } catch (error) {
        await oq('rollback to savepoint probe');
        return { ok: false, code: error.message, hint: error.hint ?? '' };
      }
    };
    return run({ oq, attempt });
  }, asUserId);
}
