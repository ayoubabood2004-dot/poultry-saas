// Adversarial review of contract 0038 Part S: the queue's «dead_parts merged with dead, never alone» invariant. Regression test of the 2026-11-27 review (failed on b5c2e56).
import 'fake-indexeddb/auto';
import { loadSrc } from './load-src.mjs';

const ALI = { userId: 'user-ali', orgId: 'org-1', displayName: 'علي' };
const sum = (parts) => parts.reduce((total, part) => total + part, 0);

export default async function (t) {
  const q = await loadSrc('src/lib/outbox/index.ts');
  const db = await q.openOutbox('zz-review-outbox-1');
  const day = (payload) => ({ fn: 'save_flock_day', flockId: 'f-1', day: '2026-11-26', payload, baseVersion: 1 });
  // A sheet correction of a split day waits on the device ([3, 0], sum 3) — e.g. offline, or held by an identity/subscription refusal.
  await q.saveRound(db, ALI, day({ dead: 3, dead_parts: [3, 0], culled: null }));
  // Meanwhile the hall was set back to one section (allowed: the server had no deaths for this batch), the sheet re-read shows one
  // «الهلاكات» column, and the user writes the day's deaths 4: an input without dead_parts, accepted by enqueueAll's check.
  await q.saveRound(db, ALI, day({ dead: 4, culled: null }));
  const [op] = await q.pendingOps(db, ALI);
  const payload = op?.payload ?? {};
  // Expected: never a queued op whose parts do not sum to its deaths (the server refuses it with bad_value either way: parts on a
  // batch not split, or sum ≠ dead). On b5c2e56 mergePayload keeps the older dead_parts beside the newer dead.
  t.ok(
    payload.dead_parts === undefined || payload.dead_parts === null || sum(payload.dead_parts) === payload.dead,
    `merged save_flock_day keeps dead and dead_parts together: payload ${JSON.stringify(payload)}`,
  );
  // And what the transport would send for it (sendFlockDay forwards p_dead and p_dead_parts as they are).
  const sent = [];
  await q.flush(db, ALI, { currentUserId: async () => ALI.userId, send: async (o) => (sent.push(o.payload), { kind: 'rejected', code: 'bad_value', hint: null }), lookup: async () => null });
  t.ok(sent.length === 1 && (sent[0].dead_parts == null || sum(sent[0].dead_parts) === sent[0].dead), `the op sent upstream is consistent: ${JSON.stringify(sent)}`);
}
