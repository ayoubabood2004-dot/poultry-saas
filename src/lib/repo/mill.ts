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
// الجولة السادسة: كلفة الطنّ المتوقّعة تحمل unconverted (ق٦١، ب٦٢: سطور لها سعر ولا تتحوّل كميتها إلى وحدة سعرها، سائل بلا كثافة أو لتر لمادّة
// صارت بالكيلو) عدداً إلزامياً منفصلاً عن unpriced، فلا تُقال «بلا أيّ سعر» تحت سطر سعره مكتوب.
// «ترتيب معمل العلف» (0023، كلمة المالك 2026-11-10): ترتيب العلائق (set_recipe_order) وترتيب موادّ المسوّدة (set_recipe_line_order) مشروطين بما
// عرضته الشاشة، والإنتاج بنداء واحد (record_production) بمعرّف الدفعة ومرجع المحاولة من الجهاز، ومدخلات تخطيط كلّ سطر كما يخطّطه الخادم
// لشاشة الإنتاج الواحدة (حلّ محلّها production_form في 0025).
// «الخلطة موادّ بلا كميات» (0025، كلمة المالك 2026-11-10: «اني بس احدد شنو المواد الي اريدها من دون ما احدد كميات… وبلحضتها احدد الكميات»):
// النسخة موادّ فقط (qty وbasis_kg فارغان، materials_only)، والكميات تُكتب عند كلّ إنتاج بنداء produce_batch واحد يقرأ شاشته من production_form
// (الكميات المقترحة من آخر إنتاج وإلّا من خلطة قديمة بكميات)، ويحفظ الموادّ نسخةً جديدة إن اختار المستخدم ذلك؛ والناتج يدخل «رصيد العلف» وحده.
// recipe_history سجلّ النسخ والإنتاج بمدّة. والقرّاء القائمون يرسلون null لكميات النسخة الجديدة ومفتاحاً إلزامياً materials_only، وrecipes_overview
// قطع الشريط من آخر دفعة مرحَّلة (pieces_source)، وproduction_detail يقول saved_to_recipe.

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
  /** null لنسخة موادّ بلا كميات (0025). */
  basisKg: bigint | null;
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

/** من أين قطع شريط التركيبة (0025): آخر دفعة مرحَّلة بكتلها، أو موادّ النسخة (بأسمائها وحدها للنسخة بلا كميات). */
export type PiecesSource = 'last_batch' | 'recipe';

export interface RecipeCard {
  id: string;
  name: string;
  note: string | null;
  archived: boolean;
  version: number;
  outputItem: { id: string; name: string; baseUnit: BaseUnit; kind: string };
  activeId: string | null;
  activeVersionNo: number | null;
  /** أساس النسخة المفعَّلة، أو null: بلا نسخة مفعَّلة، أو نسخة موادّ بلا كميات (0025). */
  activeBasisKg: bigint | null;
  /** النسخة المفعَّلة موادّ بلا كميات (0025)؛ false بلا نسخة مفعَّلة. */
  materialsOnly: boolean;
  /** مصدر القطع (0025)، أو null بلا نسخة مفعَّلة. */
  piecesSource: PiecesSource | null;
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
  /**
   * قطع شريط التركيبة ورقاقاته بترتيب الخادم (ومعها ما هو خارج الكتلة بعلامته): للنسخة القديمة موادّها بكتلتها، وللنسخة بلا كميات (0025) موادّ آخر
   * دفعة مرحَّلة بكتلها بترتيب سطورها، وإلّا موادّ النسخة بأسمائها وكتلة null.
   */
  pieces: RecipePiece[];
  /** مواد داخل الكتلة بعد الرقاقات الخمس الأولى (0025: لوحة الشريط خمسة ألوان، وما بعدها «أخرى» رمادية). */
  moreLines: number;
}

const CHIPS = 5;

