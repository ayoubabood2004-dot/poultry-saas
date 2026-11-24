import { decimalText, parseDecimal, toScale } from '../domain/decimal';
import type { BaseUnit } from '../domain/units';
import { openDatabase, requestResult, transact } from './idb';
import type { Stamp } from './outbox';
import { markFarmCopy, roundQueueStore, stampKey, type RoundRun } from './roundUploads';
import { createStore } from './store';

// نسخة الجهاز من قراءة الحقول (FOUNDATION ٢١٧–٢١٨): آخر جواب flocks_overview ناجح لكل (مستخدم، منشأة)، والتحديث يستبدلها ما يدمجها.
// الجولة تنفتح منها بلا نت، والرأس يقول «غير جاهز دون اتصال» لعامل القاعة لحد ما تنحفظ. كل قراءة ناجحة تحفظها (الرئيسية ويّاها)،
// مو شاشات الحقول بس: عامل فتح الرئيسية بالنت وطلع للقاعة كانت جولته ما تنفتح.
// ومراجعة 0036 R2: ما حُفظ من هذا الجهاز بعد القراءة (رفع جولات، وإرسال علف) يُعرض فوقها ويُكتب في النسخة (withSaved)، حتى تصل قراءة أحدث.

const CACHE_DB = 'poultry-farm';
const CACHE_STORE = 'overview';

export function openFarmCache(name: string = CACHE_DB): Promise<IDBDatabase> {
  return openDatabase(name, 1, (db, oldVersion) => {
    if (oldVersion < 1) db.createObjectStore(CACHE_STORE);
  });
}

/**
 * عدّاد هذه الجلسة لقراءات الحقول وأجوبة إرسال العلف معاً: قراءة رقمها أكبر من رقم إرسال بدأت بعد جوابه فالإرسال فيها من الخادم، وأصغر منه
 * لا. والإرسال الذي يجيب وقراءةٌ في الطريق يُعدّ خارجها (قد يُعرض مرّتين حتى القراءة التالية، لا أن يُعرض غير مُرسَل فيُرسل ثانيةً).
 */
let tick = 0;
export const nextTick = (): number => (tick += 1);
/** وسم هذه الجلسة على النسخة: رقم العدّاد لا معنى له في جلسة أخرى. */
const SESSION = Math.random();

/** جواب إرسال علف حُفظ في هذه الجلسة (send_flock_feed): سطره بوحدة أساسه، ومجموع علف يومه بالكيلو بعده كما قاله الخادم، ورقمه في العدّاد. */
export interface FedSave {
  key: string;
  flockId: string;
  day: string;
  itemId: string;
  itemName: string;
  qty: bigint;
  unit: BaseUnit;
  dayKg: bigint | null;
  mark: number;
}

export const fedStore = createStore<FedSave[]>([]);

export interface OverviewCopy {
  json: unknown;
  at: number;
  /** رقم النسخة في عدّاد هذه الجلسة (ما أُرسل قبله فيها)، و0 لنسخة من جلسة أخرى. */
  read: number;
}

type Json = Record<string, unknown>;
const num = (value: unknown): number => (typeof value === 'number' ? value : 0);
const milli = (text: unknown): bigint => {
  const value = typeof text === 'string' ? parseDecimal(text, 3) : null;
  return value ? toScale(value, 3) : 0n;
};

/**
 * قراءة الحقول (JSON كما يرسله flocks_overview) وفوقها ما حُفظ من هذا الجهاز في هذه الجلسة ليومها (مراجعة 0036 R2، نمط savedEdits في ورقة القاعة):
 * صفّ اليوم بعد هلاكاته أو زيارته (set_flock_dead وsave_flock_visit) والحيّ والمجاميع بفرقه، وغاز اليوم بعد الإضافة (add_flock_gas) — كلاهما بنسخته،
 * فالأحدث يغلب والقراءة الأحدث تغلبهما؛ وإرسال العلف لقراءة قبل جوابه (read): سطره ومجموع اليوم كما قاله الخادم و«عندك» ناقصاً ما أُرسل (والنافد يخرج).
 * كانت العملية تخرج من الطابور والقراءة المعروضة قبلها، فتنفتح الهلاكات ثانيةً ويرجع الغاز بلا الإضافة و«لم يُرسل علف اليوم بعد»، فيُكتب ثانيةً.
 */
