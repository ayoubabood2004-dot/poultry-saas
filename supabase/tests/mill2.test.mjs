// معمل العلف، النسخة الثانية (0016، كلمة المالك 2026-11-04 وأجوبته D1–D3): create_recipe بنداء واحد (مفعَّلة، أو كلّها ترجع
// بـbasis_mismatch، وتُعاد بأمان بالمعرّف)؛ ومعدّلات تكاليف الطنّ تصير سطور تكاليف بالدفعة؛ والتحميل من المصاريف المؤهّلة الأقدم
// فالأحدث تحت قفلها (expense_overloaded، وexpense_allocated، والإلغاء يوقف التحميل)، وقيمة دفعة الناتج = السحوبات + التكاليف
// بالضبط؛ وختم الكلف يفرغ بتعديل سطر؛ ومشغّل المعمل لا يرى صفّاً من الجداول الثلاثة ولا رقماً في المعاينة؛ وadd_production_input
// (إضافة وتبديل بسبب)؛ وسعر الكلفة المكتوب للتخطيط فقط؛ ومصدر دفعة العلف المنتج رقم دفعة الإنتاج؛ وكلّ فحص جديد في verify_mill
// تكسره طفرة حقيقية (الدالّة مكسورة بمعاملة ترجع، لا صفّ مكتوب باليد).
// والدمج (القسمان ١٠ و١١): كلّ جواب جديد يمرّ بمحلّل الشاشات الحقيقي محزوماً بـesbuild، وrepo الحقيقي (postgrest-js) يصل القاعدة
// الحقيقية بـminiPostgrest، للمدير ومشغّل المعمل والمحاسب.
// ودمج الجولة الثانية (fixes2.md القسم د): expenses_visible على جذر المعاينة والبطاقة، وscope بطرفيه لأمين العلف وأمين المواد ومحاسب
// العلف (والإلغاء من طرف المدخلات وحده كما تُظهر الشاشة زرّه)، وin_basis على قطع لوحة المعمل وسطور الخلطة (ولقطته بعد تغيير نوع المادّة،
// ومجموع الكتلة = خلايا ما داخلها)، وcosts_unsealed_scope بـdivision_name، وno_mass_inputs، ومشكلة التاريخ بتلميح الخادم؛ وكلّ مشكلة
// يرسلها الخادم تعرضها BatchPage بجملتها لا بالجملة العامّة؛ وrepo: الختم وكتابة المبلغ وإضافة السطر وحذفه out_of_scope لمحاسب المواد،
// وترحيله costs_unsealed_scope قبل الختم ونجاحه بعده، وloadBatch من طرف العلف من روابط بطاقة العلف الثلاثة، والاسم المكرّر لفئة المصروف
// category_name_taken (createExpenseCategory وrename)، وتاريخ انتهاء الناتج بـsetBatchFields، وno_mass_inputs في الترحيل.
// ودمج الجولة الثالثة (fixes3.md القسم د): لقطة وحدة الأساس على جواب recipe_detail الحقيقي بمحلّله (unit_changed لسطر تغيّرت وحدة مادّته بعد
// التفعيل، والوحدة و«داخل الكتلة» من اللقطة، والمسوّدة بالوحدة الحيّة)، وdraws = null لطرف الناتج (أمين العلف ومحاسبه، في المرحَّلة والملغاة)
// بمحلّل البطاقة وloadBatch، وcreate_production وcreateProduction يُرفضان item_changed بتلميحه (RejectedError كما تعرضه نافذة «أنتج»)، والكثافة
// للتخطيط لقطة السطر؛ وsetBatchFields({ producedOn }) من حقل يوم الإنتاج ثمّ المعاينة (date_too_old وdate_in_future بجملتي الخادم) والترحيل بيومه.
// ودمج الجولة الرابعة (fixes4.md القسم د): unit_mismatch على كلّ سطر من جواب recipe_detail الحقيقي بمحلّله، والكتل null (كتلة السطر وحصّته ومجموع
// الكتلة في المسوّدة، وقطعة لوحة المعمل في حالة مجمَّدة بلا كثافة مزروعة بمعاملة ترجع) لا صفراً؛ ولقطة لتر لمادّة صارت بالكيلو: create_production
// وcreateProduction ينجحان بالكتلة من لقطة الكثافة، وnew_recipe_version وnewRecipeVersion يحوّلان السطر كيلوغراماً، وactivate_recipe_version
// وactivateVersion يُرفضان bad_recipe_unit بتلميح يسمّي المادّة، ثمّ الحذف والإضافة بالكيلوغرام كما تقول جملة البطاقة.
// والجولة الخامسة (fixes5.md، ق٥٥ وب٤٨): المواضع الأربعة التي ثبّتت شكل جواب «نسخة جديدة» القديم بمحلّل الشاشة تزيد skipped فارغاً (لا مادّة صارت قطعة).
// ودمج الجولة الخامسة (fixes5.md القسم د): density_missing على جواب recipe_detail الحقيقي بمحلّله (سائل بلا كثافة في المسوّدة ولو كُتب بالكيلو، والنسخة
// المفعَّلة بلقطتها)، وverify_mill بدور postgres على السطر المزروع خارج الكتلة وداخلها (عدد لا رمية) ولوحة المعمل وبطاقة الخلطة عليه بمحلّليهما، وكلفة الطنّ
// المتوقّعة لسطر الدبس (لتر لمادّة صارت بالكيلو بلقطة كثافته) بمحلّلَي البطاقة واللوحة وloadRecipe وloadMill، وskipped بـnew_recipe_version وnewRecipeVersion
// الحقيقيين (مادّتان صارتا قطعة)، وسطر بالكيلو لمادّة صارت قطعة في المسوّدة بوحدتها الحيّة pc (ب٤١)، ثمّ ما تقوله الجمل: الكثافة من نافذة المادّة،
// والذرة 1,000، فتتفعّل ويُنتَج بها؛ ورفض «تغيّر من جهاز آخر» (ب٤٢) من كلّ كتابة مشروطة في صفحتَي الدفعة والخلطة برمز تعيد له الصفحة القراءة،
// والقراءة الجديدة شرط الحفظ التالي فينجح.
// والجولة السادسة (fixes6.md القسم أ): المواضع التي ثبّتت السلوك القديم حُدّثت — كلفة الطنّ المتوقّعة بمفتاح unconverted (ق٦١) في الجواب الخام وبمحلّل الشاشة
// (مفتاح إلزامي)، وتلميح density_required بالمكان الذي تُكتب فيه الكثافة (ق٦٥)، والإعادة بالمعرّف نفسه existing = false وskipped الأولى (ق٦٣).
// ودمج الجولة السادسة (fixes6.md القسم د): unconverted على جواب recipe_detail الحقيقي بمحلّله وبلوحة كلفة الطنّ الحقيقية (ExpectedPanel بـreact-dom/server: «لا تُحسب
// حتّى تُصحَّح سطورها أعلاه» لا «بلا أيّ سعر» لسطر سعره مكتوب، ومنه القطعة في المسوّدة والمفعَّلة)، وskipped مع المادّة المؤرشفة التي صارت قطعة وسطر اللتر لسائل صار قطعة،
// والإعادة بالمعرّف نفسه بمحلّل «نسخة جديدة» (قبل التفعيل وبعده)، والكتلة الصفرية (البطاقة لا ترمي، والتفعيل وحارس السطر وتحويل «نسخة جديدة» qty_not_positive بتلميحه)؛
// ومن الشاشة بـrepo الحقيقي: الرحلة من رابط «اكتب الكثافة» (recipeBack وloadItem وupdateItem ونسخة الرابط) حتّى التفعيل، وsetArchived ثمّ newRecipeVersion وإعادته،
// وqty_not_positive من التفعيل ونافذتي «عدّل» و«أضف مادّة»، وتلميح density_required بالمكان الجديد من «أضف مادّة» في الخلطة والدفعة.
// الأرقام محسوبة باليد بالتعليق جنب كلّ واحد، لا منسوخة من جواب الدالّة.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { race } from './shared.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUNDLE = {
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  logLevel: 'silent',
  define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
};
const loaded = (result) => import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

/** محلّلات الشاشات الحقيقية لأجوبة 0016 (الدمج، درس 2026-11-02): المصدر نفسه محزوماً بـesbuild، لا نسخة منه ولا جواب مكتوب باليد. */
async function screensParser() {
  return loaded(
    await build({
      ...BUNDLE,
      stdin: {
        contents: [
          "export { parseRecipes, parseRecipe, parsePreview, parseBatch, parseProductions, parseCreatedRecipe, parseNewRecipeVersion } from './src/lib/repo/mill.ts';",
          "export { parseItemLots, parseItemPurchases } from './src/lib/repo/inventory.ts';",
          "export { parseExpenseReport } from './src/lib/repo/cash.ts';",
        ].join('\n'),
        resolveDir: ROOT,
        loader: 'ts',
      },
    }),
  );
}

/**
 * جمل مشاكل الدفعة في الشاشة (BatchPage.problemText وproblemLine، الجولة الثانية): رمز يرسله الخادم ولا تعرفه الشاشة يُعرض بالجملة
 * العامّة «مشكلة في الدفعة: {code}»، وفرق اسم الرمز بين الطرفين لا يمسكه فحص أيّ طرف وحده. الصفحة نفسها محزومةً (الجلسة والإشعار
 * بديلان لا يُستعملان هنا)، وتصديرها كلّه كائناً فلا يكسر الحزم تصديرٌ غائب في نسخة أقدم من الشاشات. ومعها (الجولة السادسة) بطاقة الخلطة
 * (لوحة كلفة الطنّ ExpectedPanel تُرسم بـreact-dom/server على الجواب المحلَّل) و«المواد» (recipeBack: مسار الرجوع بعد كتابة الكثافة).
 */
