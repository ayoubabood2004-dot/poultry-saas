import type { SupabaseClient } from '@supabase/supabase-js';
import type { Day } from '../../domain/dates';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import type { Fils } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import { RejectedError, ZeroRowsError } from '../errors';
import { t } from '../i18n';
import './constraints-mill';
import { authed, call, classifyPostgrest, explained, send, updatedRows, type PostgrestFailure } from './core';

// معمل العلف (الهجرة 0015_mill_recipes_production، كلمة المالك 2026-11-03): الخلطة ونسخها وسطورها كتابة مباشرة
// (recipe.activate)، والتفعيل والإنتاج دوالّ (activate_recipe_version وcreate_production وpreview_production
// وpost_production وvoid_production)، والقراءة من أربعة قرّاء. ملف كسول تستورده شاشات المعمل مباشرةً
// (write-guard PAGE_MODULES)، والمال كلّه داخل money (private.mask يشيله عن غير أدوار الكلفة) فيقرأ null.
// النسخة الثانية (0016، كلمة المالك 2026-11-04): بانية الخلطة بنداء واحد (create_recipe)، وتكاليف لكلّ طنّ بالخلطة
// (recipe_cost_rates) وسطور تكاليف الدفعة (production_costs) كتابة مباشرة مشروطة بالمبلغ الذي شافته الشاشة، وإضافة مادّة
// للدفعة أو تبديلها بسبب (add_production_input)، والقرّاء يزيدون الأسعار وكلفة الطنّ المتوقّعة والتكاليف وتحميلاتها.
// الجولة الثالثة: سطر الخلطة يحمل unit_changed (ق٣١، لقطة وحدة الأساس يوم التفعيل تخالف وحدة المادّة الآن) بمفتاح إلزامي، وdraws في
// بطاقة الدفعة المرحَّلة null لمن لا يكون مخزن المدخلات بنطاقه (ق٣٢)، ويوم الإنتاج يُكتب بـsetBatchFields({ producedOn }) (ب٢٦).
// الجولة الرابعة (ق٤٢، ب٣١): سطر الخلطة يحمل unit_mismatch (سطر باللتر ومادّته الآن ليست باللتر) بمفتاح إلزامي، وكتلة السطر وحصّته
// ومجموع الكتلة وكتلة قطعة شريط التركيبة مفاتيح إلزامية قد تكون قيمتها null (القارئ لا يرمي بسطر لا تُعرف كتلته): لا صفر صامت.
// الجولة الخامسة: سطر الخلطة يحمل density_missing (ق٥١، ب٤٩: سائل بلا كثافة، وهو ما يرفض التفعيل لأجله density_required) بمفتاح إلزامي،
// وجواب «نسخة جديدة» يحمل skipped (ق٥٥، ب٤٨: أسماء المواد التي صارت بالقطعة فلم تُنسخ) مصفوفةً إلزامية فارغة غالباً.

export class MillShapeError extends Error {
  constructor(readonly field: string) {
    super(`mill_shape:${field}`);
    this.name = 'MillShapeError';
  }
}

type Row = Record<string, unknown>;

const record = (value: unknown, field: string): Row => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new MillShapeError(field);
  return value as Row;
};
const optRecord = (value: unknown, field: string): Row | null => (value === null || value === undefined ? null : record(value, field));
const list = (value: unknown, field: string): Row[] => {
  if (!Array.isArray(value)) throw new MillShapeError(field);
  return value.map((entry) => record(entry, field));
};
const str = (row: Row, field: string): string => {
  const value = row[field];
  if (typeof value !== 'string' || value === '') throw new MillShapeError(field);
  return value;
};
const optStr = (row: Row, field: string): string | null => (row[field] === null || row[field] === undefined ? null : str(row, field));
const int = (row: Row, field: string): number => {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new MillShapeError(field);
  return value;
};
const flag = (row: Row, field: string): boolean => {
  if (typeof row[field] !== 'boolean') throw new MillShapeError(field);
  return row[field] as boolean;
};
/** مصفوفة أسماء إلزامية (ق٥٥: skipped حاضرة دائماً): الغائبة أو غير المصفوفة أو فيها اسم غير نصّي أو فارغ خطأ شكل لا قائمة فارغة صامتة. */
const names = (row: Row, field: string): string[] => {
  const value = row[field];
  if (!Array.isArray(value)) throw new MillShapeError(field);
  return value.map((entry: unknown) => {
    if (typeof entry !== 'string' || entry === '') throw new MillShapeError(field);
    return entry;
  });
};
/** نصّ عشري بمراتبه ← عدد صحيح بمقياسه (الكمية 3، والمال 2، والكثافة 4). الغائب null، والمكسور يرمي. */
const scaled = (row: Row, field: string, scale: number): bigint | null => {
  const text = row[field];
  if (text === null || text === undefined) return null;
  if (typeof text !== 'string') throw new MillShapeError(field);
  const value = parseDecimal(text, scale);
  if (!value) throw new MillShapeError(field);
  return toScale(value, scale);
};
const qty = (row: Row, field: string): bigint => scaled(row, field, 3) ?? 0n;
/** مبلغ إلزامي (المال داخل صندوق money موجود): الغائب خطأ شكل لا صفر صامت. */
const amount = (row: Row, field: string): Fils => {
  const value = scaled(row, field, 2);
  if (value === null) throw new MillShapeError(field);
  return value;
};
/**
 * مفتاح إلزامي قد تكون قيمته null بقصد (إصلاحات مراجعة 0016): الغائب خطأ شكل، والـnull يُقرأ null. مثل available في المعاينة
 * وallocations في البطاقة لمن لا يرى مصاريف وحدة المدخلات (ق١١)، وdraws لسطر دفعة مسوّدة (ق١٦).
 */
const present = (row: Row, field: string): unknown => {
  if (!(field in row)) throw new MillShapeError(field);
  return row[field];
};
/** مبلغ مفتاحه إلزامي وقيمته قد تكون null (محجوب عن القارئ): الغائب خطأ شكل لا null صامت. */
const nullableAmount = (row: Row, field: string): Fils | null => (present(row, field) === null ? null : amount(row, field));
/**
 * عدد عشري مفتاحه إلزامي وقيمته قد تكون null (ق٤٢: كتلة سطر باللتر بلا كثافة لا تُعرف): الغائب خطأ شكل، والـnull يُقرأ null لا صفراً،
 * فالشاشة تعرض «—» بدل كتلة صفرية تُجمع.
 */
const nullableScaled = (row: Row, field: string, scale: number): bigint | null => (present(row, field) === null ? null : scaled(row, field, scale));
/** صندوق المال: غائب كلّه لغير أدوار الكلفة (private.mask)، فالشاشة تعرض «—» ولا تكسر. */
const moneyBox = (row: Row): Row | null => optRecord(row.money, 'money');
/** المال داخل money: غائب كلّه لغير أدوار الكلفة (private.mask)، فالشاشة تعرض «—» ولا تكسر. */
const money = (row: Row, key: string): Fils | null => {
  const box = moneyBox(row);
  return box ? scaled(box, key, 2) : null;
};
const baseUnit = (row: Row, key: string): BaseUnit => {
  const value = str(row, key);
  if (value !== 'kg' && value !== 'L' && value !== 'pc') throw new MillShapeError(key);
  return value;
};

export type RecipeUnit = 'kg' | 'L';
export type VersionStatus = 'draft' | 'active' | 'retired';
export type BatchStatus = 'draft' | 'posted' | 'void';

export interface OutputItem {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  kind: string;
  tracksExpiry: boolean;
}

export interface RecipeVersionHead {
  id: string;
  versionNo: number;
  basisKg: bigint;
  lines: number;
  version: number;
}

export interface LastBatch {
  id: string;
  docNo: string | null;
  producedOn: Day;
  outputQtyKg: bigint;
  totalValue: Fils | null;
  costPerKg: Fils | null;
}