export function withSaved(json: unknown, key: string, read: number, runs: readonly RoundRun[], fed: readonly FedSave[]): unknown {
  if (typeof json !== 'object' || json === null) return json;
  const out = JSON.parse(JSON.stringify(json)) as Json;
  const flocks = new Map<unknown, Json>();
  for (const site of (out.sites ?? []) as Json[]) for (const hall of (site.halls ?? []) as Json[]) if (hall.flock) flocks.set((hall.flock as Json).id, hall.flock as Json);
  for (const run of runs) {
    for (const entry of run.key === key ? run.results : []) {
      const flock = flocks.get(entry.flockId);
      const { result } = entry;
      if (!flock || entry.day !== out.today || result.kind !== 'saved') continue;
      const day = result.day as Json | null | undefined;
      const gas = result.gas as Json | null | undefined;
      const old = flock.today as Json | null;
      if (day && num(day.version) > num(old?.version)) {
        const dead = num(day.dead) - num(old?.dead);
        const culled = num(day.culled) - num(old?.culled);
        Object.assign(flock, { today: day, live: num(flock.live) - dead - culled, dead_total: num(flock.dead_total) + dead, culled_total: num(flock.culled_total) + culled });
      }
      if (gas && num(gas.version) > num(flock.gas_today_version)) Object.assign(flock, { gas_today: gas.cylinders, gas_today_version: gas.version });
    }
  }
  const items = out.feed_items as Json[] | undefined;
  for (const sent of fed) {
    const flock = flocks.get(sent.flockId);
    if (!flock || sent.key !== key || sent.mark < read || sent.day !== out.today) continue;
    const lines = (flock.feed_today ?? []) as Json[];
    const line = lines.find((entry) => entry.item_id === sent.itemId);
    if (line) line.qty = decimalText(milli(line.qty) + sent.qty, 3);
    else lines.push({ item_id: sent.itemId, item_name: sent.itemName, qty: decimalText(sent.qty, 3), unit: sent.unit });
    Object.assign(flock, { feed_today: lines, feed_today_kg: sent.dayKg === null ? null : decimalText(sent.dayKg, 3), last_feed_item_id: sent.itemId });
    const item = items?.find((entry) => entry.item_id === sent.itemId);
    if (item) item.on_hand = decimalText(milli(item.on_hand) - sent.qty, 3);
  }
  if (items) out.feed_items = items.filter((item) => milli(item.on_hand) > 0n);
  return out;
}

type Kept = OverviewCopy & { session?: number };

/**
 * صفّ النسخة: القراءة وفوقها ما حُفظ في هذه الجلسة لحظة الكتابة داخل معاملتها (لا قبلها)، فقراءةٌ ونتيجةُ رفعٍ متزامنتان لا تكتب إحداهما فوق الأخرى بلا
 * المحفوظ؛ ورقمها في العدّاد بعدها (ما يُرسل بعده يُكتب فوقها لاحقاً).
 */
const kept = (json: unknown, key: string, read: number, at: number): Kept => ({ json: withSaved(json, key, read, roundQueueStore.get().runs, fedStore.get()), at, read: nextTick(), session: SESSION });

/** read: رقم القراءة في عدّاد هذه الجلسة (loadOverviewKept، قبل أن تخرج). */
export async function keepOverview(stamp: Stamp, json: unknown, at: number, read: number): Promise<void> {
  const db = await openFarmCache();
  const key = stampKey(stamp);
  await transact(db, CACHE_STORE, 'readwrite', async (tx) => {
    await requestResult(tx.objectStore(CACHE_STORE).put(kept(json, key, read, at), key));
    return true;
  });
  markFarmCopy(key);
}

const readOf = (saved: Kept): number => (saved.session === SESSION ? saved.read : 0);

export async function savedOverview(stamp: Stamp): Promise<OverviewCopy | null> {
  const db = await openFarmCache();
  const saved = await transact(db, CACHE_STORE, 'readonly', (tx) => requestResult(tx.objectStore(CACHE_STORE).get(stampKey(stamp)) as IDBRequest<Kept | undefined>));
  if (!saved) return null;
  markFarmCopy(stampKey(stamp));
  return { json: saved.json, at: saved.at, read: readOf(saved) };
}

/**
 * نسخة الجهاز بما حُفظ بعدها في هذه الجلسة (الرافع بعد كلّ رفع، والجولة بعد كلّ إرسال علف)، قراءةً وكتابةً بمعاملة واحدة: التطبيق يُفتح بلا نت بعد حفظٍ
 * رُفع ولم تصل قراءة بعده فيعرض ما حُفظ، لا نسخة ما قبله (مراجعة 0036 R2c).
 */
export async function patchKept(stamp: Stamp): Promise<void> {
  const db = await openFarmCache();
  const key = stampKey(stamp);
  await transact(db, CACHE_STORE, 'readwrite', async (tx) => {
    const store = tx.objectStore(CACHE_STORE);
    const saved = await requestResult(store.get(key) as IDBRequest<Kept | undefined>);
    if (saved) await requestResult(store.put(kept(saved.json, key, readOf(saved), saved.at), key));
    return true;
  });
}

/** بالجهاز نسخة من قراءة الحقول لهذا المستخدم والمنشأة (وتنعلّم بالمخزن حتى الرأس يعرف). */
export async function hasOverviewCopy(stamp: Stamp): Promise<boolean> {
  return (await savedOverview(stamp)) !== null;
}
