-- 0004_math_units — الوحدات الثابتة، والتقريب المضبوط، والتوزيع بأكبر الباقي، والتطبيع (خطّة المرحلة 1 WP1؛ FOUNDATION
--   «الوحدات والتحويل» و«الدقّة والتقريب» ٤٥٧–٤٦٨، و٧٥٨، و٨٠٤).
-- المشكلة: كل حزمة جاية (الاستلام، السحب، التحويل، الجرد، الدفعات) تضرب وتقسم وتقرّب وتوزّع، والقسمة ببوستغريس تقرّب
--   ناتجها لحالها (حوالي ١٦ رقماً معنوياً)، فـround(q * v / l, 2) تقريب مرّتين يطلّع فلساً زايداً عن مرآة الواجهة. هنا
--   الدوالّ الوحيدة لهالحساب، كل وحدة مرآة دالّة بـsrc/domain بفحص تطابق بلا تسامح (parity.test): _mul_div_round2/0
--   (money.ts)، alloc_lr (allocation.ts)، to_base والكثافة (units.ts)، searchable وnormalize_code (normalize.ts)، وphone_key
--   (phone.ts، E34). وجدول units العام الثابت (kg g t L mL pc) بلا org_id، يُقرأ ولا يتعدّل.
-- تراجع: إضافية فقط — جدول جديد ودوالّ private جديدة، وما تغيّر ولا شي موجود (الحزمة تصدّقها بالكتالوج). التراجع إزالة
--   units ويّا الدوالّ بمحرّر SQL بكلمة المالك، وماكو دالّة منشورة تناديها بعد.
-- تنعاد بأمان: if not exists، create or replace، والبذرة on conflict do nothing ويّا فحص يطابقها بالضبط.
-- شفرة الخادم ما تعتمد على لغة القاعدة المحلّية (الإنتاج ICU والحزمة C، DECISIONS ٤٣): قوائم حروف صريحة بنقاطها
--   (U&'\0623' و\x64B بالتعابير)، وما بيها lower() ولا upper() ولا [[:space:]].
-- غير المحدود: 'NaN' و'Infinity' و'-Infinity' أعداد numeric صالحة ببوستغريس، والنصّ العشري من الشبكة (E3) ينقرا بيها.
--   NaN أكبر من كل عدد ويساوي نفسه، فيعبر «x <= 0» و«x <> trunc(x)» و«x > 0 and x = round(x, n)». كل مساعد يرفضهم
--   بـabs(x) < 'Infinity' (خطأ لـNaN ولـ±Infinity)، وقالب العمود (§2.7) check (abs(x) < 'Infinity' and x = round(x, n)).

set lock_timeout = '5s';

-- ─── الضرب-القسمة-التقريب (القاعدة 8): الوحيدة لكل كلفة وتقييم وحصّة ────────────────────────────────────────────
-- q × v ÷ l مقرّباً لـn مراتب بضربة تقريب وحدة، نصفاً بعيداً عن الصفر: sign(v) × round(div(2·q·|v|·10ⁿ + l, 2·l) ÷ 10ⁿ, n).
-- div يقصّ بالضبط (قسمة صحيحة بلا تقريب وسطي)، فـdiv(2x + l, 2l) = x/l + ½ مقصوصاً = التقريب نصفاً للأعلى، والإشارة
-- ترجع بعده. والرجوع للمراتب بالضرب بـ10⁻ⁿ مو بالقسمة على 10ⁿ: القسمة نفسها تقرّب لـ١٦ رقماً معنوياً، فعدد بـ٢٧ رقماً
-- ÷ 100 طلع عدداً صحيحاً مقرّباً (مقيس بالحزمة)، والضرب مضبوط دائماً. q وl كميتان موجبتان، وv قيمة بأي إشارة.
create or replace function private._mul_div_round(p_q numeric, p_v numeric, p_l numeric, p_n int) returns numeric
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
begin
  if p_q is null or p_v is null or p_l is null or p_n is null
     or not (abs(p_q) < 'Infinity' and abs(p_v) < 'Infinity' and abs(p_l) < 'Infinity')
     or p_q <= 0 or p_l <= 0 or p_n < 0 then
    raise exception 'mul_div_domain' using hint = 'تعذّر الحساب: الكمية والأساس يجب أن يكونا أكبر من صفر، وكل القيم أعداد محدودة معروفة.';
  end if;
  return sign(p_v) * round(div(2 * p_q * abs(p_v) * power(10::numeric, p_n) + p_l, 2 * p_l) * power(10::numeric, -p_n), p_n);
