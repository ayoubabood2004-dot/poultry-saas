import { decimalText, parseDecimal, toScale } from '../domain/decimal';
import { openDatabase, requestResult, transact } from './idb';
import type { Stamp } from './outbox';
import type { FeedSent } from './repo/hallSheet';
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
export interface FedSave extends Pick<FeedSent['issue'], 'itemId' | 'itemName' | 'qty' | 'unit'> {
  key: string;
  flockId: string;
  day: string;
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
  // فوج القراءة لنتيجة من هذا الحساب ليومها، وإلّا لا شيء.
  const of = (owner: string, flockId: string, day: string) => (owner === key && day === out.today ? flocks.get(flockId) : undefined);
  for (const run of runs) {
    for (const { flockId, day, result } of run.results) {
      const flock = of(run.key, flockId, day);
      if (!flock || result.kind !== 'saved') continue;
      const row = result.day as Json | null | undefined;
      const gas = result.gas as Json | null | undefined;
      const old = (flock.today ?? {}) as Json;
      if (row && num(row.version) > num(old.version)) {
        const dead = num(row.dead) - num(old.dead);
        const culled = num(row.culled) - num(old.culled);
        Object.assign(flock, { today: row, live: num(flock.live) - dead - culled, dead_total: num(flock.dead_total) + dead, culled_total: num(flock.culled_total) + culled });
      }
      if (gas && num(gas.version) > num(flock.gas_today_version)) Object.assign(flock, { gas_today: gas.cylinders, gas_today_version: gas.version });
    }
  }
  const items = (out.feed_items ?? []) as Json[];
  for (const sent of fed) {
    const flock = of(sent.key, sent.flockId, sent.day);
    if (!flock || sent.mark < read) continue;
    const lines = (flock.feed_today ?? []) as Json[];
    // سطر المرسل للمادّة لا سطر المنقول إليها (0036: المنقول بعلامته carry)؛ ومجموع اليوم من جواب الإرسال (خانة الورقة ومعها المنقول).
    const line = lines.find((entry) => entry.item_id === sent.itemId && entry.carry !== true);
    if (line) line.qty = decimalText(milli(line.qty) + sent.qty, 3);
    else lines.push({ item_id: sent.itemId, item_name: sent.itemName, qty: decimalText(sent.qty, 3), unit: sent.unit, carry: false });
    Object.assign(flock, { feed_today: lines, feed_today_kg: sent.dayKg === null ? null : decimalText(sent.dayKg, 3), last_feed_item_id: sent.itemId });
    for (const item of items) if (item.item_id === sent.itemId) item.on_hand = decimalText(milli(item.on_hand) - sent.qty, 3);
  }
  if (out.feed_items) out.feed_items = items.filter((item) => milli(item.on_hand) > 0n);
  return out;
}

type Kept = OverviewCopy & { session?: number };

const readOf = (saved: Kept): number => (saved.session === SESSION ? saved.read : 0);

/**
 * يكتب النسخة بمعاملة واحدة: from يرى الصفّ المحفوظ ويرجّع ما يُكتب (القراءة وموعدها ورقمها)، أو null فلا شيء. وما حُفظ في هذه الجلسة يُكتب فوقها لحظة
 * الكتابة داخل المعاملة (لا قبلها)، فقراءةٌ ونتيجةُ رفعٍ متزامنتان لا تكتب إحداهما فوق الأخرى بلا المحفوظ؛ ورقم الصفّ في العدّاد بعدها (ما يُرسل بعده
 * يُكتب فوقها لاحقاً).
 */
async function write(stamp: Stamp, from: (saved: Kept | undefined) => [json: unknown, at: number, read: number] | null): Promise<void> {
  const db = await openFarmCache();
  const key = stampKey(stamp);
  const wrote = await transact(db, CACHE_STORE, 'readwrite', async (tx) => {
    const store = tx.objectStore(CACHE_STORE);
    const next = from(await requestResult(store.get(key) as IDBRequest<Kept | undefined>));
    if (next) await requestResult(store.put({ json: withSaved(next[0], key, next[2], roundQueueStore.get().runs, fedStore.get()), at: next[1], read: nextTick(), session: SESSION }, key));
    return next !== null;
  });
  if (wrote) markFarmCopy(key);
}

/** read: رقم القراءة في عدّاد هذه الجلسة (loadOverviewKept، قبل أن تخرج). */
export const keepOverview = (stamp: Stamp, json: unknown, at: number, read: number): Promise<void> => write(stamp, () => [json, at, read]);

/**
 * نسخة الجهاز بما حُفظ بعدها في هذه الجلسة (الرافع بعد كلّ رفع، والجولة بعد كلّ إرسال علف): التطبيق يُفتح بلا نت بعد حفظٍ رُفع ولم تصل قراءة بعده
 * فيعرض ما حُفظ، لا نسخة ما قبله (مراجعة 0036 R2c).
 */
export const patchKept = (stamp: Stamp): Promise<void> => write(stamp, (saved) => (saved ? [saved.json, saved.at, readOf(saved)] : null));

export async function savedOverview(stamp: Stamp): Promise<OverviewCopy | null> {
  const db = await openFarmCache();
  const saved = await transact(db, CACHE_STORE, 'readonly', (tx) => requestResult(tx.objectStore(CACHE_STORE).get(stampKey(stamp)) as IDBRequest<Kept | undefined>));
  if (!saved) return null;
  markFarmCopy(stampKey(stamp));
  return { json: saved.json, at: saved.at, read: readOf(saved) };
}

/** بالجهاز نسخة من قراءة الحقول لهذا المستخدم والمنشأة (وتنعلّم بالمخزن حتى الرأس يعرف). */
export async function hasOverviewCopy(stamp: Stamp): Promise<boolean> {
  return (await savedOverview(stamp)) !== null;
}
