import type { Day } from '../../domain/dates';
import type { Fils, Milli } from '../../domain/money';
import { BASE_UNITS } from '../../domain/stores';
import type { BaseUnit } from '../../domain/units';
import { call } from './core';
import { arr, bool, count, filsOf, obj, oneOf, qtyOf, RowShapeError, str } from './inventory';

// تقرير إنتاج العليقة (0023 «ترتيب معمل العلف»، كلمة المالك 2026-11-10: «تقرير كامل داخل هذا العلف جدول كالندر… مربعات الاشهر… وطباعة
// تقارير… بهذا الشهر وبهذا اليوم شنو انتجنا… وشنو جانت المواد»؛ عقد scratchpad/mill3/contract-0023.md، A4): قارئ واحد mill_report بمدّة
// (من، إلى) لا تزيد على 366 يوماً، يرجّع أيام الإنتاج (الأيام التي فيها إنتاج وحدها، تصاعدياً) والدفعات المرحَّلة (بلا الملغاة) التي مخزن موادّها
// بنطاق القارئ، وما سُحب من المواد مجموعاً (والوقود والتعبئة بعلامة in_basis = false: خارج كتلة الخلطة)، ومجاميع المدّة. التقويم يقرأ السنة كلّها
// بنداء واحد ويجمع الأيام بالشهر في الشاشة، وتقرير الشهر يقرأ الشهر، وتقرير اليوم يقرأ اليوم. ملف كسول تستورده صفحة التقرير وحدها (حزمة المعمل،
// write-guard PAGE_MODULES)، وindex ما يصدّره.
// الكمية نصّ عشريّ بثلاث مراتب (E3) ← Milli، والمال نصّ بمرتبتين ← Fils. والمال هنا غير محجوب (كلمة المالك «كلشي مفتوح»، لهذا التقرير
// وحده)، فخاناته إلزامية: الغائب خطأ شكل لا «—» صامت. والمفتاح الذي قد تكون قيمته null بقصد (الملاحظة، وكلفة الكيلو لمدّة بلا ناتج، وكتلة
// مادّة لا تُعرف) إلزاميّ الحضور أيضاً (درس 0016: الغائب خطأ شكل، والـnull يُقرأ null).

type Row = Record<string, unknown>;

/** يوم بشكل YYYY-MM-DD (شهر 01–12 ويوم 01–31)، بالشكل وحده كما في dayBalance: الشاشة تحسب منه الشهر والتقويم. */
const DAY_SHAPE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;
const dayOf = (row: Row, field: string): Day => {
  const value = str(row, field);
  if (!DAY_SHAPE.test(value)) throw new RowShapeError(field);
  return value;
};

/** عدد صحيح غير سالب إجباري. */
const nat = (row: Row, field: string): number => {
  const value = count(row, field);
  if (value === null) throw new RowShapeError(field);
  return value;
};

/** مفتاح إلزامي قد تكون قيمته null: null وحدها تُقرأ null، والغائب (undefined) يمرّ بقارئ القيمة فيرمي خطأ شكل. */
const nullableText = (row: Row, field: string): string | null => (row[field] === null ? null : str(row, field));
const nullableQty = (row: Row, field: string): Milli | null => (row[field] === null ? null : qtyOf(row, field));
const nullableFils = (row: Row, field: string): Fils | null => (row[field] === null ? null : filsOf(row, field));

/** العليقة المقروءة (null حين يُقرأ إنتاج كلّ العلائق). */
export interface ReportRecipe {
  id: string;
  name: string;
  outputItemName: string;
}

/** يوم فيه إنتاج: عدد دفعاته وناتجها بالكيلوغرام. */
export interface ReportDay {
  day: Day;
  batches: number;
  outputKg: Milli;
}

/**
 * مال الدفعة: قيمة كلّ ما سُحب من المواد (ومنه مادّة أُكمل بها الطنّ)، وتكاليف التشغيل المحمَّلة عليها من المصاريف المسجّلة (أيدٍ عاملة ونقل لكلّ
 * طنّ…)، والكلفة الكلّية، وكلفة الكيلو (null لدفعة بلا ناتج).
 */
export interface ReportBatchMoney {
  materialsValue: Fils;
  extraValue: Fils;
  totalValue: Fils;
  costPerKg: Fils | null;
}

/** دفعة مرحَّلة في المدّة، بترتيب يوم الإنتاج ثمّ رقم الدفعة. */
export interface ReportBatch {
  id: string;
  docNo: string;
  producedOn: Day;
  recipeName: string;
  outputItemName: string;
  /** الناتج الموزون (أو كتلة المواد بلا هدر). */
  outputKg: Milli;
  /** كتلة المواد الداخلة في الخلطة. */
  massKg: Milli;
  /** الهدر = الكتلة − الناتج (قد يكون سالباً). */
  shrinkKg: Milli;
  note: string | null;
  inputWarehouseName: string;
  outputWarehouseName: string;
  money: ReportBatchMoney;
}