end
$$;

-- n=2 للكلف والتقييم (الفلس)، وn=0 لكل مبلغ يدخل دفتر جهة أو صندوق (دينار صحيح).
create or replace function private._mul_div_round2(p_q numeric, p_v numeric, p_l numeric) returns numeric
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select private._mul_div_round(p_q, p_v, p_l, 2)
$$;

create or replace function private._mul_div_round0(p_q numeric, p_v numeric, p_l numeric) returns numeric
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select private._mul_div_round(p_q, p_v, p_l, 0)
$$;

-- ─── التوزيع بأكبر الباقي (القاعدة 11): مرآة allocateLargestRemainder ──────────────────────────────────────────────
-- المبلغ بوحدة 10⁻ˢ (s=2 فلس للحصص بقيمة الدفعات، s=0 دينار صحيح لكل ما يدخل دفتر جهة): الحصّة = div(|المبلغ| × الوزن،
-- مجموع الأوزان)، والوحدات الباقية وحدة وحدة لأكبر البواقي (mod)، والتعادل بترتيب السطر، والإشارة ترجع آخر شي. فالمجموع
-- = المبلغ بالضبط. الأوزان بأي مراتب (كتلة بالكيلو، مبلغ بالدينار): ضربها كلها بنفس العدد ما يغيّر الحصص ولا ترتيب
-- البواقي، فتطابق المرآة اللي أوزانها أعداد صحيحة. نفس ترتيب الرفض بالمرآة: الوزن السالب قبل مجموع الصفر.
create or replace function private.alloc_lr(p_total numeric, p_weights numeric[], p_scale int) returns numeric[]
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  v_weights numeric[] := array(select x.w from unnest(p_weights) with ordinality as x(w, i) order by x.i);
  v_n int;
  v_units numeric;
  v_sum numeric := 0;
  v_shares numeric[] := '{}';
  v_rems numeric[] := '{}';
  v_left numeric;
  v_i int;
begin
  if p_total is null or p_scale is null or p_scale < 0 or not (abs(p_total) < 'Infinity') then
    raise exception 'alloc_scale' using hint = 'تعذّر التوزيع: المبلغ فارغ أو غير محدود أو فيه مراتب أكثر من وحدة التوزيع.';
  end if;
  v_units := abs(p_total) * power(10::numeric, p_scale);
  if v_units <> trunc(v_units) then
    raise exception 'alloc_scale' using hint = 'تعذّر التوزيع: المبلغ فارغ أو غير محدود أو فيه مراتب أكثر من وحدة التوزيع.';
  end if;
  v_n := cardinality(v_weights);
  for v_i in 1 .. v_n loop
    if v_weights[v_i] is null or not (abs(v_weights[v_i]) < 'Infinity') or v_weights[v_i] < 0 then
      raise exception 'negative_weight' using hint = 'تعذّر التوزيع: وزن أحد السطور فارغ أو سالب أو غير محدود.';
    end if;
    v_sum := v_sum + v_weights[v_i];
  end loop;
  if v_sum = 0 then
    raise exception 'zero_weights' using hint = 'مجموع الأوزان صفر، فلا يمكن التوزيع عليها. وزّع بأساس آخر أو اختر سطوراً لها وزن.';
  end if;
  for v_i in 1 .. v_n loop
    v_shares[v_i] := div(v_units * v_weights[v_i], v_sum);
    v_rems[v_i] := mod(v_units * v_weights[v_i], v_sum);
  end loop;
  v_left := v_units - (select sum(s) from unnest(v_shares) as s);
  for v_i in select x.i from unnest(v_rems) with ordinality as x(r, i) order by x.r desc, x.i loop
    exit when v_left = 0;
    v_shares[v_i] := v_shares[v_i] + 1;
    v_left := v_left - 1;
  end loop;
  return array(
    select sign(p_total) * round(x.s * power(10::numeric, -p_scale), p_scale)
    from unnest(v_shares) with ordinality as x(s, i) order by x.i
  );
end
$$;

