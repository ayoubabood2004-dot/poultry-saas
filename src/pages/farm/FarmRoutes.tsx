import { Route, Routes } from 'react-router-dom';
import { Notice } from '../../components/ui/Notice';
import type { FlockKind } from '../../domain/flocks';
import { t } from '../../lib/i18n';
import FarmPage from './FarmPage';
import FlockPage from './FlockPage';
import RoundPage from './RoundPage';

// حقول اللحم والبيض (المرحلة 2، النسخة الأولى بكلمة المالك 2026-10-31) تحت /broiler و/layers: الحقل بقاعاته وأفواجه، والجولة
// اليومية، وشاشة الفوج. الجولة تشتغل بلا نت، فهذه الحزمة جوّا التثبيت المسبق (FOUNDATION ٢١٦، DECISIONS «السقوف المقيسة»).

export default function FarmRoutes({ kind }: { kind: FlockKind }) {
  return (
    <Routes>
      <Route index element={<FarmPage kind={kind} />} />
      <Route path="round" element={<RoundPage kind={kind} />} />
      <Route path="flock/:id" element={<FlockPage kind={kind} />} />
      <Route path="*" element={<Notice tone="info" title={t('farm.not_found', 'هذه الصفحة غير موجودة في الحقول.')} />} />
    </Routes>
  );
}