/** ما سُحب من مادّة في المدّة مجموعاً، بالكتلة تنازلياً ثمّ الاسم. */
export interface ReportMaterial {
  itemId: string;
  name: string;
  baseUnit: BaseUnit;
  /** الكمية بوحدة أساس المادّة. */
  qty: Milli;
  /** كتلتها الفعلية بالكيلوغرام (الوقود والتعبئة أيضاً)، أو null إن لم تُعرف. */
  massKg: Milli | null;
  /** داخل كتلة الخلطة: الوقود والتعبئة خارجها (false)، فلا حصّة لهما من الكتلة. */
  inBasis: boolean;
  /** قيمة ما سُحب، ومنه مادّة أُكمل بها الطنّ. */
  value: Fils;
}

export interface ReportTotals {
  batches: number;
  outputKg: Milli;
  massKg: Milli;
  materialsValue: Fils;
  extraValue: Fils;
  totalValue: Fils;
  /** null لمدّة بلا ناتج. */
  costPerKg: Fils | null;
}

export interface MillReport {
  /** يوم الخادم (app_today). */
  today: Day;
  from: Day;
  to: Day;
  recipe: ReportRecipe | null;
  days: readonly ReportDay[];
  batches: readonly ReportBatch[];
  materials: readonly ReportMaterial[];
  totals: ReportTotals;
}

const recipeOf = (row: Row): ReportRecipe | null => {
  if (row.recipe === null) return null;
  const recipe = obj(row.recipe, 'recipe');
  return { id: str(recipe, 'id'), name: str(recipe, 'name'), outputItemName: str(recipe, 'output_item_name') };
};

export function parseMillReport(value: unknown): MillReport {
  const json = obj(value, 'mill_report');
  const totals = obj(json.totals, 'totals');
  return {
    today: dayOf(json, 'today'),
    from: dayOf(json, 'from'),
    to: dayOf(json, 'to'),
    recipe: recipeOf(json),
    days: arr(json.days, 'days').map((entry) => {
      const row = obj(entry, 'days');
      const batches = nat(row, 'batches');
      // الأيام التي فيها إنتاج وحدها: يوم بلا دفعة خطأ شكل (التقويم يلوّنه).
      if (batches < 1) throw new RowShapeError('batches');
      return { day: dayOf(row, 'day'), batches, outputKg: qtyOf(row, 'output_kg') };
    }),
    batches: arr(json.batches, 'batches').map((entry) => {
      const row = obj(entry, 'batches');
      const money = obj(row.money, 'money');
      return {
        id: str(row, 'id'),
        docNo: str(row, 'doc_no'),
        producedOn: dayOf(row, 'produced_on'),
        recipeName: str(row, 'recipe_name'),
        outputItemName: str(row, 'output_item_name'),
        outputKg: qtyOf(row, 'output_kg'),
        massKg: qtyOf(row, 'mass_kg'),
        shrinkKg: qtyOf(row, 'shrink_kg'),
        note: nullableText(row, 'note'),
        inputWarehouseName: str(row, 'input_warehouse_name'),
        outputWarehouseName: str(row, 'output_warehouse_name'),
        money: {
          materialsValue: filsOf(money, 'materials_value'),
          extraValue: filsOf(money, 'extra_value'),
          totalValue: filsOf(money, 'total_value'),
          costPerKg: nullableFils(money, 'cost_per_kg'),
        },
      };
    }),
    materials: arr(json.materials, 'materials').map((entry) => {
      const row = obj(entry, 'materials');
      return {
        itemId: str(row, 'item_id'),
        name: str(row, 'name'),
        baseUnit: oneOf(row, 'base_unit', BASE_UNITS),
        qty: qtyOf(row, 'qty'),
        massKg: nullableQty(row, 'mass_kg'),
        inBasis: bool(row, 'in_basis'),
        value: filsOf(row, 'value'),
      };
    }),
    totals: {
      batches: nat(totals, 'batches'),
      outputKg: qtyOf(totals, 'output_kg'),
      massKg: qtyOf(totals, 'mass_kg'),
      materialsValue: filsOf(totals, 'materials_value'),
      extraValue: filsOf(totals, 'extra_value'),
      totalValue: filsOf(totals, 'total_value'),
      costPerKg: nullableFils(totals, 'cost_per_kg'),
    },
  };
}

/**
 * إنتاج عليقة (أو كلّ العلائق بـnull) في مدّة من يوم إلى يوم بالتقويم، والدفعات التي مخزن موادّها بنطاق القارئ وحدها. يرفض range_too_long
 * (أكثر من 366 يوماً) وbad_range (البداية بعد النهاية) وdate_required (يوم غير محدود)، والرفض بتلميحه العربي من الخادم.
 */
export async function loadMillReport(recipeId: string | null, from: Day, to: Day): Promise<MillReport> {
  return parseMillReport(await call<unknown>('mill_report', { p_recipe: recipeId, p_from: from, p_to: to }));
}