export interface RecipePiece {
  key: string;
  label: string;
  /** الكتلة بالكيلو (بالآلاف)، أو null حين لا تُعرف (ق٤٢: سطر باللتر بلا كثافة): شريط التركيبة يتخطّاها والرقاقة «—». */
  weight: bigint | null;
  /**
   * داخل كتلة الخلطة (الجولة الثانية، ب٨، من لقطة in_basis على سطر الخلطة): الوقود والتعبئة خارجها، فلا يدخلان شريط التركيبة
   * ولا رقاقاته في شاشة المعمل. المفتاح إلزامي.
   */
  inBasis: boolean;
}

export interface RecipeCard {
  id: string;
  name: string;
  note: string | null;
  archived: boolean;
  version: number;
  outputItem: { id: string; name: string; baseUnit: BaseUnit; kind: string };
  activeId: string | null;
  activeVersionNo: number | null;
  activeBasisKg: bigint | null;
  activeLines: number;
  draft: RecipeVersionHead | null;
  batches: number;
  lastBatch: LastBatch | null;
  lastCostPerKg: Fils | null;
  /**
   * كلفة الكيلو المتوقّعة للتخطيط (0016، ج٧): سعر كلّ مادّة المكتوب وإلّا آخر شراء وإلّا متوسّط المتاح، ومعها تكاليف الطنّ.
   * null: دور بلا كلفة، أو خلطة بلا نسخة مفعَّلة، أو بقيت مادّة بلا سعر (لا رقم ناقص بصمت).
   */
  expectedCostPerKg: Fils | null;
  /** مواد النسخة المفعَّلة بكتلتها بالكيلو من الأكبر (ومعها ما هو خارج الكتلة بعلامته): شريط التركيبة ورقاقاته. */
  pieces: RecipePiece[];
  /** مواد داخل الكتلة لا تظهر في الرقاقات الأربع الأولى. */
  moreLines: number;
}

const CHIPS = 4;

const versionHead = (row: Row): RecipeVersionHead => ({
  id: str(row, 'id'),
  versionNo: int(row, 'version_no'),
  basisKg: qty(row, 'basis_kg'),
  lines: int(row, 'lines'),
  version: typeof row.version === 'number' ? int(row, 'version') : 0,
});

const lastBatch = (value: unknown): LastBatch | null => {
  const row = optRecord(value, 'last_batch');
  if (!row) return null;
  return {
    id: str(row, 'id'),
    docNo: optStr(row, 'doc_no'),
    producedOn: str(row, 'produced_on'),
    outputQtyKg: qty(row, 'output_qty_kg'),
    totalValue: money(row, 'total_value'),
    costPerKg: money(row, 'cost_per_kg'),
  };
};

/** بطاقات الخلطات من جواب recipes_overview (الكائن نفسه يحمل مخازن المعمل ومواد العلف: طلب واحد للشاشة). */
export function parseRecipes(value: unknown): RecipeCard[] {
  const json = record(value, 'overview');
  return list(json.recipes, 'recipes').map((row) => {
    const active = optRecord(row.active, 'active');
    const last = lastBatch(row.last_batch);
    const item = record(row.output_item, 'output_item');
    const pieces = active
      ? list(active.pieces, 'pieces').map((piece) => ({
          key: str(piece, 'item_id'),
          label: str(piece, 'item_name'),
          weight: nullableScaled(piece, 'mass_kg', 3),
          inBasis: flag(piece, 'in_basis'),
        }))
      : [];
    return {
      id: str(row, 'id'),
      name: str(row, 'name'),
      note: optStr(row, 'note'),
      archived: flag(row, 'archived'),
      version: int(row, 'version'),
      outputItem: { id: str(item, 'id'), name: str(item, 'name'), baseUnit: baseUnit(item, 'base_unit'), kind: str(item, 'kind') },
      activeId: active ? str(active, 'id') : null,
      activeVersionNo: active ? int(active, 'version_no') : null,
      activeBasisKg: active ? qty(active, 'basis_kg') : null,
      activeLines: active ? int(active, 'lines') : 0,
      draft: row.draft === null || row.draft === undefined ? null : versionHead(record(row.draft, 'draft')),
      batches: int(row, 'batches'),
      lastBatch: last,
      lastCostPerKg: last?.costPerKg ?? null,
      expectedCostPerKg: money(row, 'expected_cost_per_kg'),
      pieces,
      moreLines: Math.max(0, pieces.filter((piece) => piece.inBasis).length - CHIPS),
    };
  });
}

export interface RecipeLine {
  id: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  kind: string;
  baseUnit: BaseUnit;
  categoryId: string | null;
  categoryName: string | null;
  qty: bigint;
  unit: RecipeUnit;
  /** كتلة السطر بالكيلو، أو null حين لا تُعرف (ق٤٢: سطر باللتر ومادّته بلا كثافة، كسطر unit_mismatch في المسوّدة). */
  massKg: bigint | null;
  /** حصّة السطر من الأساس بمرتبتين، أو null مع الكتلة. */
  sharePct: bigint | null;
  /**
   * داخل كتلة الخلطة (إصلاح ق٣ للمراجعة): الوقود والتعبئة خارجها — يُسحبان وتُحسب كلفتهما، ولا يدخلان مجموع الأساس ولا
   * حصص المواد ولا كتلة المدخلات التي يُحسب منها الهدر.
   */
  inBasis: boolean;
  /** متوسّط المتاح لوحدة الأساس (0015). */
  unitCost: Fils | null;
  /** سعر الكلفة المكتوب لوحدة الأساس (0016، D1): للتخطيط وحده. */
  costPrice: Fils | null;
  /** سعر وحدة الأساس في آخر استلام مرحَّل للمادّة (0016، «سعر الشراء التلقائي»). */
  lastPrice: Fils | null;
  /**
   * وحدة أساس المادّة الآن تخالف لقطتها على السطر يوم التفعيل (الجولة الثالثة، ق٣١): لا يُنتَج بالنسخة (create_production يرفض
   * item_changed) حتّى تُنشأ نسخة جديدة وتُفعَّل. false لسطر المسوّدة (بلا لقطة). المفتاح إلزامي في كلّ سطر.
   */
  unitChanged: boolean;
  /**
   * سطر مكتوب باللتر ومادّته الآن ليست باللتر (الجولة الرابعة، ق٤٢): في المسوّدة لا تُعرف كتلته ولا تُفعَّل النسخة به (bad_recipe_unit)
   * حتّى يُحذف ويُضاف بالكيلوغرام؛ وفي النسخة المجمَّدة تُخطَّط كتلته من لقطة الكثافة (ق٤١). المفتاح إلزامي في كلّ سطر.
   */
  unitMismatch: boolean;
  /**
   * مادّة السطر سائل بلا كثافة (الجولة الخامسة، ق٥١: وحدة الأساس لتر ولا كثافة في اللقطة ولا في المادّة): التفعيل يرفضها density_required،
   * فبطاقة المسوّدة تسمّيها قبل النقر بجملة تقول أين تُكتب الكثافة (ب٤٩). المفتاح إلزامي في كلّ سطر.
   */
  densityMissing: boolean;
}

export interface RecipeVersionRow {
  id: string;
  versionNo: number;
  status: VersionStatus;
  basisKg: bigint;
  activatedAt: string | null;
  version: number;
}

export interface PickItem {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  categoryName: string | null;
}

/** معدّل تكاليف لكلّ طنّ بالخلطة (0016، D2 وD3): مبلغ بفئة مصروف. */
export interface RecipeRate {
  id: string;
  lineNo: number;
  categoryId: string;
  categoryName: string;
  amountPerTon: Fils;
}

/** كلفة الطنّ المتوقّعة للتخطيط من الخادم (0016، ج٧)، وunpriced عدد المواد بلا أيّ سعر (لم تُحسب). */
export interface RecipeExpected {
  materialsPerTon: Fils;
  ratesPerTon: Fils;
  costPerTon: Fils;
  unpriced: number;
}

export interface CategoryOption {
  id: string;
  name: string;
}