-- ─── الوحدات والكثافة (القواعد 1 و4): مرآة toBase وlitersToKg وkgToLiters ────────────────────────────────────────
-- qty_base = round3(qty_in_unit × factor): الضرب ببوستغريس مضبوط، فالتقريب مرّة وحدة. المعدود (pc) عدد صحيح وإلا رفض.
create or replace function private.to_base(p_qty_in_unit numeric, p_factor numeric, p_base text) returns numeric
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  v_qty numeric;
begin
  if p_qty_in_unit is null or not (abs(p_qty_in_unit) < 'Infinity') or p_base is null or p_base not in ('kg', 'L', 'pc') then
    raise exception 'unit_domain' using hint = 'التحويل إلى وحدة الأساس يحتاج كمية محدودة ووحدة أساس معروفة (كغم أو لتر أو قطعة).';
  end if;
  if p_factor is null or not (abs(p_factor) < 'Infinity') or p_factor <= 0 then
    raise exception 'factor_not_positive' using hint = 'معامل الوحدة يجب أن يكون عدداً محدوداً أكبر من صفر. راجع وحدات المادّة.';
  end if;
  v_qty := round(p_qty_in_unit * p_factor, 3);
  if p_base = 'pc' and v_qty <> trunc(v_qty) then
    raise exception 'pieces_not_whole' using hint = 'المعدود يُسجَّل بأعداد صحيحة، وهذه الكمية تعطي جزءاً من قطعة. راجع الكمية أو الوحدة.';
  end if;
  return v_qty;
end
$$;

-- كغم = round3(لتر × الكثافة).
create or replace function private.liters_to_kg(p_liters numeric, p_density numeric) returns numeric
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
begin
  if p_liters is null or not (abs(p_liters) < 'Infinity') then
    raise exception 'unit_domain' using hint = 'التحويل بين اللتر والكيلو يحتاج كمية محدودة معروفة.';
  end if;
  if p_density is null or not (abs(p_density) < 'Infinity') or p_density <= 0 then
    raise exception 'density_not_positive' using hint = 'الكثافة يجب أن تكون عدداً محدوداً أكبر من صفر. اكتب كثافة المادّة أولاً.';
  end if;
  return round(p_liters * p_density, 3);
end
$$;

-- لتر = round3(كغم ÷ الكثافة): ضرب-قسمة-تقريب، فمن _mul_div_round (q=1، والإشارة من الكيلو).
create or replace function private.kg_to_liters(p_kg numeric, p_density numeric) returns numeric
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
begin
  if p_kg is null or not (abs(p_kg) < 'Infinity') then
    raise exception 'unit_domain' using hint = 'التحويل بين اللتر والكيلو يحتاج كمية محدودة معروفة.';
  end if;
  if p_density is null or not (abs(p_density) < 'Infinity') or p_density <= 0 then
    raise exception 'density_not_positive' using hint = 'الكثافة يجب أن تكون عدداً محدوداً أكبر من صفر. اكتب كثافة المادّة أولاً.';
  end if;
  return private._mul_div_round(1, p_kg, p_density, 3);
end
$$;

