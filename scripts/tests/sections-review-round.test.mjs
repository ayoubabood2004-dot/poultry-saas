// Adversarial review of contract 0038 Part S (hall sections): the round, its review shelf, and the hall dialog. Kept as the regression test of the 2026-11-27 review: each case
// failed on b5c2e56 and passes after its fix. Harness copied from farm-round.test.mjs (real FarmRoutes + real halls chunk + real outbox on fake-indexeddb).
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REAL_FLOCKS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'flocks.ts'));
const REAL_SHEET = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'hallSheet.ts'));
const OVERRIDES = ['loadOverviewJson', 'loadFlockDetail', 'archiveHall', 'recordFlockWeight'];
const ADMIN = ['createHall', 'updateHall', 'openFlock', 'setHallSections'];
const STUBS = {
  flocks: `export * from ${REAL_FLOCKS}; import { parseOverview as __parseOverview } from ${REAL_FLOCKS}; ${OVERRIDES.map((n) => `export const ${n} = (...a) => globalThis.__farm.call('${n}', a);`).join(' ')}
    export const loadOverview = async () => __parseOverview(await globalThis.__farm.call('loadOverviewJson', []));
    export const flockDayTransport = { currentUserId: async () => globalThis.__farm.userId, send: (op) => globalThis.__farm.send(op), lookup: async () => null };`,
  hallSheet: `export * from ${REAL_SHEET}; import { parseFeedSent as __sent } from ${REAL_SHEET};
    export const sendFlockFeed = async (request) => __sent(await globalThis.__farm.call('sendFlockFeed', [request]));`,
  hallAdmin: ADMIN.map((n) => `export const ${n} = (...a) => globalThis.__farm.call('${n}', a);`).join(' '),
  session: 'export const useSession = () => globalThis.__farm.session;',
  Toast: 'export const toast = (spec) => { globalThis.__farm.toasts.push(spec); }; export function Toaster() { return null; }',
  home: 'export const loadHomeSummary = () => globalThis.__farm.call("loadHomeSummary", []);',
};