export interface RecipeDetail {
  id: string;
  name: string;
  note: string | null;
  archived: boolean;
  version: number;
  outputItem: OutputItem;
  versions: RecipeVersionRow[];
  versionId: string | null;
  versionNo: number | null;
  status: VersionStatus | null;
  basisKg: bigint;
  versionVersion: number;
  lines: RecipeLine[];
  /** مجموع كتلة ما داخل الكتلة، أو null: خلطة بلا نسخة، أو سطر داخل الكتلة لا تُعرف كتلته (ق٤٢). */
  massKg: bigint | null;
  /** مواد مرشَّحة لسطر جديد: فعّالة، يستلمها مخزن المواد الأوّلية، وتُقاس بالكيلو أو اللتر. */
  pickItems: PickItem[];
  /** معدّلات تكاليف الطنّ للنسخة المختارة، أو null لغير أدوار الكلفة. */
  rates: RecipeRate[] | null;
  /** كلفة الطنّ المتوقّعة، أو null (دور بلا كلفة، أو خلطة بلا نسخة). */
  expected: RecipeExpected | null;
  /** فئات المصاريف الفعّالة غير النظامية لمنتقي المعدّلات (بلا مال). */
  expenseCategories: CategoryOption[];
}

const versionStatus = (row: Row): VersionStatus => {
  const value = str(row, 'status');
  if (value !== 'draft' && value !== 'active' && value !== 'retired') throw new MillShapeError('status');
  return value;
};

const nonNegative = (row: Row, field: string): number => {
  const value = int(row, field);
  if (value < 0) throw new MillShapeError(field);
  return value;
};

const category = (row: Row): CategoryOption => ({ id: str(row, 'id'), name: str(row, 'name') });

function expectedOf(value: unknown): RecipeExpected | null {
  const row = optRecord(value, 'expected');
  if (!row) return null;
  return {
    materialsPerTon: amount(row, 'materials_per_ton'),
    ratesPerTon: amount(row, 'rates_per_ton'),
    costPerTon: amount(row, 'cost_per_ton'),
    unpriced: nonNegative(row, 'unpriced'),
  };
}

export function parseRecipe(value: unknown): RecipeDetail {
  const json = record(value, 'recipe');
  const item = record(json.output_item, 'output_item');
  const version = optRecord(json.selected, 'selected');
  const box = moneyBox(json);
  return {
    id: str(json, 'id'),
    name: str(json, 'name'),
    note: optStr(json, 'note'),
    archived: flag(json, 'archived'),
    version: int(json, 'version'),
    outputItem: {
      id: str(item, 'id'),
      name: str(item, 'name'),
      baseUnit: baseUnit(item, 'base_unit'),
      kind: str(item, 'kind'),
      tracksExpiry: flag(item, 'tracks_expiry'),
    },
    versions: list(json.versions, 'versions').map((row) => ({
      id: str(row, 'id'),
      versionNo: int(row, 'version_no'),
      status: versionStatus(row),
      basisKg: qty(row, 'basis_kg'),
      activatedAt: optStr(row, 'activated_at'),
      version: int(row, 'version'),
    })),
    versionId: version ? str(version, 'id') : null,
    versionNo: version ? int(version, 'version_no') : null,
    status: version ? versionStatus(version) : null,
    basisKg: version ? qty(version, 'basis_kg') : 0n,
    versionVersion: version ? int(version, 'version') : 0,
    lines: list(json.lines, 'lines').map((row) => ({
      id: str(row, 'id'),
      lineNo: int(row, 'line_no'),
      itemId: str(row, 'item_id'),
      itemName: str(row, 'item_name'),
      kind: str(row, 'kind'),
      baseUnit: baseUnit(row, 'base_unit'),
      categoryId: optStr(row, 'category_id'),
      categoryName: optStr(row, 'category_name'),
      qty: qty(row, 'qty'),
      unit: str(row, 'unit') === 'L' ? 'L' : 'kg',
      massKg: nullableScaled(row, 'mass_kg', 3),
      sharePct: nullableScaled(row, 'share_pct', 2),
      inBasis: flag(row, 'in_basis'),
      unitCost: money(row, 'unit_cost'),
      costPrice: money(row, 'cost_price'),
      lastPrice: money(row, 'last_price'),
      unitChanged: flag(row, 'unit_changed'),
      unitMismatch: flag(row, 'unit_mismatch'),
      densityMissing: flag(row, 'density_missing'),
    })),
    massKg: nullableScaled(json, 'mass_kg', 3),
    pickItems: list(json.pick_items, 'pick_items').map((row) => ({
      id: str(row, 'id'),
      name: str(row, 'name'),
      baseUnit: baseUnit(row, 'base_unit'),
      categoryName: optStr(row, 'category_name'),
    })),
    rates: box
      ? list(box.rates, 'rates').map((row) => ({
          id: str(row, 'id'),
          lineNo: int(row, 'line_no'),
          categoryId: str(row, 'category_id'),
          categoryName: str(row, 'category_name'),
          amountPerTon: amount(row, 'amount_per_ton'),
        }))
      : null,
    expected: box ? expectedOf(box.expected) : null,
    expenseCategories: list(json.expense_categories, 'expense_categories').map(category),
  };
}

export interface PreviewLine {
  inputId: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  plannedQty: bigint;
  actualQty: bigint | null;
  drawQty: bigint;
  inBasis: boolean;
  value: Fils | null;
}

export interface MillProblem {
  code: string;
  itemName: string | null;
  /** كميات مشكلة الرصيد (بالآلاف من وحدة الأساس). */
  need: bigint | null;
  have: bigint | null;
  /**
   * مشكلة costs_unfunded (0016): الفئة، والمطلوب والمتاح مالاً — لمن يرى الكلفة ومصاريف وحدة المدخلات (ق١١)، ولغيره الرمز وحده.
   */
  categoryId: string | null;
  categoryName: string | null;
  needAmount: Fils | null;
  haveAmount: Fils | null;
  /** مشكلة output_expired (ق٨): تاريخ انتهاء الناتج المكتوب ويوم الإنتاج الذي سبقه. */
  expiryOn: Day | null;
  producedOn: Day | null;
  /**
   * مشكلة costs_unsealed_scope (الجولة الثانية، ق٢١): وحدة مخزن المدخلات التي تُحمَّل التكاليف من مصاريفها وهي خارج نطاق القارئ،
   * فيختمها محاسب أو مدير يراها ثمّ تُرحَّل. إلزامي لهذا الرمز، وnull لغيره.
   */
  divisionName: string | null;
  /**
   * جملة الخادم لمشكلة التاريخ (private.date_problem منذ 0015: date_too_old وperiod_locked وbefore_go_live…) بتواريخها، فتعرضها الصفحة
   * بدل الرمز الخام (صفحة الدفعة لا تغيّر يومها، فالمسوّدة تكبر عليه). null للمشاكل التي لا يرسل لها الخادم جملة.
   */
  hint: string | null;
}

/** تحميل سطر تكاليف من مصروف مسجّل (0016، القاعدة ٢٠): يكتبه الترحيل وحده. */
export interface CostAllocation {
  expenseId: string;
  onDate: Day;
  amount: Fils;
  label: string;
}

export type CostSource = 'recipe' | 'manual';

/** سطر تكاليف الدفعة (0016): المحسوب من الخلطة (planned) والمبلغ الذي يُرحَّل، والمتاح من المصاريف في المعاينة. */
export interface BatchCost {
  id: string;
  lineNo: number;
  categoryId: string;
  categoryName: string;
  /** المحسوب من معدّل الخلطة لحظة إنشاء الدفعة، أو null للسطر اليدوي. */
  plannedAmount: Fils | null;
  amount: Fils;
  source: CostSource;
  /**
   * المتبقّي غير المحمَّل من المصاريف المؤهّلة (المعاينة فقط، بلا أقفال)، وnull في بطاقة الدفعة، وnull في المعاينة لمن لا يرى
   * مصاريف وحدة المدخلات (ق١١): لا رقم يُعرض.
   */
  available: Fils | null;
  /**
   * تحميلاته الفعّالة (بطاقة الدفعة فقط)، وفارغة في المعاينة؛ وnull = محجوبة (ق١١): القارئ لا يرى مصاريف وحدة المدخلات، فالشاشة
   * تقول إنّها محمَّلة من مصاريف وحدة خارج نطاقه بلا أرقام.
   */
  allocations: CostAllocation[] | null;
}