const versionHead = (row: Row): RecipeVersionHead => ({
  id: str(row, 'id'),
  versionNo: int(row, 'version_no'),
  basisKg: scaled(row, 'basis_kg', 3),
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

const piecesSource = (row: Row): PiecesSource => {
  const value = str(row, 'pieces_source');
  if (value !== 'last_batch' && value !== 'recipe') throw new MillShapeError('pieces_source');
  return value;
};

/**
 * اسم القطعة: item_name في قطع النسخة القديمة (0023 كما هي)، وname في قطع 0025 كما يكتبها العقد ({item_id, name, mass_kg, in_basis}).
 * أحدهما إلزامي، والموجود منهما نصّ غير فارغ.
 */
const pieceName = (piece: Row): string => ('item_name' in piece ? str(piece, 'item_name') : str(piece, 'name'));

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
          label: pieceName(piece),
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
      // مفتاح إلزامي قيمته null للنسخة بلا كميات (0025): لا أساس صفري صامت.
      activeBasisKg: active ? nullableScaled(active, 'basis_kg', 3) : null,
      materialsOnly: active ? flag(active, 'materials_only') : false,
      piecesSource: active ? piecesSource(active) : null,
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
  /** الكمية في الخلطة، أو null لسطر نسخة بلا كميات (0025: الكميات تُكتب عند الإنتاج). مفتاح إلزامي. */
  qty: bigint | null;
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
  /** null لنسخة بلا كميات (0025). */
  basisKg: bigint | null;
  activatedAt: string | null;
  version: number;
  /** نسخة موادّ بلا كميات (0025). مفتاح إلزامي. */
  materialsOnly: boolean;
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

/**
 * كلفة الطنّ المتوقّعة للتخطيط من الخادم (0016، ج٧)، وunpriced عدد المواد بلا أيّ سعر (لم تُحسب)، وunconverted عدد المواد التي لها سعر ولا
 * تتحوّل كميتها إلى وحدة سعرها (ق٦١: سائل بلا كثافة، أو سطر لتر لمادّة صارت بالكيلو) فلم تُحسب حتّى تُصحَّح سطورها.
 */
export interface RecipeExpected {
  materialsPerTon: Fils;
  ratesPerTon: Fils;
  costPerTon: Fils;
  unpriced: number;
  unconverted: number;
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
  /** أساس النسخة المعروضة، أو null: بلا نسخة، أو نسخة بلا كميات (0025). */
  basisKg: bigint | null;
  /** النسخة المعروضة موادّ بلا كميات (0025)؛ false بلا نسخة. */
  materialsOnly: boolean;
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
    // مفتاح إلزامي (ق٦١): الغائب خطأ شكل لا صفر صامت يعيد «بلا أيّ سعر» تحت سطر سعره مكتوب.
    unconverted: nonNegative(row, 'unconverted'),
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
      basisKg: nullableScaled(row, 'basis_kg', 3),
      activatedAt: optStr(row, 'activated_at'),
      version: int(row, 'version'),
      materialsOnly: flag(row, 'materials_only'),
    })),
    versionId: version ? str(version, 'id') : null,
    versionNo: version ? int(version, 'version_no') : null,
    status: version ? versionStatus(version) : null,
    basisKg: version ? nullableScaled(version, 'basis_kg', 3) : null,
    materialsOnly: version ? flag(version, 'materials_only') : false,
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
      qty: nullableScaled(row, 'qty', 3),
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
   * جملة الخادم لمشكلة التاريخ (private.date_problem منذ 0015: date_too_old وperiod_locked…؛ وبلا يوم التشغيل منذ 0018) بتواريخها، فتعرضها الصفحة
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
  /** أساس نسخة الدفعة، أو null لنسخة بلا كميات (0025). */
  basisKg: bigint | null;
  /** حُفظت موادّ هذه الدفعة نسخةً جديدة من الخلطة عند إنتاجها (0025، produce_batch). مفتاح إلزامي. */
  savedToRecipe: boolean;
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
    basisKg: scaled(recipe, 'basis_kg', 3),
    savedToRecipe: flag(json, 'saved_to_recipe'),
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