async function screens() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route } from 'react-router-dom';",
    "export { default as FarmRoutes } from './src/pages/farm/FarmRoutes.tsx';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { localDay, addDays } from './src/domain/dates.ts';",
    "export { openOutbox, pendingOps, reviewEntries, saveRound } from './src/lib/outbox/index.ts';",
    "export { RejectedError, ZeroRowsError } from './src/lib/errors.ts';",
  ].join('\n');
  const result = await build({
    stdin: { contents: entry, resolveDir: ROOT, loader: 'tsx' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    logLevel: 'silent',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'farm-stubs',
        setup(b) {
          b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/flocks$|\/lib\/repo\/hallAdmin$|\/lib\/repo\/hallSheet$|\/Toast$|\/lib\/repo\/home$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'farm-stub' }));
          b.onLoad({ filter: /.*/, namespace: 'farm-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name, root = body()) => descendants(root).filter((n) => n.getAttribute('data-action') === name);
const byIdSuffix = (suffix) => all().filter((n) => n.id.endsWith(suffix));
const type = (input, value) => {
  if (!input) return;
  input.value = value;
  fire(input, 'input');
};

export default async function (t) {
  const restore = installDom();
  let root = null;
  try {
    const m = await screens();
    const TODAY = m.localDay();
    const YESTERDAY = m.addDays(TODAY, -1);
    const ws = (userId) => ({ userId, orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role: 'manager', scopes: [], divisions: ['broiler', 'layer'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1 });
    const owner = (userId) => ({ status: 'ready', workspace: ws(userId), offline: false });
    const flock = (id, over = {}) => ({
      id, kind: 'broiler', breed: null, status: 'active', version: 1, placed_on: m.addDays(TODAY, -12), placed_count: 5000, age_days_at_placement: 0, age_days: 12,
      days_since_placement: 13, dead_total: 14, culled_total: 0, live: 4986, live_start_today: 4986, mortality_pct: '0.28', feed_kg_total: '1234.500',
      feed_days: 12, feed_span_days: 12, last_weight: null, fcr: null, today: null, eggs_today: null, hdep_today: null, rejects_pending: 0,
      section_counts: [2500, 2500], section_dead: [10, 4], ...over,
    });
    const site = (halls) => ({ id: 's-1', name: 'حقل الشمال', division_id: 'd-broiler', kind: 'broiler', can_manage: true, halls });
    const fresh = (session, handlers, send = async () => ({ kind: 'saved', version: 1 })) => {
      const calls = [];
      const sent = [];
      globalThis.__farm = {
        session,
        userId: session.workspace?.userId ?? null,
        toasts: [],
        call(name, args) {
          calls.push([name, args]);
          const handler = handlers[name];
          if (!handler) return new Promise(() => {});
          try {
            return Promise.resolve(handler(...args));
          } catch (error) {
            return Promise.reject(error);
          }
        },
        async send(op) {
          sent.push(op);
          return send(op);
        },
      };
      return { calls, sent };
    };
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(m.Routes, null, m.h(m.Route, { path: '/broiler/*', element: m.h(m.FarmRoutes, { kind: 'broiler' }) })))));
      await settle(80);
    };
    const unmount = async () => {
      if (root) m.flushSync(() => root.unmount());
      root = null;
      body().textContent = '';
      await settle();
    };
    const step = async (label, fn) => {
      m.onlineStore.set(true);
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: threw ${error?.stack ?? error}`);
      }
      await unmount();
      m.onlineStore.set(true);
    };
    const stampOf = (userId) => ({ userId, orgId: 'org-1', displayName: 'علي' });
    const queueOf = async (userId) => {
      const db = await m.openOutbox();
      return { pending: await m.pendingOps(db, stampOf(userId)), review: await m.reviewEntries(db, stampOf(userId)) };
    };
    const card = (flockId) => all().find((n) => n.getAttribute('data-flock') === flockId) ?? null;
    const inCard = (flockId, suffix) => (card(flockId) ? descendants(card(flockId)).find((n) => n.id.endsWith(suffix)) ?? null : null);
    const textIn = (flockId, action) => (card(flockId) ? byAction(action, card(flockId))[0]?.textContent ?? null : null);
    const save = async (rounds = 150) => {
      fire(byAction('round-save')[0] ?? body(), 'click');
      await settle(rounds);
    };

    // ── RS1: the round opened from yesterday's reading (offline the next morning) with yesterday's deaths still on this device
    // ([100, 0] for ق1). The hall's live-at-start is reduced by them (4,986 − 100 = 4,886) but each section's remaining is not:
    // ق1 really has 2,500 − 10 − 100 = 2,390 left. Typing 2,400 in ق1 must be refused like the hall total is; on b5c2e56 it is
    // queued (left computed as 2,500 − 10 = 2,490) and the server later refuses it with live_negative.
    await step('RS1 stale reading', async () => {
      const userId = 'u-rs1';
      m.onlineStore.set(false);
      await m.saveRound(await m.openOutbox(), stampOf(userId), { fn: 'set_flock_dead', flockId: 'f-a', day: YESTERDAY, payload: { dead: 100, parts: [100, 0] }, baseVersion: null });
      fresh(owner(userId), { loadOverviewJson: () => ({ today: YESTERDAY, sites: [site([{ id: 'h-1', name: 'قاعة 1', capacity: 6000, version: 2, sections: 2, flock: flock('f-a') }])], feed_items: [] }) });
      await mount('/broiler/round');
      t.ok(card('f-a')?.textContent.includes('4,886'), `RS1 control: the hall's live at the start of today counts yesterday's pending deaths (4,986 − 100 = 4,886): ${card('f-a')?.textContent.slice(0, 120)}`);
      type(inCard('f-a', '-dead1'), '2400');
      await settle();
      await save();
      const { pending } = await queueOf(userId);
      t.same(
        [pending.filter((op) => op.day === TODAY).map((op) => op.payload), textIn('f-a', 'round-error')],
        [[], 'هلاكات ق1 أكثر من طيوره الباقية (2,390).'],
        'RS1 ق1 bounded by its remaining after this device’s pending deaths (2,390): nothing queued for today',
      );
    });

    // ── RS2: the once-a-day rule with sections: another device recorded today's deaths 5 as [2, 3]; this device sends 5 as [3, 2]
    // → dead_recorded. The review shelf is the only place the user sees why; on b5c2e56 it shows «جولتك 5 | المحفوظ في الخادم 5»
    // and «سُجّلت هلاكات هذا اليوم من جهاز آخر: 5», no section anywhere, so the refusal looks like two equal numbers.
    await step('RS2 dead_recorded with other parts', async () => {
      const userId = 'u-rs2';
      const serverDay = { on_date: TODAY, version: 1, dead: 5, culled: 0, feed_kg: null, water_l: null, temp_min: null, temp_max: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null, dead_entered: true, dead_parts: [2, 3] };
      fresh(owner(userId), { loadOverviewJson: () => ({ today: TODAY, sites: [site([{ id: 'h-1', name: 'قاعة 1', capacity: 6000, version: 2, sections: 2, flock: flock('f-a') }])], feed_items: [] }) }, async (op) =>
        op.fn === 'set_flock_dead' ? { kind: 'dead_recorded', server: serverDay } : { kind: 'saved', version: 1 },
      );
      await mount('/broiler/round');
      type(inCard('f-a', '-dead1'), '3');
      type(inCard('f-a', '-dead2'), '2');
      await settle();
      await save(200);
      const { review } = await queueOf(userId);
      const shelf = all().find((n) => n.getAttribute('data-review') !== null);
      const shelfText = shelf?.textContent ?? '';
      t.same([review.length, review[0]?.reason, review[0]?.op.payload], [1, 'dead_recorded', { dead: 5, parts: [3, 2] }], 'RS2 control: the op [3, 2] came back dead_recorded and sits on the shelf');
      t.ok(shelfText.includes('ق1') && shelfText.includes('ق2'), `RS2 the shelf names each section's value (mine [3, 2], saved [2, 3]) so the refusal is visible; shelf text: ${shelfText}`);
    });

    // ── HD1: hall dialog: rename + change sections; the server refuses the sections (open batch with deaths) after the rename was
    // saved (hall version 2 → 3). The user keeps the name and puts the sections back, then saves again. Expected: no new write is
    // needed (or one at version 3) and the dialog closes with the farm table refreshed. On b5c2e56 the dialog still holds version 2:
    // updateHall(…, 2, …) → zero rows → «لم يُحفظ…» although nothing else touched the hall, and the table is never refreshed
    // (onSaved is not called after the refusal), so the saved name does not show.
    await step('HD1 hall dialog retry', async () => {
      const server = { version: 2, name: 'قاعة 1' };
      const hallJson = () => ({ id: 'h-1', name: server.name, capacity: 6000, version: server.version, sections: 2, flock: flock('f-a') });
      const { calls } = fresh(owner('u-hd1'), {
        loadOverviewJson: () => ({ today: TODAY, sites: [site([hallJson()])], feed_items: [] }),
        updateHall: (id, version, name) => {
          if (version !== server.version) throw new m.ZeroRowsError();
          server.version += 1;
          server.name = name.trim();
          return server.version;
        },
        setHallSections: (id, sections, expected) => {
          if (expected !== server.version) return { status: 'stale_hall', version: server.version, sections: 2 };
          throw new m.RejectedError('sections_after_deaths', 'في القاعة «قاعة 1» وجبة سُجّلت هلاكاتها، فلا تتغيّر أقسامها حتى تُغلق.');
        },
      });
      await mount('/broiler');
      fire(byAction('hall-edit')[0], 'click');
      await settle(80);
      type(byIdSuffix('-name')[0], 'قاعة 1 الكبيرة');
      fire(all().find((n) => n.getAttribute('role') === 'radio' && n.textContent === 'ثلاثة أقسام') ?? body(), 'click');
      await settle();
      fire(byAction('hall-save')[0], 'click');
      await settle(80);
      const reads = calls.filter(([name]) => name === 'loadOverviewJson').length;
      t.same([server.name, server.version, body().textContent.includes('فلا تتغيّر أقسامها')], ['قاعة 1 الكبيرة', 3, true], 'HD1 control: the rename was saved (version 3) and the sections refusal is shown');
      fire(all().find((n) => n.getAttribute('role') === 'radio' && n.textContent === 'قسمان') ?? body(), 'click');
      await settle();
      fire(byAction('hall-save')[0], 'click');
      await settle(80);
      const updates = calls.filter(([name]) => name === 'updateHall').map(([, args]) => args[1]);
      t.same(updates, [2], 'HD1 the retry does not re-send the rename with the version read before it (only the first updateHall at version 2)');
      t.ok(!body().textContent.includes('لم يغيّر الخادم أيّ صفّ'), 'HD1 no «zero rows» refusal for a change this same dialog already saved');
      t.ok(calls.filter(([name]) => name === 'loadOverviewJson').length > reads || byAction('hall-save').length === 0, 'HD1 the dialog closes / the farm table re-reads so the saved name shows');
    });

    // ── HD2: stale_hall. The hall changed on another device after the farm table was read (server version 3, table 2). The sections
    // change answers stale_hall and the dialog says «…أغلق النافذة وافتحها منجديد». Doing exactly that must give the user the
    // current hall; on b5c2e56 nothing re-reads (no onStale, onClose does not retry), so the reopened dialog sends version 2 again
    // and gets stale_hall again, for as long as the page stays open.
    await step('HD2 stale_hall loop', async () => {
      const server = { version: 3 };
      const { calls } = fresh(owner('u-hd2'), {
        // أوّل قراءة قبل تغيّر القاعة من الجهاز الآخر (النسخة 2)، وكلّ قراءة بعدها كما في الخادم الآن (3).
        loadOverviewJson: () => ({ today: TODAY, sites: [site([{ id: 'h-1', name: 'قاعة 1', capacity: 6000, version: calls.filter(([name]) => name === 'loadOverviewJson').length <= 1 ? 2 : server.version, sections: 2, flock: flock('f-a', { dead_total: 0, live: 5000, live_start_today: 5000, section_dead: [0, 0] }) }])], feed_items: [] }),
        setHallSections: (id, sections, expected) => (expected !== server.version ? { status: 'stale_hall', version: server.version, sections: 2 } : { status: 'saved', version: server.version + 1, sections }),
      });
      await mount('/broiler');
      const attempt = async () => {
        fire(byAction('hall-edit')[0], 'click');
        await settle(80);
        fire(all().find((n) => n.getAttribute('role') === 'radio' && n.textContent === 'ثلاثة أقسام') ?? body(), 'click');
        await settle();
        fire(byAction('hall-save')[0], 'click');
        await settle(80);
      };
      await attempt();
      const told = body().textContent.includes('أغلق النافذة وافتحها من جديد');
      fire(byAction('dialog-close')[0] ?? body(), 'click');
      await settle(80);
      // النافذة فيها اختيارٌ لم يُحفظ: الإغلاق يسأل «الخروج دون حفظ؟» والمستخدم يؤكّده، فتُغلق فعلاً قبل فتحها من جديد.
      fire(byAction('dialog-discard')[0] ?? body(), 'click');
      await settle(80);
      const closed = byAction('hall-save').length === 0;
      await attempt();
      const versions = calls.filter(([name]) => name === 'setHallSections').map(([, args]) => args[2]);
      t.same([told, closed, versions], [true, true, [2, 3]], 'HD2 after «close and reopen» the sections change is sent with the hall’s current version (2 then 3)');
    });

    // ── OF1: open a batch in a split hall: each section ≤ 10,000,000 passes, but nothing bounds their sum, which is the placed count
    // the server bounds (open_flock: 1..10,000,000). The single «عدد الطيور» field refuses 12,000,000 before saving; the section
    // fields let it through to the server.
    await step('OF1 total over the limit', async () => {
      const { calls } = fresh(owner('u-of1'), { loadOverviewJson: () => ({ today: TODAY, sites: [site([{ id: 'h-3', name: 'قاعة 3', capacity: 6000, version: 1, sections: 2, flock: null }])], feed_items: [] }), openFlock: () => 'f-new' });
      await mount('/broiler');
      fire(byAction('flock-open')[0], 'click');
      await settle(80);
      const inputs = byAction('section-count');
      type(inputs[0], '6000000');
      type(inputs[1], '6000000');
      await settle();
      const button = byAction('flock-open-save')[0];
      t.ok(button?.hasAttribute('disabled') || button?.getAttribute('aria-disabled') === 'true', `OF1 a total of 12,000,000 (over the server's 10,000,000) is refused before saving like the single field (total line: «${byAction('section-total')[0]?.textContent}»)`);
      fire(button, 'click');
      await settle(60);
      t.same(calls.filter(([name]) => name === 'openFlock').map(([, args]) => args[0].placedCount), [], 'OF1 open_flock is not called with 12,000,000');
    });

    // ── OF2: contract Part S «Open batch: when the hall is split, one count per section (even split by default, the sum must equal the
    // total, said before saving)» and D3 (27,051 in 2 → 13,526 + 13,525). The dialog has no total and no default: the section fields
    // start empty and «افتح» stays disabled until each is typed; evenSplit (src/domain/sections.ts) is never called.
    await step('OF2 even split default', async () => {
      const { calls } = fresh(owner('u-of2'), { loadOverviewJson: () => ({ today: TODAY, sites: [site([{ id: 'h-3', name: 'قاعة 3', capacity: 30000, version: 1, sections: 2, flock: null }])], feed_items: [] }), openFlock: () => 'f-new' });
      await mount('/broiler');
      fire(byAction('flock-open')[0], 'click');
      await settle(80);
      type(byIdSuffix('-count')[0], '27051');
      await settle();
      fire(byAction('flock-open-save')[0], 'click');
      await settle(60);
      t.same(
        calls.filter(([name]) => name === 'openFlock').map(([, args]) => [args[0].placedCount, args[0].sectionCounts]),
        [[27051, [13526, 13525]]],
        `OF2 a total of 27,051 opens the batch split evenly 13,526 + 13,525 by default (fields: ${byAction('section-count').map((n) => JSON.stringify(n.value)).join(', ')}; total input present: ${byIdSuffix('-count').length > 0})`,
      );
    });
  } finally {
    restore();
  }
}