export interface ProductionPreview {
  id: string;
  status: BatchStatus;
  version: number;
  producedOn: Day;
  plannedKg: bigint;
  inputMassKg: bigint;
  outputQtyKg: bigint;
  outputExpiryOn: Day | null;
  shrinkKg: bigint;
  shrinkReason: string | null;
  shrinkOk: boolean;
  costsConfirmed: boolean;
  /** مخزن المدخلات ووحدته (ق١٥): التكاليف تُحمَّل من مصاريف هذه الوحدة وحدها، فالتنبيه ورابط «سجّل مصروفاً» يسمّيانها. */
  inputWarehouse: InputWarehouse;
  outputWarehouse: { id: string; name: string };
  lines: PreviewLine[];
  problems: MillProblem[];
  canPost: boolean;
  planToken: string;
  inputValue: Fils | null;
  /** مجموع سطور التكاليف (0016)؛ الكلفة الكلّية = المواد + هذا. */
  extraValue: Fils | null;
  totalValue: Fils | null;
  costPerKg: Fils | null;
  /** سطور التكاليف بالمتاح لكلّ سطر، أو null لغير أدوار الكلفة. */
  costs: BatchCost[] | null;
  /**
   * يرى القارئ مصاريف وحدة مخزن المدخلات (الجولة الثانية، ق٢١: can_see_cost وفي نطاقه تلك الوحدة): بلاها لا يكتب مبلغ تكلفة ولا
   * يختمها ولا يسجّل مصروفاً منها. ليس مالاً، فهو على الجذر خارج money، وإلزامي.
   */
  expensesVisible: boolean;
}

const batchStatus = (row: Row): BatchStatus => {
  const value = str(row, 'status');
  if (value !== 'draft' && value !== 'posted' && value !== 'void') throw new MillShapeError('status');
  return value;
};

const warehouse = (value: unknown, field_: string): { id: string; name: string } => {
  const row = record(value, field_);
  return { id: str(row, 'id'), name: str(row, 'name') };
};

export interface InputWarehouse {
  id: string;
  name: string;
  divisionId: string;
  divisionName: string;
}

/** مخزن المدخلات في المعاينة بوحدته (ق١٥): مفتاحا الوحدة إلزاميان. */
const inputWarehouseOf = (value: unknown): InputWarehouse => {
  const row = record(value, 'input_warehouse');
  return { id: str(row, 'id'), name: str(row, 'name'), divisionId: str(row, 'division_id'), divisionName: str(row, 'division_name') };
};

const costSource = (row: Row): CostSource => {
  const value = str(row, 'source');
  if (value !== 'recipe' && value !== 'manual') throw new MillShapeError('source');
  return value;
};

/** تحميلات سطر التكاليف في البطاقة: المفتاح إلزامي، وnull = محجوبة عن القارئ (ق١١)، وإلّا قائمة. */
function allocationsOf(row: Row): CostAllocation[] | null {
  const value = present(row, 'allocations');
  if (value === null) return null;
  return list(value, 'allocations').map((entry) => ({
    expenseId: str(entry, 'expense_id'),
    onDate: str(entry, 'on_date'),
    amount: amount(entry, 'amount'),
    label: str(entry, 'label'),
  }));
}

/** سطر تكاليف: المعاينة تحمل available ولا تحميلات، وبطاقة الدفعة تحمل التحميلات ولا available. */
function costOf(row: Row, from: 'preview' | 'detail'): BatchCost {
  return {
    id: str(row, 'cost_id'),
    lineNo: int(row, 'line_no'),
    categoryId: str(row, 'category_id'),
    categoryName: str(row, 'category_name'),
    plannedAmount: scaled(row, 'planned_amount', 2),
    amount: amount(row, 'amount'),
    source: costSource(row),
    available: from === 'preview' ? nullableAmount(row, 'available') : null,
    allocations: from === 'detail' ? allocationsOf(row) : [],
  };
}

function problemOf(row: Row): MillProblem {
  const code = str(row, 'code');
  // costs_unfunded: need وhave مال بمرتبتين (لمن يرى مصاريف الوحدة فقط)، وغيرها كميات بثلاث.
  const funds = code === 'costs_unfunded';
  // output_expired (ق٨): التاريخان إلزاميان، فالجملة تسمّيهما.
  const expired = code === 'output_expired';
  // costs_unsealed_scope (ق٢١): اسم الوحدة إلزامي، فالجملة تسمّيها.
  const unsealed = code === 'costs_unsealed_scope';
  return {
    code,
    itemName: optStr(row, 'item_name'),
    need: funds ? null : scaled(row, 'need', 3),
    have: funds ? null : scaled(row, 'have', 3),
    categoryId: optStr(row, 'category_id'),
    categoryName: optStr(row, 'category_name'),
    needAmount: funds ? scaled(row, 'need', 2) : null,
    haveAmount: funds ? scaled(row, 'have', 2) : null,
    expiryOn: expired ? str(row, 'expiry_on') : null,
    producedOn: expired ? str(row, 'produced_on') : null,
    divisionName: unsealed ? str(row, 'division_name') : null,
    hint: optStr(row, 'hint'),
  };
}

export function parsePreview(value: unknown): ProductionPreview {
  const json = record(value, 'preview');
  const box = moneyBox(json);
  return {
    id: str(json, 'id'),
    status: batchStatus(json),
    version: int(json, 'version'),
    producedOn: str(json, 'produced_on'),
    plannedKg: qty(json, 'planned_kg'),
    inputMassKg: qty(json, 'input_mass_kg'),
    outputQtyKg: qty(json, 'output_qty_kg'),
    outputExpiryOn: optStr(json, 'output_expiry_on'),
    shrinkKg: qty(json, 'shrink_kg'),
    shrinkReason: optStr(json, 'shrink_reason'),
    shrinkOk: flag(json, 'shrink_ok'),
    costsConfirmed: flag(json, 'costs_confirmed'),
    inputWarehouse: inputWarehouseOf(json.input_warehouse),
    outputWarehouse: warehouse(json.output_warehouse, 'output_warehouse'),
    lines: list(json.lines, 'lines').map((row) => ({
      inputId: str(row, 'input_id'),
      lineNo: int(row, 'line_no'),
      itemId: str(row, 'item_id'),
      itemName: str(row, 'item_name'),
      baseUnit: baseUnit(row, 'base_unit'),
      plannedQty: qty(row, 'planned_qty'),
      actualQty: scaled(row, 'actual_qty', 3),
      drawQty: qty(row, 'draw_qty'),
      inBasis: flag(row, 'in_basis'),
      value: money(row, 'value'),
    })),
    problems: list(json.problems, 'problems').map(problemOf),
    canPost: flag(json, 'can_post'),
    planToken: str(json, 'plan_token'),
    inputValue: money(json, 'input_value'),
    extraValue: money(json, 'extra_value'),
    totalValue: money(json, 'total_value'),
    costPerKg: money(json, 'cost_per_kg'),
    costs: box ? list(box.costs, 'costs').map((row) => costOf(row, 'preview')) : null,
    expensesVisible: flag(json, 'expenses_visible'),
  };
}

/** وجبة سُحب منها سطر الدفعة المرحَّلة (draws في production_detail، ق١٦): الكمية ومصدر الوجبة بترتيب السحب. */
export interface LotDraw {
  lotId: string;
  qty: bigint;
  receivedOn: Day;
  /** رقم مستند الوجبة («RC-2026-0004» أو «رصيد افتتاح بتاريخ …»). */
  source: string;
}