async function screensText() {
  const STUBS = {
    session: 'export const useSession = () => ({ status: "loading" }); export const sessionStore = { get: () => ({ status: "loading" }) };',
    Toast: 'export const toast = () => {}; export function Toaster() { return null; }',
  };
  return loaded(
    await build({
      ...BUNDLE,
      jsx: 'automatic',
      // React بنسخة الإنتاج (الرسم بـreact-dom/server لا يطبع تحذيرات التطوير).
      define: { ...BUNDLE.define, 'process.env.NODE_ENV': '"production"' },
      stdin: {
        contents: [
          "export * as batchPage from './src/pages/mill/BatchPage.tsx';",
          "export * as recipePage from './src/pages/mill/RecipePage.tsx';",
          "export * as itemsPage from './src/pages/inventory/ItemsPage.tsx';",
          "export { renderToStaticMarkup } from 'react-dom/server.browser';",
          "export { createElement } from 'react';",
        ].join('\n'),
        resolveDir: ROOT,
        loader: 'tsx',
      },
      plugins: [
        {
          name: 'mill-text-stubs',
          setup(b) {
            b.onResolve({ filter: /\/lib\/session$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'mill-text-stub' }));
            b.onLoad({ filter: /.*/, namespace: 'mill-text-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
          },
        },
      ],
    }),
  );
}

// عميل Supabase للدمج (ب): postgrest-js الحقيقي يبني الطلب كما في المتصفّح، وfetch يذهب إلى globalThis.__millPg (miniPostgrest).
const CLIENT = `
import { PostgrestClient } from '@supabase/postgrest-js';
export async function getClient() {
  const rest = new PostgrestClient('http://pg.local/rest/v1', { fetch: (...a) => globalThis.__millPg.fetch(...a) });
  return {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: globalThis.__millPg.user }, access_token: 'a' } }, error: null }),
      refreshSession: async () => ({ data: { session: {} }, error: null }),
    },
    from: (table) => rest.from(table),
    rpc: (fn, args) => rest.rpc(fn, args),
  };
}
export const STORED_SESSION = /^sb-.+-auth-token$/;
export function addAuthListener() { return () => {}; }
export async function dropClient() {}
`;

/** دوالّ repo الحقيقية التي تناديها شاشات المعمل والمادّة والمصاريف، بعميل الدمج: الطلب كما تبنيه الشاشة يصل القاعدة الحقيقية. */
async function screensRepo() {
  return loaded(
    await build({
      ...BUNDLE,
      stdin: {
        contents: [
          'export { createRecipe, loadRecipe, loadMill, loadBuilder, createProduction, previewProduction, loadBatch, addProductionInput,',
          '  deleteProductionInput, addBatchCost, setBatchCost, deleteBatchCost, addRecipeRate, setRecipeRate, deleteRecipeRate, setInputActual,',
          "  confirmCosts, postProduction, newRecipeVersion, loadMillStores, loadExpenseCategories, setBatchFields, discardBatch, setRecipeLine,",
          "  activateVersion, addRecipeLine, deleteRecipeLine, setVersionBasis } from './src/lib/repo/mill.ts';",
          'export { loadItemLots, loadItemMoves, loadItemPurchases, setItemCostPrice, createExpenseCategory, rename, createItem, loadItem, updateItem, findItemTwins, setArchived }',
          "  from './src/lib/repo/inventory.ts';",
          "export { loadExpenses, voidExpense } from './src/lib/repo/cash.ts';",
          "export { RejectedError, ZeroRowsError } from './src/lib/errors.ts';",
          // تاريخ انتهاء الناتج كما تقرؤه الشاشة وتعرضه (ب٦): parseDayText للمكتوب، وfmtDay للمحفوظ.
          "export { parseDayText } from './src/lib/dayText.ts';",
          "export { fmtDay } from './src/lib/format.ts';",
        ].join('\n'),
        resolveDir: ROOT,
        loader: 'ts',
      },
      plugins: [
        {
          name: 'mill-client',
          setup(b) {
            b.onResolve({ filter: /^\.\/client$/ }, (args) => (args.importer.includes(`${path.sep}lib${path.sep}repo${path.sep}`) ? { path: 'client', namespace: 'mill-client' } : undefined));
            b.onLoad({ filter: /.*/, namespace: 'mill-client' }, () => ({ contents: CLIENT, resolveDir: ROOT, loader: 'js' }));
          },
        },
      ],
    }),
  );
}

/**
 * PostgREST مصغَّر فوق القاعدة الحقيقية لما تطلبه هذه الشاشات (الدمج ب). postgrest-js الحقيقي يبني الطلب، وهنا يصير جملة واحدة بمعاملة
 * واحدة بهويّة المستخدم (db.asUser: مطالبات JWT ودور authenticated وحدوده)، كما يفعل PostgREST. الدالّة بأسماء معاملاتها وأنواعها من
 * الكتالوج: اسم لا تعرفه أو معامل إلزامي ناقص = PGRST202 (404) كما يردّ PostgREST، فلا يعبر فرق اسم بصمت. والجدول: select بأعمدته
 * وتحويلاتها (amount::text يرجع باسم amount)، وeq وneq وgt وgte وlt وlte وis، وorder وlimit، وPrefer: return=representation؛
 * والجواب json_agg للصفوف (التواريخ نصوصاً والأعداد أعداداً كما يرسلها PostgREST)، والخطأ برمز القاعدة وتلميحه وحالة HTTP.
 * ما لا يعرفه يرمي PGRST100 باسمه (لا يخمّن).
 */
function miniPostgrest(db) {
  const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
  const RESERVED = new Set(['select', 'order', 'columns', 'limit', 'offset']);
  const signatures = new Map();
  const unsupported = (what) => Object.assign(new Error(`miniPostgrest: ${what}`), { code: 'PGRST100', status: 400 });
  const ident = (name) => {
    if (!/^[a-z_][a-z0-9_]*$/u.test(name)) throw unsupported(`identifier «${name}»`);
    return name;
  };
  const columns = (select) =>
    !select || select === '*'
      ? '*'
      : select
          .split(',')
          .map((part) => {
            const m = /^([a-z_][a-z0-9_]*)(?:::([a-z_]+))?$/u.exec(part);
            if (!m) throw unsupported(`select «${part}»`);
            return m[2] ? `${m[1]}::${m[2]} as ${m[1]}` : m[1];
          })
          .join(', ');
  const where = (params, values) => {
    const parts = [];
    for (const [key, raw] of params) {
      if (RESERVED.has(key)) continue;
      const dot = raw.indexOf('.');
      const op = raw.slice(0, dot);
      const operand = raw.slice(dot + 1);
      if (op === 'is' && ['null', 'true', 'false'].includes(operand)) parts.push(`${ident(key)} is ${operand}`);
      else if (OPS[op]) {
        values.push(operand);
        parts.push(`${ident(key)} ${OPS[op]} $${values.length}`);
      } else throw unsupported(`filter «${key}=${raw}»`);
    }
    return parts.length ? ` where ${parts.join(' and ')}` : '';
  };
  const orderBy = (order) =>
    order
      ? ` order by ${order
          .split(',')
          .map((part) => {
            const [col, dir] = part.split('.');
            return `${ident(col)} ${dir === 'desc' ? 'desc' : 'asc'}`;
          })
          .join(', ')}`
      : '';
  const param = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v);

  async function rpc(fn, args) {
    if (!signatures.has(fn)) {
      const { rows } = await db.admin(
        `select coalesce(p.proargnames, '{}') as names, p.pronargs as n, p.pronargdefaults as d,
           array(select format_type(x.t, null) from unnest(p.proargtypes::oid[]) with ordinality as x(t, k) order by x.k) as types
         from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
        [ident(fn)],
      );
      signatures.set(fn, rows);
    }
    const keys = Object.keys(args).filter((k) => args[k] !== undefined);
    const match = signatures.get(fn).find((s) => keys.every((k) => s.names.includes(k)) && s.names.slice(0, s.n - s.d).every((k) => keys.includes(k)));
    if (!match) throw Object.assign(new Error(`Could not find the function public.${fn}(${keys.join(', ')}) in the schema cache`), { code: 'PGRST202', status: 404 });
    const typeOf = (k) => match.types[match.names.indexOf(k)];
    const sql = `select public.${fn}(${keys.map((k, i) => `${ident(k)} => $${i + 1}::${typeOf(k)}`).join(', ')}) as body`;
    const values = keys.map((k) => (args[k] === null ? null : /json/u.test(typeOf(k)) ? JSON.stringify(args[k]) : param(args[k])));
    return (await db.asUser(server.user, (q) => q(sql, values), { commit: true })).rows[0].body;
  }

  // طلب بعد طلب: عميل الحزمة اتّصال واحد، وطلبان متوازيان (loadMill) كانا يتداخلان على معاملته الواحدة؛ وPostgREST يعطي كلّ طلب اتّصاله.
  let queue = Promise.resolve();
  const serial = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };

  const server = {
    user: null,
    fetch: (url, init = {}) => serial(() => server.handle(url, init)),
    async handle(url, init) {
      const u = new URL(String(url));
      const route = u.pathname.replace(/^\/rest\/v1\//u, '');
      const method = init.method ?? 'GET';
      const prefer = String(init.headers?.Prefer ?? init.headers?.prefer ?? '');
      const reply = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      try {
        const body = init.body ? JSON.parse(init.body) : null;
        if (route.startsWith('rpc/')) return reply(200, await rpc(route.slice('rpc/'.length), body ?? {}));
        const table = `public.${ident(route)}`;
        const values = [];
        const select = columns(u.searchParams.get('select'));
        const represent = method === 'GET' || /return=representation/u.test(prefer);
        let statement;
        if (method === 'GET') {
          const limit = u.searchParams.get('limit');
          statement = `select ${select} from ${table}${where(u.searchParams, values)}${orderBy(u.searchParams.get('order'))}${limit ? ` limit ${Number.parseInt(limit, 10)}` : ''}`;
        } else if (method === 'POST') {
          const rows = Array.isArray(body) ? body : [body];
          const cols = [...new Set(rows.flatMap((row) => Object.keys(row)))].map(ident);
          const tuples = rows.map(
            (row) =>
              `(${cols
                .map((c) => {
                  values.push(param(row[c] ?? null));
                  return `$${values.length}`;
                })
                .join(', ')})`,
          );
          statement = `insert into ${table} (${cols.join(', ')}) values ${tuples.join(', ')} returning ${select}`;
        } else if (method === 'PATCH') {
          const sets = Object.keys(body).map((c) => {
            values.push(param(body[c]));
            return `${ident(c)} = $${values.length}`;
          });
          statement = `update ${table} set ${sets.join(', ')}${where(u.searchParams, values)} returning ${select}`;
        } else throw unsupported(`method ${method}`);
        const sql = `with t as (${statement}) select coalesce(json_agg(t), '[]'::json) as body from t`;
        const out = (await db.asUser(server.user, (q) => q(sql, values), { commit: true })).rows[0].body;
        if (!represent) return reply(method === 'POST' ? 201 : 204, undefined);
        return reply(method === 'POST' ? 201 : 200, out);
      } catch (error) {
        const code = error.code ?? '';
        const status = error.status ?? (code === '23505' || code === '23503' ? 409 : code === '42501' ? 403 : 400);
        return reply(status, { code, message: error.message, details: error.detail ?? null, hint: error.hint ?? null });
      }
    },
  };
  return server;
}

const TODAY = '2026-11-04';
const id = (n) => `c2160000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477992160${String(n).padStart(2, '0')}`;
const local = (canonical) => `0${canonical.slice(3)}`;
let refs = 0;
const ref = () => id(900 + (refs += 1));

// accRaw: محاسب نطاقه مخزن المواد الأوّلية وحده (إصلاحات مراجعة 0016، ق١١): يرى الكلفة ولا يرى مصاريف وحدة المعمل.
// keepFeed وkeepRaw وaccFeed (الجولة الثانية، ق٢٥): أمين نطاقه مخزن العلف وحده، وأمين نطاقه مخزن المواد وحده، ومحاسب نطاقه مخزن العلف؛
// وmgrRaw وmgrFeed مديران (الإلغاء للمدير) نطاق كلّ منهما مخزن واحد من طرفي الدفعة.
const U = {
  owner: id(1), manager: id(2), miller: id(3), accountant: id(4), keeper: id(5), accRaw: id(6), keepFeed: id(7), keepRaw: id(8), accFeed: id(9), mgrRaw: id(10), mgrFeed: id(11),
};

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  for (const [i, user] of Object.values(U).entries()) {
    await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [user, phone(i + 1)]);
  }
  await db.asUser(U.owner, (q) => q("select public.create_my_org('مزرعة المعمل الثاني', 'المالك')"), { commit: true });
  const org = (await db.admin('select org_id from public.members where user_id = $1', [U.owner])).rows[0].org_id;
  const one = async (user, sql, params = []) => Object.values((await db.asUser(user, (q) => q(sql, params), { commit: true })).rows[0] ?? {})[0];
  const division = async (kind) => (await db.admin('select id from public.divisions where org_id = $1 and kind = $2', [org, kind])).rows[0].id;
  const MILL = await division('feed_mill');
  const GENERAL = await division('general');
  const wh = async (kind) => (await db.admin('select id from public.warehouses where org_id = $1 and kind = $2', [org, kind])).rows[0].id;
  const RAW = await wh('raw');
  const FEEDWH = await wh('feed');

  const invite = async (user, n, role, divisions = [], warehouses = []) => {
    const member = await one(U.owner, 'select public.add_member_v2($1, $2, $3, $4::uuid[], $5::uuid[], $6::uuid[]) as id', [local(phone(n)), role, role, divisions, [], warehouses]);
    await db.acceptInvite(U.owner, user, member);
  };
  await invite(U.manager, 2, 'manager');
  await invite(U.miller, 3, 'mill_operator', [MILL]);
  await invite(U.accountant, 4, 'accountant');
  await invite(U.keeper, 5, 'storekeeper');
  await invite(U.accRaw, 6, 'accountant', [], [RAW]);
  await invite(U.keepFeed, 7, 'storekeeper', [], [FEEDWH]);
  await invite(U.keepRaw, 8, 'storekeeper', [], [RAW]);
  await invite(U.accFeed, 9, 'accountant', [], [FEEDWH]);
  await invite(U.mgrRaw, 10, 'manager', [], [RAW]);
  await invite(U.mgrFeed, 11, 'manager', [], [FEEDWH]);

  /** نداء بمعاملة تثبت إذا نجح: { ok, v, rows } أو { ok: false, code, hint }. */
  const call = async (user, sql, params = []) => {
    try {
      const result = await db.asUser(user, (q) => q(sql, params), { commit: true });
      return { ok: true, v: result.rows[0] ? Object.values(result.rows[0])[0] : null, rows: result.rows, count: result.rowCount };
    } catch (error) {
      return { ok: false, code: error.message, hint: error.hint ?? null };
    }
  };
  const code = (outcome) => (outcome.ok ? 'ok' : outcome.code);
  const nonZero = async (fn) => Object.fromEntries((await db.admin(`select check_name, violations::int as n from public.${fn}() where violations <> 0`)).rows.map((r) => [r.check_name, r.n]));

  await one(U.manager, 'select public.set_division_go_live($1, public.app_today() - 10)', [MILL]);
  await one(U.manager, 'select public.set_division_go_live($1, public.app_today() - 10)', [GENERAL]);

  // ─── المواد والمورّد والصندوق وفئات المصاريف ───────────────────────────────────────────────────────────────
  const item = (name, kind, unit) => one(U.manager, 'insert into public.items (name, kind, base_unit) values ($1, $2, $3) returning id', [name, kind, unit]);
  const CORN = await item('ذرة صفراء', 'raw', 'kg');
  const SOY = await item('كسبة صويا', 'raw', 'kg');
  const BRAN = await item('نخالة', 'raw', 'kg');
  const WHEAT = await item('حنطة', 'raw', 'kg');
  const SALT = await item('ملح علفي', 'raw', 'kg'); // لا شراء ولا رصيد ولا سعر كلفة: «بلا سعر»
  const YEAST = await item('خميرة معبّأة', 'raw', 'pc');
  const SACK = await item('كيس علف', 'packaging', 'pc');
  const FEED = await item('علف بادئ', 'feed', 'kg');
  const FEED2 = await item('علف ناهي', 'feed', 'kg');
  const supplier = await one(U.manager, "insert into public.parties (name, is_supplier) values ('مورّد الحبوب', true) returning id");
  const BOX = await one(U.manager, "insert into public.cash_accounts (name, kind) values ('صندوق المعمل', 'cash') returning id");
  const category = (name) => one(U.manager, 'insert into public.expense_categories (name) values ($1) returning id', [name]);
  const LABOR = await category('أيدي عاملة');
  const POWER = await category('كهرباء');
  const TRANSPORT = await category('نقل');
  const PACKING = await category('تعبئة');
  const OLD = await category('قديمة');
  await one(U.manager, 'update public.expense_categories set archived_at = now() where id = $1 returning id', [OLD]);
  const SYSTEM = (await db.admin('select id from public.expense_categories where org_id = $1 and system_code is not null order by system_code limit 1', [org])).rows[0].id;

  /** استلام مرحَّل: كمية بوحدة الأساس ومبلغ السطر، فتصير دفعة بسعرها. */
  const receive = async (itemId, qty, total) => {
    const doc = await one(U.manager, 'insert into public.receipts (party_id, warehouse_id, received_on) values ($1, $2, public.app_today()) returning id', [supplier, RAW]);
    await one(U.manager, 'insert into public.receipt_lines (doc_id, item_id, qty_in_unit) values ($1, $2, $3) returning id', [doc, itemId, qty]);
    await one(U.manager, 'insert into public.receipt_line_amounts (line_id, line_total) select id, $2 from public.receipt_lines where doc_id = $1 returning line_id', [doc, total]);
    const out = await call(U.manager, 'select public.post_receipt($1, (select version from public.receipts where id = $1), $2)', [doc, ref()]);
    if (!out.ok) throw new Error(`استلام فشل: ${out.code} ${out.hint}`);
  };
  await receive(CORN, 2000, 1800000); // 900 للكيلو
  await receive(SOY, 1000, 1500000); // 1,500 للكيلو
  await receive(BRAN, 500, 250000); // 500 للكيلو
  await receive(WHEAT, 300, 240000); // 800 للكيلو

  // ─── ١) create_recipe: معاملة واحدة ──────────────────────────────────────────────────────────────────────────
  const createRecipe = (user, rid, vid, name, output, basis, lines, rates, activate) =>
    call(user, 'select public.create_recipe($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)', [rid, vid, name, output, basis, JSON.stringify(lines), JSON.stringify(rates), activate]);
  const R1 = id(101);
  const V1 = id(102);
  // 600 ذرة + 400 صويا = 1,000 كغم = الأساس، وتكاليف «أيدي عاملة» 5,000 و«كهرباء» 1,500 لكلّ طنّ.
  const R1_LINES = [{ item_id: CORN, qty: 600, unit: 'kg' }, { item_id: SOY, qty: 400, unit: 'kg' }];
  const R1_RATES = [{ category_id: LABOR, amount_per_ton: 5000 }, { category_id: POWER, amount_per_ton: 1500 }];
  const built = await createRecipe(U.manager, R1, V1, 'بادئ ذهبي', FEED, 1000, R1_LINES, R1_RATES, true);
  t.same(built.v, { id: R1, lines: 2, rates: 2, status: 'active', version_id: V1, version_no: 1 }, `create_recipe: الخلطة ونسختها وسطراها ومعدّلاها مفعَّلة بنداء واحد (${built.code ?? ''} ${built.hint ?? ''})`);
  const again = await createRecipe(U.manager, R1, V1, 'بادئ ذهبي', FEED, 1000, R1_LINES, R1_RATES, true);
  t.same(again.v, built.v, 'create_recipe: الإعادة بالمعرّف نفسه (جواب ضاع) ترجّع النتيجة نفسها بلا صفّ ثانٍ');
  t.eq((await db.admin('select count(*)::int as n from public.recipes where org_id = $1', [org])).rows[0].n, 1, 'ضابط: الإعادة لم تُنشئ خلطة ثانية');
  t.same(
    [
      code(await createRecipe(U.manager, R1, V1, 'بادئ فضّي', FEED, 1000, R1_LINES, R1_RATES, true)),
      code(await createRecipe(U.manager, R1, V1, 'بادئ ذهبي', FEED2, 1000, R1_LINES, R1_RATES, true)),
      code(await createRecipe(U.manager, id(111), V1, 'بادئ برونزي', FEED, 1000, R1_LINES, R1_RATES, true)),
      code(await createRecipe(U.manager, id(111), id(112), 'بادئ ذهبي', FEED, 1000, R1_LINES, R1_RATES, true)),
    ],
    ['id_conflict', 'id_conflict', 'id_conflict', 'recipe_name_taken'],
    'المعرّف نفسه باسم آخر أو منتج آخر، أو معرّف نسخة مستعمل: id_conflict؛ والاسم المأخوذ يُسمّى قبل القيد',
  );
  // 600 + 300 = 900 والأساس 1,000: الفرق −100، فلا يبقى صفّ واحد من الخلطة ولا نسختها ولا سطورها ولا معدّلها.
  const mismatch = await createRecipe(U.manager, id(103), id(104), 'ناهي', FEED2, 1000,
    [{ item_id: CORN, qty: 600, unit: 'kg' }, { item_id: SOY, qty: 300, unit: 'kg' }], [{ category_id: LABOR, amount_per_ton: 100 }], true);
  t.eq(code(mismatch), 'basis_mismatch', 'المجموع 900 والأساس 1,000 مع التفعيل: basis_mismatch');
  t.ok(/900/u.test(mismatch.hint ?? '') && /1000/u.test(mismatch.hint ?? '') && /-100/u.test(mismatch.hint ?? ''), `التلميح يسمّي المجموع والأساس والفرق (${mismatch.hint})`);
  t.same(
    (await db.admin(`select (select count(*) from public.recipes where id = $1)::int as r, (select count(*) from public.recipe_versions where id = $2)::int as v,
      (select count(*) from public.recipe_lines where version_id = $2)::int as l, (select count(*) from public.recipe_cost_rates where version_id = $2)::int as c`, [id(103), id(104)])).rows[0],
    { r: 0, v: 0, l: 0, c: 0 },
    'basis_mismatch يرجّع كلّ شيء: لا خلطة ولا نسخة ولا سطر ولا معدّل',
  );
  const R2 = id(105);
  const V2 = id(106);
  const draft = await createRecipe(U.manager, R2, V2, 'تجريبي', FEED2, 1000, [{ item_id: CORN, qty: 500, unit: 'kg' }], [], false);
  t.same([draft.v?.status, draft.v?.lines, draft.v?.rates], ['draft', 1, 0], 'بلا تفعيل: مسوّدة بسطرها ولو لم يساوِ المجموع الأساس');
  t.same(
    [
      code(await createRecipe(U.miller, id(121), id(122), 'خلطة المشغّل', FEED, 1000, R1_LINES, [], true)),
      code(await createRecipe(U.keeper, id(121), id(122), 'خلطة الأمين', FEED, 1000, R1_LINES, [], true)),
      code(await createRecipe(U.accountant, id(121), id(122), 'خلطة المحاسب', FEED, 1000, R1_LINES, [], true)),
    ],
    ['forbidden', 'forbidden', 'forbidden'],
    'create_recipe لفعل التفعيل (المالك والمدير): مشغّل المعمل والأمين والمحاسب ممنوعون',
  );
  // الحرّاس القائمة هي من يفحص: مادّة بالقطعة، وفئة مكرّرة ونظامية ومؤرشفة، ومبلغ صفر، وكمية سالبة — وكلّها ترجع بلا صفّ.
  const one000 = [{ item_id: CORN, qty: 1000, unit: 'kg' }];
  t.same(
    [
      code(await createRecipe(U.manager, id(107), id(108), 'مكيّسة', FEED2, 1000, [{ item_id: SACK, qty: 1000, unit: 'kg' }], [], true)),
      code(await createRecipe(U.manager, id(107), id(108), 'مكرّرة', FEED2, 1000, one000, [{ category_id: LABOR, amount_per_ton: 100 }, { category_id: LABOR, amount_per_ton: 200 }], true)),
      code(await createRecipe(U.manager, id(107), id(108), 'نظامية', FEED2, 1000, one000, [{ category_id: SYSTEM, amount_per_ton: 100 }], true)),
      code(await createRecipe(U.manager, id(107), id(108), 'مؤرشفة', FEED2, 1000, one000, [{ category_id: OLD, amount_per_ton: 100 }], true)),
      code(await createRecipe(U.manager, id(107), id(108), 'بلا مبلغ', FEED2, 1000, one000, [{ category_id: LABOR, amount_per_ton: 0 }], true)),
      code(await createRecipe(U.manager, id(107), id(108), 'سالبة', FEED2, 1000, [{ item_id: CORN, qty: -5, unit: 'kg' }], [], true)),
    ],
    ['bad_recipe_unit', 'category_duplicated', 'system_expense', 'category_archived', 'amount_not_positive', 'qty_not_positive'],
    'create_recipe: مادّة بالقطعة، وفئة مرّتين، وفئة نظامية، وفئة مؤرشفة، ومبلغ صفر، وكمية سالبة',
  );
  t.eq((await db.admin('select count(*)::int as n from public.recipes where id = $1', [id(107)])).rows[0].n, 0, 'ضابط: الرفض لم يترك خلطة');

  // معدّل الخلطة: كتابة مباشرة على النسخة المسوّدة وحدها، بفعل التفعيل، والفئة لا تتغيّر (عمود غير ممنوح).
  const rateSql = 'insert into public.recipe_cost_rates (version_id, category_id, amount_per_ton) values ($1, $2, $3) returning id';
  const R1_LABOR = (await db.admin('select id from public.recipe_cost_rates where version_id = $1 and category_id = $2', [V1, LABOR])).rows[0].id;
  t.same(
    [
      code(await call(U.manager, rateSql, [V1, TRANSPORT, 100])),
      code(await call(U.manager, 'update public.recipe_cost_rates set amount_per_ton = 1 where id = $1 returning id', [R1_LABOR])),
      code(await call(U.miller, rateSql, [V2, TRANSPORT, 300])),
      code(await call(U.keeper, rateSql, [V2, TRANSPORT, 300])),
    ],
    ['not_draft', 'not_draft', 'forbidden', 'forbidden'],
    'المعدّل: النسخة المفعَّلة مجمَّدة، ومشغّل المعمل والأمين ممنوعان (الحارس قبل سياسة الإدراج)',
  );
  const v2Before = (await db.admin('select version from public.recipe_versions where id = $1', [V2])).rows[0].version;
  const draftRate = await call(U.manager, rateSql, [V2, TRANSPORT, 300]);
  t.ok(draftRate.ok, `المدير يضيف معدّلاً للنسخة المسوّدة (${draftRate.code ?? ''})`);
  t.same(
    (await db.admin('select r.line_no, r.amount_per_ton::text as a, v.version from public.recipe_cost_rates r join public.recipe_versions v on v.id = r.version_id where r.id = $1', [draftRate.v])).rows[0],
    { line_no: 1, a: '300.00', version: v2Before + 1 },
    'رقم السطر الأوّل والمبلغ بمرتبتين يكتبهما الخادم، ونسخة النسخة تزيد',
  );
  t.ok(/permission denied/u.test(code(await call(U.manager, 'update public.recipe_cost_rates set category_id = $2 where id = $1', [draftRate.v, PACKING]))), 'فئة المعدّل لا تتغيّر (العمود غير ممنوح): يُحذف ويُضاف غيره');
  const rateGone = await call(U.manager, "select public.delete_draft_line('recipe_cost_rate', $1, (select version from public.recipe_versions where id = $2)) ->> 'deleted' as v", [draftRate.v, V2]);
  t.same([rateGone.v, (await db.admin('select count(*)::int as n from public.recipe_cost_rates where version_id = $1', [V2])).rows[0].n], ['true', 0], 'delete_draft_line(recipe_cost_rate) يحذف المعدّل من المسوّدة');

  // ─── ٢) معدّلات الطنّ ← سطور تكاليف الدفعة ───────────────────────────────────────────────────────────────────
  const create = (user, batch, version, kg) => call(user, 'select public.create_production($1, $2, $3, $4, $5, public.app_today())', [batch, version, kg, RAW, FEEDWH]);
  const B1 = id(201);
  const made = await create(U.miller, B1, V1, 2000);
  t.ok(made.ok, `مشغّل المعمل يسوّد دفعة 2,000 كغم (${made.code ?? ''} ${made.hint ?? ''})`);
  // أيدي عاملة 5,000 × 2,000 ÷ 1,000 = 10,000.00؛ وكهرباء 1,500 × 2,000 ÷ 1,000 = 3,000.00.
  const costsOf = async (batch) => (await db.admin(`select c.line_no, k.name, c.planned_amount::text as planned, c.amount::text as amount, c.source
    from public.production_costs c join public.expense_categories k on k.id = c.category_id where c.batch_id = $1 order by c.line_no`, [batch])).rows;
  t.same(
    await costsOf(B1),
    [
      { line_no: 1, name: 'أيدي عاملة', planned: '10000.00', amount: '10000.00', source: 'recipe' },
      { line_no: 2, name: 'كهرباء', planned: '3000.00', amount: '3000.00', source: 'recipe' },
    ],
    'سطر تكاليف لكلّ معدّل بـ_mul_div_round: 5,000 × 2,000 كغم = 10,000.00، و1,500 × 2,000 كغم = 3,000.00',
  );

  // ─── ٣) المعاينة والتحميل من المصاريف ─────────────────────────────────────────────────────────────────────────
  const preview = async (user, batch) => (await call(user, 'select public.preview_production($1)', [batch])).v;
  // بلا مصروف بعد: المتاح صفر لكلّ سطر. المواد: ذرة 1,200 × 900 = 1,080,000 وصويا 800 × 1,500 = 1,200,000 ← 2,280,000؛
  // والتكاليف 13,000 ← الكلّي 2,293,000، وكلفة الكيلو 2,293,000 ÷ 2,000 = 1,146.50.
  const p0 = await preview(U.accountant, B1);
  t.same(
    [p0.money.input_value, p0.money.extra_value, p0.money.total_value, p0.money.cost_per_kg, p0.can_post],
    ['2280000.00', '13000.00', '2293000.00', '1146.50', false],
    'المعاينة: الكلف اليدوية الحقيقية في extra_value وفي الكلّي وكلفة الكيلو',
  );
  t.same(
    p0.money.costs.map((c) => [c.line_no, c.category_name, c.planned_amount, c.amount, c.source, c.available]),
    [[1, 'أيدي عاملة', '10000.00', '10000.00', 'recipe', '0.00'], [2, 'كهرباء', '3000.00', '3000.00', 'recipe', '0.00']],
    'سطور التكاليف في المعاينة بالمحسوب والمبلغ والمتاح من المصاريف',
  );
  t.same(
    p0.problems.filter((x) => x.code === 'costs_unfunded').map((x) => [x.category_name, x.need, x.have]),
    [['أيدي عاملة', '10000.00', '0.00'], ['كهرباء', '3000.00', '0.00']],
    'costs_unfunded لكلّ سطر لا يكفيه المتاح، بأرقامه لأدوار الكلفة',
  );
  const pm = await preview(U.miller, B1);
  t.same(
    [pm.money, pm.problems.map((x) => x.code), pm.expenses_visible],
    [undefined, ['costs_pending'], false],
    'مشغّل المعمل قبل الختم: المعاينة بلا مال، وانتظار الختم وحده (مراجعة 0016 الثانية ق٢١: costs_unfunded بلا أرقام بعد الختم فقط، وكانت قبله)',
  );

  const expense = async (n, cat, div, amount, daysAgo, note = null) => {
    const out = await call(U.accountant, "select public.record_expense($1, $2, $3, $4, public.app_today() - $5::int, 'cash', $6, null, null, null, null, null, $7, null, $8)",
      [id(n), cat, div, amount, daysAgo, BOX, note, ref()]);
    if (!out.ok) throw new Error(`مصروف فشل: ${out.code} ${out.hint}`);
    return id(n);
  };
  // مصاريف لا يحمَّل منها: «أيدي عاملة» على الوحدة العامّة، و«نقل» على المعمل، و«أيدي عاملة» على المعمل أُلغي — وكلّها أقدم من المؤهّلة.
  const E4 = await expense(504, LABOR, GENERAL, 50000, 7, 'أجور المخازن');
  const E5 = await expense(505, TRANSPORT, MILL, 20000, 6, 'نقل الحبوب');
  const E6 = await expense(506, LABOR, MILL, 30000, 6, 'تسجيل خاطئ');
  t.ok((await call(U.manager, "select public.void_expense($1, 'تسجيل خاطئ', $2)", [E6, ref()])).ok, 'إلغاء مصروف لم يُحمَّل منه شيء يمرّ');
  const E1 = await expense(501, LABOR, MILL, 8000, 5, 'أجور الأسبوع الأوّل');
  const E3 = await expense(503, POWER, MILL, 4000, 3, 'كهرباء المعمل');
  const p1 = await preview(U.accountant, B1);
  t.same(
    [p1.money.costs.map((c) => c.available), p1.problems.filter((x) => x.code === 'costs_unfunded').map((x) => [x.category_name, x.need, x.have])],
    [['8000.00', '4000.00'], [['أيدي عاملة', '10000.00', '8000.00']]],
    'المتاح: «أيدي عاملة» 8,000 فقط (لا العامّة ولا الملغى)، و«كهرباء» 4,000 يكفي سطرها',
  );
  const POST = "select public.post_production($1, (select version from public.production_batches where id = $1), coalesce($2, public.preview_production($1) ->> 'plan_token'), $3)";
  const post = (user, batch, plan = null) => call(user, POST, [batch, plan, ref()]);
  const overloaded = await post(U.manager, B1);
  t.same(
    [code(overloaded), overloaded.hint],
    ['expense_overloaded', 'أيدي عاملة: المطلوب 10,000 والمتاح من المصاريف المسجّلة 8,000. سجّل المصروف أوّلاً أو قلّل المبلغ.'],
    'الترحيل والمتاح أقلّ من السطر: expense_overloaded بالفئة والمطلوب والمتاح',
  );
  t.same(
    [(await db.admin('select status from public.production_batches where id = $1', [B1])).rows[0].status,
      (await db.admin('select count(*)::int as n from public.production_cost_allocations where batch_id = $1', [B1])).rows[0].n],
    ['draft', 0],
    'الرفض يرجّع كلّ شيء: الدفعة مسوّدة ولا تحميل',
  );
  const confirm = (user, batch) => call(user, 'select public.confirm_production_costs($1, (select version from public.production_batches where id = $1))', [batch]);
  // مراجعة 0016 (#1 و#8): الختم يأذن لمشغّل المعمل بالترحيل، فلا يُختم ما يُرفض ترحيله (FOUNDATION ٥٦٠): المتاح 8,000 والسطر 10,000.
  // (كان الختم يمرّ هنا فيُرفض بعده ترحيل مشغّل المعمل؛ وتلميحه بلا أرقام لمن لا يرى وحدة المدخلات في mill2-fixes.)
  const unfundedSeal = await confirm(U.accountant, B1);
  t.same(
    [code(unfundedSeal), unfundedSeal.hint, (await db.admin('select costs_confirmed_at is null as open from public.production_batches where id = $1', [B1])).rows[0].open],
    ['expense_overloaded', 'أيدي عاملة: المطلوب 10,000 والمتاح من المصاريف المسجّلة 8,000. سجّل المصروف أوّلاً أو قلّل المبلغ.', true],
    'الختم والمتاح أقلّ من السطر: expense_overloaded بأرقامه للمحاسب، والدفعة تبقى بلا ختم',
  );
  t.eq(code(await post(U.miller, B1)), 'forbidden', 'مشغّل المعمل لا يرحّل دفعة لم تُختم كلفها');
  const E2 = await expense(502, LABOR, MILL, 5000, 2, 'أجور الأسبوع الثاني');
  const p2 = await preview(U.accountant, B1);
  t.same([p2.money.costs.map((c) => c.available), p2.problems, p2.can_post], [['13000.00', '4000.00'], [], true], 'بعد مصروف ثانٍ: المتاح 13,000 يكفي، ولا مشكلة');
  t.ok((await confirm(U.accountant, B1)).ok, 'المحاسب يختم الكلف بعد أن كفتها المصاريف');
  const posted = await post(U.miller, B1);
  t.ok(posted.ok && posted.v.status === 'posted' && posted.v.money === undefined, `مشغّل المعمل يرحّل بعد الختم، وجوابه بلا مال (${posted.code ?? ''} ${posted.hint ?? ''})`);
  const DOC1 = posted.v.doc_no;
  // «أيدي عاملة» 10,000: 8,000 من E1 (الأقدم) و2,000 من E2؛ و«كهرباء» 3,000 من E3.
  t.same(
    (await db.admin(`select c.line_no, a.expense_id, a.amount::text as amount from public.production_cost_allocations a
      join public.production_costs c on c.id = a.cost_id where a.batch_id = $1 order by c.line_no, a.amount desc`, [B1])).rows,
    [{ line_no: 1, expense_id: E1, amount: '8000.00' }, { line_no: 1, expense_id: E2, amount: '2000.00' }, { line_no: 2, expense_id: E3, amount: '3000.00' }],
    'التحميل من الأقدم: سطر 10,000 يأخذ 8,000 من الأوّل و2,000 من الثاني، والكهرباء 3,000 من مصروفها',
  );
  t.same(
    [(await db.admin('select input_value::text as i, extra_value::text as e, total_value::text as t from public.production_values where batch_id = $1', [B1])).rows[0],
      (await db.admin("select qty_in::text as q, value_in::text as v from public.stock_lots where source_kind = 'production' and source_id = $1", [B1])).rows[0]],
    [{ i: '2280000.00', e: '13000.00', t: '2293000.00' }, { q: '2000.000', v: '2293000.00' }],
    'قيمة دفعة الناتج = السحوبات 2,280,000 + التكاليف 13,000 = 2,293,000.00 بالضبط (القاعدة ٢١)',
  );
  // مصدر دفعة العلف المنتج في بطاقتها: رقم دفعة الإنتاج (item_lots_qty مسطّح: source_kind وsource_id وsource).
  const lots = (await call(U.manager, 'select public.item_lots_qty($1, $2, null, 50)', [FEED, FEEDWH])).v;
  t.same(
    lots.rows.map((r) => [r.source_kind, r.source_id, r.source, r.qty_left]),
    [['production', B1, DOC1, '2000.000']],
    `دفعة العلف المنتج: مصدرها production ورقمها ${DOC1}`,
  );
  t.ok(/^PD-\d{4}-\d{4,}$/u.test(DOC1 ?? ''), `رقم الدفعة PD (${DOC1})`);
  t.same([await nonZero('verify_mill'), await nonZero('verify_stock')], [{}, {}], 'verify_mill وverify_stock صفر بعد ترحيل بتكاليف (حفظ القيمة يعدّ الكلف اليدوية)');

  // المحمَّل في تقرير المصاريف، وإلغاء مصروف عليه تحميل.
  const report = async () => Object.fromEntries((await call(U.accountant, 'select public.report_expenses(public.app_today() - 30, public.app_today(), null, null, 200)')).v.rows.map((r) => [r.id, r.allocated]));
  const allocated = await report();
  const reportRaw = (await call(U.accountant, 'select public.report_expenses(public.app_today() - 30, public.app_today(), null, null, 200)')).v;
  t.same([allocated[E1], allocated[E2], allocated[E3], allocated[E4], allocated[E5]], ['8000.00', '2000.00', '3000.00', '0.00', '0.00'], 'تقرير المصاريف: المحمَّل من كلّ مصروف على العلف');
  const blockedVoid = await call(U.manager, "select public.void_expense($1, 'إلغاء تجربة', $2)", [E1, ref()]);
  t.same([code(blockedVoid), blockedVoid.hint], ['expense_allocated', `من هذا المصروف 8,000 محمَّلة على دفعة الإنتاج ${DOC1}؛ ألغِ الدفعة أوّلاً.`], 'إلغاء مصروف عليه تحميل فعّال: expense_allocated يسمّي الدفعة والمبلغ');
  const voided = await call(U.manager, "select public.void_production($1, 'خطأ في الوزن', $2)", [B1, ref()]);
  t.ok(voided.ok, `إلغاء الدفعة (${voided.code ?? ''})`);
  t.same(
    (await db.admin('select count(*) filter (where voided_at is null)::int as live, count(*)::int as total from public.production_cost_allocations where batch_id = $1', [B1])).rows[0],
    { live: 0, total: 3 },
    'إلغاء الدفعة يوقف تحميلاتها الثلاثة (تبقى سجلاً بختم الإلغاء)',
  );
  t.eq((await report())[E1], '0.00', 'المحمَّل من المصروف بعد إلغاء الدفعة صفر');
  t.ok((await call(U.manager, "select public.void_expense($1, 'إلغاء بعد إلغاء الدفعة', $2)", [E1, ref()])).ok, 'إلغاء المصروف صار ممكناً بعد إلغاء الدفعة');
  t.same([await nonZero('verify_mill'), await nonZero('verify_stock')], [{}, {}], 'الثوابت صفر بعد الإلغاءين');

  // ─── ٤) الختم يفرغ بتعديل سطر، ومشغّل المعمل لا يرى الجداول الثلاثة ──────────────────────────────────────────
  const B2 = id(202);
  t.ok((await create(U.miller, B2, V1, 1000)).ok, 'دفعة ثانية 1,000 كغم: أيدي عاملة 5,000.00 وكهرباء 1,500.00');
  const stamp = async (batch) => (await db.admin('select costs_confirmed_at is not null as s, version from public.production_batches where id = $1', [batch])).rows[0];
  const laborB2 = (await db.admin('select id from public.production_costs where batch_id = $1 and category_id = $2', [B2, LABOR])).rows[0].id;
  // المتاح بعد إلغاء B1 وE1: «أيدي عاملة» E2 (5,000) و«كهرباء» E3 (4,000)، فالسطران (5,000 و1,500) مكفيّان والختم يمرّ. (تعديل السطر
  // إلى 6,000 آخر القسم: بعده لا يُختم، مراجعة 0016 #1.)
  t.ok((await confirm(U.accountant, B2)).ok, 'ختم الدفعة الثانية والمصاريف تكفي سطريها');
  const same = await call(U.accountant, 'update public.production_costs set amount = amount where id = $1 returning id', [laborB2]);
  t.same([same.ok, (await stamp(B2)).s], [true, true], 'كتابة السطر بالمبلغ نفسه ليست تعديلاً: الختم يبقى');
  const manual = await call(U.manager, 'insert into public.production_costs (batch_id, category_id, amount) values ($1, $2, 2000) returning line_no', [B2, TRANSPORT]);
  t.same(
    [manual.v, (await db.admin('select source, planned_amount, amount::text as a from public.production_costs where batch_id = $1 and category_id = $2', [B2, TRANSPORT])).rows[0], (await stamp(B2)).s],
    [3, { source: 'manual', planned_amount: null, a: '2000.00' }, false],
    'سطر يدوي: الرقم التالي ومصدر manual بلا محسوب، وإضافته تفرّغ الختم',
  );
  const tables = async (user) => db.asUser(user, async (q) => {
    const out = {};
    for (const table of ['production_costs', 'production_cost_allocations', 'recipe_cost_rates']) out[table] = (await q(`select count(*)::int as n from public.${table}`)).rows[0].n;
    return out;
  });
  const millerSees = await tables(U.miller);
  const managerSees = await tables(U.manager);
  t.same(millerSees, { production_costs: 0, production_cost_allocations: 0, recipe_cost_rates: 0 }, 'مشغّل المعمل: صفر صفوف من سطور التكاليف والتحميلات والمعدّلات (سياسة الكلفة المقيِّدة)');
  t.ok(managerSees.production_costs >= 5 && managerSees.production_cost_allocations === 3 && managerSees.recipe_cost_rates === 2, `ضابط: المدير يقرأها (${JSON.stringify(managerSees)})`);
  const costSql = 'insert into public.production_costs (batch_id, category_id, amount) values ($1, $2, $3) returning id';
  t.same(
    [
      code(await call(U.miller, costSql, [B2, PACKING, 100])),
      (await call(U.miller, 'update public.production_costs set amount = 1 where id = $1', [laborB2])).count,
      code(await call(U.accountant, costSql, [B2, TRANSPORT, 100])),
      code(await call(U.accountant, costSql, [B2, SYSTEM, 100])),
      code(await call(U.accountant, costSql, [B2, PACKING, -1])),
      code(await call(U.accountant, costSql, [B1, PACKING, 100])),
    ],
    ['forbidden', 0, 'category_duplicated', 'system_expense', 'amount_required', 'not_draft'],
    'سطر الكلفة: مشغّل المعمل لا يضيف ولا يعدّل، والفئة مرّة واحدة وغير نظامية، والمبلغ لا يقلّ عن صفر، والدفعة الملغاة مجمَّدة',
  );
  t.same(
    [
      code(await call(U.accountant, "insert into public.production_costs (batch_id, category_id, amount, source) values ($1, $2, 10, 'recipe')", [B2, PACKING])),
      code(await call(U.accountant, 'update public.production_costs set category_id = $2 where id = $1', [laborB2, PACKING])),
    ],
    ['permission denied for table production_costs', 'permission denied for table production_costs'],
    'المصدر والفئة غير ممنوحين: سطر «الخلطة» لا يكتبه إلّا create_production، والفئة لا تتغيّر',
  );
  const transportB2 = (await db.admin('select id from public.production_costs where batch_id = $1 and category_id = $2', [B2, TRANSPORT])).rows[0].id;
  t.ok((await confirm(U.accountant, B2)).ok, 'ختم ثالث: «نقل» 2,000 من مصروف النقل 20,000 مكفيّ');
  const dropped = await call(U.accountant, "select public.delete_draft_line('production_cost', $1, (select version from public.production_batches where id = $2)) ->> 'deleted' as v", [transportB2, B2]);
  t.same([dropped.v, (await stamp(B2)).s], ['true', false], 'delete_draft_line(production_cost) يحذف السطر ويفرّغ الختم');
  t.ok((await confirm(U.accountant, B2)).ok, 'ختم رابع بعد حذف «نقل»');
  const sealed = await stamp(B2);
  const edited = await call(U.accountant, 'update public.production_costs set amount = 6000 where id = $1 returning amount::text', [laborB2]);
  const afterEdit = await stamp(B2);
  t.same([sealed.s, edited.v, afterEdit.s, afterEdit.version], [true, '6000.00', false, sealed.version + 1], 'تعديل مبلغ سطر بعد الختم يفرّغ الختم ويزيد نسخة الدفعة');
  const overSeal = await confirm(U.accountant, B2);
  t.same(
    [code(overSeal), overSeal.hint, (await stamp(B2)).s],
    ['expense_overloaded', 'أيدي عاملة: المطلوب 6,000 والمتاح من المصاريف المسجّلة 5,000. سجّل المصروف أوّلاً أو قلّل المبلغ.', false],
    'مراجعة 0016 (#1): ختم سطر 6,000 والمتاح 5,000 يُرفض expense_overloaded، والدفعة تبقى بلا ختم',
  );
  // بعد إلغاء B1 وE1: «أيدي عاملة» المؤهّلة E2 وحده (5,000)، والسطر 6,000 ← ناقص؛ و«كهرباء» E3 كلّه (4,000) يكفي 1,500.
  const pAcc = await preview(U.accountant, B2);
  const pMil = await preview(U.miller, B2);
  t.same(
    [pAcc.problems.filter((x) => x.code === 'costs_unfunded').map((x) => [x.category_id, x.category_name, x.need, x.have]), pMil.problems],
    [[[LABOR, 'أيدي عاملة', '6000.00', '5000.00']], [{ code: 'costs_pending' }]],
    'المعاينة قبل الختم: costs_unfunded بأرقامها للمحاسب، ولمشغّل المعمل انتظار الختم وحده (ق٢١: بلا costs_unfunded قبل الختم)',
  );

  // ─── ٥) add_production_input: إضافة مادّة وتبديل سطر بسبب ─────────────────────────────────────────────────────
  const add = (user, n, itemId, qty, replaces = null, reason = null) =>
    call(user, 'select public.add_production_input($1, $2, $3, $4, $5, $6)', [B2, id(n), itemId, qty, replaces, reason]);
  const v0 = (await stamp(B2)).version;
  const added = await add(U.miller, 301, BRAN, 50);
  t.same(added.v, { id: id(301), line_no: 3, version: v0 + 1 }, `مشغّل المعمل يضيف نخالة 50 كغم سطراً ثالثاً (${added.code ?? ''} ${added.hint ?? ''})`);
  const inputOf = async (n) => (await db.admin(`select planned_qty_base::text as q, planned_mass_kg::text as m, in_basis, is_substitute, reason, replaced_item_id
    from public.production_inputs where id = $1`, [id(n)])).rows[0];
  t.same(await inputOf(301), { q: '50.000', m: '50.000', in_basis: true, is_substitute: false, reason: null, replaced_item_id: null }, 'السطر المضاف: المخطّط = الكمية، والكتلة، وفي العليقة، وليس بديلاً');
  t.same((await add(U.miller, 301, BRAN, 50)).v, added.v, 'الإعادة بالمعرّف نفسه ترجّع السطر نفسه');
  const cornLine = (await db.admin('select id from public.production_inputs where batch_id = $1 and item_id = $2', [B2, CORN])).rows[0].id;
  const b1Line = (await db.admin('select id from public.production_inputs where batch_id = $1 and item_id = $2', [B1, CORN])).rows[0].id;
  t.same(
    [
      code(await add(U.miller, 301, WHEAT, 50)),
      code(await add(U.miller, 302, BRAN, 20)),
      code(await add(U.miller, 303, WHEAT, 100, cornLine)),
      code(await add(U.miller, 303, WHEAT, 100, cornLine, ' ')),
      code(await add(U.miller, 303, BRAN, 100, id(301), 'نفدت')),
      code(await add(U.miller, 303, WHEAT, 100, b1Line, 'سطر دفعة أخرى')),
      code(await add(U.miller, 303, FEED, 100)),
      code(await add(U.miller, 303, YEAST, 2)),
      code(await add(U.miller, 303, WHEAT, 0)),
      code(await add(U.accountant, 303, WHEAT, 100)),
      code(await add(U.keeper, 303, WHEAT, 100)),
    ],
    ['id_conflict', 'item_duplicated', 'reason_required', 'reason_required', 'substitute_same_item', 'line_not_found', 'item_kind_mismatch', 'bad_recipe_unit', 'qty_not_positive', 'forbidden', 'forbidden'],
    'المعرّف لمادّة أخرى، والمادّة مرّتين، والتبديل بلا سبب، وتبديل المادّة بنفسها، وسطر دفعة أخرى، والعلف الجاهز، والقطعة، والصفر، والمحاسب، والأمين',
  );
  const swapped = await add(U.miller, 304, WHEAT, 600, cornLine, 'نفدت الذرة من المخزن');
  t.ok(swapped.ok && swapped.v.line_no === 4, `التبديل: الحنطة بدل الذرة بسببها سطراً رابعاً (${swapped.code ?? ''} ${swapped.hint ?? ''})`);
  t.same(
    [await inputOf(304), (await db.admin('select count(*)::int as n from public.production_inputs where id = $1', [cornLine])).rows[0].n],
    [{ q: '600.000', m: '600.000', in_basis: true, is_substitute: true, reason: 'نفدت الذرة من المخزن', replaced_item_id: CORN }, 0],
    'السطر البديل بسببه وبمادّة ما حلّ محلّه، والسطر المبدَّل محذوف بالمعاملة نفسها',
  );
  const detailB2 = (await call(U.manager, 'select public.production_detail($1)', [B2])).v;
  t.same(
    [detailB2.lines.map((l) => [l.item_name, l.is_substitute, l.replaced_item_name]), detailB2.money.input_value, detailB2.money.costs.map((c) => c.amount)],
    [[['كسبة صويا', false, null], ['نخالة', false, null], ['حنطة', true, 'ذرة صفراء']], null, ['6000.00', '1500.00']],
    'بطاقة المسوّدة: البديل يسمّي ما حلّ محلّه، وmoney كائن بالتكاليف وقيمه فارغة قبل الترحيل',
  );
  const bran = await call(U.miller, "select public.delete_draft_line('production_input', $1, (select version from public.production_batches where id = $2)) ->> 'deleted' as v", [id(301), B2]);
  t.same([bran.v, (await db.admin('select count(*)::int as n from public.production_inputs where batch_id = $1', [B2])).rows[0].n], ['true', 2], 'delete_draft_line(production_input) يحذف سطر النخالة');
  t.same(await nonZero('verify_mill'), {}, 'verify_mill صفر بعد الإضافة والتبديل');

  // ─── ٦) سعر الكلفة المكتوب: مشروط بالسابق، وللتخطيط فقط ──────────────────────────────────────────────────────
  const costPrice = (user, itemId, price, expected) => call(user, 'select public.set_item_cost_price($1, $2, $3)', [itemId, price, expected]);
  const sellPrice = (user, itemId, price, expected) => call(user, 'select public.set_item_sell_price($1, $2, $3)', [itemId, price, expected]);
  const firstPrice = await costPrice(U.manager, CORN, 950, null);
  const repeat = await costPrice(U.manager, CORN, 950, null);
  t.same(
    [firstPrice.v, repeat.v, code(await costPrice(U.manager, CORN, 1000, null)), code(await costPrice(U.accountant, CORN, 1000, 950)), code(await costPrice(U.keeper, CORN, 1000, 950)),
      code(await costPrice(U.manager, CORN, 950.125, 950)), code(await costPrice(U.manager, CORN, 0, 950))],
    [{ item_id: CORN, written: true, cost_price: '950' }, { item_id: CORN, written: false, cost_price: '950' }, 'price_changed', 'forbidden', 'forbidden', 'bad_price', 'bad_price'],
    'سعر الكلفة: يُكتب مرّة، والإعادة «انكتب» بلا كتابة، والسابق الخاطئ price_changed، والمحاسب والأمين ممنوعان (stores.manage)، والمراتب والصفر',
  );
  const purchases = async (user) => (await call(user, 'select public.item_purchases($1, $2, null, 50)', [CORN, RAW])).v.item;
  t.same([(await purchases(U.manager)).money, (await purchases(U.miller)).money], [{ cost_price: '950', sell_price: null }, undefined], 'item_purchases يقرأ سعر الكلفة بجانب سعر البيع، ومشغّل المعمل (المخزن بنطاقه) بلا money');
  const priceRow = async () => (await db.admin('select sell_price::text as s, cost_price::text as c from public.item_prices where item_id = $1', [CORN])).rows;
  await sellPrice(U.manager, CORN, 1750, null);
  const both = await priceRow();
  await sellPrice(U.manager, CORN, null, 1750);
  const costOnly = await priceRow();
  await costPrice(U.manager, CORN, null, 950);
  const none = await priceRow();
  t.same([both, costOnly, none], [[{ s: '1750', c: '950' }], [{ s: null, c: '950' }], []], 'صفّ واحد للسعرين: شيل سعر البيع يُبقي سعر الكلفة، وشيل الاثنين يحذف الصفّ');
  await costPrice(U.manager, CORN, 950, null);

  // الدفعة الثالثة بعد كتابة سعر الكلفة: الذرة تُسحب بكلفة دفعتها (900) لا بالسعر المكتوب (950).
  // ذرة 60 × 900 = 54,000 وصويا 40 × 1,500 = 60,000 ← 114,000؛ وأيدي عاملة 500.00 (5,000 × 100 ÷ 1,000) من E2 وكهرباء 150.00 من E3
  // ← 114,650.00. ولو دخل السعر المكتوب لصارت الذرة 57,000 والكلّي 117,650.
  const B3 = id(203);
  await create(U.manager, B3, V1, 100);
  const posted3 = await post(U.manager, B3);
  t.ok(posted3.ok, `ترحيل الدفعة الثالثة (${posted3.code ?? ''} ${posted3.hint ?? ''})`);
  t.same(
    (await db.admin("select value_in::text as v from public.stock_lots where source_kind = 'production' and source_id = $1", [B3])).rows[0].v,
    '114650.00',
    'سعر الكلفة المكتوب لا يدخل قيمة دفعة المخزون أبداً: الناتج 114,650.00 من السحب الحقيقي والتكاليف',
  );
  const lots3 = (await call(U.miller, 'select public.item_lots_qty($1, $2, null, 50)', [FEED, FEEDWH])).v;
  t.same(lots3.rows.map((r) => [r.source_kind, r.source_id, r.source]), [['production', B3, posted3.v.doc_no]], 'مشغّل المعمل يرى مصدر دفعة العلف: رقم دفعة الإنتاج الثالثة');
  const detail3 = (await call(U.manager, 'select public.production_detail($1)', [B3])).v;
  const onDate = async (expenseId) => (await db.admin('select on_date::text as d from public.expenses where id = $1', [expenseId])).rows[0].d;
  t.same(
    [detail3.money.extra_value, detail3.money.total_value, detail3.money.costs.map((c) => [c.category_name, c.amount, c.allocations.map((a) => [a.expense_id, a.on_date, a.amount, a.label])])],
    ['650.00', '114650.00', [
      ['أيدي عاملة', '500.00', [[E2, await onDate(E2), '500.00', 'أجور الأسبوع الثاني']]],
      ['كهرباء', '150.00', [[E3, await onDate(E3), '150.00', 'كهرباء المعمل']]],
    ]],
    'بطاقة الدفعة: التكاليف وتحميلاتها من المصاريف بالتاريخ والمبلغ والوصف',
  );
  t.eq((await call(U.miller, 'select public.production_detail($1)', [B3])).v.money, undefined, 'مشغّل المعمل يرى البطاقة بلا مال');

  // ─── ٧) بانية الخلطة: سعر الكلفة وآخر شراء وكلفة الطنّ المتوقّعة ─────────────────────────────────────────────
  // الذرة: المكتوب 950، وآخر شراء 1,800,000 ÷ 2,000 = 900.00، ومتوسّط المتاح (1,940 كغم بـ1,746,000) = 900.00.
  // الصويا: بلا مكتوب، وآخر شراء 1,500.00، والمتوسّط 1,500.00. كلفة الطنّ المتوقّعة: 600 × 950 + 400 × 1,500 = 1,170,000.00،
  // والمعدّلات 5,000 + 1,500 = 6,500.00، فالطنّ 1,176,500.00 والكيلو 1,176.50.
  const detail = (await call(U.manager, 'select public.recipe_detail($1, null)', [R1])).v;
  t.same(
    detail.lines.map((l) => [l.item_name, l.money.unit_cost, l.money.cost_price, l.money.last_price]),
    [['ذرة صفراء', '900.00', '950', '900.00'], ['كسبة صويا', '1500.00', null, '1500.00']],
    'سطور الخلطة: متوسّط المتاح وسعر الكلفة المكتوب وآخر شراء',
  );
  t.same(
    [detail.money.rates.map((r) => [r.line_no, r.category_name, r.amount_per_ton]), detail.money.expected],
    [[[1, 'أيدي عاملة', '5000.00'], [2, 'كهرباء', '1500.00']], { unpriced: 0, unconverted: 0, cost_per_ton: '1176500.00', rates_per_ton: '6500.00', materials_per_ton: '1170000.00' }],
    'معدّلات الطنّ وكلفته المتوقّعة: المكتوب أوّلاً ثمّ آخر شراء',
  );
  t.same(detail.expense_categories.map((c) => c.name), ['أيدي عاملة', 'تعبئة', 'كهرباء', 'نقل'], 'فئات منتقي المعدّلات: الفعّالة غير النظامية (لا المؤرشفة ولا النظامية)');
  const millerDetail = (await call(U.miller, 'select public.recipe_detail($1, null)', [R1])).v;
  t.same([millerDetail.money, millerDetail.lines[0].money, millerDetail.expense_categories.length], [undefined, undefined, 4], 'مشغّل المعمل: بلا مال، والفئات (بلا مال) تصله');
  // «بادئ مملّح»: ذرة 990 بالمكتوب 950 = 940,500.00، والملح 10 كغم بلا أيّ سعر ← unpriced 1، فكلفة الكيلو في اللوحة فارغة.
  const R3 = id(113);
  t.eq((await createRecipe(U.manager, R3, id(114), 'بادئ مملّح', FEED2, 1000, [{ item_id: CORN, qty: 990, unit: 'kg' }, { item_id: SALT, qty: 10, unit: 'kg' }], [], true)).v?.status, 'active', 'خلطة فيها مادّة بلا سعر');
  t.same(
    (await call(U.manager, 'select public.recipe_detail($1, null)', [R3])).v.money.expected,
    { unpriced: 1, unconverted: 0, cost_per_ton: '940500.00', rates_per_ton: '0.00', materials_per_ton: '940500.00' },
    'المادّة بلا سعر تُعدّ (unpriced) ولا تُجمع ناقصة بصمت',
  );
  const overview = (await call(U.manager, 'select public.recipes_overview()')).v;
  const card = (rid) => overview.recipes.find((r) => r.id === rid);
  t.same([card(R1).money.expected_cost_per_kg, card(R3).money.expected_cost_per_kg, card(R2).money.expected_cost_per_kg], ['1176.50', null, null],
    'لوحة المعمل: كلفة الكيلو المتوقّعة 1,176.50، وفارغة لخلطة فيها مادّة بلا سعر ولخلطة بلا نسخة مفعَّلة');
  t.eq(card(R1).money === undefined, false, 'ضابط: المدير يرى money على البطاقة');
  t.eq((await call(U.miller, 'select public.recipes_overview()')).v.recipes.find((r) => r.id === R1).money, undefined, 'مشغّل المعمل: البطاقة بلا money');

  // ─── ٨) ضوابط verify_mill: كلّ فحص جديد تكسره طفرة حقيقية في دالّته (بمعاملة ترجع) ──────────────────────────────
  // «علف التجربة»: نخالة 1,000 كغم لأساس 1,000 و«تعبئة» 10,000 لكلّ طنّ؛ والدفعة 100 كغم بسطر تكاليف 1,000.00، ومصروفا «تعبئة»
  // 300 (الأقدم) و900: السليم يأخذ 300 ثمّ 700.
  const R4 = id(115);
  const V4 = id(116);
  t.eq((await createRecipe(U.manager, R4, V4, 'علف التجربة', FEED2, 1000, [{ item_id: BRAN, qty: 1000, unit: 'kg' }], [{ category_id: PACKING, amount_per_ton: 10000 }], true)).v?.status, 'active', 'خلطة الضوابط');
  const P1 = await expense(507, PACKING, MILL, 300, 4);
  const P2 = await expense(508, PACKING, MILL, 900, 1);
  const runBatch = async (oq, batch) => {
    await oq('select public.create_production($1, $2, 100, $3, $4, public.app_today())', [batch, V4, RAW, FEEDWH]);
    const plan = (await oq("select public.preview_production($1) ->> 'plan_token' as p", [batch])).rows[0].p;
    await oq('select public.post_production($1, (select version from public.production_batches where id = $1), $2, $3)', [batch, plan, ref()]);
  };
  /** الطفرة: جسم الدالّة من الكتالوج بمراسيه مستبدلة (كلّ مرساة مرّة واحدة بالضبط)، ثمّ السيناريو، ثمّ الفحص؛ والمعاملة ترجع. */
  const mutated = (fns, run, verifyFn = 'verify_mill') =>
    db.asOwner(async (oq) => {
      for (const [signature, pairs] of fns) {
        const def = (await oq('select pg_get_functiondef($1::regprocedure) as d', [signature])).rows[0].d;
        let broken = def;
        for (const [from, to] of pairs) {
          if (broken.split(from).length !== 2) throw new Error(`طفرة ${signature}: المرساة ليست مرّة واحدة: ${from}`);
          broken = broken.split(from).join(to);
        }
        await oq(broken);
      }
      const extra = await run(oq);
      const found = Object.fromEntries((await oq(`select check_name, violations::int as n from public.${verifyFn}() where violations <> 0`)).rows.map((r) => [r.check_name, r.n]));
      return { found, extra };
    }, U.manager);
  const POST_FN = 'public.post_production(uuid, integer, text, uuid)';
  const control = await mutated([], async (oq) => {
    await runBatch(oq, id(401));
    return {
      allocations: (await oq('select expense_id, amount::text as a from public.production_cost_allocations where batch_id = $1 order by amount', [id(401)])).rows,
      labels: (await oq('select public.production_detail($1) -> \'money\' -> \'costs\' -> 0 -> \'allocations\' as a', [id(401)])).rows[0].a.map((a) => a.label),
    };
  });
  t.same(
    [control.found, control.extra.allocations, control.extra.labels],
    [{}, [{ expense_id: P1, a: '300.00' }, { expense_id: P2, a: '700.00' }], ['نقداً من صندوق المعمل', 'نقداً من صندوق المعمل']],
    'ضابط السيناريو السليم: الثوابت صفر، والتحميل 300 ثمّ 700، ووصف المصروف بلا ملاحظة «نقداً من» صندوقه',
  );
  const cases = [
    ['production_extra_value', [[POST_FN, [['v_extra := v_extra + c.amount;', 'v_extra := v_extra + 0;']]]], 'الترحيل يتجاهل التكاليف في extra_value وقيمة الناتج'],
    ['production_cost_allocated', [[POST_FN, [['v_left := v_left - v_take;', 'v_left := 0;']]]], 'الترحيل يكتفي بأوّل مصروف (300 من سطر 1,000)'],
    ['expense_over_allocated', [[POST_FN, [['v_take := round(least(v_left, e.free), 2);', 'v_take := v_left;']]]], 'الترحيل يحمّل السطر كلّه على أوّل مصروف (1,000 من مصروف 300)'],
    // مراجعة 0016 (#0): التحميل ممّا قفلته جملة القفل وحدها، فـ«أيّ فئة» تُنسى في الجملتين معاً (القفل والحلقة).
    ['allocation_mismatch', [[POST_FN, [['x.category_id = c.category_id and ', ''],
      ['and x.category_id in (select pc.category_id from public.production_costs pc where pc.org_id = v_org and pc.batch_id = d.id and pc.amount > 0)', '']]]],
    'الترحيل يحمّل من مصروف أيّ فئة (الأقدم «نقل»)'],
  ];
  for (const [check, fns, label] of cases) {
    const outcome = await mutated(fns, (oq) => runBatch(oq, id(402)));
    t.same(outcome.found, { [check]: 1 }, `طفرة: ${label} ← ${check} وحده`);
  }
  const voidFn = 'public.void_production(uuid, text, uuid)';
  const unvoided = await mutated([[voidFn, [['update public.production_cost_allocations set voided_at = now()\n  where org_id = v_org and batch_id = d.id and voided_at is null;', 'perform 1;']]]], async (oq) => {
    await runBatch(oq, id(403));
    await oq("select public.void_production($1, 'طفرة الإلغاء', $2)", [id(403), ref()]);
  });
  t.same(unvoided.found, { allocation_on_void: 2 }, 'طفرة: إلغاء الدفعة لا يوقف تحميليها ← allocation_on_void = 2');
  const expenseFn = 'public.void_expense(uuid, text, uuid)';
  const unguarded = await mutated([[expenseFn, [['if v_allocated is not null then', 'if false then']]]], async (oq) => {
    await runBatch(oq, id(404));
    await oq("select public.void_expense($1, 'طفرة المصروف', $2)", [P1, ref()]);
  });
  t.same(unguarded.found, { allocation_on_void: 1 }, 'طفرة: إلغاء مصروف عليه تحميل بلا فحص ← allocation_on_void = 1');
  const guarded = await db.asOwner(async (oq) => {
    await runBatch(oq, id(404));
    await oq("select public.void_expense($1, 'بلا طفرة', $2)", [P1, ref()]);
    return 'مرّ';
  }, U.manager).catch((error) => error.message);
  t.eq(guarded, 'expense_allocated', 'ضابط: الإلغاء السليم يرفض expense_allocated في السيناريو نفسه');
  const inputFn = 'public.add_production_input(uuid, uuid, uuid, numeric, uuid, text)';
  const noReason = await mutated([[inputFn, [['if v_reason is null or length(v_reason) < 3 then', 'if false then'],
    ["i.kind not in ('fuel', 'packaging'), p_replaces is not null, v_reason, o.item_id);", "i.kind not in ('fuel', 'packaging'), p_replaces is not null, null, o.item_id);"]]]], async (oq) => {
    await oq('select public.create_production($1, $2, 100, $3, $4, public.app_today())', [id(405), V4, RAW, FEEDWH]);
    const line = (await oq('select id from public.production_inputs where batch_id = $1', [id(405)])).rows[0].id;
    await oq("select public.add_production_input($1, $2, $3, 100, $4, 'نفدت النخالة')", [id(405), id(406), WHEAT, line]);
  });
  t.same(noReason.found, { production_substitute_reason: 1 }, 'طفرة: التبديل يحفظ البديل بلا سببه ← production_substitute_reason');
  // حفظ القيمة في verify_stock يعدّ الكلف اليدوية للمرحَّلة: بلا الحدّ الجديد تصير كلّ منشأة رحّلت دفعة بتكاليف خرقاً، ولا غيرها.
  // الثابت يعدّ المنشآت المخالفة في القاعدة كلّها (ومنها منشآت ملفّات قبله)، فالمتوقّع عددها بالضبط، وهو واحد على الأقلّ (هذه المنشأة).
  const noExtra = await mutated([['public.verify_stock()', [["\n      + coalesce((select sum(pv.extra_value) from public.production_values pv join public.production_batches b on b.org_id = pv.org_id and b.id = pv.batch_id\n          where pv.org_id = o.id and b.status = 'posted'), 0) as inputs,", ' as inputs,']]]],
    async (oq) => (await oq(`select count(distinct b.org_id)::int as n from public.production_batches b
      join public.production_values pv on pv.org_id = b.org_id and pv.batch_id = b.id where b.status = 'posted' and pv.extra_value > 0`)).rows[0].n,
    'verify_stock');
  t.ok(noExtra.extra >= 1, `منشآت رحّلت دفعة بتكاليف (${noExtra.extra})`);
  t.same(noExtra.found, { value_conservation: noExtra.extra }, 'طفرة: حفظ القيمة بلا الكلف اليدوية يرى كلّ منشأة رحّلت دفعة بتكاليف خرقاً، فالحدّ الجديد لازم');
  t.same([await nonZero('verify_mill'), await nonZero('verify_stock')], [{}, {}], 'الثوابت صفر بعد الطفرات (رجعت كلّها)');

  // ─── ٩) التزامن: الترحيل يعيد فحص المتاح تحت قفل صفوف المصاريف (جلستان حقيقيتان) ──────────────────────────────
  // المتاح من «تعبئة» 1,200 (300 + 900) وكلّ دفعة 100 كغم تحتاج 1,000. ضابط: الأولى ترجع فالثانية تأخذ حاجتها بعد انتظارها.
  const X = id(210);
  const Y = id(211);
  const Z = id(212);
  for (const batch of [X, Y, Z]) await create(U.manager, batch, V4, 100);
  const rolledBack = await race(db, { user: U.manager, sql: POST, params: [X, null, ref()], rollback: true }, { user: U.accountant, sql: POST, params: [Y, null, ref()] });
  t.same([rolledBack.first, rolledBack.state, rolledBack.second], ['ok', 'blocked', 'ok'], 'ضابط: ترحيل الأولى رجع، فالثانية انتظرت ثمّ حمّلت 1,000 من 1,200');
  // بعد Y: المتبقّي 200 من الثاني. مصروف ثالث 1,000 ← المتاح 1,200 لدفعة واحدة فقط: الأولى تأخذ 200 + 800، والثانية تنتظر ثمّ
  // ترى 200 فقط فترفض expense_overloaded بدل أن تحمّل فوق المبلغ.
  const P3 = await expense(509, PACKING, MILL, 1000, 0);
  const lost = await race(db, { user: U.manager, sql: POST, params: [X, null, ref()] }, { user: U.accountant, sql: POST, params: [Z, null, ref()] });
  t.same([lost.first, lost.state, lost.second], ['ok', 'blocked', 'expense_overloaded'], 'ترحيلان على مصروف واحد بنفس اللحظة: الثاني ينتظر قفل المصروف ثمّ يرى ما بقي فيرفض');
  t.same(
    (await db.admin('select expense_id, sum(amount)::text as a from public.production_cost_allocations where voided_at is null and expense_id = any ($1) group by expense_id order by expense_id', [[P1, P2, P3]])).rows,
    [{ expense_id: P1, a: '300.00' }, { expense_id: P2, a: '900.00' }, { expense_id: P3, a: '800.00' }].sort((a, b) => (a.expense_id < b.expense_id ? -1 : 1)),
    'لا مصروف فوق مبلغه بعد السباق: 300 و900 كاملان، و800 من 1,000',
  );
  // إلغاء مصروف بنفس لحظة ترحيل يحمّل منه: الإلغاء ينتظر قفل الصفّ ثمّ يرى التحميل فيرفض expense_allocated.
  const P4 = await expense(510, PACKING, MILL, 2000, 0);
  const voidRace = await race(db, { user: U.manager, sql: POST, params: [Z, null, ref()] }, { user: U.owner, sql: "select public.void_expense($1, 'إلغاء بنفس اللحظة', $2)", params: [P4, ref()] });
  t.same([voidRace.first, voidRace.state, voidRace.second], ['ok', 'blocked', 'expense_allocated'], 'إلغاء المصروف ينتظر الترحيل الذي يقفله ثمّ يرى تحميله فيرفض');
  t.same([await nonZero('verify_mill'), await nonZero('verify_stock')], [{}, {}], 'الثوابت صفر بعد السباق');

  // ─── ١٠) الدمج (أ): جواب القاعدة الحقيقي بمحلّلات الشاشات الحقيقية (esbuild)، للمدير والمحاسب ومشغّل المعمل ─────────────────
  // درس 2026-11-02: الشاشات بُنيت على العقد بلا قاعدة، فكلّ جواب جديد من 0016 التقطته الأقسام أعلاه يمرّ هنا بمحلّله الحقيقي؛ وفرق
  // مفتاح أو مرتبة أو نوع يرمي (MillShapeError وRowShapeError وLedgerShapeError) أو يطلع رقماً غير المحسوب باليد هناك.
  const ui = await screensParser();
  /** المحلّل يرمي = فحص فاشل باسمه، لا توقّف الملف: كلّ فرق يظهر في التشغيل نفسه. */
  const parsed = (label, fn) => {
    try {
      return fn();
    } catch (error) {
      t.ok(false, `${label}: المحلّل رمى ${error.message}`);
      return null;
    }
  };
  t.same(parsed('parseCreatedRecipe', () => ui.parseCreatedRecipe(built.v)), { id: R1, versionId: V1, versionNo: 1, status: 'active', lines: 2, rates: 2 }, 'parseCreatedRecipe: جواب create_recipe المفعَّل');
  t.same(parsed('parseCreatedRecipe (مسوّدة)', () => ui.parseCreatedRecipe(draft.v)), { id: R2, versionId: V2, versionNo: 1, status: 'draft', lines: 1, rates: 0 }, 'parseCreatedRecipe: المسوّدة بسطرها وبلا معدّل');

  // المعاينة الأولى للمحاسب (القسم ٣): المواد 2,280,000.00 والتكاليف 13,000.00 والكلّي 2,293,000.00 والكيلو 1,146.50، بالفلس.
  const view0 = parsed('parsePreview (المحاسب)', () => ui.parsePreview(p0));
  t.same(
    view0 && [view0.inputValue, view0.extraValue, view0.totalValue, view0.costPerKg, view0.canPost, view0.lines.map((l) => [l.itemName, l.plannedQty, l.drawQty, l.value])],
    [228000000n, 1300000n, 229300000n, 114650n, false, [['ذرة صفراء', 1200000n, 1200000n, 108000000n], ['كسبة صويا', 800000n, 800000n, 120000000n]]],
    'parsePreview (المحاسب): المال بالفلس والكميات بالآلاف، وقيمة كلّ مدخل من سحبه (1,200 × 900 و800 × 1,500)',
  );
  t.same(
    view0?.costs?.map((c) => [c.lineNo, c.categoryId, c.categoryName, c.plannedAmount, c.amount, c.source, c.available, c.allocations]),
    [[1, LABOR, 'أيدي عاملة', 1000000n, 1000000n, 'recipe', 0n, []], [2, POWER, 'كهرباء', 300000n, 300000n, 'recipe', 0n, []]],
    'parsePreview: سطور التكاليف بالمحسوب والمبلغ والمتاح (صفر قبل أيّ مصروف)',
  );
  t.same(
    view0?.problems.map((x) => [x.code, x.categoryId, x.categoryName, x.needAmount, x.haveAmount, x.need, x.have]),
    [['costs_unfunded', LABOR, 'أيدي عاملة', 1000000n, 0n, null, null], ['costs_unfunded', POWER, 'كهرباء', 300000n, 0n, null, null]],
    'parsePreview: costs_unfunded مالاً بمرتبتين (needAmount وhaveAmount)، لا كمية',
  );
  // مخزن المدخلات بوحدته (مراجعة 0016، ق١٥ وم٤): التنبيه ورابط «سجّل مصروفاً» يسمّيان الوحدة التي تُحمَّل التكاليف من مصاريفها.
  const nameOf = async (table, rowId) => (await db.admin(`select name from public.${table} where id = $1`, [rowId])).rows[0].name;
  const RAW_NAME = await nameOf('warehouses', RAW);
  const FEEDWH_NAME = await nameOf('warehouses', FEEDWH);
  const MILL_NAME = await nameOf('divisions', MILL);
  t.same(view0?.inputWarehouse, { id: RAW, name: RAW_NAME, divisionId: MILL, divisionName: MILL_NAME }, `parsePreview: مخزن المدخلات بوحدته (division_id وdivision_name: «${MILL_NAME}»)`);
  const viewMiller = parsed('parsePreview (مشغّل المعمل)', () => ui.parsePreview(pm));
  t.same(
    viewMiller && [viewMiller.inputValue, viewMiller.extraValue, viewMiller.totalValue, viewMiller.costPerKg, viewMiller.costs, viewMiller.lines.map((l) => l.value), viewMiller.canPost],
    [null, null, null, null, null, [null, null], false],
    'parsePreview (مشغّل المعمل): بلا money كلّه، فالمال والتكاليف فارغة ولا يرمي',
  );
  t.same(
    viewMiller?.problems.map((x) => [x.code, x.categoryId, x.categoryName, x.needAmount, x.haveAmount]),
    [['costs_pending', null, null, null, null]],
    'parsePreview (مشغّل المعمل قبل الختم): انتظار الختم وحده بلا فئة ولا أرقام (ق٢١)',
  );
  t.same(viewMiller?.inputWarehouse, view0?.inputWarehouse, 'parsePreview (مشغّل المعمل): مخزن المدخلات بوحدته بلا مال');
  const view2 = parsed('parsePreview (بعد المصروف الثاني)', () => ui.parsePreview(p2));
  t.same(view2 && [view2.costs.map((c) => c.available), view2.problems, view2.canPost], [[1300000n, 400000n], [], true], 'parsePreview: بعد المصروف الثاني المتاح 13,000.00 و4,000.00 ولا مشكلة');
  // الدفعة الثانية (1,000 كغم، القسم ٤): المواد 600 × 900 + 400 × 1,500 = 1,140,000.00، والتكاليف 6,000 + 1,500 = 7,500.00،
  // والكلّي 1,147,500.00، والكيلو 1,147.50؛ والمتاح بعد إلغاء الأولى: «أيدي عاملة» 5,000.00 و«كهرباء» 4,000.00.
  const viewB2 = parsed('parsePreview (الدفعة الثانية)', () => ui.parsePreview(pAcc));
  t.same(
    viewB2 && [viewB2.inputValue, viewB2.extraValue, viewB2.totalValue, viewB2.costPerKg, viewB2.costs.map((c) => [c.lineNo, c.categoryName, c.plannedAmount, c.amount, c.available])],
    [114000000n, 750000n, 114750000n, 114750n, [[1, 'أيدي عاملة', 500000n, 600000n, 500000n], [2, 'كهرباء', 150000n, 150000n, 400000n]]],
    'parsePreview (الدفعة الثانية): المبلغ المعدَّل بجانب المحسوب، والمتاح بعد إلغاء الأولى',
  );
  t.same(viewB2?.problems.map((x) => [x.code, x.categoryId, x.needAmount, x.haveAmount]), [['costs_unfunded', LABOR, 600000n, 500000n]], 'parsePreview: النقص 6,000.00 مقابل 5,000.00');
  const viewB2Miller = parsed('parsePreview (الدفعة الثانية، مشغّل المعمل)', () => ui.parsePreview(pMil));
  t.same(
    viewB2Miller && [viewB2Miller.costs, viewB2Miller.problems.map((x) => [x.code, x.needAmount, x.haveAmount])],
    [null, [['costs_pending', null, null]]],
    'parsePreview (مشغّل المعمل، الدفعة الثانية قبل الختم): بلا تكاليف ولا أرقام، وانتظار الختم وحده (ق٢١)',
  );
  // expenses_visible على جذر المعاينة (الجولة الثانية، ق٢١ وب٢): المحاسب بلا نطاق يرى مصاريف وحدة المعمل فيكتب التكاليف ويختمها، ومشغّل
  // المعمل لا يرى الكلفة أصلاً. المفتاح خارج money، فيصل مشغّل المعمل أيضاً.
  t.same(
    [view0?.expensesVisible, viewMiller?.expensesVisible, view2?.expensesVisible, viewB2?.expensesVisible, viewB2Miller?.expensesVisible],
    [true, false, true, true, false],
    'parsePreview: expenses_visible على الجذر — المحاسب true في الدفعتين، ومشغّل المعمل false (ق٢١، ب٢)',
  );

  // بطاقة المسوّدة بعد الإضافة والتبديل (القسم ٥): صويا 400 ونخالة 50 وحنطة 600 بديلاً للذرة، والمال فارغ قبل الترحيل.
  const batchB2 = parsed('parseBatch (مسوّدة)', () => ui.parseBatch(detailB2));
  t.same(
    batchB2 && [batchB2.status, batchB2.docNo, batchB2.inputValue, batchB2.extraValue, batchB2.totalValue, batchB2.costPerKg,
      batchB2.lines.map((l) => [l.itemName, l.plannedQty, l.usedQty, l.isSubstitute, l.reason, l.replacedItemName, l.value, l.draws])],
    ['draft', null, null, null, null, null, [
      ['كسبة صويا', 400000n, null, false, null, null, null, null],
      ['نخالة', 50000n, null, false, null, null, null, null],
      ['حنطة', 600000n, null, true, 'نفدت الذرة من المخزن', 'ذرة صفراء', null, null],
    ]],
    'parseBatch (مسوّدة): البديل باسم ما حلّ محلّه وسببه، والمال فارغ قبل الترحيل',
  );
  t.same(
    batchB2?.costs?.map((c) => [c.lineNo, c.categoryName, c.plannedAmount, c.amount, c.source, c.available, c.allocations]),
    [[1, 'أيدي عاملة', 500000n, 600000n, 'recipe', null, []], [2, 'كهرباء', 150000n, 150000n, 'recipe', null, []]],
    'parseBatch (مسوّدة): التكاليف تحت money ولو كانت قيمه فارغة',
  );
  // الدفعة الثالثة (100 كغم، القسم ٦): ذرة 60 × 900 = 54,000 وصويا 40 × 1,500 = 60,000، والتكاليف 500 + 150 = 650.00،
  // والكلّي 114,650.00 والكيلو 1,146.50.
  const batch3 = parsed('parseBatch (مرحَّلة)', () => ui.parseBatch(detail3));
  t.same(
    batch3 && [batch3.status, batch3.docNo, batch3.outputQtyKg, batch3.inputValue, batch3.extraValue, batch3.totalValue, batch3.costPerKg, batch3.lines.map((l) => [l.itemName, l.usedQty, l.value])],
    ['posted', posted3.v.doc_no, 100000n, 11400000n, 65000n, 11465000n, 114650n, [['ذرة صفراء', 60000n, 5400000n], ['كسبة صويا', 40000n, 6000000n]]],
    'parseBatch (مرحَّلة): المسحوب وقيمته، والمال بالفلس',
  );
  t.same(
    batch3?.costs?.map((c) => [c.lineNo, c.categoryName, c.plannedAmount, c.amount, c.available, c.allocations.map((a) => [a.expenseId, a.onDate, a.amount, a.label])]),
    [
      [1, 'أيدي عاملة', 50000n, 50000n, null, [[E2, await onDate(E2), 50000n, 'أجور الأسبوع الثاني']]],
      [2, 'كهرباء', 15000n, 15000n, null, [[E3, await onDate(E3), 15000n, 'كهرباء المعمل']]],
    ],
    'parseBatch (مرحَّلة): التحميلات بالمصروف وتاريخه ومبلغه ووصفه',
  );
  // من أيّ وجبات سُحب كلّ سطر (ق١٦، م١٣): وجبة استلام الذرة الوحيدة (2,000 كغم) ووجبة الصويا، بالكمية موجبة ورقم الاستلام.
  const receiptLot = async (itemId) => (await db.admin(`select l.id, r.doc_no from public.stock_lots l join public.receipts r on r.id = l.source_id
    where l.org_id = $1 and l.item_id = $2 and l.warehouse_id = $3 and l.source_kind = 'receipt'`, [org, itemId, RAW])).rows;
  const [cornLot] = await receiptLot(CORN);
  const [soyLot] = await receiptLot(SOY);
  t.same(
    batch3?.lines.map((l) => [l.itemName, l.draws?.map((d) => [d.lotId, d.qty, d.receivedOn, d.source])]),
    [['ذرة صفراء', [[cornLot.id, 60000n, TODAY, cornLot.doc_no]]], ['كسبة صويا', [[soyLot.id, 40000n, TODAY, soyLot.doc_no]]]],
    `parseBatch (مرحَّلة): draws لكلّ سطر من وجبته ورقم استلامها (${cornLot.doc_no} و${soyLot.doc_no})`,
  );
  // والملغاة تبقى تقول من أين سُحبت (السحوبات الأصلية بلا عكسها): الأولى 1,200 ذرة و800 صويا.
  const detail1Raw = (await call(U.manager, 'select public.production_detail($1)', [B1])).v;
  const batch1 = parsed('parseBatch (ملغاة)', () => ui.parseBatch(detail1Raw));
  t.same(
    batch1 && [batch1.status, batch1.lines.map((l) => [l.itemName, l.draws?.map((d) => [d.lotId, d.qty, d.source])])],
    ['void', [['ذرة صفراء', [[cornLot.id, 1200000n, cornLot.doc_no]]], ['كسبة صويا', [[soyLot.id, 800000n, soyLot.doc_no]]]]],
    'parseBatch (ملغاة): draws بالسحوبات الأصلية، لا صفر ولا null',
  );
  const batch3MillerRaw = (await call(U.miller, 'select public.production_detail($1)', [B3])).v;
  const batch3Miller = parsed('parseBatch (مشغّل المعمل)', () => ui.parseBatch(batch3MillerRaw));
  t.same(
    batch3Miller && [batch3Miller.costs, batch3Miller.inputValue, batch3Miller.extraValue, batch3Miller.totalValue, batch3Miller.costPerKg, batch3Miller.lines.map((l) => [l.usedQty, l.value])],
    [null, null, null, null, null, [[60000n, null], [40000n, null]]],
    'parseBatch (مشغّل المعمل): الكميات بلا مال ولا تكاليف، ولا يرمي',
  );
  // طرفا الدفعة وexpenses_visible على جذر البطاقة (الجولة الثانية، ق٢١ وق٢٥، ب٢ وب٣): المدير يرى الطرفين ومصاريف الوحدة في المسوّدة
  // والمرحَّلة والملغاة، ومشغّل المعمل (وحدة المعمل: المخزنان فيها) يرى الطرفين بلا مصاريف.
  t.same(
    [batchB2?.scope, batchB2?.expensesVisible, batch3?.scope, batch3?.expensesVisible, batch1?.scope, batch1?.expensesVisible, batch3Miller?.scope, batch3Miller?.expensesVisible],
    [{ input: true, output: true }, true, { input: true, output: true }, true, { input: true, output: true }, true, { input: true, output: true }, false],
    'parseBatch: scope بطرفيه وexpenses_visible — المدير الطرفان والمصاريف، ومشغّل المعمل الطرفان بلا مصاريف (ق٢١، ق٢٥)',
  );
  // من طرف واحد (ق٢٥، ب٣ وج٢): أمين نطاقه مخزن العلف وحده يقرأ الدفعة من طرف ناتجها (scope.input = false: لا معاينة ولا فعل مسوّدة
  // ولا رابط دفتر في مخزن المواد)، وأمين نطاقه مخزن المواد وحده من طرف موادّها (scope.output = false: لا رابط وجبات العلف)، ومحاسب نطاقه
  // مخزن العلف يرى القيم (دور كلفة) بلا مصاريف وحدة المعمل (expenses_visible = false والتحميلات null). والكميات ووجباتها للجميع.
  const sideBatch = async (label, user, batch) => {
    const raw = (await call(user, 'select public.production_detail($1)', [batch])).v;
    return parsed(`parseBatch (${label})`, () => ui.parseBatch(raw));
  };
  const feedSide = await sideBatch('أمين العلف', U.keepFeed, B3);
  const rawSide = await sideBatch('أمين المواد', U.keepRaw, B3);
  const feedAcc = await sideBatch('محاسب العلف', U.accFeed, B3);
  t.same(
    feedSide && [feedSide.scope, feedSide.expensesVisible, feedSide.costs, feedSide.totalValue, feedSide.lines.map((l) => [l.itemName, l.usedQty, l.value, l.draws?.map((d) => d.qty)])],
    [{ input: false, output: true }, false, null, null, [['ذرة صفراء', 60000n, null, null], ['كسبة صويا', 40000n, null, null]]],
    'parseBatch (أمين العلف): scope = {input: false, output: true}، بلا مال ولا مصاريف، والكميات ظاهرة ووجبات مخزن المواد null (ق٢٥، ب٣؛ والجولة الثالثة ق٣٢: طرف الناتج وحده لا يقرأ وجبات المدخلات واستلاماتها)',
  );
  t.same(rawSide && [rawSide.scope, rawSide.expensesVisible, rawSide.costs], [{ input: true, output: false }, false, null], 'parseBatch (أمين المواد): scope = {input: true, output: false}، بلا مال (ق٢٥، ب٣)');
  t.same(
    feedAcc && [feedAcc.scope, feedAcc.expensesVisible, feedAcc.totalValue, feedAcc.costs?.map((c) => [c.categoryName, c.amount, c.allocations])],
    [{ input: false, output: true }, false, 11465000n, [['أيدي عاملة', 50000n, null], ['كهرباء', 15000n, null]]],
    'parseBatch (محاسب العلف): القيم ظاهرة (دور كلفة) والتحميلات null، وexpenses_visible = false (وحدة المعمل خارج نطاقه، ق٢١ وق٢٥)',
  );
  // وجبات مخزن المواد واستلاماته لا تخرج لطرف الناتج وحده (الجولة الثالثة، ق٣٢ وب٢٨؛ سابقة التحويل): draws = null في كلّ سطر لأمين العلف
  // ومحاسبه، في المرحَّلة والملغاة (الأولى)، مع scope.input = false — الحالة التي تقول فيها خانة «من أيّ وجبات» «وجبات مخزن المواد خارج
  // نطاقك» بلا رابط؛ وأمين المواد (مخزن المدخلات بنطاقه) يراها بوجبتها ورقم استلامها. null صريح لا «غائب» (same يسوّي بينهما في المصفوفة).
  const feedVoid = await sideBatch('أمين العلف، الملغاة', U.keepFeed, B1);
  const drawsOfLines = (batch) => batch?.lines.map((l) => (l.draws === null ? 'null' : l.draws?.map((d) => [d.lotId, d.qty, d.source]) ?? 'غائب'));
  t.same(
    [drawsOfLines(feedSide), drawsOfLines(feedAcc), feedVoid && [feedVoid.status, feedVoid.scope, drawsOfLines(feedVoid)], drawsOfLines(rawSide)],
    [['null', 'null'], ['null', 'null'], ['void', { input: false, output: true }, ['null', 'null']], [[[cornLot.id, 60000n, cornLot.doc_no]], [[soyLot.id, 40000n, soyLot.doc_no]]]],
    'parseBatch: draws = null لأمين العلف ومحاسبه في المرحَّلة والملغاة، وبوجباتها ورقم استلامها لأمين المواد (ق٣٢، ب٢٨)',
  );
  // مسوّدة من طرف العلف (ب٣): البطاقة تُقرأ والمعاينة out_of_scope، فالشاشة لا تطلبها بلا scope.input. والإلغاء بمخزن المدخلات وحده
  // (void_production: stock_wh للمدخلات بنطاق وللناتج بلا نطاق): مدير نطاقه مخزن المواد يلغي ومدير نطاقه مخزن العلف لا، كما تُظهر الشاشة
  // زرّه بـscope.input لا بـscope.output (بمعاملة ترجع).
  const feedDraft = await sideBatch('أمين العلف، المسوّدة', U.keepFeed, B2);
  const voidFrom = (user) => db.asUser(user, (q) => q("select public.void_production($1, 'إلغاء من طرف واحد', $2)", [B3, ref()])).then(() => 'ok', (error) => error.message);
  t.same(
    [feedDraft?.status, feedDraft?.scope, code(await call(U.keepFeed, 'select public.preview_production($1)', [B2])), code(await call(U.accFeed, 'select public.preview_production($1)', [B2])),
      await voidFrom(U.mgrRaw), await voidFrom(U.mgrFeed)],
    ['draft', { input: false, output: true }, 'out_of_scope', 'out_of_scope', 'ok', 'out_of_scope'],
    'المسوّدة من طرف العلف: البطاقة تُقرأ والمعاينة out_of_scope؛ والإلغاء لمن نطاقه مخزن المدخلات (مدير المواد) لا مخزن الناتج وحده (ب٣)',
  );

  // مصدر دفعة العلف (ج٦، المفتاح المسطّح القائم منذ 0007): رقم دفعة الإنتاج.
  const lotsManager = parsed('parseItemLots (المدير)', () => ui.parseItemLots(lots));
  t.same(
    lotsManager && [lotsManager.item.kind, lotsManager.rows.map((r) => [r.sourceKind, r.sourceId, r.source, r.qtyLeft])],
    ['feed', [['production', B1, DOC1, 2000000n]]],
    'parseItemLots: دفعة العلف المنتج مصدرها الإنتاج ورقم دفعته (2,000 كغم)',
  );
  t.same(
    parsed('parseItemLots (مشغّل المعمل)', () => ui.parseItemLots(lots3))?.rows.map((r) => [r.sourceKind, r.sourceId, r.source, r.qtyLeft]),
    [['production', B3, posted3.v.doc_no, 100000n]],
    'parseItemLots (مشغّل المعمل): رقم الدفعة الثالثة',
  );

  // سعر الكلفة المكتوب 950 (القسم ٦) بجانب سعر البيع الفارغ، وآخر شراء 1,800,000 ÷ 2,000 = 900.00.
  const purchasesOf = async (user) => (await call(user, 'select public.item_purchases($1, $2, null, 50)', [CORN, RAW])).v;
  const buysManagerRaw = await purchasesOf(U.manager);
  const buysMillerRaw = await purchasesOf(U.miller);
  const buysManager = parsed('parseItemPurchases (المدير)', () => ui.parseItemPurchases(buysManagerRaw));
  t.same(
    buysManager && [buysManager.item.costPrice, buysManager.item.sellPrice, buysManager.rows.length, buysManager.rows[0].qtyIn, buysManager.rows[0].money],
    [95000n, null, 1, 2000000n, { invoiceTotal: 180000000n, landedValue: 180000000n, unitCost: 90000n, corrected: false }],
    'parseItemPurchases: سعر الكلفة 950.00 بالفلس بجانب سعر البيع الفارغ، وكلفة وحدة الشراء 900.00',
  );
  t.eq(buysManager?.lastProduction, null, 'parseItemPurchases: last_production null لمادّة أوّلية لم تُصنع (المفتاح موجود بقيمته)');
  const buysMiller = parsed('parseItemPurchases (مشغّل المعمل)', () => ui.parseItemPurchases(buysMillerRaw));
  t.same(buysMiller && [buysMiller.item.costPrice, buysMiller.item.sellPrice, buysMiller.rows[0].money], [null, null, null], 'parseItemPurchases (مشغّل المعمل): بلا أسعار ولا مال');

  // تقرير المصاريف بعد ترحيل الأولى (القسم ٣): المحمَّل 8,000 و2,000 و3,000، وصفر على العامّة والنقل والملغى.
  const report0 = parsed('parseExpenseReport', () => ui.parseExpenseReport(reportRaw));
  const expenseRow = (expenseId) => report0?.rows.find((r) => r.id === expenseId);
  t.same(
    [E1, E2, E3, E4, E5].map((x) => [expenseRow(x)?.amount, expenseRow(x)?.allocated]),
    [[800000n, 800000n], [500000n, 200000n], [400000n, 300000n], [5000000n, 0n], [2000000n, 0n]],
    'parseExpenseReport: المحمَّل على العلف من كلّ مصروف بالفلس',
  );
  const reversal = report0?.rows.find((r) => r.reverses === E6);
  t.same([expenseRow(E6)?.reversed, reversal?.amount, reversal?.allocated], [true, -3000000n, 0n], 'parseExpenseReport: صفّ الإلغاء بمبلغه السالب ومحمَّله صفر');

  // بطاقة الخلطة (القسم ٧): الذرة المكتوب 950 وآخر شراء 900 ومتوسّط المتاح 900، والصويا 1,500 بلا مكتوب؛ والطنّ 1,176,500.00.
  const recipeManager = parsed('parseRecipe (المدير)', () => ui.parseRecipe(detail));
  t.same(
    recipeManager?.lines.map((l) => [l.itemName, l.unitCost, l.costPrice, l.lastPrice]),
    [['ذرة صفراء', 90000n, 95000n, 90000n], ['كسبة صويا', 150000n, null, 150000n]],
    'parseRecipe: متوسّط المتاح وسعر الكلفة المكتوب وآخر شراء بالفلس',
  );
  t.same(
    recipeManager && [recipeManager.rates.map((r) => [r.lineNo, r.categoryId, r.categoryName, r.amountPerTon]), recipeManager.expected, recipeManager.expenseCategories.map((c) => c.name)],
    [[[1, LABOR, 'أيدي عاملة', 500000n], [2, POWER, 'كهرباء', 150000n]], { materialsPerTon: 117000000n, ratesPerTon: 650000n, costPerTon: 117650000n, unpriced: 0, unconverted: 0 }, ['أيدي عاملة', 'تعبئة', 'كهرباء', 'نقل']],
    'parseRecipe: معدّلات الطنّ وكلفته المتوقّعة والفئات',
  );
  const recipeMiller = parsed('parseRecipe (مشغّل المعمل)', () => ui.parseRecipe(millerDetail));
  t.same(
    recipeMiller && [recipeMiller.rates, recipeMiller.expected, recipeMiller.lines.map((l) => [l.unitCost, l.costPrice, l.lastPrice]), recipeMiller.expenseCategories.length],
    [null, null, [[null, null, null], [null, null, null]], 4],
    'parseRecipe (مشغّل المعمل): بلا مال، والفئات تصله، ولا يرمي',
  );
  const saltedRaw = (await call(U.manager, 'select public.recipe_detail($1, null)', [R3])).v;
  t.same(
    parsed('parseRecipe (بادئ مملّح)', () => ui.parseRecipe(saltedRaw))?.expected,
    { materialsPerTon: 94050000n, ratesPerTon: 0n, costPerTon: 94050000n, unpriced: 1, unconverted: 0 },
    'parseRecipe: المادّة بلا سعر تُعدّ (unpriced) ولا تُجمع ناقصة',
  );
  const cards = parsed('parseRecipes (المدير)', () => ui.parseRecipes(overview));
  const cardOf = (list, recipeId) => list?.find((c) => c.id === recipeId);
  const goldCard = cardOf(cards, R1);
  t.same(
    goldCard && [goldCard.expectedCostPerKg, goldCard.batches, goldCard.lastBatch?.docNo, goldCard.lastCostPerKg, goldCard.activeLines, goldCard.pieces.map((p) => [p.label, p.weight])],
    [117650n, 1, posted3.v.doc_no, 114650n, 2, [['ذرة صفراء', 600000n], ['كسبة صويا', 400000n]]],
    'parseRecipes: كلفة الكيلو المتوقّعة 1,176.50، وآخر دفعة بكلفتها الفعلية 1,146.50',
  );
  t.same(
    [cardOf(cards, R3)?.expectedCostPerKg, cardOf(cards, R2)?.expectedCostPerKg, cardOf(cards, R2)?.draft?.id],
    [null, null, V2],
    'parseRecipes: لا كلفة متوقّعة لخلطة فيها مادّة بلا سعر ولا لمسوّدة',
  );
  const millerCardsRaw = (await call(U.miller, 'select public.recipes_overview()')).v;
  const millerCards = parsed('parseRecipes (مشغّل المعمل)', () => ui.parseRecipes(millerCardsRaw));
  t.same(
    millerCards && [millerCards.length, millerCards.flatMap((c) => [c.expectedCostPerKg, c.lastCostPerKg, c.lastBatch?.totalValue ?? null]).filter((x) => x !== null)],
    [4, []],
    'parseRecipes (مشغّل المعمل): أربع بطاقات بلا أيّ كلفة، ولا يرمي',
  );
  for (const [label, user] of [['المدير', U.manager], ['مشغّل المعمل', U.miller]]) {
    const raw = (await call(user, 'select public.productions_overview(null, 30)')).v;
    const page = parsed(`parseProductions (${label})`, () => ui.parseProductions(raw));
    // المسوّدة الثانية وحدها، والصفوف: الأولى ملغاة والثالثة وثلاث دفعات السباق مرحَّلة.
    t.same(page && [page.drafts.map((d) => d.id), page.rows.length], [[B2], 5], `parseProductions (${label}): المسوّدة والدفعات الخمس`);
  }

  // ─── إصلاحات مراجعة 0016 بمحلّلات الشاشات: كلّ مفتاح جديد من جواب القاعدة الحقيقي ─────────────────────────────────
  // المحاسب المحصور بمخزن المواد وحده (ق١١، م١٢): يرى الكلفة ولا يرى مصاريف وحدة المعمل، فالمتاح null وcosts_unfunded بلا أرقام.
  // الدفعة الثانية الآن: صويا 400 وحنطة 600 بديلاً للذرة (القسم ٥)، والحنطة المتاحة 300 وحدها؛ المواد 400 × 1,500 + 300 × 800 =
  // 840,000.00، والتكاليف 6,000 + 1,500 = 7,500.00، فالكلّي 847,500.00 والكيلو (الكتلة المخطّطة 1,000) 847.50. والمتاح لمن يرى
  // الوحدة: «أيدي عاملة» 5,000 − 500 (الثالثة) = 4,500.00، و«كهرباء» 4,000 − 150 = 3,850.00.
  const hiddenRaw = await preview(U.accRaw, B2);
  const hiddenView = parsed('parsePreview (محاسب المواد)', () => ui.parsePreview(hiddenRaw));
  t.same(
    hiddenView && [hiddenView.inputValue, hiddenView.extraValue, hiddenView.totalValue, hiddenView.costPerKg, hiddenView.inputWarehouse,
      hiddenView.costs?.map((c) => [c.lineNo, c.categoryName, c.plannedAmount, c.amount, c.available])],
    [84000000n, 750000n, 84750000n, 84750n, { id: RAW, name: RAW_NAME, divisionId: MILL, divisionName: MILL_NAME },
      [[1, 'أيدي عاملة', 500000n, 600000n, null], [2, 'كهرباء', 150000n, 150000n, null]]],
    'parsePreview (محاسب المواد): المال ظاهر (دور كلفة) ووحدة المخزن، والمتاح null لكلّ سطر (المفتاح موجود بقيمته)',
  );
  t.same(
    hiddenView?.problems.map((x) => [x.code, x.itemName, x.need, x.have, x.categoryId, x.categoryName, x.needAmount, x.haveAmount, x.divisionName]),
    [['insufficient_stock', 'حنطة', 600000n, 300000n, null, null, null, null, null], ['costs_unsealed_scope', null, null, null, null, null, null, null, MILL_NAME]],
    `parsePreview (محاسب المواد قبل الختم): costs_unsealed_scope بـdivision_name «${MILL_NAME}» بلا فئة ولا أرقام بعد نقص الحنطة (ق٢١؛ كانت costs_unfunded بلا أرقام)`,
  );
  const seenRaw = await preview(U.accountant, B2);
  const seenView = parsed('parsePreview (المحاسب، الآن)', () => ui.parsePreview(seenRaw));
  t.same(
    seenView && [seenView.costs?.map((c) => c.available), seenView.problems.filter((x) => x.code === 'costs_unfunded').map((x) => [x.categoryId, x.needAmount, x.haveAmount])],
    [[450000n, 385000n], [[LABOR, 600000n, 450000n]]],
    'ضابط: المحاسب بلا نطاق يرى في اللحظة نفسها المتاح 4,500.00 و3,850.00 والنقص بأرقامه',
  );
  t.same([hiddenView?.expensesVisible, seenView?.expensesVisible], [false, true], 'parsePreview: expenses_visible لمحاسب المواد false (وحدة المعمل خارج نطاقه)، وللمحاسب بلا نطاق true (ق٢١)');
  // مشكلة التاريخ (private.date_problem، منذ 0015): صفحة الدفعة لا تغيّر يومها، فالمسوّدة الثانية بعد ثمانية أيام (app_today = 2026-11-12)
  // أقدم من سبعة أيام، والخادم يرسل الرمز وجملته بتاريخها (12 − 7 = 05/11/2026). المحلّل يحمل التلميح، والصفحة تعرضه لا الرمز الخام.
  const agedRaw = await db.setToday('2026-11-12', () => preview(U.accountant, B2));
  const agedView = parsed('parsePreview (مسوّدة بعد ثمانية أيام)', () => ui.parsePreview(agedRaw));
  t.same(
    agedView?.problems.filter((x) => x.code.startsWith('date_')).map((x) => [x.code, x.hint]),
    [['date_too_old', 'لا يُقبل تاريخ أقدم من 7 أيام؛ أقدم تاريخ مسموح به 05/11/2026.']],
    'parsePreview: مشكلة التاريخ برمزها وتلميح الخادم (hint)، لا الرمز وحده',
  );
  // بطاقة الدفعة الثالثة لمحاسب المواد (ق١١، م١٢): القيم ظاهرة، والتحميلات null = «محمَّلة من مصاريف وحدة خارج نطاقك».
  const hiddenBatchRaw = (await call(U.accRaw, 'select public.production_detail($1)', [B3])).v;
  const hiddenBatch = parsed('parseBatch (محاسب المواد)', () => ui.parseBatch(hiddenBatchRaw));
  t.same(
    hiddenBatch && [hiddenBatch.inputValue, hiddenBatch.extraValue, hiddenBatch.totalValue,
      hiddenBatch.costs?.map((c) => [c.categoryName, c.amount, c.available, c.allocations]), hiddenBatch.lines.map((l) => l.draws?.map((d) => d.qty))],
    [11400000n, 65000n, 11465000n, [['أيدي عاملة', 50000n, null, null], ['كهرباء', 15000n, null, null]], [[60000n], [40000n]]],
    'parseBatch (محاسب المواد): allocations null لكلّ سطر تكاليف (المفتاح موجود)، والقيم والوجبات ظاهرة',
  );
  t.same([hiddenBatch?.scope, hiddenBatch?.expensesVisible], [{ input: true, output: false }, false],
    'parseBatch (محاسب المواد): scope = {input: true, output: false} (مخزن العلف خارج نطاقه)، وexpenses_visible = false (ق٢١، ق٢٥)');

  // آخر دفعة صنعت العلف (ق١٤، ع٢): الثالثة (الأولى ملغاة لا تُعدّ)، 100 كغم في مخزن العلف، بلا مال.
  const feedBuys = (user, warehouse) => call(user, 'select public.item_purchases($1, $2, null, 50)', [FEED, warehouse]);
  const madeFeed = { batchId: B3, docNo: posted3.v.doc_no, producedOn: TODAY, qtyKg: 100000n, warehouseName: FEEDWH_NAME };
  for (const [label, user] of [['المدير', U.manager], ['مشغّل المعمل', U.miller]]) {
    const raw = (await feedBuys(user, FEEDWH)).v;
    const page = parsed(`parseItemPurchases (${label}، العلف)`, () => ui.parseItemPurchases(raw));
    t.same(page && [page.lastProduction, page.rows.length], [madeFeed, 0], `parseItemPurchases (${label}): last_production آخر دفعة مرحَّلة صنعت العلف، ولا شراء`);
  }
  const rawScopeBuys = (await feedBuys(U.accRaw, null)).v;
  t.eq(parsed('parseItemPurchases (محاسب المواد، العلف)', () => ui.parseItemPurchases(rawScopeBuys))?.lastProduction, null,
    'parseItemPurchases (محاسب المواد): مخزن العلف خارج نطاقه، فـlast_production null');
  t.eq(code(await feedBuys(U.accRaw, FEEDWH)), 'out_of_scope', 'ضابط: محاسب المواد لا يقرأ مخزن العلف نفسه');

  // الوقود خارج كتلة الخلطة (ق٣، م١١): «بادئ بالكاز» ذرة 1,000 كغم + كاز 20 لتراً (بكثافة 0.85 = 17.000 كغم) للأساس 1,000 يتفعّل،
  // وحصّة الكاز 17 × 100 ÷ 1,000 = 1.70٪ خارج الكتلة.
  const KEROSENE = await one(U.manager, "insert into public.items (name, kind, base_unit, density_kg_per_l) values ('كاز المولّدة', 'fuel', 'L', 0.85) returning id");
  const R5 = id(143);
  const fueled = await createRecipe(U.manager, R5, id(144), 'بادئ بالكاز', FEED2, 1000, [{ item_id: CORN, qty: 1000, unit: 'kg' }, { item_id: KEROSENE, qty: 20, unit: 'L' }], [], true);
  t.same(parsed('parseCreatedRecipe (بالكاز)', () => ui.parseCreatedRecipe(fueled.v)), { id: R5, versionId: id(144), versionNo: 1, status: 'active', lines: 2, rates: 0 },
    `parseCreatedRecipe: خلطة بسطر كاز مفعَّلة والمجموع بلا الكاز = الأساس (${fueled.code ?? ''} ${fueled.hint ?? ''})`);
  const fueledRaw = (await call(U.manager, 'select public.recipe_detail($1, null)', [R5])).v;
  const fueledCard = parsed('parseRecipe (بالكاز)', () => ui.parseRecipe(fueledRaw));
  t.same(
    fueledCard && [fueledCard.basisKg, fueledCard.massKg, fueledCard.lines.map((l) => [l.itemName, l.kind, l.unit, l.qty, l.massKg, l.sharePct, l.inBasis])],
    [1000000n, 1000000n, [['ذرة صفراء', 'raw', 'kg', 1000000n, 1000000n, 10000n, true], ['كاز المولّدة', 'fuel', 'L', 20000n, 17000n, 170n, false]]],
    'parseRecipe: in_basis لكلّ سطر (الكاز خارج الكتلة)، وmass_kg 1,000 بلا الكاز',
  );
  // بطاقة الخلطة (ب٩): خلية «بالكيلوغرام» لسطر خارج الكتلة «—» والمجموع mass_kg، فمجموع ما داخل الكتلة = المجموع: 1,000 لا 1,017.
  t.eq(fueledCard?.lines.filter((l) => l.inBasis).reduce((sum, l) => sum + l.massKg, 0n), fueledCard?.massKg, 'parseRecipe: مجموع كتلة السطور داخل الكتلة = mass_kg، فالخلايا تساوي المجموع (ب٩)');
  // قطع لوحة المعمل (ب٨): in_basis على كلّ قطعة، فشريط التركيبة ورقاقاته بلا الكاز، و«أخرى» تُعدّ ممّا داخل الكتلة (صفر هنا).
  const fuelOverview = (await call(U.manager, 'select public.recipes_overview()')).v;
  const fuelCards = parsed('parseRecipes (بعد خلطة الكاز)', () => ui.parseRecipes(fuelOverview));
  t.same(
    [cardOf(fuelCards, R5)?.pieces.map((p) => [p.label, p.weight, p.inBasis]), cardOf(fuelCards, R5)?.moreLines, cardOf(fuelCards, R1)?.pieces.map((p) => [p.label, p.inBasis])],
    [[['ذرة صفراء', 1000000n, true], ['كاز المولّدة', 17000n, false]], 0, [['ذرة صفراء', true], ['كسبة صويا', true]]],
    'parseRecipes: in_basis لكلّ قطعة (الكاز 17 كغم خارج الكتلة، والذرة والصويا داخلها)، و«أخرى» صفر (ب٨)',
  );
  // اللقطة لا النوع الحيّ (ق٢٢): الكاز يصير «مادّة أوّلية» بمعاملة ترجع، فقطعة اللوحة وسطر النسخة المفعَّلة يبقيان خارج الكتلة (والنوع
  // الحيّ raw ظاهر)، والكتلة 1,000؛ والمسوّدة المنسوخة بعده تقرأ النوع الحيّ: الكاز داخلها والكتلة 1,000 + 17 = 1,017.
  const flipped = await db.asUser(U.manager, async (q) => {
    await q("update public.items set kind = 'raw' where id = $1", [KEROSENE]);
    await q('select public.new_recipe_version($1, $2)', [R5, id(151)]);
    const read = async (sql, params) => (await q(sql, params)).rows[0].v;
    return {
      overview: await read('select public.recipes_overview() as v', []),
      active: await read('select public.recipe_detail($1, null) as v', [R5]),
      draft: await read('select public.recipe_detail($1, $2) as v', [R5, id(151)]),
    };
  });
  const flippedActive = parsed('parseRecipe (المفعَّلة بعد تغيير النوع)', () => ui.parseRecipe(flipped.active));
  const flippedDraft = parsed('parseRecipe (المسوّدة بعد تغيير النوع)', () => ui.parseRecipe(flipped.draft));
  t.same(
    [cardOf(parsed('parseRecipes (بعد تغيير النوع)', () => ui.parseRecipes(flipped.overview)), R5)?.pieces.map((p) => p.inBasis),
      flippedActive && [flippedActive.massKg, flippedActive.lines.map((l) => [l.kind, l.inBasis])], flippedDraft && [flippedDraft.status, flippedDraft.massKg, flippedDraft.lines.map((l) => [l.kind, l.inBasis])]],
    [[true, false], [1000000n, [['raw', true], ['raw', false]]], ['draft', 1017000n, [['raw', true], ['raw', true]]]],
    'in_basis من لقطة السطر في اللوحة وبطاقة النسخة المفعَّلة بعد تغيير نوع الكاز، والمسوّدة بالنوع الحيّ (ق٢٢، ب٨ وب٩)',
  );
  // ووحدة الأساس لقطة ثالثة (الجولة الثالثة، ق٣١ وب٢٧): «كاز البانية» يُنشأ من «أنشئ» في البانية مادّة أوّلية بالكيلو (newItemFields: raw
  // وkg وخطوة 0.100) ويدخل خلطة مفعَّلة 983 ذرة + 17 كغم كاز = 1,000 = الأساس، ثمّ يصحّحه المدير من نافذة المادّة وقوداً باللتر بكثافة 0.85
  // (قبل أوّل حركة). جواب recipe_detail الحقيقي بمحلّل الشاشة: سطر الكاز في المفعَّلة بلقطته (الوحدة kg و«داخل الكتلة»، والكتلة 1,000)
  // ونوعه الحيّ fuel، وunit_changed = true له وحده — فبطاقة الخلطة تقول «تغيّرت وحدة» تحت المفعَّلة، ومشغّل المعمل الذي يضغط «أنتج» يقرؤه
  // بلا مال؛ وcreate_production من النسخة item_changed بتلميح يسمّي المادّة (نافذة «أنتج» تعرضه كما هو)؛ والمسوّدة المنسوخة بعده بالوحدة
  // والنوع الحيّين (L، والكاز خارج الكتلة فهي 983) وبلا unit_changed (لا لقطة).
  const KAZ_B = await one(U.manager, "insert into public.items (name, kind, base_unit, scale_step) values ('كاز البانية', 'raw', 'kg', 0.100) returning id");
  const R6 = id(161);
  const V6 = id(162);
  const kazBuilt = await createRecipe(U.manager, R6, V6, 'بادئ بكاز البانية', FEED2, 1000, [{ item_id: CORN, qty: 983, unit: 'kg' }, { item_id: KAZ_B, qty: 17, unit: 'kg' }], [], true);
  t.eq(kazBuilt.v?.status, 'active', `خلطة بكاز البانية مفعَّلة: 983 + 17 = 1,000 (${kazBuilt.code ?? ''} ${kazBuilt.hint ?? ''})`);
  await one(U.manager, "update public.items set kind = 'fuel', base_unit = 'L', density_kg_per_l = 0.85 where id = $1 returning id", [KAZ_B]);
  const unitLine = (l) => [l.itemName, l.kind, l.baseUnit, l.unit, l.qty, l.massKg, l.inBasis, l.unitChanged];
  const kazActiveRaw = (await call(U.manager, 'select public.recipe_detail($1, null)', [R6])).v;
  const kazMillerRaw = (await call(U.miller, 'select public.recipe_detail($1, null)', [R6])).v;
  const kazActive = parsed('parseRecipe (بعد تصحيح وحدة الكاز)', () => ui.parseRecipe(kazActiveRaw));
  const kazMiller = parsed('parseRecipe (مشغّل المعمل، بعد تصحيح وحدة الكاز)', () => ui.parseRecipe(kazMillerRaw));
  t.same(
    [kazActive && [kazActive.status, kazActive.massKg, kazActive.lines.map(unitLine)], kazMiller && [kazMiller.rates, kazMiller.lines.map((l) => [l.itemName, l.unitChanged])]],
    [['active', 1000000n, [['ذرة صفراء', 'raw', 'kg', 'kg', 983000n, 983000n, true, false], ['كاز البانية', 'fuel', 'kg', 'kg', 17000n, 17000n, true, true]]],
      [null, [['ذرة صفراء', false], ['كاز البانية', true]]]],
    'parseRecipe: unit_changed للكاز وحده (لقطة kg والمادّة L الآن)، والوحدة و«داخل الكتلة» والكتلة من اللقطة، ومشغّل المعمل يقرؤه بلا مال (ق٣١، ب٢٧)',
  );
  const kazRefused = await create(U.miller, id(260), V6, 100);
  t.same(
    [code(kazRefused), kazRefused.hint, (await db.admin('select count(*)::int as n from public.production_batches where id = $1', [id(260)])).rows[0].n],
    ['item_changed', 'تغيّرت وحدة «كاز البانية» بعد تفعيل الخلطة، فلا يُنتَج بنسختها المفعَّلة. أنشئ نسخة جديدة من الخلطة وفعّلها.', 0],
    'create_production من النسخة بعد تصحيح الوحدة: item_changed بتلميح يسمّي المادّة ويقول ما العمل، ولا دفعة (ق٣١، ب٢٧)',
  );
  const kazCopy = await call(U.manager, 'select public.new_recipe_version($1, $2)', [R6, id(163)]);
  const kazDraftRaw = (await call(U.manager, 'select public.recipe_detail($1, $2)', [R6, id(163)])).v;
  const kazDraft = parsed('parseRecipe (المسوّدة بعد تصحيح وحدة الكاز)', () => ui.parseRecipe(kazDraftRaw));
  t.same(
    [code(kazCopy), kazDraft && [kazDraft.status, kazDraft.massKg, kazDraft.lines.map(unitLine)]],
    ['ok', ['draft', 983000n, [['ذرة صفراء', 'raw', 'kg', 'kg', 983000n, 983000n, true, false], ['كاز البانية', 'fuel', 'L', 'kg', 17000n, 17000n, false, false]]]],
    'parseRecipe (المسوّدة المنسوخة بعد التصحيح): الوحدة والنوع الحيّان (L وfuel خارج الكتلة، فالكتلة 983)، وunit_changed = false (لا لقطة)',
  );
  // والجولة الرابعة (ق٤٢، ب٣١): سطر الكاز مكتوب بالكيلو، فـunit_mismatch = false في المفعَّلة (لمن يقرؤها) والمسوّدة — هذا الاتّجاه (kg ← L) يقوله
  // unit_changed وحده، وunit_mismatch لسطر مكتوب باللتر ومادّته الآن ليست باللتر (أدناه).
  t.same(
    [kazActive?.lines.map((l) => l.unitMismatch), kazMiller?.lines.map((l) => l.unitMismatch), kazDraft?.lines.map((l) => l.unitMismatch)],
    [[false, false], [false, false], [false, false]],
    'parseRecipe: unit_mismatch = false لسطر الكاز المكتوب بالكيلو في المفعَّلة والمسوّدة (الاتّجاه kg ← L يقوله unit_changed وحده، ق٤١ وق٤٢)',
  );
  t.same(await nonZero('verify_mill'), {}, 'verify_mill صفر بعد تصحيح وحدة مادّة في خلطة مفعَّلة (الفحص الثالث يقرأ لقطة الوحدة، ق٣١)');

  // ─── دمج الجولة الرابعة (fixes4.md القسم د؛ ق٤١ وق٤٢ وب٣١): جواب القاعدة الحقيقي بمحلّلات الشاشات ─────────────────────────────
  /** جواب القاعدة بمحلّل الشاشة، أو فحص فاشل باسمه ورمز رفض القاعدة (لا يُمرَّر جواب غائب للمحلّل فيرمي بخطأ شكل يخفي الرمز). */
  const servedAs = async (label, user, sql, params, parser) => {
    const out = await call(user, sql, params);
    if (!out.ok) {
      t.ok(false, `${label}: رمت القاعدة ${out.code}`);
      return null;
    }
    return parsed(label, () => parser(out.v));
  };
  const fullLine = (l) => [l.itemName, l.baseUnit, l.unit, l.qty, l.massKg, l.sharePct, l.inBasis, l.unitChanged, l.unitMismatch];
  const liquidItem = (name, kind, density) =>
    one(U.manager, "insert into public.items (name, kind, base_unit, density_kg_per_l) values ($1, $2, 'L', $3) returning id", [name, kind, density]);
  // التصحيح كما يرسله نموذج المادّة (changedFields): الوحدة كيلوغرام والكثافة فارغة معاً (items_density_unit_check)، قبل أيّ حركة.
  const toKg = (itemId) => one(U.manager, "update public.items set base_unit = 'kg', density_kg_per_l = null where id = $1 returning id", [itemId]);
  const ACTIVATE_V = 'select public.activate_recipe_version($1, (select version from public.recipe_versions where id = $1))';

  // الاتّجاه الآخر (ق٤١): «دبس الدمج» أوّلي باللتر بكثافة 1.4 في خلطة مفعَّلة (ذرة 972 + دبس 20 لتراً = 28 كغم ← 1,000)، ثمّ يُصحَّح كيلوغراماً قبل أيّ
  // حركة. جواب recipe_detail بمحلّل الشاشة: سطر الدبس بلقطته (L و«داخل الكتلة»، وكتلته 20 × 1.4 = 28 وحصّته 28 × 100 ÷ 1,000 = 2.80٪ من لقطة
  // الكثافة)، وunit_changed = false (يُنتَج بها، فلا تنبيه «تغيّرت وحدة»)، وunit_mismatch = true (مكتوب باللتر ومادّته الآن بالكيلو)؛ وقطعة لوحة المعمل
  // 28 كغم. وcreate_production ينجح (كان item_changed): الدبس بالكيلو 28 × 1,000 ÷ (1,000 × 0.1) = 280 خطوة ← 28.0 كغم والذرة 972.0، بمحلّل البطاقة.
  // و«نسخة جديدة» تنسخ سطره 28 كغم (round3(20 × 1.4)) بالكيلو فلا unit_mismatch، وتتفعّل (972 + 28 = 1,000) فيصير سطر المفعَّلة بالكيلو.
  const DIBS_I = await liquidItem('دبس الدمج', 'raw', 1.4);
  const R7 = id(171);
  const V7 = id(172);
  const dibsBuilt = await createRecipe(U.manager, R7, V7, 'بادئ بدبس الدمج', FEED2, 1000, [{ item_id: CORN, qty: 972, unit: 'kg' }, { item_id: DIBS_I, qty: 20, unit: 'L' }], [], true);
  t.eq(dibsBuilt.v?.status, 'active', `خلطة بدبس الدمج مفعَّلة: 972 + 20 × 1.4 = 1,000 (${dibsBuilt.code ?? ''} ${dibsBuilt.hint ?? ''})`);
  await toKg(DIBS_I);
  const CORN_972 = ['ذرة صفراء', 'kg', 'kg', 972000n, 972000n, 9720n, true, false, false];
  const dibsActive = await servedAs('parseRecipe (الدبس بعد تصحيحه كيلوغراماً)', U.manager, 'select public.recipe_detail($1, null)', [R7], ui.parseRecipe);
  const dibsMiller = await servedAs('parseRecipe (مشغّل المعمل، الدبس بعد تصحيحه)', U.miller, 'select public.recipe_detail($1, null)', [R7], ui.parseRecipe);
  t.same(
    [dibsActive && [dibsActive.status, dibsActive.massKg, dibsActive.lines.map(fullLine)], dibsMiller && [dibsMiller.rates, dibsMiller.lines.map((l) => [l.itemName, l.massKg, l.unitChanged, l.unitMismatch])]],
    [['active', 1000000n, [CORN_972, ['دبس الدمج', 'L', 'L', 20000n, 28000n, 280n, true, false, true]]], [null, [['ذرة صفراء', 972000n, false, false], ['دبس الدمج', 28000n, false, true]]]],
    'parseRecipe: لقطة لتر ومادّة صارت بالكيلو — الكتلة 28 والحصّة 2.80٪ من لقطة الكثافة، وunit_changed = false (يُنتَج بها) وunit_mismatch = true، ولمشغّل المعمل بلا مال (ق٤١ وق٤٢، ب٣١)',
  );
  const dibsCards = await servedAs('parseRecipes (بعد تصحيح الدبس)', U.manager, 'select public.recipes_overview()', [], ui.parseRecipes);
  t.same(cardOf(dibsCards, R7)?.pieces.map((p) => [p.label, p.weight, p.inBasis]), [['ذرة صفراء', 972000n, true], ['دبس الدمج', 28000n, true]],
    'parseRecipes: قطعة الدبس 28 كغم من لقطة الكثافة بعد تصحيح مادّته كيلوغراماً (ق٤١)');
  // كلفة الطنّ المتوقّعة لسطر الدبس (الجولة الخامسة، ق٥٤؛ ما علّقه التكامل الرابع): قبل سعره «1 من المواد بلا أيّ سعر» والمواد 972 × 950 (سعر كلفة الذرة
  // المكتوب، القسم ٦) = 923,400.00 وكلفة الكيلو في اللوحة فارغة؛ ثمّ يُكتب سعر كلفة الدبس 1,500 للكيلو، فيُحوَّل سطره المكتوب باللتر كيلوغراماً بلقطة كثافته
  // (20 × 1.4 = 28 كغم، الكتلة التي يخطّطها create_production منذ ق٤١) ويُسعَّر بسعر الكيلو: 923,400 + 28 × 1,500 = 965,400.00 للطنّ، والكيلو 965.40.
  const dibsPrice = await costPrice(U.manager, DIBS_I, 1500, null);
  const dibsPriced = await servedAs('parseRecipe (الدبس بعد سعر كلفته)', U.manager, 'select public.recipe_detail($1, null)', [R7], ui.parseRecipe);
  const dibsPricedCards = await servedAs('parseRecipes (الدبس بعد سعر كلفته)', U.manager, 'select public.recipes_overview()', [], ui.parseRecipes);
  const DIBS_EXPECTED = { materialsPerTon: 96540000n, ratesPerTon: 0n, costPerTon: 96540000n, unpriced: 0, unconverted: 0 };
  t.same(
    [dibsActive?.expected, cardOf(dibsCards, R7)?.expectedCostPerKg, code(dibsPrice), dibsPriced?.expected, cardOf(dibsPricedCards, R7)?.expectedCostPerKg],
    [{ materialsPerTon: 92340000n, ratesPerTon: 0n, costPerTon: 92340000n, unpriced: 1, unconverted: 0 }, null, 'ok', DIBS_EXPECTED, 96540n],
    'parseRecipe وparseRecipes: سطر الدبس المكتوب باللتر لمادّة صارت بالكيلو يُسعَّر بسعر الكيلو بلقطة كثافته (28 كغم × 1,500): الطنّ 965,400.00 والكيلو 965.40 — كان «بلا سعر» والسعر مكتوب (ق٥٤)',
  );
  const DIBS_B = id(173);
  const dibsMade = await create(U.miller, DIBS_B, V7, 1000);
  const dibsBatch = await servedAs('parseBatch (دفعة الدبس)', U.miller, 'select public.production_detail($1)', [DIBS_B], ui.parseBatch);
  t.same(
    [code(dibsMade), dibsMade.hint ?? null, dibsBatch && dibsBatch.lines.map((l) => [l.itemName, l.baseUnit, l.plannedQty, l.inBasis])],
    ['ok', null, [['ذرة صفراء', 'kg', 972000n, true], ['دبس الدمج', 'kg', 28000n, true]]],
    'create_production بلقطة لتر ومادّة صارت بالكيلو: تنجح (كانت item_changed)، والدبس 28.0 كغم بالكيلو بمحلّل البطاقة (ق٤١)',
  );
  if (dibsMade.ok) await call(U.miller, "select public.discard_draft('production', $1, (select version from public.production_batches where id = $1))", [DIBS_B]);
  const dibsCopy = await call(U.manager, 'select public.new_recipe_version($1, $2)', [R7, id(174)]);
  const dibsDraft = await servedAs('parseRecipe (مسوّدة الدبس المنسوخة)', U.manager, 'select public.recipe_detail($1, $2)', [R7, id(174)], ui.parseRecipe);
  const dibsRenewed = await call(U.manager, ACTIVATE_V, [id(174)]);
  const dibsNow = await servedAs('parseRecipe (الدبس بعد تفعيل النسخة الجديدة)', U.manager, 'select public.recipe_detail($1, null)', [R7], ui.parseRecipe);
  const DIBS_KG = ['دبس الدمج', 'kg', 'kg', 28000n, 28000n, 280n, true, false, false];
  t.same(
    [dibsCopy.ok ? parsed('parseNewRecipeVersion (الدبس)', () => ui.parseNewRecipeVersion(dibsCopy.v)) : dibsCopy.code,
      dibsDraft && [dibsDraft.status, dibsDraft.massKg, dibsDraft.lines.map(fullLine)], code(dibsRenewed), dibsNow && [dibsNow.versionId, dibsNow.status, dibsNow.massKg, dibsNow.lines.map(fullLine)]],
    [{ recipeId: R7, versionId: id(174), versionNo: 2, status: 'draft', lines: 2, rates: 0, existing: false, skipped: [] }, ['draft', 1000000n, [CORN_972, DIBS_KG]], 'ok',
      [id(174), 'active', 1000000n, [CORN_972, DIBS_KG]]],
    'new_recipe_version: سطر الدبس المكتوب باللتر يُنسخ 28 كغم بالكيلو (20 × 1.4) فلا unit_mismatch، وskipped فارغ، وتتفعّل (972 + 28 = 1,000) (ق٤١ وق٥٥، ب٣١ وب٤٨)',
  );
  t.same([dibsDraft?.expected, dibsNow?.expected], [DIBS_EXPECTED, DIBS_EXPECTED], 'ضابط ق٥٤: المسوّدة المنسوخة (الدبس 28 كغم بالكيلو) والمفعَّلة الجديدة بكلفة الطنّ نفسها 965,400.00');

  // لا سطر لتر بلا كثافة في نسخة تُفعَّل، ولا قارئ يرمي بسطر واحد (ق٤٢): «مولاس الدمج» أوّلي باللتر بكثافة 1.4 و«كاز مسوّدة الدمج» وقود باللتر بكثافة
  // 0.85 في مسوّدة (ذرة 986 + مولاس 10 لترات + كاز 20 لتراً)، ومسوّدة ثانية (ذرة 1,000 + الكاز 20 لتراً)، ثمّ تُصحَّح المادّتان كيلوغراماً قبل أيّ حركة.
  // جواب recipe_detail بمحلّل الشاشة: سطرا اللتر بكتلة وحصّة null (لا تُعرف بلا كثافة، والقارئ لا يرمي) وunit_mismatch = true، ومجموع الكتلة null لا
  // 986 ناقصاً (المولاس داخلها)؛ والتفعيل bad_recipe_unit يسمّي أوّل سطر منهما (المولاس) بجملة حارس السطر.
  const MOL_I = await liquidItem('مولاس الدمج', 'raw', 1.4);
  const KAZ_I = await liquidItem('كاز مسوّدة الدمج', 'fuel', 0.85);
  const R8 = id(175);
  const V8 = id(176);
  const R9 = id(177);
  const V9 = id(178);
  const molDraft = await createRecipe(U.manager, R8, V8, 'مسوّدة المولاس والكاز', FEED2, 1000,
    [{ item_id: CORN, qty: 986, unit: 'kg' }, { item_id: MOL_I, qty: 10, unit: 'L' }, { item_id: KAZ_I, qty: 20, unit: 'L' }], [], false);
  const kazOnly = await createRecipe(U.manager, R9, V9, 'مسوّدة كاز الدمج', FEED2, 1000, [{ item_id: CORN, qty: 1000, unit: 'kg' }, { item_id: KAZ_I, qty: 20, unit: 'L' }], [], false);
  t.same([molDraft.v?.status, kazOnly.v?.status], ['draft', 'draft'], `مسوّدتا سطور اللتر قبل التصحيح (${molDraft.code ?? ''} ${kazOnly.code ?? ''})`);
  await toKg(MOL_I);
  await toKg(KAZ_I);
  const molCard = await servedAs('parseRecipe (مسوّدة المولاس والكاز)', U.manager, 'select public.recipe_detail($1, $2)', [R8, V8], ui.parseRecipe);
  t.same(
    molCard && [molCard.status, molCard.massKg, molCard.lines.map(fullLine)],
    ['draft', null, [['ذرة صفراء', 'kg', 'kg', 986000n, 986000n, 9860n, true, false, false], ['مولاس الدمج', 'kg', 'L', 10000n, null, null, true, false, true],
      ['كاز مسوّدة الدمج', 'kg', 'L', 20000n, null, null, false, false, true]]],
    'parseRecipe (مسوّدة): سطرا اللتر لمادّتين صارتا بالكيلو بكتلة وحصّة null وunit_mismatch = true، ومجموع الكتلة null (المولاس داخلها) لا 986 ناقصاً (ق٤٢، ب٣١)',
  );
  const molActivate = await call(U.manager, ACTIVATE_V, [V8]);
  t.same([code(molActivate), molActivate.hint], ['bad_recipe_unit', '«مولاس الدمج» تُقاس بالكيلوغرام، فاكتب كميتها في الخلطة بالكيلوغرام.'],
    'activate_recipe_version: bad_recipe_unit يسمّي أوّل سطر باللتر لمادّة صارت بالكيلو، بجملة حارس السطر (ق٤٢)');
  // حالة مجمَّدة كما تركها التفعيل قبل الإصلاح (#1)، بمعاملة ترجع بدور postgres: «مسوّدة كاز الدمج» تُفعَّل بالتفعيل بلا فحص سطر اللتر (يُشال إن وُجد)،
  // فلقطة سطر الكاز لتر ووحدة أساس كيلوغرام خارج الكتلة بلا كثافة. لوحة المعمل وبطاقة الخلطة بدور authenticated للمدير ومشغّل المعمل كما يطلبها
  // PostgREST، والجواب بمحلّلي الشاشة: قطعة الكاز weight = null أخيراً (nulls last)، وسطره بكتلة وحصّة null وunit_mismatch = true، ومجموع الكتلة
  // 1,000 (الكاز خارجها) — كانت اللوحة كلّها والبطاقة ترميان density_not_positive لكلّ قارئ.
  const UNIT_CHECK = "if ln.unit = 'L' and ln.base_unit <> 'L' then";
  const planted = await db.asOwner(async (q) => {
    const def = (await q("select pg_get_functiondef('public.activate_recipe_version(uuid, integer)'::regprocedure) as d")).rows[0].d;
    if (def.split(UNIT_CHECK).length === 2) await q(def.split(UNIT_CHECK).join('if false then'));
    await q(ACTIVATE_V, [V9]);
    const snap = (await q('select unit, base_unit, in_basis, density_kg_per_l::text as density from public.recipe_lines where version_id = $1 and item_id = $2', [V9, KAZ_I])).rows[0];
    const read = async (user, sql, params = []) => {
      await q('savepoint integ_read');
      try {
        await q('set local role authenticated');
        await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: 'authenticated' })]);
        const v = (await q(sql, params)).rows[0].v;
        await q('release savepoint integ_read');
        return { ok: true, v };
      } catch (error) {
        await q('rollback to savepoint integ_read');
        return { ok: false, code: error.message };
      }
    };
    // verify_mill بدور postgres على الحالة المزروعة (الجولة الخامسة، ق٥٢): عدد لا رمية، ونقطة حفظ تلتقط الرمية فتُكمل المعاملة وتسمّي رمزها.
    const verifyMill = async () => {
      await q('savepoint integ_verify');
      try {
        const found = (await q('select check_name, violations::int as n from public.verify_mill() where violations <> 0')).rows;
        await q('release savepoint integ_verify');
        return Object.fromEntries(found.map((r) => [r.check_name, r.n]));
      } catch (error) {
        await q('rollback to savepoint integ_verify');
        return error.message;
      }
    };
    const outside = {
      snap,
      verify: await verifyMill(),
      overview: await read(U.manager, 'select public.recipes_overview() as v'),
      millerOverview: await read(U.miller, 'select public.recipes_overview() as v'),
      detail: await read(U.manager, 'select public.recipe_detail($1, null) as v', [R9]),
    };
    // ثمّ السطر نفسه داخل الكتلة (ق٥٢، حالة «#1» داخل الكتلة): لقطة in_basis تُقلب صحيحة (عمود لقطة يمرّ به حارس السطر)، فالذرة 1,000 = الأساس وكتلة الكاز
    // لا تُعرف — الحالة التي لا يعدّها «يتخطّى الفارغ».
    // القراءات أعلاه بدور authenticated بـset local داخل نقطة حفظ تُحرَّر (فيبقى الدور): الزرع والثوابت بدور postgres من جديد.
    await q('set local role postgres');
    await q('update public.recipe_lines set in_basis = true where version_id = $1 and item_id = $2', [V9, KAZ_I]);
    const inside = {
      verify: await verifyMill(),
      overview: await read(U.manager, 'select public.recipes_overview() as v'),
      millerOverview: await read(U.miller, 'select public.recipes_overview() as v'),
      detail: await read(U.manager, 'select public.recipe_detail($1, null) as v', [R9]),
      millerDetail: await read(U.miller, 'select public.recipe_detail($1, null) as v', [R9]),
    };
    return { ...outside, inside };
  }, U.manager);
  const plantedParse = (label, read, parser) => {
    if (read.ok) return parsed(label, () => parser(read.v));
    t.ok(false, `${label}: رمت القاعدة ${read.code}`);
    return null;
  };
  const plantedCards = plantedParse('parseRecipes (المدير، حالة مجمَّدة بلا كثافة)', planted.overview, ui.parseRecipes);
  const plantedMiller = plantedParse('parseRecipes (مشغّل المعمل، حالة مجمَّدة بلا كثافة)', planted.millerOverview, ui.parseRecipes);
  const plantedCard = plantedParse('parseRecipe (حالة مجمَّدة بلا كثافة)', planted.detail, ui.parseRecipe);
  const PLANTED_PIECES = [['ذرة صفراء', 1000000n, true], ['كاز مسوّدة الدمج', null, false]];
  t.same(
    [planted.snap, cardOf(plantedCards, R9)?.pieces.map((p) => [p.label, p.weight, p.inBasis]), cardOf(plantedMiller, R9)?.pieces.map((p) => [p.label, p.weight, p.inBasis]),
      cardOf(plantedCards, R9)?.moreLines],
    [{ unit: 'L', base_unit: 'kg', in_basis: false, density: null }, PLANTED_PIECES, PLANTED_PIECES, 0],
    'parseRecipes على حالة مجمَّدة بسطر لتر بلا كثافة (#1): لوحة المعمل لا ترمي للمدير ومشغّل المعمل، وقطعة الكاز weight = null أخيراً (ق٤٢، ب٣١)',
  );
  t.same(
    plantedCard && [plantedCard.status, plantedCard.massKg, plantedCard.lines.map(fullLine)],
    ['active', 1000000n, [['ذرة صفراء', 'kg', 'kg', 1000000n, 1000000n, 10000n, true, false, false], ['كاز مسوّدة الدمج', 'kg', 'L', 20000n, null, null, false, false, true]]],
    'parseRecipe على الحالة المجمَّدة: سطر الكاز بكتلة وحصّة null وunit_mismatch = true، ومجموع الكتلة 1,000 (الكاز خارجها) (ق٤٢، ب٣١)',
  );
  // verify_mill على السطر المزروع (الجولة الخامسة، ق٥٢): خارج الكتلة يعدّه الفحص ٣ وحده؛ وداخلها (والباقي = الأساس) يعدّه الفحصان ٢ و٣ — كان الفحص ٢ يجمع
  // بالرامي فيُسقط الثوابت كلّها لكلّ المنشآت بـdensity_not_positive. ولوحة المعمل وبطاقة الخلطة على الحالة داخل الكتلة بمحلّلَي الشاشة للمدير ولمشغّل المعمل:
  // قطعة الكاز weight = null داخل الكتلة أخيراً، وسطره بكتلة وحصّة null وunit_mismatch (لا density_missing: لقطته كيلوغرام)، ومجموع الكتلة null لا 1,000.
  const insideCards = plantedParse('parseRecipes (المدير، السطر المزروع داخل الكتلة)', planted.inside.overview, ui.parseRecipes);
  const insideMillerCards = plantedParse('parseRecipes (مشغّل المعمل، السطر المزروع داخل الكتلة)', planted.inside.millerOverview, ui.parseRecipes);
  const insideCard = plantedParse('parseRecipe (السطر المزروع داخل الكتلة)', planted.inside.detail, ui.parseRecipe);
  const insideMillerCard = plantedParse('parseRecipe (مشغّل المعمل، السطر المزروع داخل الكتلة)', planted.inside.millerDetail, ui.parseRecipe);
  const INSIDE_PIECES = [['ذرة صفراء', 1000000n, true], ['كاز مسوّدة الدمج', null, true]];
  const INSIDE_KAZ = ['كاز مسوّدة الدمج', 'kg', 'L', 20000n, null, null, true, false, true];
  t.same(
    [planted.verify, planted.inside.verify, cardOf(insideCards, R9)?.pieces.map((p) => [p.label, p.weight, p.inBasis]),
      cardOf(insideMillerCards, R9)?.pieces.map((p) => [p.label, p.weight, p.inBasis]), insideCard && [insideCard.massKg, insideCard.lines.map(fullLine)],
      insideMillerCard && [insideMillerCard.massKg, insideMillerCard.lines.map(fullLine)], [plantedCard, insideCard, insideMillerCard].map((card) => card?.lines.map((l) => l.densityMissing))],
    [{ recipe_frozen_bad_lines: 1 }, { recipe_basis_mismatch: 1, recipe_frozen_bad_lines: 1 }, INSIDE_PIECES, INSIDE_PIECES,
      [null, [['ذرة صفراء', 'kg', 'kg', 1000000n, 1000000n, 10000n, true, false, false], INSIDE_KAZ]], [null, [['ذرة صفراء', 'kg', 'kg', 1000000n, 1000000n, 10000n, true, false, false], INSIDE_KAZ]],
      [[false, false], [false, false], [false, false]]],
    'verify_mill بدور postgres على السطر المزروع: خارج الكتلة الفحص ٣ وحده، وداخلها الفحصان ٢ و٣ (عدد لا رمية)؛ واللوحة والبطاقة بمحلّليهما للمدير ولمشغّل المعمل: الكاز بلا كتلة داخل الكتلة أخيراً، والمجموع null (ق٥٢، ب٣١)',
  );
  t.same([await nonZero('verify_mill'), (await db.admin('select status from public.recipe_versions where id = $1', [V9])).rows[0].status], [{}, 'draft'],
    'ضابط: معاملة الحالة المجمَّدة رجعت (المسوّدة مسوّدة)، والثوابت صفر');

  // ─── دمج الجولة الخامسة (fixes5.md القسم د؛ ق٥١ وق٥٥، ب٤١ وب٤٨ وب٤٩): جواب القاعدة الحقيقي بمحلّلات الشاشات ─────────────────────────────
  // سائل بلا كثافة (ق٥١، ب٤٩): «شراب الدمج» أوّلي باللتر بكثافة 1.25، و«زيت الدمج» سائل بكثافة 0.9 مكتوب في الخلطة بالكيلو، في مسوّدة بلا تفعيل: ذرة 974 +
  // شراب 16 لتراً (16 × 1.25 = 20 كغم) + زيت 6 كغم = 1,000؛ ثمّ تُفرَّغ كثافتاهما وهما ما زالا باللتر (items_density_unit_check يسمح، والكثافة لا تتجمّد بلا
  // حركة). جواب recipe_detail بمحلّل الشاشة للمدير ولمشغّل المعمل (المفتاح خارج money): density_missing للشراب (كتلته null وليس unit_mismatch) وللزيت
  // المكتوب بالكيلو (كتلته 6 معروفة: جملة ب٤٩ لا تُشترط بكتلة فارغة)، وfalse للذرة؛ ومجموع الكتلة null (الشراب داخلها). والتفعيل density_required يسمّي
  // الشراب (أوّل سطر) — ما تقوله البطاقة قبل النقر.
  const SYRUP_I = await liquidItem('شراب الدمج', 'raw', 1.25);
  const OIL_I = await liquidItem('زيت الدمج', 'raw', 0.9);
  const R10 = id(601);
  const V10 = id(602);
  const syrupDraft = await createRecipe(U.manager, R10, V10, 'مسوّدة الشراب والزيت', FEED2, 1000,
    [{ item_id: CORN, qty: 974, unit: 'kg' }, { item_id: SYRUP_I, qty: 16, unit: 'L' }, { item_id: OIL_I, qty: 6, unit: 'kg' }], [], false);
  for (const liquid of [SYRUP_I, OIL_I]) await one(U.manager, 'update public.items set density_kg_per_l = null where id = $1 returning id', [liquid]);
  const densityLine = (l) => [l.itemName, l.baseUnit, l.unit, l.massKg, l.unitMismatch, l.densityMissing];
  const syrupCard = await servedAs('parseRecipe (مسوّدة الشراب والزيت)', U.manager, 'select public.recipe_detail($1, $2)', [R10, V10], ui.parseRecipe);
  const syrupMiller = await servedAs('parseRecipe (مشغّل المعمل، مسوّدة الشراب والزيت)', U.miller, 'select public.recipe_detail($1, $2)', [R10, V10], ui.parseRecipe);
  const SYRUP_LINES = [['ذرة صفراء', 'kg', 'kg', 974000n, false, false], ['شراب الدمج', 'L', 'L', null, false, true], ['زيت الدمج', 'L', 'kg', 6000n, false, true]];
  const syrupActivate = await call(U.manager, ACTIVATE_V, [V10]);
  t.same(
    [syrupDraft.v?.status, syrupCard && [syrupCard.status, syrupCard.massKg, syrupCard.lines.map(densityLine)], syrupMiller && [syrupMiller.rates, syrupMiller.massKg, syrupMiller.lines.map(densityLine)],
      code(syrupActivate), syrupActivate.hint],
    ['draft', ['draft', null, SYRUP_LINES], [null, null, SYRUP_LINES], 'density_required', '«شراب الدمج» سائل بلا كثافة، فلا يُحسب وزنه. اكتب كثافته من «المواد» في المخزن (زرّ «عدّل» بجانبها) ثمّ فعّل.'],
    'parseRecipe (مسوّدة): density_missing للسائلين بلا كثافة — الشراب باللتر (كتلته null وليس unit_mismatch) والزيت المكتوب بالكيلو (كتلته 6 معروفة) — لا للذرة، للمدير ولمشغّل المعمل؛ والتفعيل density_required يسمّي الشراب (ق٥١، ب٤٩)',
  );
  // والنسخة المفعَّلة بلقطتها (بمعاملة ترجع): تُفرَّغ كثافتا «كاز المولّدة» (سطر «بادئ بالكاز» باللتر بلقطة كثافة 0.85) و«كاز البانية» (لقطة سطره كيلوغرام، والمادّة
  // الآن باللتر) — المفعَّلتان بلا density_missing (الإنتاج يمضي بلقطة الكثافة، والثانية يسمّيها unit_changed)، ومسوّدة «كاز البانية» المنسوخة بالوحدة الحيّة
  // (سطره 17 كغم مكتوب بالكيلو لسائل صار بلا كثافة) بـdensity_missing = true. وكلّ بطاقة قُرئت أعلاه بلا سطر سائل بلا كثافة: false في كلّ سطر.
  const snapshots = await db.asUser(U.manager, async (q) => {
    await q('update public.items set density_kg_per_l = null where id = any ($1)', [[KEROSENE, KAZ_B]]);
    const read = async (recipe, version) => (await q('select public.recipe_detail($1, $2) as v', [recipe, version])).rows[0].v;
    return { fueled: await read(R5, null), kazActive: await read(R6, null), kazDraft: await read(R6, id(163)) };
  });
  const missingOf = (label, raw) => parsed(label, () => ui.parseRecipe(raw))?.lines.map((l) => [l.itemName, l.massKg, l.densityMissing]);
  t.same(
    [missingOf('parseRecipe (بادئ بالكاز بلا كثافة المادّة)', snapshots.fueled), missingOf('parseRecipe (كاز البانية المفعَّلة بلا كثافة المادّة)', snapshots.kazActive),
      missingOf('parseRecipe (مسوّدة كاز البانية بلا كثافة المادّة)', snapshots.kazDraft)],
    [[['ذرة صفراء', 1000000n, false], ['كاز المولّدة', 17000n, false]], [['ذرة صفراء', 983000n, false], ['كاز البانية', 17000n, false]],
      [['ذرة صفراء', 983000n, false], ['كاز البانية', 17000n, true]]],
    'parseRecipe: النسخة المفعَّلة بلقطتها بلا density_missing (لقطة كثافة، أو لقطة كيلوغرام)، والمسوّدة بالوحدة الحيّة بـdensity_missing لسطر بالكيلو لسائل بلا كثافة (ق٥١)',
  );
  t.same(
    [fueledCard, kazActive, kazMiller, kazDraft, dibsActive, dibsMiller, dibsDraft, dibsNow, molCard, recipeManager, recipeMiller].map((card) => card?.lines.every((l) => l.densityMissing === false) ?? null),
    Array(11).fill(true),
    'parseRecipe: density_missing = false في كلّ سطر من البطاقات المقروءة أعلاه (لا سائل بلا كثافة فيها؛ الكتلة null هناك سببها unit_mismatch) (ق٥١)',
  );

  // «نسخة جديدة» لا تنسخ سطر مادّة صارت قطعة (ق٥٥، ب٤٨): «ملح الدمج» و«خميرة الدمج» أوّليتان بالكيلو في خلطة مفعَّلة (ذرة 980 + ملح 10 + خميرة 10 = 1,000؛
  // ترتيب السطور غير ترتيب الأسماء)، ثمّ تصيران قطعة قبل أيّ حركة. create_production يرفض النسخة item_changed، وnew_recipe_version كان يرفض bad_recipe_unit من
  // حارس السطر فلا مسوّدة: خلطة لا يُنتَج بها ولا تُنسخ. الآن parseNewRecipeVersion بالجواب الحقيقي: مسوّدة بسطر الذرة وحده (lines 1)، وskipped بالاسمين بترتيب
  // السطور (تقوله الصفحة فوق النسخة الجديدة)؛ والإعادة بالمعرّف نفسه existing وskipped فارغ؛ وبطاقة المسوّدة بالذرة 980 وحدها، ثمّ 1,000 فتتفعّل ويُنتَج بها.
  const PIECE_A = await item('ملح الدمج', 'raw', 'kg');
  const PIECE_B = await item('خميرة الدمج', 'raw', 'kg');
  const R11 = id(611);
  const V11 = id(612);
  const pieced = await createRecipe(U.manager, R11, V11, 'بادئ بمادّتين صارتا قطعة', FEED2, 1000,
    [{ item_id: CORN, qty: 980, unit: 'kg' }, { item_id: PIECE_A, qty: 10, unit: 'kg' }, { item_id: PIECE_B, qty: 10, unit: 'kg' }], [], true);
  // ومسوّدة كتبها المدير قبل التحويل (ب٤١، ضابط P1b في #3): ذرة 990 + ملح 10 كغم = 1,000.
  const R12 = id(616);
  const V12 = id(617);
  const pieceDraft = await createRecipe(U.manager, R12, V12, 'مسوّدة ملح صار قطعة', FEED2, 1000, [{ item_id: CORN, qty: 990, unit: 'kg' }, { item_id: PIECE_A, qty: 10, unit: 'kg' }], [], false);
  for (const piece of [PIECE_A, PIECE_B]) await one(U.manager, "update public.items set base_unit = 'pc', scale_step = 1 where id = $1 returning id", [piece]);
  // سطر بالكيلو لمادّة صارت قطعة في المسوّدة (ب٤١): بطاقتها بالوحدة الحيّة pc والسطر مكتوب بالكيلو فكتلته 10 والمجموع 1,000 = الأساس، بلا unit_mismatch ولا
  // density_missing — فالشاشة تشترط base_unit = pc لتقول «لا تُفعَّل حتّى تُصحَّح السطور أعلاه» بدل «جاهزة للتفعيل»؛ والتفعيل bad_recipe_unit بجملة القطعة.
  const pieceCard = await servedAs('parseRecipe (مسوّدة ملح صار قطعة)', U.manager, 'select public.recipe_detail($1, $2)', [R12, V12], ui.parseRecipe);
  const pieceActivate = await call(U.manager, ACTIVATE_V, [V12]);
  t.same(
    [pieceDraft.v?.status, pieceCard && [pieceCard.massKg, pieceCard.basisKg, pieceCard.lines.map((l) => [l.itemName, l.baseUnit, l.unit, l.massKg, l.unitMismatch, l.densityMissing])],
      code(pieceActivate), pieceActivate.hint],
    ['draft', [1000000n, 1000000n, [['ذرة صفراء', 'kg', 'kg', 990000n, false, false], ['ملح الدمج', 'pc', 'kg', 10000n, false, false]]], 'bad_recipe_unit',
      '«ملح الدمج» وحدتها قطعة، والعليقة تُحسب بالكتلة: احذف سطرها.'],
    'parseRecipe (مسوّدة): سطر بالكيلو لمادّة صارت قطعة بوحدتها الحيّة pc والمجموع = الأساس بلا unit_mismatch ولا density_missing، والتفعيل bad_recipe_unit بجملة القطعة — ما تشترطه ب٤١ (ب٤١، #3)',
  );
  const piecedMade = await create(U.miller, id(613), V11, 100);
  const piecedCopy = await call(U.manager, 'select public.new_recipe_version($1, $2)', [R11, id(614)]);
  const piecedAgain = await call(U.manager, 'select public.new_recipe_version($1, $2)', [R11, id(614)]);
  const piecedDraft = await servedAs('parseRecipe (مسوّدة بلا القطعتين)', U.manager, 'select public.recipe_detail($1, $2)', [R11, id(614)], ui.parseRecipe);
  const PIECED_COPY = { recipeId: R11, versionId: id(614), versionNo: 2, status: 'draft', lines: 1, rates: 0, existing: false, skipped: ['ملح الدمج', 'خميرة الدمج'] };
  t.same(
    [pieced.v?.status, code(piecedMade),
      piecedCopy.ok ? parsed('parseNewRecipeVersion (القطعتان)', () => ui.parseNewRecipeVersion(piecedCopy.v)) : piecedCopy.code,
      piecedAgain.ok ? parsed('parseNewRecipeVersion (إعادة القطعتين)', () => ui.parseNewRecipeVersion(piecedAgain.v)) : piecedAgain.code,
      piecedDraft && [piecedDraft.status, piecedDraft.massKg, piecedDraft.lines.map((l) => [l.itemName, l.qty, l.unit, l.densityMissing])]],
    ['active', 'item_changed', PIECED_COPY, PIECED_COPY, ['draft', 980000n, [['ذرة صفراء', 980000n, 'kg', false]]]],
    'parseNewRecipeVersion: مادّتان صارتا قطعة لا تُنسخان — مسوّدة بسطر الذرة وحده، وskipped بالاسمين بترتيب السطور (كانت bad_recipe_unit ولا مسوّدة)، والإعادة بالمعرّف نفسه ترجع ما رجع أوّل مرّة: existing = false وskipped بالاسمين (ق٥٥ وق٦٣، ب٤٨ وب٦٣؛ كانت existing وskipped فارغ)',
  );
  await one(U.manager, 'update public.recipe_lines set qty = 1000 where version_id = $1 and item_id = $2 returning id', [id(614), CORN]);
  const piecedRenewed = await call(U.manager, ACTIVATE_V, [id(614)]);
  const piecedNowMade = await create(U.miller, id(615), id(614), 100);
  t.same([code(piecedRenewed), code(piecedNowMade)], ['ok', 'ok'], 'ثمّ الذرة 1,000 في المسوّدة: تتفعّل ويُنتَج بها (لا خلطة عالقة، ق٥٥)');
  if (piecedNowMade.ok) await call(U.miller, "select public.discard_draft('production', $1, (select version from public.production_batches where id = $1))", [id(615)]);
  t.same(await nonZero('verify_mill'), {}, 'verify_mill صفر بعد دمج الجولة الخامسة (القسم ١٠)');

  // ─── دمج الجولة السادسة (fixes6.md القسم د؛ ق٦١–ق٦٥، ب٦٢ وب٦٣): جواب القاعدة الحقيقي بمحلّلات الشاشات ولوحة كلفة الطنّ ─────────────────────────────
  const pages = await screensText();
  /** لوحة كلفة الطنّ كما ترسمها بطاقة الخلطة (ExpectedPanel الحقيقية بـreact-dom/server): نصّ الفقرتين الأوليين (الثالثة ملاحظة ثابتة). */
  const panelOf = (expected, canPrice) => {
    if (!expected) return null;
    try {
      const html = pages.renderToStaticMarkup(pages.createElement(pages.recipePage.ExpectedPanel, { expected, canPrice }));
      return (html.match(/<p[^>]*>[\s\S]*?<\/p>/gu) ?? []).map((p) => p.replace(/<[^>]+>/gu, '')).slice(0, 2);
    } catch (error) {
      return `رمت اللوحة: ${error.message}`;
    }
  };
  // السطر الذي له سعر ولا تتحوّل كميته إلى وحدة سعره (ق٦١، ب٦٢): «زيت التكامل» سائل أوّلي بكثافة 0.9 وسعر كلفته 2,000 للتر، في مسوّدة: ذرة 994 + زيت 6 كغم مكتوب
  // بالكيلو؛ و«دبس التكامل» أوّلي باللتر بكثافة 1.4، في مسوّدة: ذرة 972 + دبس 20 لتراً. قبل التصحيح: الزيت 6 كغم = round3(6 ÷ 0.9) = 6.667 لتر × 2,000 = 13,334،
  // والذرة 994 × 950 (سعر كلفتها المكتوب، القسم ٦) = 944,300، فالطنّ 957,634.00 بلا سطر متروك. ثمّ تُفرَّغ كثافة الزيت (density_missing) ويصير الدبس بالكيلو بسعر كلفة
  // 1,500 (unit_mismatch: لقطة الكثافة فارغة في المسوّدة)، قبل أيّ حركة. جواب recipe_detail بمحلّل الشاشة للمدير والمحاسب: سعر السطر مكتوب (2,000.00 و1,500.00)
  // وunpriced = 0 وunconverted = 1 (كان unpriced = 1)، والمواد بلاه 944,300.00 و972 × 950 = 923,400.00؛ ولمشغّل المعمل بلا مال. ولوحة كلفة الطنّ نفسها على الجواب
  // المحلَّل: «على الأقلّ» وجملة «لا تُحسب حتّى تُصحَّح سطورها أعلاه» لا «بلا أيّ سعر… اكتب سعر كلفتها» تحت سطر سعره مكتوب.
  const OIL6 = await liquidItem('زيت التكامل', 'raw', 0.9);
  const DIBS6 = await liquidItem('دبس التكامل', 'raw', 1.4);
  const R13 = id(651);
  const V13 = id(652);
  const R14 = id(653);
  const V14 = id(654);
  const oilPriced6 = await costPrice(U.manager, OIL6, 2000, null);
  const oilDraft6 = await createRecipe(U.manager, R13, V13, 'مسوّدة زيت التكامل', FEED2, 1000, [{ item_id: CORN, qty: 994, unit: 'kg' }, { item_id: OIL6, qty: 6, unit: 'kg' }], [], false);
  const dibsDraft6 = await createRecipe(U.manager, R14, V14, 'مسوّدة دبس التكامل', FEED2, 1000, [{ item_id: CORN, qty: 972, unit: 'kg' }, { item_id: DIBS6, qty: 20, unit: 'L' }], [], false);
  const oilBefore6 = await servedAs('parseRecipe (مسوّدة زيت التكامل قبل التصحيح)', U.manager, 'select public.recipe_detail($1, $2)', [R13, V13], ui.parseRecipe);
  await one(U.manager, 'update public.items set density_kg_per_l = null where id = $1 returning id', [OIL6]);
  await toKg(DIBS6);
  const dibsPriced6 = await costPrice(U.manager, DIBS6, 1500, null);
  const pricedLine = (l) => [l.itemName, l.baseUnit, l.unit, l.costPrice, l.unitMismatch, l.densityMissing];
  const oilCard6 = await servedAs('parseRecipe (مسوّدة زيت التكامل بلا كثافة)', U.manager, 'select public.recipe_detail($1, $2)', [R13, V13], ui.parseRecipe);
  const oilAccountant6 = await servedAs('parseRecipe (المحاسب، مسوّدة زيت التكامل)', U.accountant, 'select public.recipe_detail($1, $2)', [R13, V13], ui.parseRecipe);
  const oilMiller6 = await servedAs('parseRecipe (مشغّل المعمل، مسوّدة زيت التكامل)', U.miller, 'select public.recipe_detail($1, $2)', [R13, V13], ui.parseRecipe);
  const dibsCard6 = await servedAs('parseRecipe (مسوّدة دبس التكامل بالكيلو)', U.manager, 'select public.recipe_detail($1, $2)', [R14, V14], ui.parseRecipe);
  const dibsAccountant6 = await servedAs('parseRecipe (المحاسب، مسوّدة دبس التكامل)', U.accountant, 'select public.recipe_detail($1, $2)', [R14, V14], ui.parseRecipe);
  const OIL6_EXPECTED = { materialsPerTon: 94430000n, ratesPerTon: 0n, costPerTon: 94430000n, unpriced: 0, unconverted: 1 };
  const DIBS6_EXPECTED = { materialsPerTon: 92340000n, ratesPerTon: 0n, costPerTon: 92340000n, unpriced: 0, unconverted: 1 };
  t.same(
    [[code(oilPriced6), oilDraft6.v?.status, dibsDraft6.v?.status, code(dibsPriced6)], oilBefore6?.expected,
      oilCard6 && [oilCard6.expected, oilCard6.lines.map(pricedLine)], oilAccountant6?.expected, oilMiller6 && [oilMiller6.expected, oilMiller6.lines.map((l) => [l.itemName, l.costPrice, l.densityMissing])],
      dibsCard6 && [dibsCard6.expected, dibsCard6.lines.map(pricedLine)], dibsAccountant6?.expected],
    [['ok', 'draft', 'draft', 'ok'], { materialsPerTon: 95763400n, ratesPerTon: 0n, costPerTon: 95763400n, unpriced: 0, unconverted: 0 },
      [OIL6_EXPECTED, [['ذرة صفراء', 'kg', 'kg', 95000n, false, false], ['زيت التكامل', 'L', 'kg', 200000n, false, true]]], OIL6_EXPECTED,
      [null, [['ذرة صفراء', null, false], ['زيت التكامل', null, true]]],
      [DIBS6_EXPECTED, [['ذرة صفراء', 'kg', 'kg', 95000n, false, false], ['دبس التكامل', 'kg', 'L', 150000n, true, false]]], DIBS6_EXPECTED],
    'parseRecipe: سطر الزيت بلا كثافة وسطر الدبس المكتوب باللتر لمادّة صارت بالكيلو، ولكلٍّ سعر مكتوب في سطره، في unconverted = 1 لا unpriced، والمواد بلاه 944,300.00 و923,400.00، للمدير والمحاسب؛ ولمشغّل المعمل بلا مال (ق٦١، ب٦٢)',
  );
  const PANEL_TAIL = '1 من المواد لا تُحسب حتّى تُصحَّح سطورها أعلاه.';
  t.same(
    [panelOf(oilBefore6?.expected, true), panelOf(oilCard6?.expected, true), panelOf(oilAccountant6?.expected, false), panelOf(dibsCard6?.expected, true), panelOf(dibsAccountant6?.expected, false)],
    [['كلفة الطنّ المتوقّعة: 957,634.00', 'المواد 957,634.00 والتكاليف 0.00 لكلّ طنّ.'],
      ['كلفة الطنّ المتوقّعة: 944,300.00 على الأقلّ', `المواد 944,300.00 والتكاليف 0.00 لكلّ طنّ. ${PANEL_TAIL}`],
      ['كلفة الطنّ المتوقّعة: 944,300.00 على الأقلّ', `المواد 944,300.00 والتكاليف 0.00 لكلّ طنّ. ${PANEL_TAIL}`],
      ['كلفة الطنّ المتوقّعة: 923,400.00 على الأقلّ', `المواد 923,400.00 والتكاليف 0.00 لكلّ طنّ. ${PANEL_TAIL}`],
      ['كلفة الطنّ المتوقّعة: 923,400.00 على الأقلّ', `المواد 923,400.00 والتكاليف 0.00 لكلّ طنّ. ${PANEL_TAIL}`]],
    'ExpectedPanel على الجواب المحلَّل: للسطر المسعَّر الذي لا تتحوّل كميته «على الأقلّ» و«لا تُحسب حتّى تُصحَّح سطورها أعلاه»، لا «بلا أيّ سعر… اكتب سعر كلفتها»، للمدير والمحاسب؛ والضابط قبل التصحيح بلا جملة (ب٦٢)',
  );
  // والقطعة (ما علّقه وكيل الشاشات): مادّة لها سعر وصارت قطعة لا تتحوّل كميتها، فتُعدّ في unconverted، وفي البطاقة جملتها فوق اللوحة — في المسوّدة جملة القطعة (وحدة
  // الأساس الحيّة pc)، وفي المفعَّلة جملة «تغيّرت وحدة» (unit_changed). بمعاملة ترجع للمدير: سعر كلفة «ملح الدمج» (صار قطعة أعلاه) 300، فمسوّدة «مسوّدة ملح صار قطعة» (ذرة
  // 990 + ملح 10 كغم) بالمواد 990 × 950 = 940,500.00 وunconverted = 1؛ وخلطة مفعَّلة تُنشأ في المعاملة نفسها (ذرة 990 + «قطعة مسعّرة» 10 كغم بسعر 400) ثمّ تصير مادّتها
  // قطعة: unit_changed لسطرها وunconverted = 1 والمواد 940,500.00.
  const pieceReads6 = await db.asUser(U.manager, async (q) => {
    await q('select public.set_item_cost_price($1, 300, null)', [PIECE_A]);
    const priced = (await q("insert into public.items (name, kind, base_unit) values ('قطعة مسعّرة', 'raw', 'kg') returning id")).rows[0].id;
    await q('select public.set_item_cost_price($1, 400, null)', [priced]);
    await q("select public.create_recipe($1, $2, 'بادئ بقطعة مسعّرة', $3, 1000, $4::jsonb, '[]'::jsonb, true)",
      [id(655), id(656), FEED2, JSON.stringify([{ item_id: CORN, qty: 990, unit: 'kg' }, { item_id: priced, qty: 10, unit: 'kg' }])]);
    await q("update public.items set base_unit = 'pc', scale_step = 1 where id = $1", [priced]);
    const read = async (recipe, version) => (await q('select public.recipe_detail($1, $2) as v', [recipe, version])).rows[0].v;
    return { draft: await read(R12, V12), active: await read(id(655), null), overview: (await q('select public.recipes_overview() as v')).rows[0].v };
  });
  const pieceDraft6 = parsed('parseRecipe (مسوّدة ملح صار قطعة بسعره)', () => ui.parseRecipe(pieceReads6.draft));
  const pieceActive6 = parsed('parseRecipe (مفعَّلة بقطعة مسعّرة)', () => ui.parseRecipe(pieceReads6.active));
  const pieceCards6 = parsed('parseRecipes (مفعَّلة بقطعة مسعّرة)', () => ui.parseRecipes(pieceReads6.overview));
  const PIECE6_EXPECTED = { materialsPerTon: 94050000n, ratesPerTon: 0n, costPerTon: 94050000n, unpriced: 0, unconverted: 1 };
  const pieceLine6 = (l) => [l.itemName, l.baseUnit, l.costPrice, l.unitChanged];
  t.same(
    [pieceCard?.expected, panelOf(pieceCard?.expected, true), pieceDraft6 && [pieceDraft6.status, pieceDraft6.expected, pieceDraft6.lines.map(pieceLine6)],
      pieceActive6 && [pieceActive6.status, pieceActive6.expected, pieceActive6.lines.map(pieceLine6)],
      panelOf(pieceActive6?.expected, true), pieceCards6 && cardOf(pieceCards6, id(655))?.expectedCostPerKg, (await db.admin('select count(*)::int as n from public.recipes where id = $1', [id(655)])).rows[0].n],
    [{ ...PIECE6_EXPECTED, unpriced: 1, unconverted: 0 }, ['كلفة الطنّ المتوقّعة: 940,500.00 على الأقلّ', 'المواد 940,500.00 والتكاليف 0.00 لكلّ طنّ. 1 من المواد بلا أيّ سعر فلم تُحسب: اكتب سعر كلفتها.'],
      ['draft', PIECE6_EXPECTED, [['ذرة صفراء', 'kg', 95000n, false], ['ملح الدمج', 'pc', 30000n, false]]],
      ['active', PIECE6_EXPECTED, [['ذرة صفراء', 'kg', 95000n, false], ['قطعة مسعّرة', 'kg', 40000n, true]]],
      ['كلفة الطنّ المتوقّعة: 940,500.00 على الأقلّ', `المواد 940,500.00 والتكاليف 0.00 لكلّ طنّ. ${PANEL_TAIL}`], null, 0],
    'parseRecipe: القطعة بلا سعر في unpriced واللوحة «بلا أيّ سعر… اكتب سعر كلفتها» (السعر أوّل ما يُكتب لها)، وبسعرها في unconverted، وفي سطرها ما تبني عليه البطاقة جملتها فوق اللوحة — وحدة الأساس pc في المسوّدة، وunit_changed في المفعَّلة — واللوحة «لا تُحسب حتّى تُصحَّح سطورها أعلاه»، وكلفة الكيلو في لوحة المعمل فارغة لا رقم بلا سطرها (ق٦١، ب٦٢؛ بمعاملة ترجع)',
  );

  // «نسخة جديدة» تترك المادّة المؤرشفة التي صارت قطعة وسطر اللتر لسائل صار قطعة (ق٦٢)، والإعادة بالمعرّف نفسه ترجع ما رجع أوّل مرّة (ق٦٣، ب٦٣): «كيس التكامل» أوّلي
  // بالكيلو و«فيتامين التكامل» أوّلي باللتر بكثافة 1.25 في خلطة مفعَّلة (ذرة 980 + كيس 10 كغم + فيتامين 8 لترات = 10 كغم ← 1,000؛ ترتيب السطور غير ترتيب الأسماء)، ثمّ
  // يصير الكيس قطعة ويُؤرشف، ويصير الفيتامين قطعة بلا كثافة. create_production يرفض النسخة item_changed، وparseNewRecipeVersion بالجواب الحقيقي: مسوّدة بالذرة وحدها
  // (lines 1) وskipped بالاسمين بترتيب السطور (كانت item_archived ولا مسوّدة)؛ والإعادة بالمعرّف نفسه الجواب نفسه (existing = false: تقول الصفحة «أُنشئت نسخة مسوّدة…»
  // و«نُسخت النسخة بلا …» لا «مسوّدة قائمة»)؛ ومعرّف آخر والمسوّدة قائمة existing وskipped فارغ؛ ثمّ الذرة 1,000 فتتفعّل، والإعادة بعد التفعيل الجواب نفسه وحالة
  // النسخة مفعَّلة، ويُنتَج بها.
  const BAG6 = await item('كيس التكامل', 'raw', 'kg');
  const VIT6 = await liquidItem('فيتامين التكامل', 'raw', 1.25);
  const R15 = id(657);
  const V15 = id(658);
  const bagBuilt6 = await createRecipe(U.manager, R15, V15, 'بادئ بكيس وفيتامين صارا قطعة', FEED2, 1000,
    [{ item_id: CORN, qty: 980, unit: 'kg' }, { item_id: BAG6, qty: 10, unit: 'kg' }, { item_id: VIT6, qty: 8, unit: 'L' }], [], true);
  await one(U.manager, "update public.items set base_unit = 'pc', scale_step = 1 where id = $1 returning id", [BAG6]);
  await one(U.manager, 'update public.items set archived_at = now() where id = $1 returning id', [BAG6]);
  await one(U.manager, "update public.items set base_unit = 'pc', density_kg_per_l = null, scale_step = 1 where id = $1 returning id", [VIT6]);
  const bagRefused6 = await create(U.miller, id(661), V15, 100);
  const nv6 = (vid) => call(U.manager, 'select public.new_recipe_version($1, $2)', [R15, vid]);
  const asVersion6 = (label, out) => (out.ok ? parsed(label, () => ui.parseNewRecipeVersion(out.v)) : [out.code, out.hint]);
  const copy6 = asVersion6('parseNewRecipeVersion (الكيس والفيتامين)', await nv6(id(659)));
  const again6 = asVersion6('parseNewRecipeVersion (إعادة الكيس والفيتامين)', await nv6(id(659)));
  const other6 = asVersion6('parseNewRecipeVersion (معرّف آخر والمسوّدة قائمة)', await nv6(id(660)));
  const bagDraft6 = await servedAs('parseRecipe (مسوّدة بلا الكيس والفيتامين)', U.manager, 'select public.recipe_detail($1, $2)', [R15, id(659)], ui.parseRecipe);
  const COPY6 = { recipeId: R15, versionId: id(659), versionNo: 2, status: 'draft', lines: 1, rates: 0, existing: false, skipped: ['كيس التكامل', 'فيتامين التكامل'] };
  t.same(
    [bagBuilt6.v?.status, code(bagRefused6), copy6, again6, other6, bagDraft6 && [bagDraft6.status, bagDraft6.massKg, bagDraft6.lines.map((l) => [l.itemName, l.qty, l.unit])]],
    ['active', 'item_changed', COPY6, COPY6, { ...COPY6, existing: true, skipped: [] }, ['draft', 980000n, [['ذرة صفراء', 980000n, 'kg']]]],
    'parseNewRecipeVersion: الكيس المؤرشف الذي صار قطعة وسطر الفيتامين المكتوب باللتر لسائل صار قطعة يُتركان ويُسمّيان بترتيب السطور (كانت item_archived)، والإعادة بالمعرّف نفسه ترجع ما رجع أوّل مرّة (existing = false وskipped بالاسمين)، ومعرّف آخر existing وskipped فارغ (ق٦٢ وق٦٣، ب٦٣)',
  );
  await call(U.manager, 'update public.recipe_lines set qty = 1000 where version_id = $1 and item_id = $2 returning id', [id(659), CORN]);
  const bagRenewed6 = await call(U.manager, ACTIVATE_V, [id(659)]);
  const after6 = asVersion6('parseNewRecipeVersion (إعادة بعد التفعيل)', await nv6(id(659)));
  const bagMade6 = await create(U.miller, id(662), id(659), 100);
  t.same([code(bagRenewed6), after6, code(bagMade6)], ['ok', { ...COPY6, status: 'active' }, 'ok'],
    'ثمّ الذرة 1,000: تتفعّل، والإعادة بالمعرّف نفسه بعد التفعيل الجواب نفسه (المصدر النسخة التي قبلها) وحالة النسخة مفعَّلة، ويُنتَج بها (ق٦٢ وق٦٣)');
  if (bagMade6.ok) await call(U.miller, "select public.discard_draft('production', $1, (select version from public.production_batches where id = $1))", [id(662)]);

  // سطر تُقرَّب كتلته صفراً (ق٦٤): «سائل خفيف التكامل» أوّلي باللتر بكثافة 0.6، في مسوّدة: ذرة 1,000 + 0.001 لتر (round3(0.001 × 0.6) = 0.001 كغم، فيقبله حارس السطر،
  // والمجموع 1,000.001)، ثمّ تصير كثافته 0.4 قبل أيّ حركة: round3(0.001 × 0.4) = 0.000. recipe_detail بمحلّل الشاشة للمدير ومشغّل المعمل والمحاسب لا يرمي (كانت
  // mul_div_domain للثلاثة): الكتلة 0 والحصّة 0.00، ومجموع الكتلة 1,000 = الأساس، والسطر بلا unit_mismatch ولا density_missing ووحدته لتر — فلا شيء من شروط «لا تُفعَّل»
  // الثلاثة في الشاشة (ب٤١) يمسكه إلّا الكتلة الصفرية؛ والتفعيل وحارس السطر (البانية بسطر 0.001 لتر) يرفضانه qty_not_positive بتلميح يسمّيه.
  const LIGHT6 = await liquidItem('سائل خفيف التكامل', 'raw', 0.6);
  const R16 = id(664);
  const V16 = id(665);
  const lightDraft6 = await createRecipe(U.manager, R16, V16, 'مسوّدة سائل صغرت كثافته', FEED2, 1000, [{ item_id: CORN, qty: 1000, unit: 'kg' }, { item_id: LIGHT6, qty: 0.001, unit: 'L' }], [], false);
  await one(U.manager, 'update public.items set density_kg_per_l = 0.4 where id = $1 returning id', [LIGHT6]);
  const zeroLine = (l) => [l.itemName, l.qty, l.unit, l.baseUnit, l.massKg, l.sharePct, l.unitMismatch, l.densityMissing];
  const zeroCards = [];
  for (const [label, user] of [['المدير', U.manager], ['مشغّل المعمل', U.miller], ['المحاسب', U.accountant]]) {
    const card = await servedAs(`parseRecipe (${label}، سطر كتلته صفر)`, user, 'select public.recipe_detail($1, $2)', [R16, V16], ui.parseRecipe);
    zeroCards.push(card && [card.basisKg, card.massKg, card.lines.map(zeroLine)]);
  }
  const LIGHT6_LINE = ['سائل خفيف التكامل', 1n, 'L', 'L', 0n, 0n, false, false];
  const ZERO_CARD = [1000000n, 1000000n, [['ذرة صفراء', 1000000n, 'kg', 'kg', 1000000n, 10000n, false, false], LIGHT6_LINE]];
  const ZERO_HINT = (name) => `كمية «${name}» في الخلطة تُقرَّب صفراً بالكيلوغرام. اكتب كمية أكبر.`;
  const zeroActivate = await call(U.manager, ACTIVATE_V, [V16]);
  const zeroGuard = await createRecipe(U.manager, id(666), id(667), 'مسوّدة سائل خفيف بلا كتلة', FEED2, 1000,
    [{ item_id: CORN, qty: 1000, unit: 'kg' }, { item_id: LIGHT6, qty: 0.001, unit: 'L' }], [], false);
  t.same(
    [lightDraft6.v?.status, zeroCards, [code(zeroActivate), zeroActivate.hint ?? null], [code(zeroGuard), zeroGuard.hint ?? null]],
    ['draft', [ZERO_CARD, ZERO_CARD, ZERO_CARD], ['qty_not_positive', ZERO_HINT('سائل خفيف التكامل')], ['qty_not_positive', ZERO_HINT('سائل خفيف التكامل')]],
    'parseRecipe لمسوّدة سطرها 0.001 لتر بكثافة 0.4: لا يرمي للمدير ومشغّل المعمل والمحاسب، والكتلة 0 والحصّة 0.00 والمجموع = الأساس بلا unit_mismatch ولا density_missing؛ والتفعيل وحارس السطر qty_not_positive بتلميح يسمّيه (ق٦٤)',
  );
  // ونسخة مفعَّلة بالسطر الصفري كما يتركها التفعيل قبل الإصلاح (بمعاملة ترجع بدور postgres: فحص الكتلة الصفرية يُشال من التفعيل إن وُجد): بطاقتها بمحلّل الشاشة لا ترمي
  // (الحصّة 0.00 من لقطة الكثافة 0.4)، ثمّ تصير المادّة بالكيلو فتحويل «نسخة جديدة» (0.001 × 0.4 ← 0.000 كغم) يرفضه qty_not_positive بتلميحه لا خطأ قيد خام.
  const ZERO_CHECK = "    if private.recipe_line_kg_or_null(ln.qty, ln.unit, ln.density_kg_per_l) = 0 then\n      raise exception 'qty_not_positive'";
  const zeroPlanted = await db.asOwner(async (q) => {
    const asManager = async (sql, params) => {
      await q('savepoint integ6');
      try {
        await q('set local role authenticated');
        await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.manager, role: 'authenticated' })]);
        const v = (await q(sql, params)).rows[0].v;
        await q('release savepoint integ6');
        await q('set local role postgres');
        return { ok: true, v };
      } catch (error) {
        await q('rollback to savepoint integ6');
        return { ok: false, code: error.message, hint: error.hint ?? null };
      }
    };
    const def = (await q("select pg_get_functiondef('public.activate_recipe_version(uuid, integer)'::regprocedure) as d")).rows[0].d;
    if (def.split(ZERO_CHECK).length === 2) await q(def.split(ZERO_CHECK).join("    if false then\n      raise exception 'qty_not_positive'"));
    await q('savepoint integ6_activate');
    let activated = 'ok';
    try {
      await q(ACTIVATE_V, [V16]);
      await q('release savepoint integ6_activate');
    } catch (error) {
      await q('rollback to savepoint integ6_activate');
      activated = error.message;
    }
    const card = await asManager('select public.recipe_detail($1, null) as v', [R16]);
    await q("update public.items set base_unit = 'kg', density_kg_per_l = null where id = $1", [LIGHT6]);
    const copy = await asManager('select public.new_recipe_version($1, $2) as v', [R16, id(668)]);
    return { activated, card, copy };
  }, U.manager);
  const plantedZero = zeroPlanted.card.ok ? parsed('parseRecipe (مفعَّلة بسطر كتلته صفر)', () => ui.parseRecipe(zeroPlanted.card.v)) : zeroPlanted.card.code;
  t.same(
    [zeroPlanted.activated, typeof plantedZero === 'string' ? plantedZero : plantedZero && [plantedZero.status, plantedZero.massKg, plantedZero.lines.map(zeroLine)],
      zeroPlanted.copy.ok ? 'ok' : [zeroPlanted.copy.code, zeroPlanted.copy.hint]],
    ['ok', ['active', 1000000n, [['ذرة صفراء', 1000000n, 'kg', 'kg', 1000000n, 10000n, false, false], LIGHT6_LINE]], ['qty_not_positive', ZERO_HINT('سائل خفيف التكامل')]],
    'نسخة مفعَّلة بالسطر الصفري (مزروعة بمعاملة ترجع): parseRecipe لا يرمي والحصّة 0.00؛ وبعد أن تصير المادّة بالكيلو يرفض تحويل «نسخة جديدة» qty_not_positive بتلميحه (ق٦٤)',
  );
  // ثمّ ما يقوله التلميح: 0.002 لتر (round3(0.002 × 0.4) = 0.001 كغم) والذرة 999.999، فالمجموع 1,000 وتتفعّل؛ وحصّة السائل 0.001 × 100 ÷ 1,000 ← 0.00.
  const zeroBigger = await call(U.manager, 'update public.recipe_lines set qty = 0.002 where version_id = $1 and item_id = $2 returning id', [V16, LIGHT6]);
  const zeroCorn = await call(U.manager, 'update public.recipe_lines set qty = 999.999 where version_id = $1 and item_id = $2 returning id', [V16, CORN]);
  const zeroFixed = await call(U.manager, ACTIVATE_V, [V16]);
  const zeroNow = await servedAs('parseRecipe (السائل الخفيف بعد كمية أكبر)', U.manager, 'select public.recipe_detail($1, null)', [R16], ui.parseRecipe);
  t.same(
    [code(zeroBigger), code(zeroCorn), code(zeroFixed), zeroNow && [zeroNow.status, zeroNow.massKg, zeroNow.lines.map(zeroLine)]],
    ['ok', 'ok', 'ok', ['active', 1000000n, [['ذرة صفراء', 999999n, 'kg', 'kg', 999999n, 10000n, false, false], ['سائل خفيف التكامل', 2n, 'L', 'L', 1n, 0n, false, false]]]],
    'ثمّ «اكتب كمية أكبر»: 0.002 لتر (كتلته 0.001) والذرة 999.999 فتتفعّل، والحصّة 0.00 (ق٦٤)',
  );
  t.same(await nonZero('verify_mill'), {}, 'verify_mill صفر بعد دمج الجولة السادسة (القسم ١٠)');

  // «نسخة جديدة» تنسخ المفعَّلة (ق١٣، م٧): مسوّدة «بادئ ذهبي» الثانية بسطري المفعَّلة ومعدّليها، والإعادة والمسوّدة القائمة ترجعانها.
  const newVersion = (user, recipe, vid) => call(user, 'select public.new_recipe_version($1, $2)', [recipe, vid]);
  const copiedRaw = await newVersion(U.manager, R1, id(141));
  const againRaw = await newVersion(U.manager, R1, id(141));
  const otherRaw = await newVersion(U.manager, R1, id(142));
  const COPIED = { recipeId: R1, versionId: id(141), versionNo: 2, status: 'draft', lines: 2, rates: 2, existing: false, skipped: [] };
  t.same(parsed('parseNewRecipeVersion', () => ui.parseNewRecipeVersion(copiedRaw.v)), COPIED, `parseNewRecipeVersion: مسوّدة بسطري المفعَّلة ومعدّليها، وskipped فارغ (ق٥٥، ب٤٨) (${copiedRaw.code ?? ''} ${copiedRaw.hint ?? ''})`);
  t.same(
    [parsed('parseNewRecipeVersion (إعادة)', () => ui.parseNewRecipeVersion(againRaw.v)), parsed('parseNewRecipeVersion (مسوّدة قائمة)', () => ui.parseNewRecipeVersion(otherRaw.v))],
    [COPIED, { ...COPIED, existing: true }],
    'parseNewRecipeVersion: الإعادة بالمعرّف نفسه ترجع ما رجع أوّل مرّة (existing = false، ق٦٣)، ومعرّف آخر والمسوّدة قائمة: النسخة نفسها بـexisting وskipped فارغ (لم يُنسخ شيء بالنداء، ق٥٥)',
  );
  const copiedDetail = (await call(U.manager, 'select public.recipe_detail($1, $2)', [R1, id(141)])).v;
  const copiedCard = parsed('parseRecipe (المسوّدة المنسوخة)', () => ui.parseRecipe(copiedDetail));
  t.same(
    copiedCard && [copiedCard.versionId, copiedCard.status, copiedCard.basisKg, copiedCard.lines.map((l) => [l.itemName, l.qty, l.unit, l.inBasis]),
      copiedCard.rates?.map((r) => [r.lineNo, r.categoryName, r.amountPerTon])],
    [id(141), 'draft', 1000000n, [['ذرة صفراء', 600000n, 'kg', true], ['كسبة صويا', 400000n, 'kg', true]], [[1, 'أيدي عاملة', 500000n], [2, 'كهرباء', 150000n]]],
    'parseRecipe (المسوّدة المنسوخة): الأساس والسطور والمعدّلات بترتيبها كما في المفعَّلة',
  );
  t.eq(code(await newVersion(U.miller, R1, id(142))), 'forbidden', 'new_recipe_version لفعل التفعيل: مشغّل المعمل ممنوع');

  // الناتج لا يولد منتهياً (ق٨، م١٤): علف يتابَع انتهاؤه بتاريخ قبل يوم الإنتاج بثلاثين يوماً (2026-11-04 − 30 = 2026-10-05)،
  // بمعاملة ترجع فلا يبقى منها صفّ.
  const expiredRaw = await db.asUser(U.manager, async (q) => {
    const feedX = (await q("insert into public.items (name, kind, base_unit, tracks_expiry) values ('علف بصلاحية', 'feed', 'kg', true) returning id")).rows[0].id;
    await q("select public.create_recipe($1, $2, 'خلطة بصلاحية', $3, 1000, $4::jsonb, '[]'::jsonb, true)", [id(145), id(146), feedX, JSON.stringify([{ item_id: CORN, qty: 1000, unit: 'kg' }])]);
    await q('select public.create_production($1, $2, 100, $3, $4, public.app_today())', [id(147), id(146), RAW, FEEDWH]);
    await q('update public.production_batches set output_expiry_on = public.app_today() - 30 where id = $1', [id(147)]);
    return (await q('select public.preview_production($1) as p', [id(147)])).rows[0].p;
  });
  const expiredView = parsed('parsePreview (ناتج منتهٍ)', () => ui.parsePreview(expiredRaw));
  t.same(
    expiredView && [expiredView.outputExpiryOn, expiredView.canPost, expiredView.problems.map((x) => [x.code, x.expiryOn, x.producedOn, x.itemName])],
    ['2026-10-05', false, [['output_expired', '2026-10-05', TODAY, null]]],
    'parsePreview: output_expired بتاريخ انتهاء الناتج ويوم الإنتاج',
  );
  t.eq((await db.admin('select count(*)::int as n from public.production_batches where id = $1', [id(147)])).rows[0].n, 0, 'ضابط: معاملة الناتج المنتهي رجعت، لا دفعة باقية');

  // ─── ١١) الدمج (ب): repo الحقيقي على القاعدة الحقيقية — الطلب كما تبنيه الشاشة، والجواب بمحلّلها ──────────────────────────────
  // postgrest-js الحقيقي وfetch إلى miniPostgrest فوق db.asUser: اسم معامل لا تعرفه الدالّة يرجع PGRST202 كما يردّ PostgREST، وعمود
  // غير ممنوح أو سياسة ترفض بخطئها؛ والكتابة المشروطة تُعاد بعد «جواب ضاع» فتعرف نتيجتها (درس WP5 وWP6).
  const server = miniPostgrest(db);
  globalThis.__millPg = server;
  try {
    const repo = await screensRepo();
    const actAs = (user) => {
      server.user = user;
    };
    /** 'ok' أو رمز الرفض كما تراه الشاشة (RejectedError)، وغيره باسمه. */
    const rejected = async (promise) => {
      try {
        await promise;
        return 'ok';
      } catch (error) {
        return error instanceof repo.RejectedError ? error.code : `${error.name}: ${error.message}`;
      }
    };

    // بانية الخلطة بنداء واحد: 700 ذرة + 300 صويا = 1,000 كغم، و«أيدي عاملة» 4,000 لكلّ طنّ، مفعَّلة.
    actAs(U.manager);
    const NEW = {
      id: id(131),
      versionId: id(132),
      name: ' بادئ الشاشة ',
      outputItemId: FEED2,
      basisKg: 1000000n,
      lines: [{ itemId: CORN, qty: 700000n, unit: 'kg' }, { itemId: SOY, qty: 300000n, unit: 'kg' }],
      rates: [{ categoryId: LABOR, amountPerTon: 400000n }],
      activate: true,
    };
    const created = await repo.createRecipe(NEW);
    t.same(created, { id: id(131), versionId: id(132), versionNo: 1, status: 'active', lines: 2, rates: 1 }, 'createRecipe من الشاشة: create_recipe بمعاملاته كما تبنيها (الكميات والمبالغ نصوصاً)');
    t.same(await repo.createRecipe(NEW), created, 'createRecipe: الإعادة بالمعرّفين نفسيهما (جواب ضاع) ترجّع الموجود');
    t.eq(await rejected(repo.createRecipe({ ...NEW, name: 'بادئ آخر' })), 'id_conflict', 'createRecipe: المعرّف نفسه باسم آخر: id_conflict');
    // إصلاح ق٥ وم١: الإعادة تعرف نتيجتها هي — أيّ فرق في السطور أو ترتيبها أو المعدّلات أو الأساس أو طلب التفعيل id_conflict، لا «نجح»
    // بالمحفوظ القديم (والشاشة تُبقي المعرّفين وتقول إنّ ما حُفظ غير ما تراه، برابطه). والمحفوظ لا يتغيّر (loadRecipe بعده).
    t.same(
      [
        await rejected(repo.createRecipe({ ...NEW, lines: [{ itemId: CORN, qty: 600000n, unit: 'kg' }, { itemId: SOY, qty: 400000n, unit: 'kg' }] })),
        await rejected(repo.createRecipe({ ...NEW, lines: [...NEW.lines].reverse() })),
        await rejected(repo.createRecipe({ ...NEW, rates: [] })),
        await rejected(repo.createRecipe({ ...NEW, rates: [{ categoryId: LABOR, amountPerTon: 450000n }] })),
        await rejected(repo.createRecipe({ ...NEW, basisKg: 2000000n, lines: [{ itemId: CORN, qty: 1400000n, unit: 'kg' }, { itemId: SOY, qty: 600000n, unit: 'kg' }] })),
        await rejected(repo.createRecipe({ ...NEW, activate: false })),
      ],
      ['id_conflict', 'id_conflict', 'id_conflict', 'id_conflict', 'id_conflict', 'id_conflict'],
      'createRecipe: الإعادة بالمعرّفين نفسيهما بمحتوى آخر (السطور، وترتيبها، والمعدّلات، والأساس، وطلب التفعيل): id_conflict',
    );
    // سعر الطنّ للتخطيط: 700 × 950 (المكتوب) + 300 × 1,500 (آخر شراء) = 1,115,000.00، والمعدّل 4,000.00، فالطنّ 1,119,000.00.
    const builtCard = await repo.loadRecipe(id(131));
    t.same(
      [builtCard.status, builtCard.basisKg, builtCard.massKg, builtCard.lines.map((l) => [l.itemName, l.qty, l.costPrice, l.lastPrice, l.unitCost]),
        builtCard.rates?.map((r) => [r.categoryName, r.amountPerTon]), builtCard.expected],
      ['active', 1000000n, 1000000n, [['ذرة صفراء', 700000n, 95000n, 90000n, 90000n], ['كسبة صويا', 300000n, null, 150000n, 150000n]],
        [['أيدي عاملة', 400000n]], { materialsPerTon: 111500000n, ratesPerTon: 400000n, costPerTon: 111900000n, unpriced: 0, unconverted: 0 }],
      'loadRecipe (المدير): الخلطة كما بُنيت، وكلفة الطنّ المتوقّعة 1,119,000.00',
    );
    const builder = await repo.loadBuilder();
    t.same(
      [builder.categories.map((c) => c.name), builder.recipeNames.includes('بادئ الشاشة'), builder.feedItems.map((f) => f.name), builder.stores.map((s) => s.kind)],
      [['أيدي عاملة', 'تعبئة', 'كهرباء', 'نقل'], true, ['علف بادئ', 'علف ناهي'], ['feed', 'raw']],
      'loadBuilder: فئات المصاريف بقراءة مباشرة (الفعّالة غير النظامية)، والخلطات ومواد العلف ومخزنا المعمل',
    );
    actAs(U.miller);
    const builtMiller = await repo.loadRecipe(id(131));
    t.same([builtMiller.rates, builtMiller.expected, builtMiller.lines.map((l) => l.costPrice)], [null, null, [null, null]], 'loadRecipe (مشغّل المعمل): بلا مال ولا يرمي');

    // الدفعة 500 كغم: ذرة 350 وصويا 150، و«أيدي عاملة» 4,000 × 500 ÷ 1,000 = 2,000.00.
    const BATCH = id(230);
    await repo.createProduction(BATCH, id(132), 500000n, RAW, FEEDWH, TODAY);
    const fresh = await repo.loadBatch(BATCH);
    t.same(
      [fresh.status, fresh.lines.map((l) => [l.itemName, l.plannedQty]), fresh.costs],
      ['draft', [['ذرة صفراء', 350000n], ['كسبة صويا', 150000n]], null],
      'createProduction ثمّ loadBatch (مشغّل المعمل): المخطّط بالتناسب، وبلا تكاليف',
    );
    // نسختا القراءتين اللتين يقارنهما BatchPage.load (الجولة الرابعة، ب٣٣ وfindings4 #4)، على دفعة تجربة 100 كغم من النسخة نفسها تُحذف بعده: بلا
    // كاتب بينهما تتطابق نسخة production_detail ونسخة preview_production لمشغّل المعمل والمدير والمحاسب (فلا تقول الصفحة «تغيّرت الدفعة الآن من جهاز
    // آخر» لدفعة لم تتغيّر)، وحفظ من جهاز آخر بينهما (مشغّل المعمل يكتب الوزن بـsetBatchFields) يجعل المعاينة أحدث بواحد، فتُعاد القراءتان ولا يُرحَّل
    // بنسخة لم تُعرض.
    const PAIR = id(267);
    await repo.createProduction(PAIR, id(132), 100000n, RAW, FEEDWH, TODAY);
    const readPair = async (user, between = null) => {
      try {
        actAs(user);
        const shown = await repo.loadBatch(PAIR);
        if (between) await between();
        actAs(user);
        return (await repo.previewProduction(PAIR)).version - shown.version;
      } catch (error) {
        return `${error?.name}: ${error?.code ?? error?.message}`;
      }
    };
    t.same(
      [await readPair(U.miller), await readPair(U.manager), await readPair(U.accountant),
        await readPair(U.manager, async () => {
          actAs(U.miller);
          await repo.setBatchFields(PAIR, { outputQtyKg: 99000n });
        })],
      [0, 0, 0, 1],
      'BatchPage.load (ب٣٣): نسخة production_detail = نسخة preview_production بلا كاتب بينهما لكلّ قارئ، وحفظ من جهاز آخر بينهما يجعل المعاينة أحدث بواحد',
    );
    actAs(U.miller);
    await repo.discardBatch(PAIR, (await repo.loadBatch(PAIR)).version);
    // المتاح من «أيدي عاملة» = الأسبوع الثاني 5,000 − تحميل الدفعة الثالثة 500 = 4,500.00. المواد 350 × 900 + 150 × 1,500 =
    // 540,000.00، والكلّي 542,000.00، والكيلو 1,084.00.
    actAs(U.accountant);
    const firstLook = await repo.previewProduction(BATCH);
    t.same(
      [firstLook.inputValue, firstLook.extraValue, firstLook.totalValue, firstLook.costPerKg, firstLook.canPost, firstLook.problems.map((x) => x.code),
        firstLook.costs?.map((c) => [c.lineNo, c.categoryName, c.plannedAmount, c.amount, c.source, c.available])],
      [54000000n, 200000n, 54200000n, 108400n, true, [], [[1, 'أيدي عاملة', 200000n, 200000n, 'recipe', 450000n]]],
      'previewProduction (المحاسب): التكاليف من الخلطة بالمتاح لها، والكلّي مواد + تكاليف',
    );

    actAs(U.miller);
    const bran = { batchId: BATCH, id: id(231), itemId: BRAN, qty: 20000n, replaces: null, reason: null };
    const added = await repo.addProductionInput(bran);
    t.same([added.id, added.lineNo], [id(231), 3], 'addProductionInput: نخالة 20 كغم سطراً ثالثاً');
    t.same(await repo.addProductionInput(bran), added, 'addProductionInput: الإعادة بالمعرّف نفسه ترجّع السطر نفسه');
    // إصلاح ق٦ وم٢: المعرّف نفسه بكمية أخرى id_conflict، لا السطر بكميته الأولى بصمت (والشاشة تولّد معرّفاً جديداً للكمية الجديدة).
    t.eq(await rejected(repo.addProductionInput({ ...bran, qty: 30000n })), 'id_conflict', 'addProductionInput: المعرّف نفسه بكمية أخرى (30 كغم بعد 20): id_conflict');
    const soyLine = fresh.lines.find((l) => l.itemName === 'كسبة صويا')?.id ?? null;
    const swapInput = { batchId: BATCH, id: id(232), itemId: WHEAT, qty: 150000n, replaces: soyLine, reason: ' نفدت الصويا ' };
    const swap = await repo.addProductionInput(swapInput);
    t.eq(swap.lineNo, 4, 'addProductionInput: الحنطة بدل الصويا سطراً رابعاً');
    t.same(
      [
        await repo.addProductionInput(swapInput),
        await rejected(repo.addProductionInput({ ...swapInput, reason: 'سبب آخر للتبديل' })),
        await rejected(repo.addProductionInput({ ...swapInput, replaces: null, reason: null })),
      ],
      [swap, 'id_conflict', 'id_conflict'],
      'addProductionInput: إعادة التبديل بعد جواب ضاع (والسطر المبدَّل حُذف) ترجّع السطر نفسه، وبسبب آخر أو بلا تبديل id_conflict',
    );
    t.eq(
      await rejected(repo.addProductionInput({ batchId: BATCH, id: id(233), itemId: SOY, qty: 1000n, replaces: id(231), reason: '  ' })),
      'reason_required',
      'addProductionInput: التبديل بسبب فارغ (الشاشة تشذّبه): reason_required',
    );
    await repo.deleteProductionInput(id(231), (await repo.loadBatch(BATCH)).version);
    t.same(
      (await repo.loadBatch(BATCH)).lines.map((l) => [l.itemName, l.plannedQty, l.isSubstitute, l.reason, l.replacedItemName]),
      [['ذرة صفراء', 350000n, false, null, null], ['حنطة', 150000n, true, 'نفدت الصويا', 'كسبة صويا']],
      'deleteProductionInput ثمّ loadBatch: النخالة حُذفت، والبديل باسم ما حلّ محلّه وسببه المشذَّب',
    );

    // سطر تكاليف يدويّ بكتابة مباشرة (costs.load): «نقل» 1,000.00 ثمّ 1,500.00 ثمّ يُحذف.
    actAs(U.accountant);
    await repo.addBatchCost(BATCH, id(234), TRANSPORT, 100000n);
    t.eq(await rejected(repo.addBatchCost(BATCH, id(234), TRANSPORT, 100000n)), 'ok', 'addBatchCost: الإعادة بالمعرّف نفسه بعد جواب ضاع = انكتب، لا خطأ');
    t.eq(await rejected(repo.addBatchCost(BATCH, id(234), TRANSPORT, 90000n)), 'amount_changed', 'addBatchCost: المعرّف نفسه بمبلغ آخر: amount_changed');
    t.eq(await rejected(repo.addBatchCost(BATCH, id(235), TRANSPORT, 50000n)), 'category_duplicated', 'addBatchCost: الفئة نفسها بسطر آخر: category_duplicated كما هو');
    await repo.setBatchCost(id(234), 100000n, 150000n);
    t.eq(await rejected(repo.setBatchCost(id(234), 100000n, 150000n)), 'ok', 'setBatchCost: الإعادة بعد جواب ضاع: صفر صفوف والمحفوظ = المطلوب ← انكتب');
    t.eq(await rejected(repo.setBatchCost(id(234), 100000n, 120000n)), 'amount_changed', 'setBatchCost: السابق تغيّر: amount_changed بلا كتابة');
    const withTransport = await repo.previewProduction(BATCH);
    t.same(
      withTransport.costs?.map((c) => [c.lineNo, c.categoryName, c.plannedAmount, c.amount, c.source, c.available]),
      [[1, 'أيدي عاملة', 200000n, 200000n, 'recipe', 450000n], [2, 'نقل', null, 150000n, 'manual', 2000000n]],
      'السطر اليدويّ في المعاينة: بلا محسوب، والمبلغ المعدَّل، ومتاح «نقل» 20,000.00',
    );
    await repo.deleteBatchCost(id(234), withTransport.version);
    t.same((await repo.previewProduction(BATCH)).costs?.map((c) => c.categoryName), ['أيدي عاملة'], 'deleteBatchCost يحذف السطر اليدويّ');

    // الكمية الفعلية الموزونة مشروطة بما شافته الشاشة: الحنطة 151 كغم.
    actAs(U.miller);
    await repo.setInputActual(id(232), null, 151000n);
    t.eq(await rejected(repo.setInputActual(id(232), null, 151000n)), 'ok', 'setInputActual: الإعادة بعد جواب ضاع = انكتب');
    t.eq(await rejected(repo.setInputActual(id(232), null, 152000n)), 'qty_changed', 'setInputActual: السابق تغيّر: qty_changed');

    // فئة مصروف من مكانها (م٣): حقل «فئة جديدة» في صفحة الدفعة يكتبها بـcreateExpenseCategory، وتصل منتقي التكاليف فوراً.
    actAs(U.accountant);
    const upkeep = await repo.createExpenseCategory('  صيانة المعمل  ');
    t.same([upkeep.name, upkeep.systemCode, upkeep.archived], ['صيانة المعمل', null, false], 'createExpenseCategory (م٣): المحاسب يضيف الفئة باسمها المشذَّب، غير نظامية');
    t.ok((await repo.loadExpenseCategories()).some((c) => c.id === upkeep.id && c.name === 'صيانة المعمل'), 'loadExpenseCategories: الفئة الجديدة في منتقي تكاليف الدفعة');
    // الاسم المكرّر (ق٢٦، ب١١ وج٣): حقل «فئة جديدة» وإعدادات الفئات يعرضان رفض category_name_taken بتلميحه كما يرسله الخادم. الاسم يُطبَّع
    // (الهمزة والمسافات)، والتلميح يسمّي الفئة الموجودة بحالها: فعّالة تُختار، ومؤرشفة تُعاد، ونظامية اسمها محجوز؛ وتغيير الاسم إلى موجود مثله.
    const taken = (promise) => promise.then(() => ['ok', null], (error) => [error.code ?? `${error.name}: ${error.message}`, error.hint ?? null]);
    t.same(
      [
        await taken(repo.createExpenseCategory('ايدي  عاملة')),
        await taken(repo.createExpenseCategory(' قديمة ')),
        await taken(repo.createExpenseCategory('فرق جرد')),
        await taken(repo.rename('expense_categories', upkeep.id, upkeep.version, 'كهرباء')),
      ],
      [
        ['category_name_taken', 'توجد فئة «أيدي عاملة»: اخترها بدل إنشاء أخرى.'],
        ['category_name_taken', 'توجد فئة «قديمة» مؤرشفة: أعِدها من الأرشيف بدل إنشاء أخرى.'],
        ['category_name_taken', '«فرق جرد» اسم فئة نظامية يكتبها النظام؛ اختر اسماً آخر.'],
        ['category_name_taken', 'توجد فئة «كهرباء»: اخترها بدل إنشاء أخرى.'],
      ],
      'createExpenseCategory وrename: الاسم المكرّر category_name_taken بتلميح يقول حال الفئة الموجودة (ق٢٦)',
    );
    // الختم بلا مصروف (ق٢): سطر «صيانة المعمل» 500.00 ولا مصروف بفئته، فلا يُختم ما يُرفض ترحيله.
    await repo.addBatchCost(BATCH, id(240), upkeep.id, 50000n);
    const sealNoFunds = await repo.confirmCosts(BATCH, (await repo.previewProduction(BATCH)).version).then(() => null, (error) => error);
    t.same(
      [sealNoFunds?.code, sealNoFunds?.hint],
      ['expense_overloaded', 'صيانة المعمل: المطلوب 500 والمتاح من المصاريف المسجّلة 0. سجّل المصروف أوّلاً أو قلّل المبلغ.'],
      'confirmCosts بلا مصروف للفئة: expense_overloaded بأرقامه للمحاسب كما تعرضه الشاشة',
    );
    // محاسب المواد (ق١١): المعاينة بلا متاح ولا أرقام، والختم يُرفض بتلميح بلا رقم واحد.
    actAs(U.accRaw);
    const rawLook = await repo.previewProduction(BATCH);
    t.same(
      [rawLook.costs?.map((c) => [c.categoryName, c.amount, c.available]), rawLook.problems.map((x) => [x.code, x.categoryId, x.needAmount, x.haveAmount])],
      [[['أيدي عاملة', 200000n, null], ['صيانة المعمل', 50000n, null]], [['costs_unsealed_scope', null, null, null]]],
      'previewProduction (محاسب المواد قبل الختم): المتاح null لكلّ سطر، وcosts_unsealed_scope بلا أرقام (ق٢١؛ كانت costs_unfunded)',
    );
    const rawSeal = await repo.confirmCosts(BATCH, rawLook.version).then(() => null, (error) => error);
    t.same([rawSeal?.code, rawSeal?.hint], ['out_of_scope', `تكاليف هذه الدفعة تُحمَّل من مصاريف وحدة «${MILL_NAME}» خارج نطاقك، فيكتبها ويختمها محاسب أو مدير يرى تلك الوحدة.`],
      'confirmCosts (محاسب المواد): out_of_scope بتلميح يسمّي الوحدة (ق٢١: الختم لمن يرى مصاريف الوحدة؛ كان expense_overloaded بلا رقم)');
    // ولا يحدّد مبلغاً يُحمَّل منها (ق٢١): تعديل المبلغ وإضافة سطر وحذفه out_of_scope بالتلميح نفسه (حارس السطر وdelete_draft_line)؛ والترحيل
    // قبل الختم costs_unsealed_scope يسمّي الوحدة. والدفعة لم تتغيّر بشيء منها (النسخة نفسها).
    const unitHint = `تكاليف هذه الدفعة تُحمَّل من مصاريف وحدة «${MILL_NAME}» خارج نطاقك، فيكتبها ويختمها محاسب أو مدير يرى تلك الوحدة.`;
    const refusedAs = (promise) => promise.then(() => ['ok', null], (error) => [error.code ?? `${error.name}: ${error.message}`, error.hint ?? null]);
    t.same(
      [
        await refusedAs(repo.setBatchCost(id(240), 50000n, 40000n)),
        await refusedAs(repo.addBatchCost(BATCH, id(239), PACKING, 10000n)),
        await refusedAs(repo.deleteBatchCost(id(240), rawLook.version)),
        await refusedAs(repo.postProduction(BATCH, rawLook.version, rawLook.planToken, ref())),
        (await repo.previewProduction(BATCH)).version,
      ],
      [
        ['out_of_scope', unitHint],
        ['out_of_scope', unitHint],
        ['out_of_scope', unitHint],
        ['costs_unsealed_scope', `تكاليف هذه الدفعة تُحمَّل من مصاريف وحدة «${MILL_NAME}» خارج نطاقك، فتُرحَّل بعد أن يختمها محاسب أو مدير يرى تلك الوحدة.`],
        rawLook.version,
      ],
      'محاسب المواد قبل الختم: setBatchCost وaddBatchCost وdeleteBatchCost out_of_scope بتلميح الوحدة، وpostProduction costs_unsealed_scope (ق٢١)',
    );
    actAs(U.accountant);
    await repo.deleteBatchCost(id(240), (await repo.previewProduction(BATCH)).version);
    await repo.confirmCosts(BATCH, (await repo.previewProduction(BATCH)).version);
    actAs(U.miller);
    const ready = await repo.previewProduction(BATCH);
    t.same([ready.canPost, ready.problems, ready.costs, ready.totalValue, ready.inputMassKg], [true, [], null, null, 501000n], 'previewProduction (مشغّل المعمل بعد الختم): يرحّل، ولا مال');
    t.same([fresh.costsConfirmed, (await repo.loadBatch(BATCH)).costsConfirmed], [false, true], 'loadBatch (مشغّل المعمل): costs_confirmed قبل الختم false وبعده true، فيرى «أنتج الآن» بعده وحده (ب١)');
    // بعد أن يختمها المحاسب الذي يرى الوحدة يرحّل محاسب المواد (ق٢١): المعاينة بلا مشكلة، والمبالغ ظاهرة والمتاح null، والخطّة نفسها.
    actAs(U.accRaw);
    const rawReady = await repo.previewProduction(BATCH);
    t.same(
      [rawReady.canPost, rawReady.problems, rawReady.expensesVisible, rawReady.costs?.map((c) => [c.categoryName, c.amount, c.available]), rawReady.version, rawReady.planToken],
      [true, [], false, [['أيدي عاملة', 200000n, null]], ready.version, ready.planToken],
      'previewProduction (محاسب المواد بعد الختم): يرحّل، بلا مشكلة ولا متاح (ق٢١)',
    );
    await repo.postProduction(BATCH, rawReady.version, rawReady.planToken, ref());
    // الكتلة 350 + 151 (الفعلي) = 501 كغم؛ المواد 350 × 900 + 151 × 800 = 435,800.00، والتكاليف 2,000.00 ← 437,800.00،
    // والكيلو 437,800 ÷ 501 = 873.85.
    actAs(U.manager);
    const done = await repo.loadBatch(BATCH);
    t.same(
      [done.status, done.outputQtyKg, done.inputValue, done.extraValue, done.totalValue, done.costPerKg, done.lines.map((l) => [l.itemName, l.usedQty, l.value])],
      ['posted', 501000n, 43580000n, 200000n, 43780000n, 87385n, [['ذرة صفراء', 350000n, 31500000n], ['حنطة', 151000n, 12080000n]]],
      'loadBatch (المدير، مرحَّلة): المسحوب الفعلي وقيمته والكلّي وكلفة الكيلو',
    );
    t.same(
      done.costs?.map((c) => [c.categoryName, c.amount, c.allocations.map((a) => [a.expenseId, a.amount, a.label])]),
      [['أيدي عاملة', 200000n, [[E2, 200000n, 'أجور الأسبوع الثاني']]]],
      'loadBatch: التحميل 2,000.00 من مصروف الأسبوع الثاني',
    );
    // من طرف العلف (ق٢٥، ج٢): أمين نطاقه مخزن العلف وحده يصل الدفعة من روابط بطاقة العلف الثلاثة — «صُنع في المعمل» (last_production)،
    // ومصدر الوجبة، ومستند الحركة في الدفتر — وloadBatch يقرؤها بطرفها (كانت out_of_scope)، بلا مال ولا مصاريف.
    actAs(U.keepFeed);
    const feedMade = (await repo.loadItemPurchases(FEED2, FEEDWH)).lastProduction;
    const feedLot = (await repo.loadItemLots(FEED2, FEEDWH)).rows.find((r) => r.sourceId === BATCH);
    const feedMove = (await repo.loadItemMoves(FEED2, FEEDWH)).rows.find((r) => r.docId === BATCH);
    const fromFeed = await repo.loadBatch(feedMade?.batchId ?? BATCH);
    t.same(
      [feedMade?.batchId, feedLot?.sourceKind, feedMove?.docKind, fromFeed.status, fromFeed.scope, fromFeed.expensesVisible, fromFeed.costs, fromFeed.totalValue,
        fromFeed.lines.map((l) => [l.itemName, l.usedQty])],
      [BATCH, 'production', 'production', 'posted', { input: false, output: true }, false, null, null, [['ذرة صفراء', 350000n], ['حنطة', 151000n]]],
      'loadBatch (أمين العلف): الدفعة من روابط بطاقة العلف الثلاثة بطرف الناتج، scope = {input: false, output: true} وبلا مال (ق٢٥، ج٢)',
    );
    // ومسوّدة من طرفه (ب٣): البطاقة تُقرأ، والمعاينة out_of_scope بتلميح مخزن المواد، فالشاشة لا تطلبها بلا scope.input.
    const feedDraftCard = await repo.loadBatch(B2);
    const feedPreview = await repo.previewProduction(B2).then(() => null, (error) => error);
    t.same(
      [feedDraftCard.status, feedDraftCard.scope, feedPreview?.code, feedPreview?.hint],
      ['draft', { input: false, output: true }, 'out_of_scope', `المخزن «${RAW_NAME}» خارج نطاقك.`],
      'loadBatch (أمين العلف، مسوّدة): تُقرأ بطرف العلف، وpreviewProduction out_of_scope (ب٣)',
    );
    // ووجبات مخزن المواد واستلاماته لا تصل طرف الناتج (الجولة الثالثة، ق٣٢ وب٢٨): draws = null في كلّ سطر مع scope.input = false — فخانة
    // «من أيّ وجبات» تقول «وجبات مخزن المواد خارج نطاقك» بلا رابط؛ ومحاسب العلف كذلك والقيمة ظاهرة له (دور كلفة)؛ ومحاسب المواد يراها (أدناه).
    actAs(U.accFeed);
    const feedAccCard = await repo.loadBatch(BATCH);
    t.same(
      [fromFeed.lines.map((l) => [l.itemName, l.draws === null]), [feedAccCard.scope, feedAccCard.totalValue, feedAccCard.lines.map((l) => [l.itemName, l.draws === null])]],
      [[['ذرة صفراء', true], ['حنطة', true]], [{ input: false, output: true }, 43780000n, [['ذرة صفراء', true], ['حنطة', true]]]],
      'loadBatch (أمين العلف ومحاسبه): draws = null لكلّ سطر وscope.input = false، والقيمة 437,800.00 ظاهرة لمحاسب العلف (ق٣٢، ب٢٨)',
    );
    actAs(U.miller);
    const madeLot = (await repo.loadItemLots(FEED2, FEEDWH)).rows.find((r) => r.sourceId === BATCH);
    t.same(madeLot && [madeLot.sourceKind, madeLot.source, madeLot.qtyLeft], ['production', done.docNo, 501000n], 'loadItemLots (مشغّل المعمل): دفعة العلف «صُنعت بدفعة» رقمها');
    // بطاقة العلف المنتج (ع٢): loadItemPurchases يحمل آخر دفعة صنعته — هذه الدفعة (501 كغم)، أحدث من دفعات السباق الثلاث.
    const madeHere = { batchId: BATCH, docNo: done.docNo, producedOn: TODAY, qtyKg: 501000n, warehouseName: FEEDWH_NAME };
    t.same((await repo.loadItemPurchases(FEED2, FEEDWH)).lastProduction, madeHere, 'loadItemPurchases (مشغّل المعمل): lastProduction لبطاقة العلف المنتج');
    actAs(U.manager);
    t.same((await repo.loadItemPurchases(FEED2, null)).lastProduction, madeHere, 'loadItemPurchases (المدير، كلّ المخازن): lastProduction نفسه');
    actAs(U.accRaw);
    t.eq((await repo.loadItemPurchases(FEED2, null)).lastProduction, null, 'loadItemPurchases (محاسب المواد): مخزن العلف خارج نطاقه، فلا lastProduction');
    // وتحميلات بطاقة الدفعة محجوبة عنه (ق١١، م١٢): allocations null والقيم ظاهرة.
    const doneRaw = await repo.loadBatch(BATCH);
    t.same(
      [doneRaw.totalValue, doneRaw.costs?.map((c) => [c.categoryName, c.amount, c.allocations]), doneRaw.lines.map((l) => [l.itemName, l.draws?.map((d) => d.qty)])],
      [43780000n, [['أيدي عاملة', 200000n, null]], [['ذرة صفراء', [350000n]], ['حنطة', [151000n]]]],
      'loadBatch (محاسب المواد): التحميلات null، والقيمة والوجبات ظاهرة',
    );

    actAs(U.accountant);
    const second = (await repo.loadExpenses('2026-10-01', TODAY, null)).rows.find((r) => r.id === E2);
    t.same([second?.amount, second?.allocated], [500000n, 250000n], 'loadExpenses: المحمَّل من الأسبوع الثاني 500 + 2,000 = 2,500.00');
    // إلغاء المصروف المحمَّل من الشاشة (ش-أ ٦): الرفض برمزه وتلميحه الذي تعرضه كما هو (المبلغ والدفعتان وأوّلهما).
    actAs(U.manager);
    const refusal = await repo.voidExpense(ref(), E2, 'إلغاء من الشاشة').then(() => null, (error) => error);
    t.same(
      [refusal?.code, refusal?.hint],
      ['expense_allocated', `من هذا المصروف 2,500 محمَّلة على دفعات إنتاج عددها 2، أوّلها ${posted3.v.doc_no}؛ ألغِ الدفعات أوّلاً.`],
      'voidExpense من الشاشة: expense_allocated وتلميحه يسمّي المحمَّل والدفعتين وأوّلهما',
    );

    actAs(U.manager);
    const cornBuys = await repo.loadItemPurchases(CORN, RAW);
    t.same([cornBuys.item.costPrice, cornBuys.item.sellPrice, cornBuys.rows[0]?.money?.unitCost], [95000n, null, 90000n], 'loadItemPurchases (المدير): سعر الكلفة وآخر شراء');
    actAs(U.miller);
    const cornBuysMiller = await repo.loadItemPurchases(CORN, RAW);
    t.same([cornBuysMiller.item.costPrice, cornBuysMiller.rows[0]?.money], [null, null], 'loadItemPurchases (مشغّل المعمل): بلا أسعار');
    actAs(U.manager);
    t.eq(await repo.setItemCostPrice(SOY, 160000n, null), 160000n, 'setItemCostPrice: 1,600.00 لكيلو الصويا');
    t.eq(await repo.setItemCostPrice(SOY, 160000n, null), 160000n, 'setItemCostPrice: الإعادة ترجّع المكتوب');
    t.eq(await rejected(repo.setItemCostPrice(SOY, 170000n, null)), 'price_changed', 'setItemCostPrice: السابق غير الذي شافته الشاشة: price_changed');
    // بعد سعر الصويا المكتوب: 665,000 + 300 × 1,600 = 1,145,000.00، والطنّ 1,149,000.00، والكيلو 1,149.00.
    t.same(
      (await repo.loadRecipe(id(131))).expected,
      { materialsPerTon: 114500000n, ratesPerTon: 400000n, costPerTon: 114900000n, unpriced: 0, unconverted: 0 },
      'loadRecipe: سعر الكلفة المكتوب يدخل كلفة الطنّ المتوقّعة فوراً',
    );
    t.eq((await repo.loadMill()).recipes.find((r) => r.id === id(131))?.expectedCostPerKg, 114900n, 'loadMill (المدير): كلفة الكيلو المتوقّعة على البطاقة 1,149.00');
    actAs(U.miller);
    const millHome = await repo.loadMill();
    t.same(
      [millHome.recipes.find((r) => r.id === id(131))?.expectedCostPerKg, millHome.productions.rows.find((r) => r.id === BATCH)?.totalValue],
      [null, null],
      'loadMill (مشغّل المعمل): البطاقة والدفعة بلا كلفة',
    );

    // «نسخة جديدة» من بطاقة الخلطة (م٧): newRecipeVersion بمعرّف من الجهاز يبقى للإعادة، والمسوّدة بسطور المفعَّلة ومعدّليها.
    actAs(U.manager);
    const COPY = { recipeId: id(131), versionId: id(241), versionNo: 2, status: 'draft', lines: 2, rates: 1, existing: false, skipped: [] };
    t.same(await repo.newRecipeVersion(id(131), id(241)), COPY, 'newRecipeVersion: مسوّدة ثانية بسطري «بادئ الشاشة» ومعدّله، وskipped فارغ (ق٥٥، ب٤٨)');
    t.same(
      [await repo.newRecipeVersion(id(131), id(241)), await repo.newRecipeVersion(id(131), id(242))],
      [COPY, { ...COPY, existing: true }],
      'newRecipeVersion: الإعادة بعد جواب ضاع ترجع ما رجع أوّل مرّة (existing = false، ق٦٣)، ومعرّف آخر والمسوّدة قائمة: المسوّدة نفسها (existing) وskipped فارغ (ق٥٥)',
    );
    const copyCard = await repo.loadRecipe(id(131), id(241));
    t.same(
      [copyCard.versionId, copyCard.status, copyCard.basisKg, copyCard.lines.map((l) => [l.itemName, l.qty, l.unit, l.inBasis]), copyCard.rates?.map((r) => [r.categoryName, r.amountPerTon])],
      [id(241), 'draft', 1000000n, [['ذرة صفراء', 700000n, 'kg', true], ['كسبة صويا', 300000n, 'kg', true]], [['أيدي عاملة', 400000n]]],
      'loadRecipe (المسوّدة المنسوخة): السطور والمعدّل كما في المفعَّلة',
    );
    t.eq((await repo.loadRecipe(id(131))).versionId, id(132), 'ضابط: بطاقة الخلطة بلا نسخة مختارة تبقى على المفعَّلة');
    actAs(U.miller);
    t.eq(await rejected(repo.newRecipeVersion(id(131), id(242))), 'forbidden', 'newRecipeVersion (مشغّل المعمل): forbidden');
    // «أنتج» من بطاقة الخلطة (م٩): مخازن المعمل ويوم الخادم من recipes_overview.
    t.same(
      (({ today, stores }) => [today, stores.map((s) => [s.id, s.kind])])(await repo.loadMillStores()),
      [TODAY, [[FEEDWH, 'feed'], [RAW, 'raw']]],
      'loadMillStores (مشغّل المعمل): يوم الخادم ومخزنا المعمل',
    );
    // «اجعلها مادّة أوّلية» (م٨): التوأم بالاسم من find_item_twins، وصفّه بـloadItem، والنوع بـupdateItem مشروطاً بالنسخة؛ والمادّة
    // التي عليها حركات مخزون frozen_column (الشاشة تقول أنشئ باسم آخر).
    actAs(U.manager);
    const made = await repo.createItem({ name: 'نخالة خشنة', category_id: null, kind: 'feed', base_unit: 'kg', density_kg_per_l: null, piece_mass_kg: null,
      tracks_expiry: false, scale_step: '0.100', min_qty: null, barcode: null, alt_codes: [] });
    const twins = await repo.findItemTwins(' نخالة  خشنة ', []);
    t.same(twins.filter((x) => x.sameName).map((x) => [x.id, x.archived]), [[made.id, false]], 'findItemTwins: التوأم بالاسم المطبَّع قبل أيّ إنشاء');
    const twinRow = await repo.loadItem(made.id);
    t.same([twinRow?.kind, (await repo.updateItem(made.id, twinRow.version, { kind: 'raw' })).kind], ['feed', 'raw'], 'updateItem: «اجعلها مادّة أوّلية» لمادّة بلا حركات');
    const feedRow = await repo.loadItem(FEED);
    t.eq(await rejected(repo.updateItem(FEED, feedRow.version, { kind: 'raw' })), 'frozen_column', 'updateItem: مادّة عليها حركات مخزون: frozen_column (pickers.kindFixFailure)');

    // معدّل تكاليف بنسخة مسوّدة (الخلطة التجريبية) بكتابة مباشرة (recipe.activate).
    actAs(U.manager);
    await repo.addRecipeRate(V2, id(236), PACKING, 50000n);
    t.eq(await rejected(repo.addRecipeRate(V2, id(236), PACKING, 50000n)), 'ok', 'addRecipeRate: الإعادة بعد جواب ضاع = انكتب');
    t.eq(await rejected(repo.addRecipeRate(V2, id(237), PACKING, 50000n)), 'category_duplicated', 'addRecipeRate: الفئة نفسها بسطر آخر: category_duplicated');
    await repo.setRecipeRate(id(236), 50000n, 60000n);
    t.eq(await rejected(repo.setRecipeRate(id(236), 50000n, 70000n)), 'amount_changed', 'setRecipeRate: السابق تغيّر: amount_changed');
    const trial = await repo.loadRecipe(R2);
    t.same(trial.rates?.map((r) => [r.lineNo, r.categoryName, r.amountPerTon]), [[1, 'تعبئة', 60000n]], 'loadRecipe (مسوّدة): المعدّل بعد تعديله');
    await repo.deleteRecipeRate(id(236), trial.versionVersion);
    t.same((await repo.loadRecipe(R2)).rates, [], 'deleteRecipeRate يحذفه');
    actAs(U.miller);
    t.eq(await rejected(repo.addRecipeRate(V2, id(238), PACKING, 50000n)), 'forbidden', 'addRecipeRate (مشغّل المعمل): forbidden من الحارس');

    // دفعة بلا مادّة داخل الكتلة (ق٢٤، ب٢): «بادئ بالكاز» 100 كغم (ذرة 100 وكاز 20 × 100 ÷ 1,000 = 2 لتر) وتُحذف الذرة فيبقى الكاز وحده.
    // المعاينة: الكاز بلا رصيد، ثمّ no_mass_inputs، والكتلة صفر فالهدر بلا مدى (لا وزن)؛ والترحيل يرفض no_mass_inputs بتلميحه لا 23514.
    actAs(U.manager);
    const NOMASS = id(243);
    await repo.createProduction(NOMASS, id(144), 100000n, RAW, FEEDWH, TODAY);
    const lonely = await repo.loadBatch(NOMASS);
    await repo.deleteProductionInput(lonely.lines.find((l) => l.itemName === 'ذرة صفراء')?.id ?? '', lonely.version);
    const massless = await repo.previewProduction(NOMASS);
    const masslessPost = await repo.postProduction(NOMASS, massless.version, massless.planToken, ref()).then(() => null, (error) => error);
    t.same(
      [massless.canPost, massless.inputMassKg, massless.lines.map((l) => [l.itemName, l.inBasis]), massless.problems.map((x) => x.code), masslessPost?.code, masslessPost?.hint],
      [false, 0n, [['كاز المولّدة', false]], ['insufficient_stock', 'no_mass_inputs', 'shrink_out_of_range'], 'no_mass_inputs',
        'الدفعة بلا مادّة داخل الكتلة: الوقود والتعبئة وحدهما لا يصنعان علفاً. أضف مادّة أوّلية أو احذف المسوّدة.'],
      'previewProduction: no_mass_inputs وcan_post = false، وpostProduction يرفض no_mass_inputs بتلميحه (ق٢٤)',
    );
    await repo.discardBatch(NOMASS, massless.version);

    // تاريخ انتهاء الناتج من صفحة الدفعة (ب٦): علف يتابَع انتهاؤه فالمعاينة تطلبه (expiry_required)، والحقل يُقرأ بـparseDayText (يوم تقويم)
    // ويُحفظ بـsetBatchFields، فتُرحَّل الدفعة ووجبتها بتاريخها، والمحفوظ يعود للحقل بـfmtDay. 100 كغم ذرة بلا تكاليف.
    const dated = await repo.createItem({ name: 'علف بصلاحية الشاشة', category_id: null, kind: 'feed', base_unit: 'kg', density_kg_per_l: null, piece_mass_kg: null,
      tracks_expiry: true, scale_step: '0.100', min_qty: null, barcode: null, alt_codes: [] });
    await repo.createRecipe({ id: id(246), versionId: id(247), name: 'خلطة بصلاحية', outputItemId: dated.id, basisKg: 1000000n, lines: [{ itemId: CORN, qty: 1000000n, unit: 'kg' }], rates: [], activate: true });
    await repo.createProduction(id(248), id(247), 100000n, RAW, FEEDWH, TODAY);
    const undated = await repo.previewProduction(id(248));
    const typedExpiry = repo.parseDayText('4/12/2026');
    const expirySaved = await repo.setBatchFields(id(248), { outputExpiryOn: typedExpiry }).then(() => 'ok', (error) => `${error.name}: ${error.code ?? error.message}`);
    const datedLook = await repo.previewProduction(id(248));
    const datedCard = await repo.loadBatch(id(248));
    t.same(
      [undated.problems.map((x) => x.code), undated.canPost, datedCard.outputItem.tracksExpiry, typedExpiry, expirySaved, datedLook.outputExpiryOn, datedLook.problems, datedLook.canPost, datedCard.outputExpiryOn,
        datedCard.outputExpiryOn && repo.fmtDay(datedCard.outputExpiryOn)],
      [['expiry_required'], false, true, '2026-12-04', 'ok', '2026-12-04', [], true, '2026-12-04', '04/12/2026'],
      'setBatchFields({outputExpiryOn}) من حقل الشاشة: expiry_required يُحلّ والدفعة تُرحَّل، والمحفوظ يُعرض 04/12/2026 (ب٦)',
    );
    const datedPosted = await repo.postProduction(id(248), datedLook.version, datedLook.planToken, ref()).then(() => 'ok', (error) => error.code ?? `${error.name}: ${error.message}`);
    const datedLot = (await repo.loadItemLots(dated.id, FEEDWH)).rows[0];
    t.same([datedPosted, datedLot && [datedLot.sourceId, datedLot.expiryOn, datedLot.qtyLeft]], ['ok', [id(248), '2026-12-04', 100000n]], 'postProduction ثمّ loadItemLots: وجبة العلف بتاريخ انتهائه من الدفعة (ب٦)');

    // لقطة وحدة الأساس من الشاشة (الجولة الثالثة، ق٣١ وب٢٧): «كاز الشاشة» من «أنشئ» في البانية (createItem بحقول newItemFields: raw وkg)
    // يدخل خلطة مفعَّلة 983 + 17 كغم، ثمّ يصحّحه المدير من نافذة المادّة (updateItem بالنوع والوحدة والكثافة معاً كما يرسلها changedFields، قبل
    // أوّل حركة). loadRecipe يقول unitChanged لسطره وحده (والوحدة من اللقطة kg)، وcreateProduction من النسخة يُرفض RejectedError برمز
    // item_changed وتلميحه — الشرط الذي تعرض به نافذة «أنتج» التلميح كما هو. ثمّ «نسخة جديدة» بالوحدة الحيّة: الكاز 17 كغم (سائل يُكتب
    // بالكيلو) خارج الكتلة والذرة 1,000، تُفعَّل بنداءَي صفحة الخلطة (setRecipeLine وactivateVersion)، فيُنتَج بها: الكاز 17 ÷ 0.85 = 20
    // لتراً، وبعد تعديل كثافة المادّة إلى 0.80 يبقى 20 (لقطة التفعيل؛ بالكثافة الحيّة 17 ÷ 0.80 = 21.25 ← 21.3). والمسوّدتان تُحذفان.
    /** نداء repo يرمي = فحص فاشل باسمه وnull، لا توقّف الملف (كـparsed): كلّ فرق في الكتلتين التاليتين يظهر في التشغيل نفسه. */
    const tried = async (label, run) => {
      try {
        return await run();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.name}: ${error?.code ?? error?.message}`);
        return null;
      }
    };
    actAs(U.manager);
    const kazItem = await tried('createItem (كاز الشاشة)', () =>
      repo.createItem({ name: 'كاز الشاشة', category_id: null, kind: 'raw', base_unit: 'kg', density_kg_per_l: null, piece_mass_kg: null,
        tracks_expiry: false, scale_step: '0.100', min_qty: null, barcode: null, alt_codes: [] }));
    const KR = id(250);
    const kazRecipe = await rejected(repo.createRecipe({ id: KR, versionId: id(251), name: 'بادئ بكاز الشاشة', outputItemId: FEED2, basisKg: 1000000n,
      lines: [{ itemId: CORN, qty: 983000n, unit: 'kg' }, { itemId: kazItem?.id ?? '', qty: 17000n, unit: 'kg' }], rates: [], activate: true }));
    const kazFixed = await tried('updateItem (تصحيح الكاز)', () => repo.updateItem(kazItem?.id ?? '', kazItem?.version ?? 0, { kind: 'fuel', base_unit: 'L', density_kg_per_l: '0.8500' }));
    actAs(U.miller);
    const kazStale = await tried('loadRecipe (بعد تصحيح الكاز)', () => repo.loadRecipe(KR));
    const kazRefusal = await repo.createProduction(id(252), id(251), 100000n, RAW, FEEDWH, TODAY).then(() => null, (error) => error);
    t.same(
      [kazRecipe, kazFixed && [kazFixed.kind, kazFixed.baseUnit], kazStale && [kazStale.status, kazStale.lines.map((l) => [l.itemName, l.baseUnit, l.inBasis, l.unitChanged])],
        kazRefusal instanceof repo.RejectedError, kazRefusal?.code, kazRefusal?.hint],
      ['ok', ['fuel', 'L'], ['active', [['ذرة صفراء', 'kg', true, false], ['كاز الشاشة', 'kg', true, true]]], true, 'item_changed',
        'تغيّرت وحدة «كاز الشاشة» بعد تفعيل الخلطة، فلا يُنتَج بنسختها المفعَّلة. أنشئ نسخة جديدة من الخلطة وفعّلها.'],
      'loadRecipe (مشغّل المعمل): unitChanged لسطر الكاز وحده، وcreateProduction يُرفض item_changed بتلميحه كما تعرضه نافذة «أنتج» (ق٣١، ب٢٧)',
    );
    actAs(U.manager);
    const kazCopied = await tried('newRecipeVersion (الكاز)', () => repo.newRecipeVersion(KR, id(253)));
    const kazDraftCard = await tried('loadRecipe (مسوّدة الكاز)', () => repo.loadRecipe(KR, id(253)));
    const kazLine = await rejected(repo.setRecipeLine(kazDraftCard?.lines.find((l) => l.itemId === CORN)?.id ?? '', 1000000n, 'kg'));
    const kazActivated = await rejected((async () => repo.activateVersion(id(253), (await repo.loadRecipe(KR, id(253))).versionVersion))());
    const kazRenewed = await tried('loadRecipe (الكاز بعد التفعيل)', () => repo.loadRecipe(KR));
    t.same(
      [kazCopied && [kazCopied.versionId, kazCopied.existing], kazDraftCard?.lines.map((l) => [l.itemName, l.baseUnit, l.inBasis, l.unitChanged]), kazLine, kazActivated,
        kazRenewed && [kazRenewed.versionId, kazRenewed.status, kazRenewed.massKg], kazRenewed?.lines.map((l) => [l.itemName, l.qty, l.unit, l.baseUnit, l.inBasis, l.unitChanged])],
      [[id(253), false], [['ذرة صفراء', 'kg', true, false], ['كاز الشاشة', 'L', false, false]], 'ok', 'ok',
        [id(253), 'active', 1000000n], [['ذرة صفراء', 1000000n, 'kg', 'kg', true, false], ['كاز الشاشة', 17000n, 'kg', 'L', false, false]]],
      'newRecipeVersion ثمّ setRecipeLine وactivateVersion: المسوّدة بالوحدة الحيّة، والمفعَّلة الجديدة بلقطة L والكاز خارج الكتلة وبلا unitChanged (ق٣١)',
    );
    actAs(U.miller);
    const firstMade = await rejected(repo.createProduction(id(254), id(253), 1000000n, RAW, FEEDWH, TODAY));
    actAs(U.manager);
    const thinner = await rejected((async () => repo.updateItem(kazItem?.id ?? '', (await repo.loadItem(kazItem?.id ?? ''))?.version ?? 0, { density_kg_per_l: '0.8000' }))());
    actAs(U.miller);
    const secondMade = await rejected(repo.createProduction(id(255), id(253), 1000000n, RAW, FEEDWH, TODAY));
    const plannedOf = async (batchId) => (await tried(`loadBatch (${batchId})`, () => repo.loadBatch(batchId)))?.lines.map((l) => [l.itemName, l.baseUnit, l.plannedQty]) ?? null;
    t.same(
      [firstMade, thinner, secondMade, await plannedOf(id(254)), await plannedOf(id(255))],
      ['ok', 'ok', 'ok', [['ذرة صفراء', 'kg', 1000000n], ['كاز الشاشة', 'L', 20000n]], [['ذرة صفراء', 'kg', 1000000n], ['كاز الشاشة', 'L', 20000n]]],
      'createProduction من النسخة الجديدة ثمّ loadBatch: الكاز 17 ÷ 0.85 = 20 لتراً، ويبقى 20 بعد تعديل كثافة المادّة إلى 0.80 (لقطة التفعيل، ق٣١)',
    );
    for (const batchId of [id(254), id(255)]) {
      const card = await repo.loadBatch(batchId).catch(() => null);
      if (card) await repo.discardBatch(batchId, card.version);
    }
    // والجولة الرابعة (ق٤٢، ب٣١): سطر «كاز الشاشة» مكتوب بالكيلو، فـunitMismatch = false في المفعَّلة القديمة والمسوّدة والمفعَّلة الجديدة (الاتّجاه kg ← L
    // يقوله unitChanged وحده).
    t.same(
      [kazStale?.lines.map((l) => l.unitMismatch), kazDraftCard?.lines.map((l) => l.unitMismatch), kazRenewed?.lines.map((l) => l.unitMismatch)],
      [[false, false], [false, false], [false, false]],
      'loadRecipe: unitMismatch = false لسطر الكاز المكتوب بالكيلو قبل «نسخة جديدة» وبعدها (ق٤٢، ب٣١)',
    );

    // دمج الجولة الرابعة من الشاشة (fixes4.md القسم د؛ ق٤١ وق٤٢ وب٣١). الاتّجاه الآخر (ق٤١): «دبس الشاشة» سائل من نافذة «مادّة جديدة» (createItem:
    // raw وL وكثافة 1.4000) يدخل خلطة مفعَّلة من البانية (ذرة 972 كغم + دبس 20 لتراً = 28 كغم)، ثمّ يصحّحه المدير من نافذة المادّة كيلوغراماً (updateItem
    // بما يرسله changedFields: base_unit = kg والكثافة فارغة، قبل أوّل حركة). loadRecipe لمشغّل المعمل: سطر الدبس بلقطته L وكتلته 28 وحصّته 2.80٪،
    // وunitChanged = false وunitMismatch = true؛ وcreateProduction 500 كغم ينجح (كان RejectedError برمز item_changed)، والدبس بالكيلو 28 × 500 ÷
    // (1,000 × 0.1) = 140 خطوة ← 14.0 كغم والذرة 486.0. و«نسخة جديدة» (newRecipeVersion) تنسخ سطره 28 كغم بالكيلو فلا unitMismatch، وactivateVersion
    // من صفحة الخلطة ينجح (972 + 28 = 1,000).
    actAs(U.manager);
    const liquidFromScreen = (name, kind, density) =>
      repo.createItem({ name, category_id: null, kind, base_unit: 'L', density_kg_per_l: density, piece_mass_kg: null, tracks_expiry: false, scale_step: '0.100',
        min_qty: null, barcode: null, alt_codes: [] });
    const toKgFromScreen = async (made) => repo.updateItem(made?.id ?? '', (await repo.loadItem(made?.id ?? ''))?.version ?? 0, { base_unit: 'kg', density_kg_per_l: null });
    const screenLine = (l) => [l.itemName, l.baseUnit, l.unit, l.qty, l.massKg, l.sharePct, l.inBasis, l.unitChanged, l.unitMismatch];
    const dibsItem = await tried('createItem (دبس الشاشة)', () => liquidFromScreen('دبس الشاشة', 'raw', '1.4000'));
    const DR = id(261);
    const dibsRecipe = await rejected(repo.createRecipe({ id: DR, versionId: id(262), name: 'بادئ بدبس الشاشة', outputItemId: FEED2, basisKg: 1000000n,
      lines: [{ itemId: CORN, qty: 972000n, unit: 'kg' }, { itemId: dibsItem?.id ?? '', qty: 20000n, unit: 'L' }], rates: [], activate: true }));
    const dibsToKg = await tried('updateItem (الدبس كيلوغراماً)', () => toKgFromScreen(dibsItem));
    actAs(U.miller);
    const dibsCard = await tried('loadRecipe (الدبس بعد تصحيحه)', () => repo.loadRecipe(DR));
    const dibsMade = await rejected(repo.createProduction(id(263), id(262), 500000n, RAW, FEEDWH, TODAY));
    const SCREEN_CORN = ['ذرة صفراء', 'kg', 'kg', 972000n, 972000n, 9720n, true, false, false];
    t.same(
      [dibsRecipe, dibsToKg && [dibsToKg.kind, dibsToKg.baseUnit], dibsCard && [dibsCard.status, dibsCard.massKg, dibsCard.lines.map(screenLine)], dibsMade, await plannedOf(id(263))],
      ['ok', ['raw', 'kg'], ['active', 1000000n, [SCREEN_CORN, ['دبس الشاشة', 'L', 'L', 20000n, 28000n, 280n, true, false, true]]], 'ok',
        [['ذرة صفراء', 'kg', 486000n], ['دبس الشاشة', 'kg', 14000n]]],
      'loadRecipe (مشغّل المعمل) ثمّ createProduction ثمّ loadBatch: لقطة لتر ومادّة صارت بالكيلو — unitChanged = false وunitMismatch = true والكتلة 28 من لقطة الكثافة، والدفعة تُنشأ والدبس 14 كغم بالكيلو (ق٤١، ب٣١)',
    );
    const dibsBatchCard = await repo.loadBatch(id(263)).catch(() => null);
    if (dibsBatchCard) await repo.discardBatch(id(263), dibsBatchCard.version);
    // كلفة الطنّ المتوقّعة من الشاشة (الجولة الخامسة، ق٥٤): المدير يكتب سعر كلفة الدبس 1,500 للكيلو من بطاقة المادّة (setItemCostPrice)، فبطاقة الخلطة (loadRecipe)
    // تحوّل سطره المكتوب باللتر كيلوغراماً بلقطة كثافته (28 كغم) وتسعّره بسعر الكيلو: 972 × 950 + 28 × 1,500 = 965,400.00 للطنّ، ولوحة المعمل (loadMill) 965.40
    // للكيلو؛ وقبل السعر «1 من المواد بلا أيّ سعر» والمواد 923,400.00 وكلفة الكيلو فارغة.
    actAs(U.manager);
    const dibsUnpriced = await tried('loadRecipe (الدبس قبل سعره)', () => repo.loadRecipe(DR));
    const dibsSetPrice = await rejected(repo.setItemCostPrice(dibsItem?.id ?? '', 150000n, null));
    const dibsPricedCard = await tried('loadRecipe (الدبس بعد سعره)', () => repo.loadRecipe(DR));
    const dibsPricedMill = (await tried('loadMill (الدبس بعد سعره)', () => repo.loadMill()))?.recipes.find((r) => r.id === DR);
    const SCREEN_DIBS_EXPECTED = { materialsPerTon: 96540000n, ratesPerTon: 0n, costPerTon: 96540000n, unpriced: 0, unconverted: 0 };
    t.same(
      [dibsUnpriced?.expected, dibsSetPrice, dibsPricedCard?.expected, dibsPricedMill?.expectedCostPerKg],
      [{ materialsPerTon: 92340000n, ratesPerTon: 0n, costPerTon: 92340000n, unpriced: 1, unconverted: 0 }, 'ok', SCREEN_DIBS_EXPECTED, 96540n],
      'setItemCostPrice ثمّ loadRecipe وloadMill: سطر الدبس المكتوب باللتر لمادّة صارت بالكيلو بسعر الكيلو بلقطة كثافته — الطنّ 965,400.00 والكيلو 965.40، لا «بلا سعر» (ق٥٤)',
    );
    actAs(U.manager);
    const dibsCopied = await tried('newRecipeVersion (الدبس)', () => repo.newRecipeVersion(DR, id(264)));
    const dibsDraftCard = await tried('loadRecipe (مسوّدة الدبس)', () => repo.loadRecipe(DR, id(264)));
    const dibsRenewed = await rejected((async () => repo.activateVersion(id(264), (await repo.loadRecipe(DR, id(264))).versionVersion))());
    const dibsNow = await tried('loadRecipe (الدبس بعد التفعيل)', () => repo.loadRecipe(DR));
    const SCREEN_DIBS_KG = ['دبس الشاشة', 'kg', 'kg', 28000n, 28000n, 280n, true, false, false];
    t.same(
      [dibsCopied, dibsDraftCard && [dibsDraftCard.status, dibsDraftCard.massKg, dibsDraftCard.lines.map(screenLine)], dibsRenewed,
        dibsNow && [dibsNow.versionId, dibsNow.status, dibsNow.massKg, dibsNow.lines.map(screenLine)]],
      [{ recipeId: DR, versionId: id(264), versionNo: 2, status: 'draft', lines: 2, rates: 0, existing: false, skipped: [] }, ['draft', 1000000n, [SCREEN_CORN, SCREEN_DIBS_KG]], 'ok',
        [id(264), 'active', 1000000n, [SCREEN_CORN, SCREEN_DIBS_KG]]],
      'newRecipeVersion ثمّ activateVersion: سطر الدبس المكتوب باللتر يُنسخ 28 كغم بالكيلو فلا unitMismatch، وskipped فارغ، والنسخة تتفعّل بنداء صفحة الخلطة (ق٤١ وق٥٥، ب٣١ وب٤٨)',
    );
    t.same([dibsDraftCard?.expected, dibsNow?.expected], [SCREEN_DIBS_EXPECTED, SCREEN_DIBS_EXPECTED], 'ضابط ق٥٤ من الشاشة: مسوّدة «نسخة جديدة» والمفعَّلة الجديدة بكلفة الطنّ نفسها 965,400.00');

    // ق٤٢ من الشاشة: مسوّدة من البانية بلا تفعيل (createRecipe بـactivate = false): ذرة 986 + «مولاس الشاشة» سائل أوّلي 10 لترات + «كاز مسوّدة
    // الشاشة» وقود 20 لتراً، ثمّ يصحّح المدير المادّتين كيلوغراماً. loadRecipe: سطرا اللتر بكتلة وحصّة null وunitMismatch = true، ومجموع الكتلة null
    // (المولاس داخلها) — فبطاقة الخلطة تعرض «—» وجملة «احذف سطرها وأضفه بالكيلوغرام»؛ وactivateVersion يرمي RejectedError برمز bad_recipe_unit
    // وتلميح يسمّي المولاس (تعرضه الصفحة بـdescribeError). ثمّ ما تقوله الجملة: deleteRecipeLine لسطرَي اللتر وaddRecipeLine بالكيلوغرام (مولاس
    // 14 = 10 × 1.4، وكاز 17 = 20 × 0.85)، فلا unitMismatch والمجموع 986 + 14 = 1,000 (الكاز خارج الكتلة) وتتفعّل.
    const molItem = await tried('createItem (مولاس الشاشة)', () => liquidFromScreen('مولاس الشاشة', 'raw', '1.4000'));
    const kazDraftItem = await tried('createItem (كاز مسوّدة الشاشة)', () => liquidFromScreen('كاز مسوّدة الشاشة', 'fuel', '0.8500'));
    const MR = id(265);
    const MV = id(266);
    const molRecipe = await rejected(repo.createRecipe({ id: MR, versionId: MV, name: 'مسوّدة مولاس الشاشة', outputItemId: FEED2, basisKg: 1000000n,
      lines: [{ itemId: CORN, qty: 986000n, unit: 'kg' }, { itemId: molItem?.id ?? '', qty: 10000n, unit: 'L' }, { itemId: kazDraftItem?.id ?? '', qty: 20000n, unit: 'L' }],
      rates: [], activate: false }));
    const corrected = [await tried('updateItem (المولاس كيلوغراماً)', () => toKgFromScreen(molItem)), await tried('updateItem (كاز المسوّدة كيلوغراماً)', () => toKgFromScreen(kazDraftItem))];
    const molCard = await tried('loadRecipe (مسوّدة المولاس)', () => repo.loadRecipe(MR, MV));
    const molRefusal = await (async () => repo.activateVersion(MV, (await repo.loadRecipe(MR, MV)).versionVersion))().then(() => null, (error) => error);
    t.same(
      [molRecipe, corrected.map((x) => x?.baseUnit), molCard && [molCard.status, molCard.massKg, molCard.lines.map(screenLine)], molRefusal instanceof repo.RejectedError, molRefusal?.code,
        molRefusal?.hint],
      ['ok', ['kg', 'kg'], ['draft', null, [['ذرة صفراء', 'kg', 'kg', 986000n, 986000n, 9860n, true, false, false], ['مولاس الشاشة', 'kg', 'L', 10000n, null, null, true, false, true],
        ['كاز مسوّدة الشاشة', 'kg', 'L', 20000n, null, null, false, false, true]]], true, 'bad_recipe_unit', '«مولاس الشاشة» تُقاس بالكيلوغرام، فاكتب كميتها في الخلطة بالكيلوغرام.'],
      'loadRecipe (المسوّدة) ثمّ activateVersion: سطرا اللتر بكتلة وحصّة null وunitMismatch، والمجموع null، والتفعيل RejectedError برمز bad_recipe_unit وتلميح يسمّي المادّة (ق٤٢، ب٣١)',
    );
    for (const line of (molCard?.lines ?? []).filter((l) => l.unitMismatch)) {
      await tried(`deleteRecipeLine (${line.itemName})`, async () => repo.deleteRecipeLine(line.id, (await repo.loadRecipe(MR, MV)).versionVersion));
    }
    await tried('addRecipeLine (المولاس بالكيلوغرام)', () => repo.addRecipeLine(MV, molItem?.id ?? '', 14000n, 'kg'));
    await tried('addRecipeLine (كاز المسوّدة بالكيلوغرام)', () => repo.addRecipeLine(MV, kazDraftItem?.id ?? '', 17000n, 'kg'));
    const molFixed = await tried('loadRecipe (المسوّدة بعد الحذف والإضافة)', () => repo.loadRecipe(MR, MV));
    const molActivated = await rejected((async () => repo.activateVersion(MV, (await repo.loadRecipe(MR, MV)).versionVersion))());
    t.same(
      [molFixed && [molFixed.massKg, molFixed.lines.map((l) => [l.itemName, l.unit, l.qty, l.massKg, l.inBasis, l.unitMismatch])], molActivated],
      [[1000000n, [['ذرة صفراء', 'kg', 986000n, 986000n, true, false], ['مولاس الشاشة', 'kg', 14000n, 14000n, true, false], ['كاز مسوّدة الشاشة', 'kg', 17000n, 17000n, false, false]]], 'ok'],
      'ما تقوله جملة البطاقة: deleteRecipeLine ثمّ addRecipeLine بالكيلوغرام، فلا unitMismatch والمجموع 986 + 14 = 1,000، وactivateVersion ينجح (ق٤٢، ب٣١)',
    );

    // دمج الجولة الخامسة من الشاشة (fixes5.md القسم د؛ ق٥١ وب٤٩): «شراب الشاشة» سائل من نافذة «مادّة جديدة» (createItem: raw وL وكثافة 1.2500) في مسوّدة من البانية بلا
    // تفعيل (ذرة 980 كغم + شراب 16 لتراً = 20 كغم)، ثمّ يفرّغ المدير كثافته من نافذة المادّة (updateItem بما يرسله changedFields: density_kg_per_l = null). loadRecipe
    // (المدير ومشغّل المعمل): سطر الشراب densityMissing = true وكتلته null وليس unitMismatch، ومجموع الكتلة null — فتقول البطاقة «سائل بلا كثافة» قبل النقر؛
    // وactivateVersion يرمي RejectedError برمز density_required وتلميح يسمّي الشراب. والمحاسب لا يكتب الكثافة (updateItem لا يمرّ والكثافة فارغة كما هي) — جملته
    // «يكتبها المالك أو المدير». ثمّ ما تقوله جملة المدير: الكثافة 1.2500 من نافذة المادّة، فلا densityMissing والمجموع 1,000، وactivateVersion ينجح.
    actAs(U.manager);
    const syrupItem = await tried('createItem (شراب الشاشة)', () => liquidFromScreen('شراب الشاشة', 'raw', '1.2500'));
    const SR = id(621);
    const SV = id(622);
    const syrupRecipe = await rejected(repo.createRecipe({ id: SR, versionId: SV, name: 'مسوّدة شراب الشاشة', outputItemId: FEED2, basisKg: 1000000n,
      lines: [{ itemId: CORN, qty: 980000n, unit: 'kg' }, { itemId: syrupItem?.id ?? '', qty: 16000n, unit: 'L' }], rates: [], activate: false }));
    const densityOf = async (density) => repo.updateItem(syrupItem?.id ?? '', (await repo.loadItem(syrupItem?.id ?? ''))?.version ?? 0, { density_kg_per_l: density });
    const emptied = await tried('updateItem (الشراب بلا كثافة)', () => densityOf(null));
    const syrupLine = (l) => [l.itemName, l.baseUnit, l.unit, l.qty, l.massKg, l.unitMismatch, l.densityMissing];
    const syrupScreen = await tried('loadRecipe (مسوّدة الشراب)', () => repo.loadRecipe(SR, SV));
    actAs(U.miller);
    const syrupScreenMiller = await tried('loadRecipe (مشغّل المعمل، مسوّدة الشراب)', () => repo.loadRecipe(SR, SV));
    actAs(U.manager);
    const syrupRefusal = await (async () => repo.activateVersion(SV, (await repo.loadRecipe(SR, SV)).versionVersion))().then(() => null, (error) => error);
    actAs(U.accountant);
    const accountantDensity = await rejected(densityOf('1.2500'));
    actAs(U.manager);
    const stillEmpty = await tried('loadItem (الشراب بعد محاولة المحاسب)', () => repo.loadItem(syrupItem?.id ?? ''));
    const SYRUP_SCREEN = [['ذرة صفراء', 'kg', 'kg', 980000n, 980000n, false, false], ['شراب الشاشة', 'L', 'L', 16000n, null, false, true]];
    t.same(
      [syrupRecipe, emptied && [emptied.baseUnit, emptied.density], syrupScreen && [syrupScreen.massKg, syrupScreen.lines.map(syrupLine)],
        syrupScreenMiller && [syrupScreenMiller.massKg, syrupScreenMiller.lines.map(syrupLine)], syrupRefusal instanceof repo.RejectedError, syrupRefusal?.code, syrupRefusal?.hint,
        accountantDensity === 'ok', stillEmpty?.density],
      ['ok', ['L', null], [null, SYRUP_SCREEN], [null, SYRUP_SCREEN], true, 'density_required', '«شراب الشاشة» سائل بلا كثافة، فلا يُحسب وزنه. اكتب كثافته من «المواد» في المخزن (زرّ «عدّل» بجانبها) ثمّ فعّل.',
        false, null],
      'loadRecipe (المدير ومشغّل المعمل) ثمّ activateVersion: سطر الشراب densityMissing وكتلته null والمجموع null، والتفعيل RejectedError برمز density_required وتلميح يسمّيه؛ والمحاسب لا يكتب الكثافة (ق٥١، ب٤٩)',
    );
    const refilled = await tried('updateItem (كثافة الشراب من جديد)', () => densityOf('1.2500'));
    const syrupFixed = await tried('loadRecipe (الشراب بعد كثافته)', () => repo.loadRecipe(SR, SV));
    const syrupActivated = await rejected((async () => repo.activateVersion(SV, (await repo.loadRecipe(SR, SV)).versionVersion))());
    t.same(
      [refilled?.density, syrupFixed && [syrupFixed.massKg, syrupFixed.lines.map(syrupLine)], syrupActivated],
      [12500n, [1000000n, [['ذرة صفراء', 'kg', 'kg', 980000n, 980000n, false, false], ['شراب الشاشة', 'L', 'L', 16000n, 20000n, false, false]]], 'ok'],
      'ما تقوله جملة المدير: الكثافة 1.2500 من نافذة المادّة (updateItem)، فلا densityMissing والكتلة 16 × 1.25 = 20 والمجموع 1,000، وactivateVersion ينجح (ق٥١، ب٤٩)',
    );

    // «نسخة جديدة» من الشاشة لا تنسخ مادّة صارت قطعة (ق٥٥، ب٤٨): «ملح الشاشة» و«خميرة الشاشة» من نافذة «مادّة جديدة» (raw وkg) في خلطة مفعَّلة من البانية
    // (ذرة 980 + 10 + 10)، ثمّ يجعلهما المدير قطعة من نافذة المادّة (updateItem بما يرسله changedFields: base_unit = pc وscale_step = 1.000). createProduction يُرفض
    // item_changed، وnewRecipeVersion (زرّ «نسخة جديدة») يعطي skipped بالاسمين بترتيب السطور ومسوّدة بالذرة وحدها (lines 1)، والإعادة بعد جواب ضاع existing
    // وskipped فارغ؛ ثمّ setRecipeLine للذرة 1,000 وactivateVersion من الصفحة، فيُنتَج بها (createProduction ثمّ loadBatch).
    const pieceFromScreen = (name) => repo.createItem({ name, category_id: null, kind: 'raw', base_unit: 'kg', density_kg_per_l: null, piece_mass_kg: null,
      tracks_expiry: false, scale_step: '0.100', min_qty: null, barcode: null, alt_codes: [] });
    const toPieceFromScreen = async (made) => repo.updateItem(made?.id ?? '', (await repo.loadItem(made?.id ?? ''))?.version ?? 0, { base_unit: 'pc', scale_step: '1.000' });
    const saltItem = await tried('createItem (ملح الشاشة)', () => pieceFromScreen('ملح الشاشة'));
    const yeastItem = await tried('createItem (خميرة الشاشة)', () => pieceFromScreen('خميرة الشاشة'));
    const PR = id(631);
    const piecesRecipe = await rejected(repo.createRecipe({ id: PR, versionId: id(632), name: 'بادئ بقطعتَي الشاشة', outputItemId: FEED2, basisKg: 1000000n,
      lines: [{ itemId: CORN, qty: 980000n, unit: 'kg' }, { itemId: saltItem?.id ?? '', qty: 10000n, unit: 'kg' }, { itemId: yeastItem?.id ?? '', qty: 10000n, unit: 'kg' }],
      rates: [], activate: true }));
    const piecesNow = [await tried('updateItem (الملح قطعة)', () => toPieceFromScreen(saltItem)), await tried('updateItem (الخميرة قطعة)', () => toPieceFromScreen(yeastItem))];
    actAs(U.miller);
    const piecesRefused = await rejected(repo.createProduction(id(633), id(632), 100000n, RAW, FEEDWH, TODAY));
    actAs(U.manager);
    const piecesCopied = await tried('newRecipeVersion (القطعتان)', () => repo.newRecipeVersion(PR, id(634)));
    const piecesAgain = await tried('newRecipeVersion (إعادة القطعتين)', () => repo.newRecipeVersion(PR, id(634)));
    const piecesDraft = await tried('loadRecipe (مسوّدة بلا القطعتين)', () => repo.loadRecipe(PR, id(634)));
    const SCREEN_PIECED = { recipeId: PR, versionId: id(634), versionNo: 2, status: 'draft', lines: 1, rates: 0, existing: false, skipped: ['ملح الشاشة', 'خميرة الشاشة'] };
    t.same(
      [piecesRecipe, piecesNow.map((x) => x?.baseUnit), piecesRefused, piecesCopied, piecesAgain,
        piecesDraft && [piecesDraft.status, piecesDraft.massKg, piecesDraft.lines.map((l) => [l.itemName, l.qty, l.unit])]],
      ['ok', ['pc', 'pc'], 'item_changed', SCREEN_PIECED, SCREEN_PIECED, ['draft', 980000n, [['ذرة صفراء', 980000n, 'kg']]]],
      'newRecipeVersion من الشاشة: مادّتان صارتا قطعة لا تُنسخان، وskipped بالاسمين بترتيب السطور، والإعادة بعد جواب ضاع ترجع ما رجع أوّل مرّة (existing = false وskipped بالاسمين، ق٦٣)، والمسوّدة بالذرة وحدها (ق٥٥، ب٤٨)',
    );
    const piecesCornLine = piecesDraft?.lines.find((l) => l.itemId === CORN)?.id ?? '';
    const piecesLine = await rejected(repo.setRecipeLine(piecesCornLine, 1000000n, 'kg'));
    const piecesActivated = await rejected((async () => repo.activateVersion(id(634), (await repo.loadRecipe(PR, id(634))).versionVersion))());
    actAs(U.miller);
    const piecesMade = await rejected(repo.createProduction(id(635), id(634), 100000n, RAW, FEEDWH, TODAY));
    t.same(
      [piecesLine, piecesActivated, piecesMade, await plannedOf(id(635))],
      ['ok', 'ok', 'ok', [['ذرة صفراء', 'kg', 100000n]]],
      'setRecipeLine (الذرة 1,000) ثمّ activateVersion ثمّ createProduction وloadBatch: النسخة بلا القطعتين تتفعّل ويُنتَج بها (ق٥٥)',
    );
    const piecesBatch = await repo.loadBatch(id(635)).catch(() => null);
    if (piecesBatch) await repo.discardBatch(id(635), piecesBatch.version);

    // ─── دمج الجولة السادسة من الشاشة (fixes6.md القسم د؛ ق٦١–ق٦٥، ب٦١–ب٦٣) ─────────────────────────────────────────────────────────────
    /** رفض كما تعرضه الشاشة (describeError: عنوان الرفض وتلميح الخادم): [RejectedError؟، الرمز، التلميح]، أو ['ok']. */
    const namedRefusal = (promise) =>
      promise.then(() => ['ok'], (error) => [error instanceof repo.RejectedError, error?.code ?? `${error?.name}: ${error?.message}`, error?.hint ?? null]);
    // (أ) unconverted ثمّ رحلة رابط الكثافة على القاعدة الحقيقية (ق٦١، ب٦١ وب٦٢): «زيت الشاشة» سائل من نافذة «مادّة جديدة» (createItem: raw وL وكثافة 0.9000) وسعر
    // كلفته 2,000 للتر (setItemCostPrice)، في مسوّدة من البانية بلا تفعيل (ذرة 994 كغم + زيت 6 كغم مكتوب بالكيلو). loadRecipe قبل التصحيح: round3(6 ÷ 0.9) = 6.667 لتر
    // × 2,000 = 13,334، والذرة 994 × 950 = 944,300، فالطنّ 957,634.00 بلا سطر متروك. ثمّ يفرّغ المدير كثافته من نافذة المادّة (updateItem): loadRecipe للمدير والمحاسب
    // بسعر السطر 2,000.00 وdensityMissing، وunpriced = 0 وunconverted = 1 والطنّ 944,300.00؛ ولمشغّل المعمل بلا مال. ثمّ رابط «اكتب الكثافة» كما تبنيه بطاقة الخلطة
    // (?edit=<المادّة> و?back=/mill/recipe/<الخلطة>?version=<المسوّدة>) بمعرّفات القاعدة الحقيقية: recipeBack في «المواد» يقبل مسار الرجوع كما هو، والنافذة تقرأ
    // المادّة بمعرّفها (loadItem: فعّالة باللتر بلا كثافة) وتحفظ الكثافة وحدها بنسختها (updateItem)، والرجوع يقرأ نسخة الرابط (loadRecipe بها): لا densityMissing،
    // والطنّ 957,634.00 من جديد، والتفعيل ينجح (994 + 6 = 1,000).
    actAs(U.manager);
    const oilScreen = await tried('createItem (زيت الشاشة)', () => liquidFromScreen('زيت الشاشة', 'raw', '0.9000'));
    const oilPriced = await rejected(repo.setItemCostPrice(oilScreen?.id ?? '', 200000n, null));
    const OR = id(681);
    const OV = id(682);
    const oilRecipe = await rejected(repo.createRecipe({ id: OR, versionId: OV, name: 'مسوّدة زيت الشاشة', outputItemId: FEED2, basisKg: 1000000n,
      lines: [{ itemId: CORN, qty: 994000n, unit: 'kg' }, { itemId: oilScreen?.id ?? '', qty: 6000n, unit: 'kg' }], rates: [], activate: false }));
    const oilBefore = await tried('loadRecipe (زيت الشاشة قبل التصحيح)', () => repo.loadRecipe(OR, OV));
    const oilEmptied = await tried('updateItem (الزيت بلا كثافة)', async () => repo.updateItem(oilScreen?.id ?? '', (await repo.loadItem(oilScreen?.id ?? ''))?.version ?? 0, { density_kg_per_l: null }));
    const oilAfter = await tried('loadRecipe (زيت الشاشة بلا كثافة)', () => repo.loadRecipe(OR, OV));
    actAs(U.accountant);
    const oilAccountant = await tried('loadRecipe (المحاسب، زيت الشاشة بلا كثافة)', () => repo.loadRecipe(OR, OV));
    actAs(U.miller);
    const oilMiller = await tried('loadRecipe (مشغّل المعمل، زيت الشاشة بلا كثافة)', () => repo.loadRecipe(OR, OV));
    const oilScreenLine = (l) => [l.itemName, l.baseUnit, l.unit, l.costPrice, l.densityMissing];
    const OIL_SCREEN_PRICED = { materialsPerTon: 95763400n, ratesPerTon: 0n, costPerTon: 95763400n, unpriced: 0, unconverted: 0 };
    const OIL_SCREEN_UNCONVERTED = { materialsPerTon: 94430000n, ratesPerTon: 0n, costPerTon: 94430000n, unpriced: 0, unconverted: 1 };
    t.same(
      [oilPriced, oilRecipe, oilBefore?.expected, oilEmptied?.density, oilAfter && [oilAfter.expected, oilAfter.lines.map(oilScreenLine)], oilAccountant?.expected,
        oilMiller && [oilMiller.expected, oilMiller.lines.map((l) => [l.itemName, l.costPrice, l.densityMissing])]],
      ['ok', 'ok', OIL_SCREEN_PRICED, null, [OIL_SCREEN_UNCONVERTED, [['ذرة صفراء', 'kg', 'kg', 95000n, false], ['زيت الشاشة', 'L', 'kg', 200000n, true]]], OIL_SCREEN_UNCONVERTED,
        [null, [['ذرة صفراء', null, false], ['زيت الشاشة', null, true]]]],
      'setItemCostPrice ثمّ updateItem ثمّ loadRecipe: سطر الزيت المسعَّر بلا كثافة في unconverted = 1 لا unpriced والطنّ 944,300.00 للمدير والمحاسب، ولمشغّل المعمل بلا مال (ق٦١، ب٦٢)',
    );
    actAs(U.manager);
    const oilLine = oilAfter?.lines.find((l) => l.densityMissing) ?? null;
    const oilBack = `/mill/recipe/${OR}?version=${oilAfter?.versionId ?? ''}`;
    const recipeBack = pages.itemsPage?.recipeBack;
    const backAccepted = typeof recipeBack === 'function' ? recipeBack(oilBack) : 'recipeBack غائبة';
    const linkedItem = await tried('loadItem (نافذة «عدّل» بالرابط)', () => repo.loadItem(oilLine?.itemId ?? ''));
    const densitySaved = await tried('updateItem (الكثافة من نافذة «عدّل»)', () => repo.updateItem(linkedItem?.id ?? '', linkedItem?.version ?? 0, { density_kg_per_l: '0.9000' }));
    const backVersion = new URL(oilBack, 'http://localhost').searchParams.get('version');
    const oilReturned = await tried('loadRecipe (الرجوع بنسخة الرابط)', () => repo.loadRecipe(OR, backVersion));
    const oilActivated = await rejected((async () => repo.activateVersion(OV, (await repo.loadRecipe(OR, OV)).versionVersion))());
    t.same(
      [oilLine?.itemId === oilScreen?.id, backAccepted, linkedItem && [linkedItem.id === oilScreen?.id, linkedItem.archived, linkedItem.baseUnit, linkedItem.density], densitySaved?.density,
        backVersion, oilReturned && [oilReturned.versionId, oilReturned.status, oilReturned.massKg, oilReturned.lines.map(oilScreenLine), oilReturned.expected], oilActivated],
      [true, oilBack, [true, false, 'L', null], 9000n, OV,
        [OV, 'draft', 1000000n, [['ذرة صفراء', 'kg', 'kg', 95000n, false], ['زيت الشاشة', 'L', 'kg', 200000n, false]], OIL_SCREEN_PRICED], 'ok'],
      'رابط «اكتب الكثافة» على القاعدة الحقيقية (ب٦١): recipeBack يقبل مسار الرجوع بمعرّفاتها، وloadItem يعطي النافذة المادّة فعّالة بلا كثافة، وupdateItem يحفظ 0.9000، ونسخة الرابط تُقرأ بلا densityMissing والطنّ 957,634.00، وتتفعّل',
    );

    // (ب) «نسخة جديدة» من الشاشة مع مادّة مؤرشفة صارت قطعة وسطر لتر لسائل صار قطعة (ق٦٢)، والإعادة بعد جواب ضاع (ق٦٣، ب٦٣): «كيس الشاشة» (raw وkg) و«فيتامين الشاشة»
    // (raw وL وكثافة 1.2500) في خلطة مفعَّلة من البانية (ذرة 980 كغم + كيس 10 كغم + فيتامين 8 لترات = 10 كغم ← 1,000)، ثمّ يجعل المدير الكيس قطعة ويؤرشفه من «المواد»
    // (updateItem ثمّ setArchived) ويجعل الفيتامين قطعة (updateItem: base_unit = pc والكثافة فارغة وscale_step = 1.000). createProduction يُرفض item_changed، وnewRecipeVersion:
    // مسوّدة بالذرة وحدها وskipped بالاسمين بترتيب السطور (كانت item_archived)؛ والإعادة بالمعرّف نفسه الجواب نفسه (existing = false وskipped بالاسمين)؛ ومعرّف آخر
    // والمسوّدة قائمة existing وskipped فارغ؛ ثمّ setRecipeLine للذرة 1,000 وactivateVersion، والإعادة بعد التفعيل الجواب نفسه وحالة النسخة مفعَّلة، ويُنتَج بها.
    actAs(U.manager);
    const bagScreen = await tried('createItem (كيس الشاشة)', () => pieceFromScreen('كيس الشاشة'));
    const vitScreen = await tried('createItem (فيتامين الشاشة)', () => liquidFromScreen('فيتامين الشاشة', 'raw', '1.2500'));
    const BR = id(683);
    const bagRecipe = await rejected(repo.createRecipe({ id: BR, versionId: id(684), name: 'بادئ بكيس وفيتامين الشاشة', outputItemId: FEED2, basisKg: 1000000n,
      lines: [{ itemId: CORN, qty: 980000n, unit: 'kg' }, { itemId: bagScreen?.id ?? '', qty: 10000n, unit: 'kg' }, { itemId: vitScreen?.id ?? '', qty: 8000n, unit: 'L' }],
      rates: [], activate: true }));
    const bagPiece = await tried('updateItem (الكيس قطعة)', () => toPieceFromScreen(bagScreen));
    const bagArchived = await rejected(repo.setArchived('items', bagScreen?.id ?? '', bagPiece?.version ?? 0, true));
    const vitPiece = await tried('updateItem (الفيتامين قطعة)', async () =>
      repo.updateItem(vitScreen?.id ?? '', (await repo.loadItem(vitScreen?.id ?? ''))?.version ?? 0, { base_unit: 'pc', density_kg_per_l: null, scale_step: '1.000' }));
    actAs(U.miller);
    const bagRefused = await rejected(repo.createProduction(id(687), id(684), 100000n, RAW, FEEDWH, TODAY));
    actAs(U.manager);
    const bagCopy = await tried('newRecipeVersion (الكيس والفيتامين)', () => repo.newRecipeVersion(BR, id(685)));
    const bagAgain = await tried('newRecipeVersion (إعادة بعد جواب ضاع)', () => repo.newRecipeVersion(BR, id(685)));
    const bagOther = await tried('newRecipeVersion (معرّف آخر والمسوّدة قائمة)', () => repo.newRecipeVersion(BR, id(686)));
    const bagDraft = await tried('loadRecipe (مسوّدة بلا الكيس والفيتامين)', () => repo.loadRecipe(BR, id(685)));
    const BAG_COPY = { recipeId: BR, versionId: id(685), versionNo: 2, status: 'draft', lines: 1, rates: 0, existing: false, skipped: ['كيس الشاشة', 'فيتامين الشاشة'] };
    t.same(
      [bagRecipe, bagPiece?.baseUnit, bagArchived, vitPiece && [vitPiece.baseUnit, vitPiece.density], bagRefused, bagCopy, bagAgain, bagOther,
        bagDraft && [bagDraft.status, bagDraft.massKg, bagDraft.lines.map((l) => [l.itemName, l.qty, l.unit])]],
      ['ok', 'pc', 'ok', ['pc', null], 'item_changed', BAG_COPY, BAG_COPY, { ...BAG_COPY, existing: true, skipped: [] }, ['draft', 980000n, [['ذرة صفراء', 980000n, 'kg']]]],
      'newRecipeVersion من الشاشة: الكيس المؤرشف الذي صار قطعة وسطر الفيتامين باللتر لسائل صار قطعة يُتركان ويُسمّيان بترتيب السطور (كانت item_archived)، والإعادة بعد جواب ضاع ترجع ما رجع أوّل مرّة (existing = false وskipped بالاسمين)، ومعرّف آخر existing وskipped فارغ (ق٦٢ وق٦٣، ب٦٣)',
    );
    const bagCorn = await rejected(repo.setRecipeLine(bagDraft?.lines.find((l) => l.itemId === CORN)?.id ?? '', 1000000n, 'kg'));
    const bagActivated = await rejected((async () => repo.activateVersion(id(685), (await repo.loadRecipe(BR, id(685))).versionVersion))());
    const bagAfter = await tried('newRecipeVersion (إعادة بعد التفعيل)', () => repo.newRecipeVersion(BR, id(685)));
    actAs(U.miller);
    const bagMade = await rejected(repo.createProduction(id(688), id(685), 100000n, RAW, FEEDWH, TODAY));
    t.same(
      [bagCorn, bagActivated, bagAfter, bagMade, await plannedOf(id(688))],
      ['ok', 'ok', { ...BAG_COPY, status: 'active' }, 'ok', [['ذرة صفراء', 'kg', 100000n]]],
      'setRecipeLine (الذرة 1,000) ثمّ activateVersion: تتفعّل، والإعادة بالمعرّف نفسه بعد التفعيل الجواب نفسه وحالة النسخة مفعَّلة، ويُنتَج بها (createProduction ثمّ loadBatch) (ق٦٢ وق٦٣)',
    );
    const bagBatch = await repo.loadBatch(id(688)).catch(() => null);
    if (bagBatch) await repo.discardBatch(id(688), bagBatch.version);

    // (ج) سطر تُقرَّب كتلته صفراً (ق٦٤) وتلميح density_required بالمكان الذي تُكتب فيه الكثافة (ق٦٥): «سائل خفيف الشاشة» (raw وL وكثافة 0.6000) في مسوّدة من البانية
    // (ذرة 1,000 كغم + 0.001 لتر: round3(0.001 × 0.6) = 0.001 كغم فيقبله حارس السطر)، ثمّ يجعل المدير كثافته 0.4000 من نافذة المادّة: كتلة السطر 0.000. loadRecipe للمدير
    // ومشغّل المعمل والمحاسب لا ترمي (كانت mul_div_domain): الكتلة 0 والحصّة 0.00 ومجموع الكتلة 1,000 = الأساس. activateVersion، وتعديل السطر بكميته (setRecipeLine،
    // نافذة «عدّل»)، وإضافة سائل مثله بكثافة 0.4000 (addRecipeLine، «أضف مادّة») ترمي RejectedError برمز qty_not_positive وتلميح يسمّي المادّة؛ وإضافة سائل فُرّغت كثافته
    // باللتر (addRecipeLine) ترمي density_required بتلميح «اكتب كثافته من «المواد» في المخزن (زرّ «عدّل» بجانبها) ثمّ فعّل»، وإضافته إلى دفعة (addProductionInput، «أضف
    // مادّة» في صفحة الدفعة) بتلميح «… أوّلاً» — والنافذتان تعرضان التلميح بـdescribeError كما هو. ثمّ ما يقوله تلميح الكتلة: 0.002 لتر (كتلته 0.001) والذرة 999.999، فتتفعّل.
    actAs(U.manager);
    const lightScreen = await tried('createItem (سائل خفيف الشاشة)', () => liquidFromScreen('سائل خفيف الشاشة', 'raw', '0.6000'));
    const LR = id(689);
    const LV = id(690);
    const lightRecipe = await rejected(repo.createRecipe({ id: LR, versionId: LV, name: 'مسوّدة سائل خفيف الشاشة', outputItemId: FEED2, basisKg: 1000000n,
      lines: [{ itemId: CORN, qty: 1000000n, unit: 'kg' }, { itemId: lightScreen?.id ?? '', qty: 1n, unit: 'L' }], rates: [], activate: false }));
    const lightThinner = await tried('updateItem (كثافة 0.4000)', async () =>
      repo.updateItem(lightScreen?.id ?? '', (await repo.loadItem(lightScreen?.id ?? ''))?.version ?? 0, { density_kg_per_l: '0.4000' }));
    const lightCards = [];
    for (const user of [U.manager, U.miller, U.accountant]) {
      actAs(user);
      const card = await tried('loadRecipe (سطر كتلته صفر)', () => repo.loadRecipe(LR, LV));
      lightCards.push(card && [card.basisKg, card.massKg, card.lines.map((l) => [l.itemName, l.qty, l.unit, l.massKg, l.sharePct])]);
    }
    actAs(U.manager);
    const lightCard = await tried('loadRecipe (مسوّدة السائل الخفيف)', () => repo.loadRecipe(LR, LV));
    const lightLineId = lightCard?.lines.find((l) => l.itemId === lightScreen?.id)?.id ?? '';
    const lightActivate = await namedRefusal((async () => repo.activateVersion(LV, (await repo.loadRecipe(LR, LV)).versionVersion))());
    const lightEdit = await namedRefusal(repo.setRecipeLine(lightLineId, 1n, 'L'));
    const lightTwin = await tried('createItem (سائل خفيف آخر)', () => liquidFromScreen('سائل خفيف آخر', 'raw', '0.4000'));
    const lightAdd = await namedRefusal(repo.addRecipeLine(LV, lightTwin?.id ?? '', 1n, 'L'));
    const dryOil = await tried('createItem (زيت بلا كثافة)', () => liquidFromScreen('زيت بلا كثافة', 'raw', '0.9000'));
    const dryEmptied = await tried('updateItem (زيت بلا كثافة)', async () => repo.updateItem(dryOil?.id ?? '', (await repo.loadItem(dryOil?.id ?? ''))?.version ?? 0, { density_kg_per_l: null }));
    const dryLine = await namedRefusal(repo.addRecipeLine(LV, dryOil?.id ?? '', 5000n, 'L'));
    actAs(U.miller);
    const DRY_BATCH = id(691);
    const dryBatch = await rejected(repo.createProduction(DRY_BATCH, id(132), 100000n, RAW, FEEDWH, TODAY));
    const dryInput = await namedRefusal(repo.addProductionInput({ batchId: DRY_BATCH, id: id(692), itemId: dryOil?.id ?? '', qty: 5000n, replaces: null, reason: null }));
    const dryCard = await repo.loadBatch(DRY_BATCH).catch(() => null);
    if (dryCard) await repo.discardBatch(DRY_BATCH, dryCard.version);
    const LIGHT_CARD = [1000000n, 1000000n, [['ذرة صفراء', 1000000n, 'kg', 1000000n, 10000n], ['سائل خفيف الشاشة', 1n, 'L', 0n, 0n]]];
    const DRY_PLACE = 'اكتب كثافته من «المواد» في المخزن (زرّ «عدّل» بجانبها)';
    t.same(
      [lightRecipe, lightThinner?.density, lightCards, lightActivate, lightEdit, lightAdd],
      ['ok', 4000n, [LIGHT_CARD, LIGHT_CARD, LIGHT_CARD], [true, 'qty_not_positive', ZERO_HINT('سائل خفيف الشاشة')], [true, 'qty_not_positive', ZERO_HINT('سائل خفيف الشاشة')],
        [true, 'qty_not_positive', ZERO_HINT('سائل خفيف آخر')]],
      'loadRecipe لسطر كتلته صفر لا ترمي للأدوار الثلاثة، وactivateVersion وsetRecipeLine وaddRecipeLine ترمي RejectedError برمز qty_not_positive وتلميح يسمّي المادّة كما تعرضه الصفحة (ق٦٤)',
    );
    t.same(
      [dryEmptied?.density, dryLine, dryBatch, dryInput],
      [null, [true, 'density_required', `«زيت بلا كثافة» سائل بلا كثافة، فلا يُحسب وزنه. ${DRY_PLACE} ثمّ فعّل.`], 'ok',
        [true, 'density_required', `«زيت بلا كثافة» سائل بلا كثافة، فلا يُحسب وزنه. ${DRY_PLACE} أوّلاً.`]],
      'addRecipeLine وaddProductionInput لسائل بلا كثافة: RejectedError برمز density_required وتلميح يسمّي المكان الذي تُكتب فيه الكثافة («المواد» وزرّ «عدّل»)، لا «بطاقة المادّة» (ق٦٥، ب٦١)',
    );
    actAs(U.manager);
    const lightBigger = await rejected(repo.setRecipeLine(lightLineId, 2n, 'L'));
    const lightCorn = await rejected(repo.setRecipeLine(lightCard?.lines.find((l) => l.itemId === CORN)?.id ?? '', 999999n, 'kg'));
    const lightActivated = await rejected((async () => repo.activateVersion(LV, (await repo.loadRecipe(LR, LV)).versionVersion))());
    const lightNow = await tried('loadRecipe (السائل الخفيف بعد التفعيل)', () => repo.loadRecipe(LR));
    t.same(
      [lightBigger, lightCorn, lightActivated, lightNow && [lightNow.status, lightNow.massKg, lightNow.lines.map((l) => [l.itemName, l.qty, l.massKg, l.sharePct])]],
      ['ok', 'ok', 'ok', ['active', 1000000n, [['ذرة صفراء', 999999n, 999999n, 10000n], ['سائل خفيف الشاشة', 2n, 1n, 0n]]]],
      'ما يقوله التلميح: setRecipeLine بـ0.002 لتر (كتلته 0.001) وبالذرة 999.999، فactivateVersion ينجح (ق٦٤)',
    );

    // يوم الإنتاج من صفحة الدفعة (ب٢٦): مسوّدة سوّدها مشغّل المعمل قبل ثمانية أيام (27/10/2026) لا تُرحَّل اليوم — date_too_old بتلميح الخادم،
    // ووجبات الذرة (استُلمت 04/11/2026) بعد يومها فلا رصيد لها بذلك اليوم. فيكتب في حقل «يوم الإنتاج» (editInputs: مشغّل المعمل) يوماً بعد
    // اليوم فيحكم الخادم date_in_future بجملته، ثمّ «4/11/2026»: parseDayText يوم تقويم، وsetBatchFields({ producedOn }) وحده كما ترسله
    // الصفحة، فالمعاينة بلا مشكلة، ويرحّلها المدير؛ والسحب ووجبة العلف بذلك اليوم، والمحفوظ يعود للحقل بـfmtDay. خلطة بلا تكاليف (ذرة
    // 1,000 كغم للأساس 1,000)، والدفعة 50 كغم.
    actAs(U.manager);
    const dayRecipe = await rejected(repo.createRecipe({ id: id(256), versionId: id(257), name: 'بادئ يوم الإنتاج', outputItemId: FEED2, basisKg: 1000000n,
      lines: [{ itemId: CORN, qty: 1000000n, unit: 'kg' }], rates: [], activate: true }));
    const LATE = id(258);
    actAs(U.miller);
    const lateMade = await rejected(db.setToday('2026-10-27', () => repo.createProduction(LATE, id(257), 50000n, RAW, FEEDWH, '2026-10-27')));
    actAs(U.manager);
    const lateLook = await tried('previewProduction (مسوّدة 27/10/2026)', () => repo.previewProduction(LATE));
    t.same(
      [dayRecipe, lateMade, lateLook && [lateLook.producedOn, lateLook.problems.map((x) => [x.code, x.hint]), lateLook.canPost]],
      ['ok', 'ok', ['2026-10-27', [['date_too_old', 'لا يُقبل تاريخ أقدم من 7 أيام؛ أقدم تاريخ مسموح به 28/10/2026.'], ['insufficient_stock', null]], false]],
      'previewProduction لمسوّدة عمرها ثمانية أيام: date_too_old بتلميح الخادم، والذرة بلا رصيد بيومها (استُلمت بعده) — فلا تُرحَّل (ب٢٦)',
    );
    actAs(U.miller);
    const aheadDay = repo.parseDayText('5/11/2026');
    const aheadSaved = await rejected(repo.setBatchFields(LATE, { producedOn: aheadDay }));
    actAs(U.manager);
    const aheadLook = await tried('previewProduction (يوم بعد اليوم)', () => repo.previewProduction(LATE));
    actAs(U.miller);
    const fixedDay = repo.parseDayText('4/11/2026');
    const fixedSaved = await rejected(repo.setBatchFields(LATE, { producedOn: fixedDay }));
    const fixedCard = await tried('loadBatch (بعد تصحيح اليوم)', () => repo.loadBatch(LATE));
    actAs(U.manager);
    const fixedLook = await tried('previewProduction (بعد تصحيح اليوم)', () => repo.previewProduction(LATE));
    t.same(
      [aheadDay, aheadSaved, aheadLook && [aheadLook.producedOn, aheadLook.problems.map((x) => [x.code, x.hint]), aheadLook.canPost],
        fixedDay, fixedSaved, fixedCard && [fixedCard.producedOn, repo.fmtDay(fixedCard.producedOn)], fixedLook && [fixedLook.producedOn, fixedLook.problems, fixedLook.canPost]],
      ['2026-11-05', 'ok', ['2026-11-05', [['date_in_future', 'التاريخ 05/11/2026 بعد تاريخ اليوم 04/11/2026.']], false],
        '2026-11-04', 'ok', ['2026-11-04', '04/11/2026'], ['2026-11-04', [], true]],
      'setBatchFields({ producedOn }) من حقل يوم الإنتاج (مشغّل المعمل): يوم بعد اليوم date_in_future بجملة الخادم، ثمّ يوم صالح فالمعاينة بلا مشكلة (ب٢٦)',
    );
    const latePosted = fixedLook ? await rejected(repo.postProduction(LATE, fixedLook.version, fixedLook.planToken, ref())) : 'بلا معاينة';
    const lateDone = await tried('loadBatch (بعد ترحيل اليوم المصحَّح)', () => repo.loadBatch(LATE));
    const lateLot = (await tried('loadItemLots (العلف بعد ترحيل اليوم المصحَّح)', () => repo.loadItemLots(FEED2, FEEDWH)))?.rows.find((r) => r.sourceId === LATE);
    const lateMove = (await tried('loadItemMoves (الذرة بعد ترحيل اليوم المصحَّح)', () => repo.loadItemMoves(CORN, RAW)))?.rows.find((r) => r.docId === LATE);
    t.same(
      [latePosted, lateDone && [lateDone.status, lateDone.producedOn], lateLot && [lateLot.receivedOn, lateLot.qtyLeft], lateMove && [lateMove.movedOn, lateMove.qty]],
      ['ok', ['posted', '2026-11-04'], ['2026-11-04', 50000n], ['2026-11-04', -50000n]],
      'postProduction بعد تصحيح اليوم: الدفعة مرحَّلة بيومها الجديد، وسحب الذرة ووجبة العلف 50 كغم بذلك اليوم (ب٢٦)',
    );

    // جمل المشاكل كما تعرضها صفحة الدفعة (ب٢): محلّل المعاينة يقبل أيّ رمز، ففرق اسمه بين الطرفين لا يظهر إلّا هنا — كلّ مشكلة أرسلتها القاعدة
    // في هذا الملف تعرضها BatchPage بجملتها (problemLine) لا بالجملة العامّة «مشكلة في الدفعة: {code}»، والجملتان الجديدتان بنصّ المواصفة،
    // ومشكلة التاريخ بتلميح الخادم (ومنها date_in_future من حقل يوم الإنتاج، ب٢٦).
    const page = (await screensText()).batchPage;
    const served = [view0, viewMiller, view2, viewB2, viewB2Miller, hiddenView, seenView, agedView, expiredView, rawLook, massless, undated, lateLook, aheadLook, fixedLook]
      .flatMap((view) => view?.problems ?? []);
    const codes = [...new Set(served.map((x) => x.code))].sort();
    const generic = page.problemText('zz_probe');
    const lineOf = (wanted) => {
      const problem = served.find((x) => x.code === wanted);
      return problem ? page.problemLine(problem) : `(لم تُرسل القاعدة ${wanted})`;
    };
    t.same(
      [codes, [...new Set(served.filter((x) => page.problemLine(x) === generic.replace('zz_probe', x.code)).map((x) => x.code))]],
      [['costs_pending', 'costs_unfunded', 'costs_unsealed_scope', 'date_in_future', 'date_too_old', 'expiry_required', 'insufficient_stock', 'no_mass_inputs', 'output_expired', 'shrink_out_of_range'], []],
      'BatchPage.problemLine: لكلّ مشكلة من القاعدة جملتها، لا الجملة العامّة (ب٢)',
    );
    t.same(
      [lineOf('costs_unsealed_scope'), lineOf('no_mass_inputs'), lineOf('date_too_old')],
      [`تكاليف هذه الدفعة تُحمَّل من مصاريف وحدة «${MILL_NAME}» خارج نطاقك: يختمها محاسب أو مدير يرى تلك الوحدة، ثمّ تُرحَّل.`,
        'الدفعة بلا مادّة داخل الكتلة: أضف مادّة أوّلية؛ الوقود والتعبئة وحدهما لا يصنعان علفاً.', 'لا يُقبل تاريخ أقدم من 7 أيام؛ أقدم تاريخ مسموح به 05/11/2026.'],
      'BatchPage.problemLine: costs_unsealed_scope تسمّي الوحدة من division_name، وno_mass_inputs بجملتها، ومشكلة التاريخ بتلميح الخادم (ب٢)',
    );
    t.eq(lineOf('date_in_future'), 'التاريخ 05/11/2026 بعد تاريخ اليوم 04/11/2026.', 'BatchPage.problemLine: date_in_future (يوم إنتاج بعد اليوم من حقله، ب٢٦) بتلميح الخادم لا بالجملة العامّة');

    // رفض «تغيّر من نافذة أو جهاز آخر» ثمّ القراءة الجديدة (الجولة الخامسة، ب٤٢) على القاعدة الحقيقية: كلّ كتابة مشروطة من صفحتَي الدفعة والخلطة، وجهاز آخر يكتب
    // بين قراءتها وكتابتها، تُرفض برمز تعيد له الصفحة القراءة (BatchPage: qty_changed وamount_changed وstale_draft وstale_preview؛ RecipePage: price_changed
    // وamount_changed وstale_draft، وZeroRowsError لحفظ الأساس المشروط بنسخة المسوّدة) — اسم رمز آخر لا يعيد القراءة فتعود حلقة الرفض. والقراءة الجديدة تعطي
    // شرط الحفظ التالي من المصدر الذي تأخذه الصفحة (المعاينة: الكمية الفعلية ومبلغ التكلفة والنسخة وخطّتها؛ وبطاقة الخلطة: سعر الكلفة ومبلغ الطنّ ونسخة النسخة)،
    // فينجح. دفعة 100 كغم من «بادئ الشاشة» (ذرة 70 وصويا 30، و«أيدي عاملة» 4,000 × 100 ÷ 1,000 = 400.00) ومسوّدته الثانية.
    const BATCH_REREAD = ['qty_changed', 'amount_changed', 'stale_draft', 'stale_preview'];
    const RECIPE_REREAD = ['price_changed', 'amount_changed', 'stale_draft'];
    /** رمز الرفض كما تقرؤه الصفحة، وهل تعيد له القراءة: «رمز» أو «غير مُعاد: رمز» أو «ok». */
    const conflictIn = (codes) => (promise) =>
      promise.then(
        () => 'ok',
        (error) => {
          if (error instanceof repo.ZeroRowsError) return codes === RECIPE_REREAD ? 'ZeroRowsError' : 'غير مُعاد: ZeroRowsError';
          if (error instanceof repo.RejectedError) return codes.includes(error.code) ? error.code : `غير مُعاد: ${error.code}`;
          return `${error?.name}: ${error?.code ?? error?.message}`;
        },
      );
    const onBatch = conflictIn(BATCH_REREAD);
    const onRecipe = conflictIn(RECIPE_REREAD);
    const LOOP = id(641);
    actAs(U.miller);
    await repo.createProduction(LOOP, id(132), 100000n, RAW, FEEDWH, TODAY);
    const seen = await repo.previewProduction(LOOP);
    const loopInput = seen.lines.find((l) => l.itemName === 'ذرة صفراء');
    actAs(U.manager);
    await repo.setInputActual(loopInput.inputId, null, 71000n);
    actAs(U.miller);
    const actualClash = await onBatch(repo.setInputActual(loopInput.inputId, loopInput.actualQty, 72000n));
    const actualNow = (await repo.previewProduction(LOOP)).lines.find((l) => l.inputId === loopInput.inputId)?.actualQty ?? null;
    const actualRetry = await onBatch(repo.setInputActual(loopInput.inputId, actualNow, 72000n));
    actAs(U.accountant);
    const costSeen = (await repo.previewProduction(LOOP)).costs?.[0] ?? null;
    actAs(U.manager);
    await repo.setBatchCost(costSeen?.id ?? '', costSeen?.amount ?? 0n, 45000n);
    actAs(U.accountant);
    const costClash = await onBatch(repo.setBatchCost(costSeen?.id ?? '', costSeen?.amount ?? 0n, 50000n));
    const costNow = (await repo.previewProduction(LOOP)).costs?.find((c) => c.id === costSeen?.id)?.amount ?? null;
    const costRetry = await onBatch(repo.setBatchCost(costSeen?.id ?? '', costNow ?? 0n, 50000n));
    const deleteClash = await onBatch(repo.deleteBatchCost(costSeen?.id ?? '', seen.version));
    const sealSeen = await repo.previewProduction(LOOP);
    actAs(U.miller);
    await repo.setBatchFields(LOOP, { outputQtyKg: 101000n });
    actAs(U.accountant);
    const sealClash = await onBatch(repo.confirmCosts(LOOP, sealSeen.version));
    const sealRetry = await onBatch((async () => repo.confirmCosts(LOOP, (await repo.previewProduction(LOOP)).version))());
    actAs(U.manager);
    const postSeen = await repo.previewProduction(LOOP);
    actAs(U.miller);
    await repo.setBatchFields(LOOP, { outputQtyKg: 102000n });
    actAs(U.manager);
    const postClash = await onBatch(repo.postProduction(LOOP, postSeen.version, postSeen.planToken, ref()));
    const postNow = await repo.previewProduction(LOOP);
    const postRetry = await onBatch(repo.postProduction(LOOP, postNow.version, postNow.planToken, ref()));
    const loopDone = await repo.loadBatch(LOOP);
    t.same(
      [[loopInput.actualQty, actualClash, actualNow, actualRetry], [costSeen?.amount, costClash, costNow, costRetry, deleteClash], [sealClash, sealRetry], [postClash, postNow.version > postSeen.version, postRetry],
        [loopDone.status, loopDone.lines.find((l) => l.id === loopInput.inputId)?.usedQty, loopDone.costs?.[0]?.amount]],
      [[null, 'qty_changed', 71000n, 'ok'], [40000n, 'amount_changed', 45000n, 'ok', 'stale_draft'], ['stale_draft', 'ok'], ['stale_draft', true, 'ok'], ['posted', 72000n, 50000n]],
      'BatchPage (ب٤٢): الكمية الفعلية qty_changed ومبلغ التكلفة amount_changed والختم والترحيل stale_draft — كلّها ممّا تعيد له الصفحة القراءة، والمعاينة الجديدة شرط الحفظ التالي فينجح، والدفعة تُرحَّل بالنسخة الجديدة',
    );
    // وحذف المسوّدة (discard في BatchPage، خارج act) بنسخة البطاقة: جهاز آخر يكتب الوزن، فالحذف stale_draft، والبطاقة الجديدة نسختها فتُحذف (discard_draft يجعلها void).
    const GONE = id(642);
    actAs(U.miller);
    await repo.createProduction(GONE, id(132), 100000n, RAW, FEEDWH, TODAY);
    const goneSeen = await repo.loadBatch(GONE);
    actAs(U.manager);
    await repo.setBatchFields(GONE, { outputQtyKg: 99000n });
    actAs(U.miller);
    const discardClash = await onBatch(repo.discardBatch(GONE, goneSeen.version));
    const discardRetry = await onBatch((async () => repo.discardBatch(GONE, (await repo.loadBatch(GONE)).version))());
    const goneLeft = (await db.admin('select status from public.production_batches where id = $1', [GONE])).rows[0]?.status ?? null;
    t.same([discardClash, discardRetry, goneLeft], ['stale_draft', 'ok', 'void'], 'BatchPage.discard (ب٤٢): الحذف بنسخة قديمة stale_draft ممّا تعيد له الصفحة القراءة، والبطاقة الجديدة نسختها فتُحذف المسوّدة (تصير ملغاة، لا يُمحى صفّها)');
    actAs(U.manager);
    const recipeSeen = await repo.loadRecipe(id(131), id(241));
    const cornSeen = recipeSeen.lines.find((l) => l.itemId === CORN)?.costPrice ?? null;
    const rateSeen = recipeSeen.rates?.[0] ?? null;
    await repo.setItemCostPrice(CORN, 96000n, cornSeen);
    await repo.setRecipeRate(rateSeen?.id ?? '', rateSeen?.amountPerTon ?? 0n, 450000n);
    const priceClash = await onRecipe(repo.setItemCostPrice(CORN, 97000n, cornSeen));
    const rateClash = await onRecipe(repo.setRecipeRate(rateSeen?.id ?? '', rateSeen?.amountPerTon ?? 0n, 500000n));
    const basisClash = await onRecipe(repo.setVersionBasis(id(241), 1000000n, recipeSeen.versionVersion));
    const activateClash = await onRecipe(repo.activateVersion(id(241), recipeSeen.versionVersion));
    const deleteRateClash = await onRecipe(repo.deleteRecipeRate(rateSeen?.id ?? '', recipeSeen.versionVersion));
    const recipeNow = await repo.loadRecipe(id(131), id(241));
    const cornNow = recipeNow.lines.find((l) => l.itemId === CORN)?.costPrice ?? null;
    const rateNow = recipeNow.rates?.find((r) => r.id === rateSeen?.id)?.amountPerTon ?? null;
    const priceRetry = await onRecipe(repo.setItemCostPrice(CORN, 97000n, cornNow));
    const rateRetry = await onRecipe(repo.setRecipeRate(rateSeen?.id ?? '', rateNow ?? 0n, 500000n));
    const basisRetry = await onRecipe((async () => repo.setVersionBasis(id(241), 1000000n, (await repo.loadRecipe(id(131), id(241))).versionVersion))());
    const activateRetry = await onRecipe((async () => repo.activateVersion(id(241), (await repo.loadRecipe(id(131), id(241))).versionVersion))());
    const renewed = await repo.loadRecipe(id(131));
    await repo.setItemCostPrice(CORN, 95000n, 97000n);
    t.same(
      [[cornSeen, priceClash, cornNow, priceRetry], [rateSeen?.amountPerTon, rateClash, rateNow, rateRetry, deleteRateClash], [basisClash, basisRetry], [activateClash, activateRetry],
        [renewed.versionId, renewed.status, renewed.rates?.map((r) => r.amountPerTon)]],
      [[95000n, 'price_changed', 96000n, 'ok'], [400000n, 'amount_changed', 450000n, 'ok', 'stale_draft'], ['ZeroRowsError', 'ok'], ['stale_draft', 'ok'], [id(241), 'active', [500000n]]],
      'RecipePage (ب٤٢): سعر الكلفة price_changed ومبلغ الطنّ amount_changed وحفظ الأساس ZeroRowsError والتفعيل stale_draft — كلّها ممّا تعيد له الصفحة القراءة، وبطاقة الخلطة الجديدة شرط الحفظ التالي فينجح، والنسخة تتفعّل بنسختها الجديدة',
    );
  } finally {
    delete globalThis.__millPg;
  }
  t.same([await nonZero('verify_mill'), await nonZero('verify_stock')], [{}, {}], 'الثوابت صفر بالنهاية (بعد الدمج)');
}