/**
 * مادّة في مسوّدة الخلطة بلا كمية (0025: الخلطة موادّ فقط): الحارس يكتب وحدتها = وحدة أساس المادّة، والكميات تُكتب عند الإنتاج.
 */
export function addRecipeLine(versionId: string, itemId: string): Promise<string> {
  return written(async (db) => updatedRows(withStatus(await db.from('recipe_lines').insert({ version_id: versionId, item_id: itemId }).select('id')))).then((row) =>
    str(row, 'id'),
  );
}

/**
 * يمحو كمية سطر في مسوّدة كُتبت بكميات قبل 0025 (الخلطة الآن موادّ فقط): مسوّدة تجمع موادّ بكميات وموادّ بلاها لا تُفعَّل (mixed_quantities)، والشاشة
 * لا تعرض الكميات ولا تكتبها. صفر صفوف = حُذف السطر من جهاز آخر (ZeroRowsError)، فتُقرأ الخلطة من جديد.
 */
export function clearRecipeLineQty(lineId: string): Promise<string> {
  return written(async (db) => updatedRows(withStatus(await db.from('recipe_lines').update({ qty: null }).eq('id', lineId).select('id')))).then((row) => str(row, 'id'));
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
   * معرّفا الخلطة ونسختها من الجهاز: الإعادة بالمحتوى نفسه (الاسم والمنتج والسطور والمعدّلات وطلب التفعيل) ترجّع
   * الموجود (جواب ضاع)، وبأيّ فرق id_conflict (ق٥): ما حُفظ غير ما تراه الشاشة، فلا تُولَّد خلطة ثانية بصمت (م١).
   */
  id: string;
  versionId: string;
  name: string;
  outputItemId: string;
  /** موادّ الخلطة بترتيبها بلا كميات (0025: p_basis_kg فارغ، والكميات تُكتب عند الإنتاج). */
  lines: readonly { itemId: string }[];
  rates: readonly { categoryId: string; amountPerTon: Fils }[];
  /** تفعيلها بالمعاملة نفسها (مادّة داخل الكتلة على الأقلّ، وكثافة كلّ سائل، وإلّا يرجع كلّ شيء). */
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
      p_basis_kg: null,
      p_lines: input.lines.map((line) => ({ item_id: line.itemId })),
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

/**
 * مخازن المعمل ويوم الخادم (recipes_overview يحملهما، كشاشة المعمل). كانت لنافذة «أنتج» في بطاقة الخلطة؛ وشاشة الإنتاج تقرؤهما الآن من
 * production_form (0025).
 */
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

// ─── ترتيب المعمل والإنتاج بشاشة واحدة (0023، كلمة المالك 2026-11-10) ──────────────────────────────────────────────

export interface RecipeOrderSaved {
  count: number;
}

/** جواب set_recipe_order: عدد العلائق المرتَّبة. */
export function parseRecipeOrder(value: unknown): RecipeOrderSaved {
  return { count: nonNegative(record(value, 'set_recipe_order'), 'count') };
}

/**
 * ترتيب العلائق الظاهرة (المالك والمدير، recipe.activate): ids كلّ العلائق غير المحذوفة بالترتيب الجديد، وexpected ترتيبها كما عرضته الشاشة
 * (recipes_overview). تغيّرت القائمة أو ترتيبها بعد القراءة ← recipes_changed بتلميحه؛ والإعادة بالطلب نفسه بعد جواب ضاع لا تُرفض.
 */
export async function setRecipeOrder(ids: readonly string[], expected: readonly string[]): Promise<RecipeOrderSaved> {
  return parseRecipeOrder(await call<unknown>('set_recipe_order', { p_ids: [...ids], p_expected: [...expected] }));
}

export interface LineOrderSaved {
  versionId: string;
  count: number;
  /** نسخة المسوّدة بعد الترتيب (recipe_versions.version). */
  version: number;
}

export function parseLineOrder(value: unknown): LineOrderSaved {
  const json = record(value, 'set_recipe_line_order');
  return { versionId: str(json, 'version_id'), count: nonNegative(json, 'count'), version: int(json, 'version') };
}

/**
 * ترتيب موادّ نسخة مسوّدة («عدّل الخلطة»): lineIds كلّ سطورها بالترتيب الجديد، وexpected ترتيبها كما عرضته الشاشة؛ الخادم يعيد ترقيم line_no
 * من 1. النسخة المفعَّلة مجمَّدة (not_draft)، وتغيّر السطور بعد القراءة lines_changed بتلميحه.
 */
export async function setRecipeLineOrder(versionId: string, lineIds: readonly string[], expected: readonly string[]): Promise<LineOrderSaved> {
  return parseLineOrder(await call<unknown>('set_recipe_line_order', { p_version: versionId, p_lines: [...lineIds], p_expected: [...expected] }));
}

// ─── نتيجة الإنتاج (0023، وproduce_batch في 0025 يزيد عليها) ─────────────────────────────────────────────────────────────

export interface PostedProduction {
  status: 'posted';
  id: string;
  docNo: string;
  producedOn: Day;
  recipeName: string;
  outputItemName: string;
  inputWarehouseName: string;
  outputWarehouseName: string;
  outputQtyKg: bigint;
  inputMassKg: bigint;
  shrinkKg: bigint;
  note: string | null;
  /** null لغير أدوار الكلفة (private.mask يحذف money). */
  money: { inputValue: Fils; extraValue: Fils; totalValue: Fils; costPerKg: Fils | null } | null;
}

/** دفعة مشغّل المعمل: حُفظت مسوّدة تنتظر ختم الكلف من المحاسب أو المدير على صفحتها، ثمّ يرحّلها. */
export interface AwaitingProduction {
  status: 'draft';
  id: string;
  awaiting: 'costs';
  recipeName: string;
  plannedKg: bigint;
}

export type RecordedProduction = PostedProduction | AwaitingProduction;

/** كمية إلزامية في جواب الإنتاج: الغائبة خطأ شكل لا صفر صامت يُعرض «دخل 0 كغم». */
const needQty = (row: Row, field: string): bigint => {
  const value = scaled(row, field, 3);
  if (value === null) throw new MillShapeError(field);
  return value;
};

/** جواب record_production (0023)، وهو نفسه أساس جواب produce_batch (0025). */
export function parseRecordedProduction(value: unknown): RecordedProduction {
  const json = record(value, 'record_production');
  const status = str(json, 'status');
  if (status === 'draft') {
    if (str(json, 'awaiting') !== 'costs') throw new MillShapeError('awaiting');
    return { status: 'draft', id: str(json, 'id'), awaiting: 'costs', recipeName: str(json, 'recipe_name'), plannedKg: needQty(json, 'planned_kg') };
  }
  if (status !== 'posted') throw new MillShapeError('status');
  const box = moneyBox(json);
  return {
    status: 'posted',
    id: str(json, 'id'),
    docNo: str(json, 'doc_no'),
    producedOn: str(json, 'produced_on'),
    recipeName: str(json, 'recipe_name'),
    outputItemName: str(json, 'output_item_name'),
    inputWarehouseName: str(json, 'input_warehouse_name'),
    outputWarehouseName: str(json, 'output_warehouse_name'),
    outputQtyKg: needQty(json, 'output_qty_kg'),
    inputMassKg: needQty(json, 'input_mass_kg'),
    shrinkKg: needQty(json, 'shrink_kg'),
    note: optStr(json, 'note'),
    money: box
      ? { inputValue: amount(box, 'input_value'), extraValue: amount(box, 'extra_value'), totalValue: amount(box, 'total_value'), costPerKg: nullableAmount(box, 'cost_per_kg') }
      : null,
  };
}

// ─── شاشة الإنتاج (0025، production_form وproduce_batch) ───────────────────────────────────────────────────────────────

export type DefaultSource = 'last' | 'recipe';

/** مادّة في النسخة المفعَّلة بترتيبها، بما يلزم لكتابة كميتها عند الإنتاج. */
export interface FormMaterial {
  lineNo: number;
  itemId: string;
  name: string;
  kind: string;
  /** وحدة أساس المادّة الآن (الكمية تُكتب بها): كغم أو لتر، و«قطعة» لمادّة صارت بالقطعة فلا تدخل الإنتاج (bad_recipe_unit). */
  baseUnit: BaseUnit;
  /** ١/١٠٠٠٠ كغم/لتر للسائل: كثافة المادّة الآن (هي ما يحسب به produce_batch، مراجعة 0025 #6)، أو null. */
  density: bigint | null;
  /** محذوفة من القوائم (مؤرشفة): لا تُنتج، فيطلب صفّها إزالته (مراجعة 0025 #5). */
  archived: boolean;
  /** داخل كتلة الخلطة: الوقود والتعبئة خارجها، فلا يدخلان الناتج. */
  inBasis: boolean;
  /** خطوة عدّاد المادّة بالآلاف من وحدة أساسها، أو 0 بلا خطوة. */
  scaleStep: bigint;
  /** الكمية المقترحة بوحدة أساس المادّة: من آخر إنتاج (last)، وإلّا من نسخة قديمة بكميات (recipe)، وإلّا null. */
  defaultQty: bigint | null;
  defaultSource: DefaultSource | null;
}

export interface FormLastBatch {
  id: string;
  docNo: string;
  producedOn: Day;
  outputKg: bigint;
  inputMassKg: bigint;
  /** موادّ استُعملت في آخر إنتاج وليست في النسخة المفعَّلة: تُقترح أوّلاً في «أضف مادّة» بلا كمية. */
  extraItems: { itemId: string; name: string }[];
}

export interface ProductionForm {
  /** يوم الخادم (بغداد): يوم الإنتاج الافتراضي. */
  today: Day;
  recipe: { id: string; name: string; archived: boolean; outputItem: { id: string; name: string } };
  /** منتج الخلطة «يُتابَع انتهاؤه»: تاريخ الانتهاء إلزاميّ له قبل «أنتج» (من جواب القارئ نفسه، بلا قراءة ثانية). */
  tracksExpiry: boolean;
  /** النسخة المفعَّلة (p_expected_version)، أو null: الخلطة بلا نسخة مفعَّلة. */
  active: { id: string; versionNo: number; materialsOnly: boolean } | null;
  materials: FormMaterial[];
  last: FormLastBatch | null;
  /** مخازن الموادّ الأوّلية الحيّة بنطاق القارئ بالاسم. */
  stores: { id: string; name: string }[];
  /** «رصيد العلف» الذي يدخله كلّ إنتاج تلقائياً، أو null: لا مخزن علف للمعمل (الإنتاج يُرفض feed_store_missing). */
  outputStore: { id: string; name: string } | null;
  /** يعدّل الخلطة (recipe.activate): يختار «عدّل الخلطة بهذه الموادّ» حين تخالف موادُّ الإنتاج موادَّ الخلطة. */
  canEditRecipe: boolean;
  /** للخلطة مسوّدة لم تُفعَّل: «عدّل الخلطة بهذه الموادّ» يُرفض draft_exists. */
  draftExists: boolean;
}

/** شاشة الإنتاج: جواب production_form كما هو (ومعه «يُتابَع انتهاؤه» لمنتج الخلطة). */
export type ProduceForm = ProductionForm;

const nameRef = (row: Row): { itemId: string; name: string } => ({ itemId: str(row, 'item_id'), name: str(row, 'name') });

function defaultSource(row: Row, hasQty: boolean): DefaultSource | null {
  const value = present(row, 'default_source');
  // الكمية والمصدر معاً: كمية بلا مصدر أو مصدر بلا كمية خطأ شكل، فلا تُعرض «من آخر إنتاج» على خانة فارغة.
  if (!hasQty) {
    if (value !== null) throw new MillShapeError('default_source');
    return null;
  }
  if (value !== 'last' && value !== 'recipe') throw new MillShapeError('default_source');
  return value;
}

export function parseProductionForm(value: unknown): ProductionForm {
  const json = record(value, 'production_form');
  const recipe = record(json.recipe, 'recipe');
  const output = record(recipe.output_item, 'output_item');
  const active = present(json, 'active') === null ? null : record(json.active, 'active');
  const last = present(json, 'last') === null ? null : record(json.last, 'last');
  const outputStore = present(json, 'output_store');
  return {
    today: str(json, 'today'),
    recipe: { id: str(recipe, 'id'), name: str(recipe, 'name'), archived: flag(recipe, 'archived'), outputItem: { id: str(output, 'id'), name: str(output, 'name') } },
    tracksExpiry: flag(output, 'tracks_expiry'),
    active: active ? { id: str(active, 'id'), versionNo: int(active, 'version_no'), materialsOnly: flag(active, 'materials_only') } : null,
    materials: list(json.materials, 'materials').map((row) => {
      const defaultQty = nullableScaled(row, 'default_qty', 3);
      return {
        lineNo: int(row, 'line_no'),
        itemId: str(row, 'item_id'),
        name: str(row, 'name'),
        kind: str(row, 'kind'),
        baseUnit: baseUnit(row, 'base_unit'),
        density: nullableScaled(row, 'density', 4),
        archived: flag(row, 'archived'),
        inBasis: flag(row, 'in_basis'),
        scaleStep: nullableScaled(row, 'scale_step', 3) ?? 0n,
        defaultQty,
        defaultSource: defaultSource(row, defaultQty !== null),
      };
    }),
    last: last
      ? {
          id: str(last, 'id'),
          docNo: str(last, 'doc_no'),
          producedOn: str(last, 'produced_on'),
          outputKg: needQty(last, 'output_kg'),
          inputMassKg: needQty(last, 'input_mass_kg'),
          extraItems: list(last.extra_items, 'extra_items').map(nameRef),
        }
      : null,
    stores: list(json.stores, 'stores').map((row) => ({ id: str(row, 'id'), name: str(row, 'name') })),
    outputStore: outputStore === null ? null : warehouse(outputStore, 'output_store'),
    canEditRecipe: flag(json, 'can_edit_recipe'),
    draftExists: flag(json, 'draft_exists'),
  };
}

/** شاشة الإنتاج (/mill/produce/:recipeId): production_form بنداء واحد («يُتابَع انتهاؤه» لمنتج الخلطة في جوابه). */
export async function loadProduceForm(recipeId: string): Promise<ProduceForm> {
  return parseProductionForm(await call<unknown>('production_form', { p_recipe: recipeId }));
}

/** سطر في طلب الإنتاج: المادّة وكميتها بوحدة أساسها؛ والاسم والوحدة والكثافة وداخل الكتلة للعرض وحده (الشاشة المجمَّدة تعرض الطلب منها). */
export interface ProduceLine {
  itemId: string;
  qty: bigint;
  name: string;
  unit: BaseUnit;
  density: bigint | null;
  inBasis: boolean;
}

/** طلب produce_batch كما يُرسل، ويُعاد حرفاً بعد نتيجة مجهولة (المعرّف والمرجع نفسيهما): لا دفعة ثانية أبداً. */
export interface ProduceRequest {
  /** معرّف الدفعة من الجهاز. */
  id: string;
  recipeId: string;
  /** النسخة المفعَّلة التي عرضتها الشاشة (recipe_changed إن تغيّرت). */
  expectedVersion: string;
  inputWarehouseId: string;
  /** الموادّ بترتيب الشاشة. */
  lines: readonly ProduceLine[];
  /** موادّ الإنتاج تخالف موادّ الخلطة: true «عدّل الخلطة بهذه الموادّ»، وfalse «لهذه المرّة فقط»، وnull حين لا تخالفها. */
  saveRecipe: boolean | null;
  /** «احفظ مسوّدة»: الدفعة ورأسها فقط، ثمّ صفحتها. */
  draft: boolean;
  producedOn: Day | null;
  /** الناتج الموزون بالكيلو، أو null (= كتلة المواد، بلا هدر). */
  outputKg: bigint | null;
  expiry: Day | null;
  shrinkReason: string | null;
  note: string | null;
  clientRef: string;
}

/** ما يزيده produce_batch على نتيجة record_production: هل حُفظت الموادّ في الخلطة، والنسخة التي أُنتج بها. */
export interface ProducedVersion {
  savedToRecipe: boolean;
  recipeVersionId: string;
  versionNo: number;
}

/** «احفظ مسوّدة» (p_draft): الدفعة مسوّدة، وتُكمل في صفحتها. */
export interface SavedDraft extends ProducedVersion {
  status: 'draft';
  id: string;
  awaiting: null;
}

export type ProducedBatch = (PostedProduction & ProducedVersion) | (AwaitingProduction & ProducedVersion) | SavedDraft;

const producedVersion = (json: Row): ProducedVersion => ({
  savedToRecipe: flag(json, 'saved_to_recipe'),
  recipeVersionId: str(json, 'recipe_version_id'),
  versionNo: int(json, 'version_no'),
});

/** جواب produce_batch: للمسوّدة (p_draft) معرّفها ونسختها، وغيرها جواب record_production ومعه النسخة. */
export function parseProducedBatch(value: unknown, draft: boolean): ProducedBatch {
  const json = record(value, 'produce_batch');
  if (draft) {
    if (str(json, 'status') !== 'draft') throw new MillShapeError('status');
    return { status: 'draft', id: str(json, 'id'), awaiting: null, ...producedVersion(json) };
  }
  return { ...parseRecordedProduction(json), ...producedVersion(json) };
}

/** الإنتاج بنداء produce_batch واحد (معاملة واحدة): الكميات كما كُتبت، ثمّ يرحّل، أو مسوّدة تنتظر الكلف، أو مسوّدة طُلبت. */
export async function produceBatch(request: ProduceRequest): Promise<ProducedBatch> {
  return parseProducedBatch(
    await call<unknown>('produce_batch', {
      p_id: request.id,
      p_recipe: request.recipeId,
      p_expected_version: request.expectedVersion,
      p_wh_in: request.inputWarehouseId,
      p_lines: request.lines.map((line) => ({ item_id: line.itemId, qty: decimalText(line.qty, 3) })),
      p_save_recipe: request.saveRecipe,
      p_draft: request.draft,
      p_produced_on: request.producedOn,
      p_output_kg: qtyText(request.outputKg),
      p_expiry: request.expiry,
      p_shrink_reason: request.shrinkReason,
      p_note: request.note,
      p_client_ref: request.clientRef,
    }),
    request.draft,
  );
}

// ─── سجلّ الخلطة (0025، recipe_history) ───────────────────────────────────────────────────────────────────────────

export interface HistoryItem {
  itemId: string;
  name: string;
}

export interface HistoryVersion {
  id: string;
  versionNo: number;
  status: VersionStatus;
  /** لحظة التفعيل (ISO). */
  activatedAt: string;
  activatedBy: string | null;
  retiredAt: string | null;
  materialsOnly: boolean;
  /** موادّ النسخة بترتيبها. */
  items: HistoryItem[];
  /** ما أُضيف وما حُذف عن النسخة غير المسوّدة التي قبلها. */
  added: HistoryItem[];
  removed: HistoryItem[];
  /**
   * الدفعة التي حُفظت موادّها في هذه النسخة («عدّل الخلطة بهذه الموادّ»)، أو null؛ بحالتها (مراجعة 0025 #3): «عدّل الخلطة» مع «احفظ مسوّدة» يعدّل
   * الخلطة لحظته، فالدفعة مسوّدة بلا رقم بعد (docNo null)، أو مرحَّلة برقمها، أو ملغاة.
   */
  fromBatch: { id: string; docNo: string | null; status: BatchStatus } | null;
}

export interface HistoryLine {
  itemId: string;
  name: string;
  qty: bigint;
  baseUnit: BaseUnit;
  /** الكتلة بالكيلو، أو null حين لا تُعرف. */
  massKg: bigint | null;
  inBasis: boolean;
  /** مادّة ليست في نسخة الدفعة: أُضيفت لهذه المرّة. */
  extra: boolean;
}

export interface HistoryProduction {
  id: string;
  docNo: string;
  producedOn: Day;
  status: 'posted' | 'void';
  versionNo: number;
  outputKg: bigint;
  inputMassKg: bigint;
  savedToRecipe: boolean;
  note: string | null;
  by: string | null;
  lines: HistoryLine[];
  /** موادّ في نسخة الدفعة لم تُستعمل فيها. */
  omitted: HistoryItem[];
}

export interface RecipeHistory {
  recipe: { id: string; name: string };
  /** كلّ النسخ غير المسوّدة، الأحدث أوّلاً (بلا تقييد بالمدّة). */
  versions: HistoryVersion[];
  /** دفعات المدّة المرحَّلة والملغاة، الأحدث أوّلاً. */
  productions: HistoryProduction[];
  /** المرحَّلة وحدها. */
  totals: { batches: number; outputKg: bigint };
}

const historyItems = (value: unknown, field: string): HistoryItem[] => list(value, field).map(nameRef);

export function parseRecipeHistory(value: unknown): RecipeHistory {
  const json = record(value, 'recipe_history');
  const recipe = record(json.recipe, 'recipe');
  const totals = record(json.totals, 'totals');
  return {
    recipe: { id: str(recipe, 'id'), name: str(recipe, 'name') },
    versions: list(json.versions, 'versions').map((row) => {
      const from = present(row, 'from_batch') === null ? null : record(row.from_batch, 'from_batch');
      return {
        id: str(row, 'id'),
        versionNo: int(row, 'version_no'),
        status: versionStatus(row),
        activatedAt: str(row, 'activated_at'),
        activatedBy: present(row, 'activated_by') === null ? null : str(row, 'activated_by'),
        retiredAt: present(row, 'retired_at') === null ? null : str(row, 'retired_at'),
        materialsOnly: flag(row, 'materials_only'),
        items: historyItems(row.items, 'items'),
        added: historyItems(row.added, 'added'),
        removed: historyItems(row.removed, 'removed'),
        fromBatch: from ? { id: str(from, 'id'), docNo: present(from, 'doc_no') === null ? null : str(from, 'doc_no'), status: batchStatus(from) } : null,
      };
    }),
    productions: list(json.productions, 'productions').map((row) => {
      const status = str(row, 'status');
      if (status !== 'posted' && status !== 'void') throw new MillShapeError('status');
      return {
        id: str(row, 'id'),
        docNo: str(row, 'doc_no'),
        producedOn: str(row, 'produced_on'),
        status,
        versionNo: int(row, 'version_no'),
        outputKg: needQty(row, 'output_kg'),
        inputMassKg: needQty(row, 'input_mass_kg'),
        savedToRecipe: flag(row, 'saved_to_recipe'),
        note: present(row, 'note') === null ? null : str(row, 'note'),
        by: present(row, 'by') === null ? null : str(row, 'by'),
        lines: list(row.lines, 'lines').map((line) => ({
          itemId: str(line, 'item_id'),
          name: str(line, 'name'),
          qty: needQty(line, 'qty'),
          baseUnit: baseUnit(line, 'base_unit'),
          massKg: nullableScaled(line, 'mass_kg', 3),
          inBasis: flag(line, 'in_basis'),
          extra: flag(line, 'extra'),
        })),
        omitted: historyItems(row.omitted, 'omitted'),
      };
    }),
    totals: { batches: nonNegative(totals, 'batches'), outputKg: needQty(totals, 'output_kg') },
  };
}

/** سجلّ الخلطة لمدّة (حتى 366 يوماً): النسخ كلّها والإنتاج في المدّة ومجموعه. */
export async function loadRecipeHistory(recipeId: string, from: Day, to: Day): Promise<RecipeHistory> {
  return parseRecipeHistory(await call<unknown>('recipe_history', { p_recipe: recipeId, p_from: from, p_to: to }));
}