-- ─── التطبيع: مرآة normalize.ts وphone.ts حرفاً بحرف (الحزمة تقارنهم على كل حروف BMP) ───────────────────────────
-- الأرقام الشرقية (٠-٩) والفارسية (۰-۹) غربية، و«٫» نقطة و«٬» فاصلة: مرآة toWesternDigits.
create or replace function private.western_digits(p_input text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select translate(
    p_input,
    U&'\0660\0661\0662\0663\0664\0665\0666\0667\0668\0669\06F0\06F1\06F2\06F3\06F4\06F5\06F6\06F7\06F8\06F9\066B\066C',
    '01234567890123456789.,'
  )
$$;

-- نصّ البحث بالاسم (مرآة searchable): الأرقام غربية قبل مسح التشكيل (U+064B–U+065F وU+0670) والتطويل (U+0640)، لأن
-- مدى U+064B–U+0670 كاملاً يضمّ الأرقام الشرقية و«٧٧٠٩٩» كان ينمسح (FOUNDATION ٧٥٨)؛ ثم أ إ آ ٱ ← ا، ة ← ه، ى ← ي،
-- ؤ ← و، ئ ← ي، واللاتيني الكبير A–Z صغير بقائمة صريحة؛ ثم كل فراغ (نفس قائمة \s بـJavaScript) فراغ واحد، وبلا فراغ بالطرفين.
create or replace function private.searchable(p_input text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select btrim(
    regexp_replace(
      translate(
        regexp_replace(private.western_digits(p_input), '[\x64B-\x65F\x670\x640]', '', 'g'),
        U&'\0623\0625\0622\0671\0629\0649\0624\0626ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        U&'\0627\0627\0627\0627\0647\064A\0648\064Aabcdefghijklmnopqrstuvwxyz'
      ),
      '[\x9-\xD\x20\xA0\x1680\x2000-\x200A\x2028\x2029\x202F\x205F\x3000\xFEFF]+', ' ', 'g'
    ),
    ' '
  )
$$;

-- الباركود والرموز (مرآة normalizeCode): أرقام غربية، بلا أي فراغ، واللاتيني الصغير a–z كبير.
create or replace function private.normalize_code(p_input text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select translate(
    regexp_replace(private.western_digits(p_input), '[\x9-\xD\x20\xA0\x1680\x2000-\x200A\x2028\x2029\x202F\x205F\x3000\xFEFF]', '', 'g'),
    'abcdefghijklmnopqrstuvwxyz',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  )
$$;

-- مفتاح توائم الجهات بالهاتف (E34، مرآة phoneKey): الموبايل العراقي بشكله الموحّد (normalize_phone)، وغيره (أرضي، أجنبي)
-- أرقامه الغربية بس بلا أي فاصل، وبلا رقم ← null.
create or replace function private.phone_key(p_input text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(
    private.normalize_phone(p_input),
    nullif(regexp_replace(private.western_digits(p_input), '[^0-9]', '', 'g'), '')
  )
$$;

-- ─── الوحدات الثابتة (القاعدة 3، FOUNDATION ٢٦٦) ─────────────────────────────────────────────────────────────────
-- عام بلا org_id (استثناء مسمّى، FOUNDATION ٢٣٧): كل منشأة تقرأه، وماكو منح كتابة لأحد، وما يتعدّل ولا ينحذف ولا ينمسح
-- (reject_change). المعامل لوحدة الأساس، والطن 1000 ثابت (القرار 6). الكيس والبرميل والقنينة من item_units لكل مادّة (WP2).
create table if not exists public.units (
  code text primary key,
  dimension text not null,
  base text not null,
  factor numeric not null,
  constraint units_dimension_check check (dimension in ('mass', 'volume', 'count')),
  constraint units_base_check check (base in ('kg', 'L', 'pc')),
  constraint units_base_dimension_check check (
    (dimension = 'mass' and base = 'kg') or (dimension = 'volume' and base = 'L') or (dimension = 'count' and base = 'pc')
  ),
  constraint units_factor_check check (abs(factor) < 'Infinity' and factor > 0 and factor = round(factor, 3))
);

insert into public.units (code, dimension, base, factor) values
  ('kg', 'mass', 'kg', 1),
  ('g', 'mass', 'kg', 0.001),
  ('t', 'mass', 'kg', 1000),
  ('L', 'volume', 'L', 1),
  ('mL', 'volume', 'L', 0.001),
  ('pc', 'count', 'pc', 1)
on conflict (code) do nothing;

-- on conflict do nothing ما يصلّح صفّاً مختلفاً: الإعادة لازم تلكى الست نفسها بالضبط، وإلا الهجرة كلها ترجع.
do $$
begin
  if (select count(*) from public.units) <> 6 or exists (
    select 1 from (values
      ('kg', 'mass', 'kg', 1::numeric), ('g', 'mass', 'kg', 0.001), ('t', 'mass', 'kg', 1000),
      ('L', 'volume', 'L', 1), ('mL', 'volume', 'L', 0.001), ('pc', 'count', 'pc', 1)
    ) as e(code, dimension, base, factor)
    where not exists (
      select 1 from public.units u
      where u.code = e.code and u.dimension = e.dimension and u.base = e.base and u.factor = e.factor
    )
  ) then
    raise exception 'units_seed_mismatch' using hint = 'جدول الوحدات لا يطابق الوحدات الثابتة الست (كغم، غم، طن، لتر، مل، قطعة). راجع القاعدة قبل المتابعة.';
  end if;
end
$$;

create or replace trigger units_append_only before update or delete on public.units
  for each row execute function private.reject_change();
create or replace trigger units_no_truncate before truncate on public.units
  for each statement execute function private.reject_change();

alter table public.units enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'units' and policyname = 'units_read') then
    create policy units_read on public.units for select to authenticated using (true);
  end if;
end
$$;

-- القراءة لـauthenticated بس، وanon ولا شي، وservice_role يقرأ بلا كتابة (الثابت يتغيّر بهجرة بس).
revoke all on table public.units from anon, authenticated;
grant select on table public.units to authenticated;
revoke insert, update, delete, truncate on table public.units from service_role;
