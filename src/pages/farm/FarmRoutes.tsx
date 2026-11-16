import { lazy, Suspense, useState, type ComponentType } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Notice } from '../../components/ui/Notice';
import type { FlockKind } from '../../domain/flocks';
import { loadHalls } from '../../lib/hallsChunk';
import { t } from '../../lib/i18n';
import { quietly } from '../../lib/pwa/recovery';
import FarmPage from './FarmPage';
import RoundPage from './RoundPage';

// حقول اللحم والبيض (المرحلة 2، النسخة الأولى بكلمة المالك 2026-10-31) تحت /broiler و/layers: الحقل بقاعاته وأفواجه، والجولة
// اليومية. الجولة تشتغل بلا نت، فهذه الحزمة جوّا التثبيت المسبق (FOUNDATION ٢١٦، DECISIONS «السقوف المقيسة»).
// وصفحة القاعة (/hall/:id بفوجها القائم أو فارغة، كلمة المالك 2026-11-16) وشاشة الفوج بعينه (/flock/:id) من حزمة القاعات خارج التثبيت
// المسبق: تقرأ كلّها من الخادم. بلا نت (أو أيّ فشل في تحميلها) جملة تقول إنّها تحتاج اتصالاً، لا تعافٍ من القشرة (quietly)؛ وكلّ فتح يعيد المحاولة.

type Screen = ComponentType<{ kind: FlockKind }>;
type Halls = Awaited<ReturnType<typeof loadHalls>>;

function NeedsConnection() {
  return <Notice tone="info" title={t('hall.offline', 'صفحة القاعة تحتاج اتصالاً بالإنترنت؛ افتحها حين يعود الاتصال.')} />;
}

const screen =
  (pick: (halls: Halls) => Screen) =>
  () =>
    lazy<Screen>(() => quietly(loadHalls).then((halls) => ({ default: pick(halls) }), () => ({ default: NeedsConnection })));
const hallScreen = screen((halls) => halls.HallPage);
const flockScreen = screen((halls) => halls.FlockPage);

function HallsScreen({ kind, make }: { kind: FlockKind; make: () => Screen }) {
  const [Lazy] = useState(make);
  return (
    <Suspense fallback={null}>
      <Lazy kind={kind} />
    </Suspense>
  );
}

export default function FarmRoutes({ kind }: { kind: FlockKind }) {
  return (
    <Routes>
      <Route index element={<FarmPage kind={kind} />} />
      <Route path="round" element={<RoundPage kind={kind} />} />
      <Route path="hall/:id" element={<HallsScreen kind={kind} make={hallScreen} />} />
      <Route path="flock/:id" element={<HallsScreen kind={kind} make={flockScreen} />} />
      <Route path="*" element={<Notice tone="info" title={t('farm.not_found', 'هذه الصفحة غير موجودة في الحقول.')} />} />
    </Routes>
  );
}