export interface BatchLine {
  id: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  plannedQty: bigint;
  actualQty: bigint | null;
  usedQty: bigint | null;
  inBasis: boolean;
  /** مادّة بديلة (القاعدة ١٩) وسببها الإلزامي، واسم المادّة التي حلّت محلّها (0016). */
  isSubstitute: boolean;
  reason: string | null;
  replacedItemName: string | null;
  value: Fils | null;
  /**
   * الوجبات التي سُحب منها السطر بعد الترحيل (ق١٦)، وnull للمسوّدة؛ وnull للمرحَّلة حين لا يكون مخزن المدخلات بنطاق القارئ (الجولة
   * الثالثة، ق٣٢: طرف الناتج يرى المواد وكمياتها لا وجبات مخزن المواد واستلاماتها). المفتاح إلزامي في كلّ سطر.
   */
  draws: LotDraw[] | null;
}

export interface ProductionBatch {
  id: string;
  docNo: string | null;
  status: BatchStatus;
  version: number;
  producedOn: Day;
  plannedKg: bigint;
  outputQtyKg: bigint;
  outputExpiryOn: Day | null;
  inputMassKg: bigint;
  shrinkKg: bigint;
  shrinkReason: string | null;
  note: string | null;
  voidReason: string | null;
  costsConfirmed: boolean;
  recipeId: string;
  recipeName: string;
  versionNo: number;
  basisKg: bigint;
  outputItem: { id: string; name: string; baseUnit: BaseUnit; tracksExpiry: boolean };
  inputWarehouse: { id: string; name: string };
  outputWarehouse: { id: string; name: string };
  lines: BatchLine[];
  inputValue: Fils | null;
  extraValue: Fils | null;
  totalValue: Fils | null;
  costPerKg: Fils | null;
  /** سطور التكاليف بتحميلاتها، أو null لغير أدوار الكلفة. */
  costs: BatchCost[] | null;
  /** يرى القارئ مصاريف وحدة مخزن المدخلات (ق٢١)، كما في المعاينة. */
  expensesVisible: boolean;
  /**
   * طرفا الدفعة في نطاق القارئ (الجولة الثانية، ق٢٥: الدفعة تُقرأ من مخزن المواد أو مخزن العلف كالتحويل): بلا input لا معاينة
   * ولا فعل مسوّدة ولا إلغاء ولا رابط دفتر في مخزن المواد، وبلا output لا رابط وجبات العلف. المفتاح وطرفاه إلزاميان.
   */
  scope: { input: boolean; output: boolean };
}

/**
 * الوجبات المسحوبة لسطر الدفعة (ق١٦): المفتاح إلزامي (الغائب خطأ شكل)، وnull للمسوّدة ولطرف الناتج (ق٣٢)، وإلّا قائمة بترتيب السحب.
 */
function drawsOf(row: Row): LotDraw[] | null {
  const value = present(row, 'draws');
  if (value === null) return null;
  return list(value, 'draws').map((entry) => ({ lotId: str(entry, 'lot_id'), qty: qty(entry, 'qty'), receivedOn: str(entry, 'received_on'), source: str(entry, 'source') }));
}

/** طرفا الدفعة في نطاق القارئ (ق٢٥): المفتاح وطرفاه إلزاميان، فالغائب خطأ شكل لا «في النطاق» صامت. */
function scopeOf(value: unknown): { input: boolean; output: boolean } {
  const row = record(value, 'scope');
  return { input: flag(row, 'input'), output: flag(row, 'output') };
}

export function parseBatch(value: unknown): ProductionBatch {
  const json = record(value, 'batch');
  const recipe = record(json.recipe, 'recipe');
  const item = record(json.output_item, 'output_item');
  const box = moneyBox(json);
  return {
    id: str(json, 'id'),
    docNo: optStr(json, 'doc_no'),
    status: batchStatus(json),
    version: int(json, 'version'),
    producedOn: str(json, 'produced_on'),
    plannedKg: qty(json, 'planned_kg'),
    outputQtyKg: qty(json, 'output_qty_kg'),
    outputExpiryOn: optStr(json, 'output_expiry_on'),
    inputMassKg: qty(json, 'input_mass_kg'),
    shrinkKg: qty(json, 'shrink_kg'),
    shrinkReason: optStr(json, 'shrink_reason'),
    note: optStr(json, 'note'),
    voidReason: optStr(json, 'void_reason'),
    costsConfirmed: flag(json, 'costs_confirmed'),
    recipeId: str(recipe, 'id'),
    recipeName: str(recipe, 'name'),
    versionNo: int(recipe, 'version_no'),
    basisKg: qty(recipe, 'basis_kg'),
    outputItem: { id: str(item, 'id'), name: str(item, 'name'), baseUnit: baseUnit(item, 'base_unit'), tracksExpiry: flag(item, 'tracks_expiry') },
    inputWarehouse: warehouse(json.input_warehouse, 'input_warehouse'),
    outputWarehouse: warehouse(json.output_warehouse, 'output_warehouse'),
    lines: list(json.lines, 'lines').map((row) => ({
      id: str(row, 'id'),
      lineNo: int(row, 'line_no'),
      itemId: str(row, 'item_id'),
      itemName: str(row, 'item_name'),
      baseUnit: baseUnit(row, 'base_unit'),
      plannedQty: qty(row, 'planned_qty'),
      actualQty: scaled(row, 'actual_qty', 3),
      usedQty: scaled(row, 'used_qty', 3),
      inBasis: flag(row, 'in_basis'),
      isSubstitute: flag(row, 'is_substitute'),
      reason: optStr(row, 'reason'),
      replacedItemName: optStr(row, 'replaced_item_name'),
      value: money(row, 'value'),
      draws: drawsOf(row),
    })),
    inputValue: money(json, 'input_value'),
    extraValue: money(json, 'extra_value'),
    totalValue: money(json, 'total_value'),
    costPerKg: money(json, 'cost_per_kg'),
    costs: box ? list(box.costs, 'costs').map((row) => costOf(row, 'detail')) : null,
    expensesVisible: flag(json, 'expenses_visible'),
    scope: scopeOf(json.scope),
  };
}

export interface ProductionRow {
  id: string;
  docNo: string | null;
  status: BatchStatus;
  producedOn: Day;
  recipeName: string;
  outputItemName: string;
  outputQtyKg: bigint;
  shrinkKg: bigint;
  totalValue: Fils | null;
  costPerKg: Fils | null;
}

export interface DraftRow {
  id: string;
  producedOn: Day;
  plannedKg: bigint;
  recipeName: string;
  outputItemName: string;
  inputWarehouseName: string;
  outputWarehouseName: string;
  version: number;
  costsConfirmed: boolean;
  lines: number;
}

export interface ProductionsPage {
  drafts: DraftRow[];
  rows: ProductionRow[];
  total: number | null;
}

export function parseProductions(value: unknown): ProductionsPage {
  const json = record(value, 'productions');
  return {
    drafts: list(json.drafts, 'drafts').map((row) => ({
      id: str(row, 'id'),
      producedOn: str(row, 'produced_on'),
      plannedKg: qty(row, 'planned_kg'),
      recipeName: str(row, 'recipe_name'),
      outputItemName: str(row, 'output_item_name'),
      inputWarehouseName: str(row, 'input_warehouse_name'),
      outputWarehouseName: str(row, 'output_warehouse_name'),
      version: int(row, 'version'),
      costsConfirmed: flag(row, 'costs_confirmed'),
      lines: int(row, 'lines'),
    })),
    rows: list(json.rows, 'rows').map((row) => ({
      id: str(row, 'id'),
      docNo: optStr(row, 'doc_no'),
      status: batchStatus(row),
      producedOn: str(row, 'produced_on'),
      recipeName: str(row, 'recipe_name'),
      outputItemName: str(row, 'output_item_name'),
      outputQtyKg: qty(row, 'output_qty_kg'),
      shrinkKg: qty(row, 'shrink_kg'),
      totalValue: money(row, 'total_value'),
      costPerKg: money(row, 'cost_per_kg'),
    })),
    total: typeof json.total === 'number' ? int(json, 'total') : null,
  };
}

// ─── القراءة ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface MillStore {
  id: string;
  name: string;
  kind: 'raw' | 'feed';
}

export interface MillHome {
  /** يوم الخادم (بغداد): تاريخ الدفعة الجديدة، فلا يختلف عن يوم العمل بساعة الجهاز. */
  today: string;
  recipes: RecipeCard[];
  stores: MillStore[];
  feedItems: { id: string; name: string }[];
  productions: ProductionsPage;
}

const storesOf = (json: Row): MillStore[] =>
  list(json.stores, 'stores').map((row) => ({ id: str(row, 'id'), name: str(row, 'name'), kind: str(row, 'kind') === 'feed' ? 'feed' : 'raw' }));
const feedItemsOf = (json: Row): { id: string; name: string }[] => list(json.feed_items, 'feed_items').map((row) => ({ id: str(row, 'id'), name: str(row, 'name') }));

export async function loadRecipes(): Promise<RecipeCard[]> {
  return parseRecipes(await call<unknown>('recipes_overview'));
}

/** شاشة المعمل بطلبين متوازيين: الخلطات بمخازنها ومواد علفها، ودفعات الإنتاج. */
export async function loadMill(): Promise<MillHome> {
  const [overview, productions] = await Promise.all([call<unknown>('recipes_overview'), call<unknown>('productions_overview', { p_after: null, p_limit: 30 })]);
  const json = record(overview, 'overview');
  return {
    today: str(json, 'today'),
    recipes: parseRecipes(overview),
    stores: storesOf(json),
    feedItems: feedItemsOf(json),
    productions: parseProductions(productions),
  };
}

/**
 * فئات المصاريف الفعّالة غير النظامية (منتقي تكاليف الدفعة وبانية الخلطة): نفس شرط حارسَي recipe_cost_rates وproduction_costs،
 * فلا تُعرض فئة يرفضها الخادم. قراءة مباشرة بسياسة المنشأة (البيانات الأساسية بلا مال).
 */
export async function loadExpenseCategories(): Promise<CategoryOption[]> {
  const { result, wasOnline } = await send(
    (db) => db.from('expense_categories').select('id, name').is('archived_at', null).is('system_code', null).order('name').order('id'),
    (answer) => [answer],
  );
  if (result.error) throw classifyPostgrest(result.error, result.status, 'table', wasOnline);
  return ((result.data ?? []) as Row[]).map(category);
}

export interface BuilderData {
  /** مواد العلف الجاهز (منتج الخلطة). */
  feedItems: { id: string; name: string }[];
  /** أسماء الخلطات غير المؤرشفة (الخادم يرفض الاسم المكرّر recipe_name_taken، والشاشة تقوله قبل الإرسال). */
  recipeNames: string[];
  stores: MillStore[];
  categories: CategoryOption[];
}

/** بانية الخلطة الجديدة: مواد العلف والخلطات القائمة من recipes_overview، وفئات المصاريف لتكاليف الطنّ. */
export async function loadBuilder(): Promise<BuilderData> {
  const [overview, categories] = await Promise.all([call<unknown>('recipes_overview'), loadExpenseCategories()]);
  const json = record(overview, 'overview');
  return {
    feedItems: feedItemsOf(json),
    recipeNames: parseRecipes(overview)
      .filter((recipe) => !recipe.archived)
      .map((recipe) => recipe.name),
    stores: storesOf(json),
    categories,
  };
}

export async function loadRecipe(recipeId: string, versionId: string | null = null): Promise<RecipeDetail> {
  return parseRecipe(await call<unknown>('recipe_detail', { p_id: recipeId, p_version: versionId }));
}

export async function loadProductions(after: Record<string, unknown> | null = null, limit = 30): Promise<ProductionsPage> {
  return parseProductions(await call<unknown>('productions_overview', { p_after: after, p_limit: limit }));
}

export async function loadBatch(batchId: string): Promise<ProductionBatch> {
  return parseBatch(await call<unknown>('production_detail', { p_id: batchId }));
}

export async function previewProduction(batchId: string): Promise<ProductionPreview> {
  return parsePreview(await call<unknown>('preview_production', { p_id: batchId }));
}

// ─── الكتابة المباشرة (الخلطة ونسخها وسطورها) ───────────────────────────────────────────────────────────────────

type Raw = { data: unknown; error: PostgrestFailure | null; status: number };
type Failed = PostgrestFailure & { status: number };

const withStatus = (answer: Raw) => ({ data: answer.data as Row | Row[] | null, error: answer.error ? { ...answer.error, status: answer.status } : null });
const failed = (error: unknown): error is Failed => typeof error === 'object' && error !== null && typeof (error as Failed).status === 'number';

/** كتابة مباشرة بـupdatedRows: صفر صفوف = تغيّرت بعد ما انفتحت الشاشة (ZeroRowsError)، وخطأ القاعدة يتصنّف. */
async function written(make: (db: SupabaseClient) => Promise<Row[]>): Promise<Row> {
  const { result, wasOnline } = await send(
    async (db): Promise<{ rows: Row[]; error: PostgrestFailure | null; status: number }> => {
      try {
        return { rows: await make(db), error: null, status: 200 };
      } catch (error) {
        if (!failed(error)) throw error;
        return { rows: [], error, status: error.status };
      }
    },
    (answer) => [answer],
  );
  if (result.error) throw await explained(classifyPostgrest(result.error, result.status, 'table', wasOnline));
  const [row] = result.rows;
  if (!row) throw new ZeroRowsError();
  return row;
}

/** صفّ واحد بقراءة مباشرة (بعد كتابة مشروطة رجعت بصفر صفوف أو 23505)، أو null إن لم يكن. */
async function oneRow(make: (db: SupabaseClient) => PromiseLike<{ data: unknown; error: PostgrestFailure | null; status: number }>): Promise<Row | null> {
  const { result, wasOnline } = await send(make, (answer) => [answer]);
  if (result.error) throw classifyPostgrest(result.error, result.status, 'table', wasOnline);
  const rows = Array.isArray(result.data) ? (result.data as Row[]) : [];
  return rows[0] ?? null;
}

export function renameRecipe(recipeId: string, name: string, version: number): Promise<string> {
  return written(async (db) =>
    updatedRows(withStatus(await db.from('recipes').update({ name: name.trim() }).eq('id', recipeId).eq('version', version).select('id'))),
  ).then((row) => str(row, 'id'));
}

export function archiveRecipe(recipeId: string, version: number, archived: boolean): Promise<string> {
  return written(async (db) =>
    updatedRows(withStatus(await db.from('recipes').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', recipeId).eq('version', version).select('id'))),
  ).then((row) => str(row, 'id'));
}

export function setVersionBasis(versionId: string, basisKg: bigint, version: number): Promise<string> {
  return written(async (db) =>
    updatedRows(withStatus(await db.from('recipe_versions').update({ basis_kg: decimalText(basisKg, 3) }).eq('id', versionId).eq('version', version).select('id'))),
  ).then((row) => str(row, 'id'));
}

export function addRecipeLine(versionId: string, itemId: string, qtyValue: bigint, unit: RecipeUnit): Promise<string> {
  return written(async (db) =>
    updatedRows(withStatus(await db.from('recipe_lines').insert({ version_id: versionId, item_id: itemId, qty: decimalText(qtyValue, 3), unit }).select('id'))),
  ).then((row) => str(row, 'id'));
}

export function setRecipeLine(lineId: string, qtyValue: bigint, unit: RecipeUnit): Promise<string> {
  return written(async (db) =>
    updatedRows(withStatus(await db.from('recipe_lines').update({ qty: decimalText(qtyValue, 3), unit }).eq('id', lineId).select('id'))),
  ).then((row) => str(row, 'id'));
}

export function deleteRecipeLine(lineId: string, versionVersion: number): Promise<unknown> {
  return call<unknown>('delete_draft_line', { p_doc_kind: 'recipe_line', p_line_id: lineId, p_expected_version: versionVersion });
}

/** تعديل مسوّدة الدفعة: وزن الناتج وتاريخ انتهائه وسبب الهدر والتاريخ (الخادم يزيد النسخة). */
export function setBatchFields(
  batchId: string,
  fields: { producedOn?: Day; outputQtyKg?: bigint | null; outputExpiryOn?: Day | null; shrinkReason?: string | null; note?: string | null },
): Promise<string> {
  const patch: Row = {};
  if (fields.producedOn !== undefined) patch.produced_on = fields.producedOn;
  if (fields.outputQtyKg !== undefined) patch.output_qty_kg = fields.outputQtyKg === null ? null : decimalText(fields.outputQtyKg, 3);
  if (fields.outputExpiryOn !== undefined) patch.output_expiry_on = fields.outputExpiryOn;
  if (fields.shrinkReason !== undefined) patch.shrink_reason = fields.shrinkReason?.trim() || null;
  if (fields.note !== undefined) patch.note = fields.note?.trim() || null;
  return written(async (db) => updatedRows(withStatus(await db.from('production_batches').update(patch).eq('id', batchId).select('id')))).then((row) => str(row, 'id'));
}

const qtyText = (value: bigint | null): string | null => (value === null ? null : decimalText(value, 3));
const moneyText = (value: Fils): string => decimalText(value, 2);

function qtyChanged(): RejectedError {
  return new RejectedError(
    'qty_changed',
    t('mill.input.changed', 'تغيّرت الكمية الفعلية لهذه المادّة من نافذة أو جهاز آخر بعد أن بدأت تعديلها؛ قُرئت من جديد، فراجعها واحفظ مرّة أخرى.'),
  );
}

/**
 * الكمية الفعلية الموزونة لمدخل (القاعدة ١٩): المرحَّل هو هذه، والفارغة تعني «كما خُطّط». الكتابة مشروطة بالقيمة التي شافتها
 * الشاشة حين بدأ التعديل (درس WP6): صفر صفوف يقرأ الصفّ — المطلوب = انكتب (جواب ضاع)، وإلّا qty_changed ولا يُداس كاتب ثانٍ.
 */
export async function setInputActual(inputId: string, before: bigint | null, actual: bigint | null): Promise<void> {
  if (before === actual) return;
  try {
    await written(async (db) =>
      updatedRows(
        withStatus(
          await db
            .from('production_inputs')
            .update({ actual_qty_base: qtyText(actual) })
            .eq('id', inputId)
            .filter('actual_qty_base', before === null ? 'is' : 'eq', qtyText(before))
            .select('id'),
        ),
      ),
    );
  } catch (error) {
    if (!(error instanceof ZeroRowsError)) throw error;
    const now = await oneRow((db) => db.from('production_inputs').select('actual_qty_base::text').eq('id', inputId));
    if (now && scaled(now, 'actual_qty_base', 3) === actual) return;
    throw qtyChanged();
  }
}

// ─── الدوالّ ──────────────────────────────────────────────────────────────────────────────────────────────────

export function activateVersion(versionId: string, version: number): Promise<unknown> {
  return call<unknown>('activate_recipe_version', { p_id: versionId, p_expected_version: version });
}

/** 23505 بمعرّف الجهاز = كُتبت فعلاً (إعادة بعد جواب ضائع)، لا دفعة ثانية. نسخة محلّية فلا تُحزَم وحدة المخازن كلّها. */
export function isDuplicate(error: unknown): boolean {
  return error instanceof RejectedError && error.code === '23505';
}

/** معرّف الدفعة من الجهاز (درس WP4): الإعادة بعد جواب ضاع تصطدم بالمفتاح ولا تُنشئ دفعة ثانية. */
export function createProduction(batchId: string, versionId: string, plannedKg: bigint, inputWarehouseId: string, outputWarehouseId: string, producedOn: Day): Promise<unknown> {
  return call<unknown>('create_production', {
    p_id: batchId,
    p_recipe_version: versionId,
    p_planned_kg: decimalText(plannedKg, 3),
    p_wh_in: inputWarehouseId,
    p_wh_out: outputWarehouseId,
    p_produced_on: producedOn,
  });
}

export function confirmCosts(batchId: string, version: number): Promise<unknown> {
  return call<unknown>('confirm_production_costs', { p_id: batchId, p_expected_version: version });
}

export function postProduction(batchId: string, version: number, planToken: string, clientRef: string): Promise<unknown> {
  return call<unknown>('post_production', { p_id: batchId, p_expected_version: version, p_expected_plan: planToken, p_client_ref: clientRef });
}

export function voidProduction(batchId: string, reason: string, clientRef: string): Promise<unknown> {
  return call<unknown>('void_production', { p_id: batchId, p_reason: reason, p_client_ref: clientRef });
}

export function discardBatch(batchId: string, version: number): Promise<unknown> {
  return call<unknown>('discard_draft', { p_doc_kind: 'production', p_id: batchId, p_expected_version: version });
}

// ─── بانية الخلطة (0016، ج٢) ────────────────────────────────────────────────────────────────────────────────

export interface RecipeInput {
  /**
   * معرّفا الخلطة ونسختها من الجهاز: الإعادة بالمحتوى نفسه (الاسم والمنتج والأساس والسطور والمعدّلات وطلب التفعيل) ترجّع
   * الموجود (جواب ضاع)، وبأيّ فرق id_conflict (ق٥): ما حُفظ غير ما تراه الشاشة، فلا تُولَّد خلطة ثانية بصمت (م١).
   */
  id: string;
  versionId: string;
  name: string;
  outputItemId: string;
  /** الأساس بالآلاف من الكيلو (1,000 كغم ← 1000000n). */
  basisKg: bigint;
  lines: readonly { itemId: string; qty: bigint; unit: RecipeUnit }[];
  rates: readonly { categoryId: string; amountPerTon: Fils }[];
  /** تفعيلها بالمعاملة نفسها (المجموع بالكيلو = الأساس، وإلّا basis_mismatch ويرجع كلّ شيء). */
  activate: boolean;
}

export interface CreatedRecipe {
  id: string;
  versionId: string;
  versionNo: number;
  status: VersionStatus;
  lines: number;
  rates: number;
}

export function parseCreatedRecipe(value: unknown): CreatedRecipe {
  const json = record(value, 'create_recipe');
  return {
    id: str(json, 'id'),
    versionId: str(json, 'version_id'),
    versionNo: int(json, 'version_no'),
    status: versionStatus(json),
    lines: nonNegative(json, 'lines'),
    rates: nonNegative(json, 'rates'),
  };
}

/** الخلطة ونسختها الأولى وسطورها ومعدّلات تكاليفها (وتفعيلها إن طُلب) بنداء create_recipe واحد: معاملة واحدة. */
export async function createRecipe(input: RecipeInput): Promise<CreatedRecipe> {
  return parseCreatedRecipe(
    await call<unknown>('create_recipe', {
      p_id: input.id,
      p_version_id: input.versionId,
      p_name: input.name.trim(),
      p_output_item: input.outputItemId,
      p_basis_kg: decimalText(input.basisKg, 3),
      p_lines: input.lines.map((line) => ({ item_id: line.itemId, qty: decimalText(line.qty, 3), unit: line.unit })),
      p_rates: input.rates.map((rate) => ({ category_id: rate.categoryId, amount_per_ton: moneyText(rate.amountPerTon) })),
      p_activate: input.activate,
    }),
  );
}

// ─── نسخة جديدة تنسخ المفعَّلة (إصلاح ق١٣ للمراجعة) ─────────────────────────────────────────────────────────────

export interface NewRecipeVersion {
  recipeId: string;
  versionId: string;
  versionNo: number;
  status: VersionStatus;
  /** عدد السطور والمعدّلات المنسوخة (أو الموجودة في المسوّدة القائمة). */
  lines: number;
  rates: number;
  /** true: رجعت نسخة موجودة (إعادة بالمعرّف نفسه، أو مسوّدة سابقة للخلطة) بلا نسخ جديد. */
  existing: boolean;
  /**
   * أسماء المواد التي لم تُنسخ لأنّ وحدتها صارت غير الكتلة (الجولة الخامسة، ق٥٥: قطعة لا تدخل الخلطة)، فارغة غالباً؛ والصفحة تقولها (ب٤٨).
   * المفتاح إلزامي.
   */
  skipped: string[];
}

export function parseNewRecipeVersion(value: unknown): NewRecipeVersion {
  const json = record(value, 'new_recipe_version');
  return {
    recipeId: str(json, 'recipe_id'),
    versionId: str(json, 'version_id'),
    versionNo: int(json, 'version_no'),
    status: versionStatus(json),
    lines: nonNegative(json, 'lines'),
    rates: nonNegative(json, 'rates'),
    existing: flag(json, 'existing'),
    skipped: names(json, 'skipped'),
  };
}

/**
 * «نسخة جديدة» لخلطة (new_recipe_version): مسوّدة بأساس النسخة المفعَّلة وسطورها ومعدّلات تكاليفها بترتيبها، بمعاملة واحدة.
 * المعرّف من الجهاز ويبقى للإعادة (جواب ضاع ← النسخة نفسها لا ثانية)، والمسوّدة القائمة للخلطة ترجع كما هي (existing).
 */
export async function newRecipeVersion(recipeId: string, versionId: string): Promise<NewRecipeVersion> {
  return parseNewRecipeVersion(await call<unknown>('new_recipe_version', { p_recipe: recipeId, p_id: versionId }));
}

/** مخازن المعمل ويوم الخادم لنافذة «أنتج» من بطاقة الخلطة (recipes_overview يحملهما، كشاشة المعمل). */
export async function loadMillStores(): Promise<{ today: string; stores: MillStore[] }> {
  const json = record(await call<unknown>('recipes_overview'), 'overview');
  return { today: str(json, 'today'), stores: storesOf(json) };
}

// ─── مدخلات الدفعة (0016، ج٥) ───────────────────────────────────────────────────────────────────────────────

export interface ProductionInputAdded {
  id: string;
  lineNo: number;
  version: number;
}

/**
 * مادّة جديدة في الدفعة المسوّدة، أو بديل لسطر قائم بسببه الإلزامي (القاعدة ١٩): replaces سطر الدفعة المبدَّل، والسبب
 * للتبديل وحده. المعرّف من الجهاز: الإعادة بعد جواب ضاع ترجّع السطر نفسه.
 */
export async function addProductionInput(input: { batchId: string; id: string; itemId: string; qty: bigint; replaces: string | null; reason: string | null }): Promise<ProductionInputAdded> {
  const json = record(
    await call<unknown>('add_production_input', {
      p_batch: input.batchId,
      p_id: input.id,
      p_item: input.itemId,
      p_qty: decimalText(input.qty, 3),
      p_replaces: input.replaces,
      p_reason: input.reason?.trim() || null,
    }),
    'add_production_input',
  );
  return { id: str(json, 'id'), lineNo: int(json, 'line_no'), version: int(json, 'version') };
}

export function deleteProductionInput(inputId: string, batchVersion: number): Promise<unknown> {
  return call<unknown>('delete_draft_line', { p_doc_kind: 'production_input', p_line_id: inputId, p_expected_version: batchVersion });
}

// ─── المبالغ: معدّلات الخلطة وسطور تكاليف الدفعة (0016، ج٣ وج٤) ──────────────────────────────────────────────────
// كتابة مباشرة بـupdatedRows، والتعديل مشروط بالمبلغ الذي شافته الشاشة حين بدأ التعديل (درس WP6 وFOUNDATION ٨١٧): صفر صفوف
// أو 23505 (محاولة ضاع جوابها، أو كاتب ثانٍ) يقرأ الصفّ — المطلوب = انكتب، وإلّا amount_changed فالشاشة تقرأ من جديد.

function amountChanged(): RejectedError {
  return new RejectedError('amount_changed', t('mill.amount.changed', 'تغيّر هذا المبلغ من نافذة أو جهاز آخر بعد أن بدأت تعديله؛ قُرئ من جديد، فراجعه واحفظ مرّة أخرى.'));
}

const batchCostNow = (costId: string): Promise<Row | null> =>
  oneRow((db) => db.from('production_costs').select('batch_id, category_id, amount::text').eq('id', costId) /* unbounded: صفّ واحد بمعرّفه */);

/** سطر تكاليف يدوي في الدفعة المسوّدة (أدوار الكلفة، costs.load): يفرّغ ختم الكلف بالخادم. */
export async function addBatchCost(batchId: string, id: string, categoryId: string, value: Fils): Promise<void> {
  try {
    await written(async (db) => updatedRows(withStatus(await db.from('production_costs').insert({ id, batch_id: batchId, category_id: categoryId, amount: moneyText(value) }).select('id'))));
  } catch (error) {
    if (!isDuplicate(error)) throw error;
    const now = await batchCostNow(id);
    if (now && now.batch_id === batchId && now.category_id === categoryId && scaled(now, 'amount', 2) === value) return;
    throw amountChanged();
  }
}

/** مبلغ سطر تكاليف الدفعة مشروطاً بما شافته الشاشة (before)؛ الصفر مسموح («صفّر السطر» حين لا يكفيه المتاح). */
export async function setBatchCost(costId: string, before: Fils, value: Fils): Promise<void> {
  if (before === value) return;
  try {
    await written(async (db) =>
      updatedRows(withStatus(await db.from('production_costs').update({ amount: moneyText(value) }).eq('id', costId).eq('amount', moneyText(before)).select('id'))),
    );
  } catch (error) {
    if (!(error instanceof ZeroRowsError)) throw error;
    const now = await batchCostNow(costId);
    if (now && scaled(now, 'amount', 2) === value) return;
    throw amountChanged();
  }
}

export function deleteBatchCost(costId: string, batchVersion: number): Promise<unknown> {
  return call<unknown>('delete_draft_line', { p_doc_kind: 'production_cost', p_line_id: costId, p_expected_version: batchVersion });
}

const recipeRateNow = (rateId: string): Promise<Row | null> =>
  oneRow((db) => db.from('recipe_cost_rates').select('version_id, category_id, amount_per_ton::text').eq('id', rateId) /* unbounded: صفّ واحد بمعرّفه */);

/** معدّل تكاليف لكلّ طنّ في نسخة مسوّدة (recipe.activate وأدوار الكلفة). */
export async function addRecipeRate(versionId: string, id: string, categoryId: string, perTon: Fils): Promise<void> {
  try {
    await written(async (db) =>
      updatedRows(withStatus(await db.from('recipe_cost_rates').insert({ id, version_id: versionId, category_id: categoryId, amount_per_ton: moneyText(perTon) }).select('id'))),
    );
  } catch (error) {
    if (!isDuplicate(error)) throw error;
    const now = await recipeRateNow(id);
    if (now && now.version_id === versionId && now.category_id === categoryId && scaled(now, 'amount_per_ton', 2) === perTon) return;
    throw amountChanged();
  }
}

export async function setRecipeRate(rateId: string, before: Fils, perTon: Fils): Promise<void> {
  if (before === perTon) return;
  try {
    await written(async (db) =>
      updatedRows(
        withStatus(await db.from('recipe_cost_rates').update({ amount_per_ton: moneyText(perTon) }).eq('id', rateId).eq('amount_per_ton', moneyText(before)).select('id')),
      ),
    );
  } catch (error) {
    if (!(error instanceof ZeroRowsError)) throw error;
    const now = await recipeRateNow(rateId);
    if (now && scaled(now, 'amount_per_ton', 2) === perTon) return;
    throw amountChanged();
  }
}

export function deleteRecipeRate(rateId: string, versionVersion: number): Promise<unknown> {
  return call<unknown>('delete_draft_line', { p_doc_kind: 'recipe_cost_rate', p_line_id: rateId, p_expected_version: versionVersion });
}

/** الجلسة قبل أي طلب (درس 2026-10-26): الشاشة تستعملها قبل أن ترسم زرّ الإنتاج. */
export async function millReady(): Promise<boolean> {
  const { db } = await authed();
  return Boolean(db);
}
